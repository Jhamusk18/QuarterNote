"""Phase 1 — Map BTS airports to NOAA weather stations and download hourly LCD data.

Source product: NOAA NCEI Local Climatological Data (LCD), v1 access path
    https://www.ncei.noaa.gov/data/local-climatological-data/access/{YEAR}/{USAF}{WBAN}.csv
Station metadata: https://www.ncei.noaa.gov/pub/data/noaa/isd-history.csv

Why LCD rather than raw ISD (global-hourly)?
  * LCD is NOAA's quality-controlled hourly product for (mostly airport) ASOS stations.
  * Fields arrive decoded (degF, mph, miles, inches) instead of packed ISD strings.
  * Same underlying ASOS observations, so no information is lost for our variables.

Key integration facts (verified empirically in Phase 1, see docs):
  * LCD DATE is Local *Standard* Time — no daylight-saving shift.
  * BTS CRSDepTime is local *clock* time — includes DST.
  => Both must be converted to UTC before matching.

Mapping rule  BTS IATA code -> station:
  0. Explicit ICAO_OVERRIDES for airports whose ICAO != K+IATA (HI, AK, territories, renamed fields).
  1. Otherwise ICAO = "K" + IATA, restricted to US stations in the BTS state.
  2. Station period must cover 2022-01-01..2023-12-31.
  3. Prefer a real WBAN (not 99999); then the most recent END date.
  4. Airports with no match are reported, not guessed.

Usage:
    python src/download_noaa.py                  # all airports seen in BTS
    python src/download_noaa.py --top 50         # only the 50 busiest origins
"""
from __future__ import annotations

import argparse
import glob
import time
from pathlib import Path

import pandas as pd
import requests
from timezonefinder import TimezoneFinder

ROOT = Path(__file__).resolve().parents[1]
BTS_DIR = ROOT / "data" / "raw" / "bts"
NOAA_DIR = ROOT / "data" / "raw" / "noaa"
ISD_HISTORY = NOAA_DIR / "isd-history.csv"
MAP_OUT = ROOT / "data" / "interim" / "airport_station_map.csv"
LCD_URL = "https://www.ncei.noaa.gov/data/local-climatological-data/access/{y}/{sid}.csv"
YEARS = (2022, 2023)

# IATA codes whose ICAO identifier is not simply K/P/T + IATA. Sourced from FAA/ICAO
# location identifiers; each is still validated against isd-history below.
ICAO_OVERRIDES = {
    "SJU": "TJSJ", "BQN": "TJBQ", "PSE": "TJPS", "STT": "TIST", "STX": "TISX",
    "OGG": "PHOG", "KOA": "PHKO", "LIH": "PHLI", "ITO": "PHTO", "HNL": "PHNL",
    "GUM": "PGUM", "SPN": "PGSN", "PPG": "NSTU",
    "FAI": "PAFA", "JNU": "PAJN", "KTN": "PAKT", "SIT": "PASI", "BET": "PABE",
    "CDV": "PACV", "PSG": "PAPG", "OTZ": "PAOT", "WRG": "PAWG", "YAK": "PAYA",
    "OME": "PAOM", "SCC": "PASC", "BRW": "PABR", "DLG": "PADL", "ADQ": "PADQ",
    "ANC": "PANC", "AKN": "PAKN", "ADK": "PADK", "GST": "PAGS", "BKG": "KBBG",
    "AZA": "KIWA", "FCA": "KGPI", "YUM": "KNYL", "HHH": "KHXD", "USA": "KJQF",
    "SCE": "KUNV", "MQT": "KSAW",  # XWA (opened 2019): no ISD station exists -> left unmatched
}

LCD_COLS = [
    "STATION", "DATE", "REPORT_TYPE", "SOURCE",
    "HourlyDryBulbTemperature", "HourlyDewPointTemperature", "HourlyRelativeHumidity",
    "HourlyVisibility", "HourlyWindSpeed", "HourlyWindDirection", "HourlyWindGustSpeed",
    "HourlyPrecipitation", "HourlyStationPressure", "HourlySeaLevelPressure",
    "HourlyAltimeterSetting", "HourlyPresentWeatherType", "HourlySkyConditions",
]


def bts_airports() -> pd.DataFrame:
    """Every airport appearing as origin or destination, with flight counts."""
    frames = []
    for f in sorted(glob.glob(str(BTS_DIR / "bts_*.parquet"))):
        d = pd.read_parquet(f, columns=["Origin", "OriginState", "Dest", "DestState"])
        o = d.groupby(["Origin", "OriginState"]).size().rename("n_origin")
        o.index.names = ["iata", "state"]
        de = d.groupby(["Dest", "DestState"]).size().rename("n_dest")
        de.index.names = ["iata", "state"]
        frames.append(pd.concat([o, de], axis=1).fillna(0))
    a = pd.concat(frames).groupby(level=[0, 1]).sum().reset_index()
    a["n_flights"] = a.n_origin + a.n_dest
    return a.sort_values("n_origin", ascending=False)


def build_station_map(airports: pd.DataFrame) -> pd.DataFrame:
    isd = pd.read_csv(ISD_HISTORY, dtype=str)
    isd = isd[isd.ICAO.notna() & isd.ICAO.str.len().eq(4)].copy()
    isd = isd[(isd.BEGIN <= "20220101") & (isd.END >= "20231231")]
    isd["has_wban"] = isd.WBAN.ne("99999")
    isd["sid"] = isd.USAF + isd.WBAN
    us = isd[isd.CTRY.eq("US")]

    tf = TimezoneFinder()
    rows = []
    for a in airports.itertuples():
        if a.iata in ICAO_OVERRIDES:
            c = isd[isd.ICAO.eq(ICAO_OVERRIDES[a.iata])]
            how = "override"
        else:
            c = us[us.ICAO.eq("K" + a.iata) & us.STATE.eq(a.state)]
            how = "icao"
        if c.empty:
            rows.append({"iata": a.iata, "state": a.state, "sid": None, "match": "none"})
            continue
        best = c.sort_values(["has_wban", "END"], ascending=False).iloc[0]
        lat, lon = float(best.LAT), float(best.LON)
        rows.append({
            "iata": a.iata, "state": a.state, "sid": best.sid, "icao": best.ICAO,
            "station_name": best["STATION NAME"], "lat": lat, "lon": lon,
            "tz": tf.timezone_at(lat=lat, lng=lon), "n_candidates": len(c), "match": how,
        })
    m = pd.DataFrame(rows).merge(airports[["iata", "state", "n_origin", "n_dest", "n_flights"]],
                                 on=["iata", "state"], how="left")
    return m


def download_lcd(sid: str, year: int, retries: int = 4) -> str:
    out = NOAA_DIR / "lcd" / f"{sid}_{year}.parquet"
    if out.exists():
        return "skip"
    for attempt in range(retries):
        try:
            r = requests.get(LCD_URL.format(y=year, sid=sid), timeout=180)
            if r.status_code == 404:
                return "missing"
            r.raise_for_status()
            break
        except requests.RequestException:
            time.sleep(2 ** (attempt + 1))
    else:
        return "failed"
    from io import StringIO
    df = pd.read_csv(StringIO(r.text), usecols=lambda c: c in LCD_COLS, dtype=str, low_memory=False)
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(out, index=False)
    return "ok"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=None, help="limit to N busiest origin airports")
    args = ap.parse_args()

    airports = bts_airports()
    smap = build_station_map(airports)
    MAP_OUT.parent.mkdir(parents=True, exist_ok=True)
    smap.to_csv(MAP_OUT, index=False)
    print(f"airports in BTS: {len(smap)}; mapped to a station: {smap.sid.notna().sum()}")

    todo = smap[smap.sid.notna()].sort_values("n_origin", ascending=False)
    if args.top:
        todo = todo.head(args.top)
    from concurrent.futures import ThreadPoolExecutor  # I/O bound: a few polite parallel requests
    jobs = [(r.iata, r.sid, y) for r in todo.itertuples() for y in YEARS]
    with ThreadPoolExecutor(max_workers=6) as ex:
        results = list(ex.map(lambda j: download_lcd(j[1], j[2]), jobs))
    st = pd.DataFrame(jobs, columns=["iata", "sid", "year"]).assign(status=results)
    st.to_csv(ROOT / "data" / "interim" / "lcd_download_status.csv", index=False)
    print(st.status.value_counts().to_string())


if __name__ == "__main__":
    main()
