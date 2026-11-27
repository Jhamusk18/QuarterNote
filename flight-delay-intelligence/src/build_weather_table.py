"""Phase 1 — Parse every downloaded LCD station-year into one UTC hourly weather table + audit.

Output: data/interim/weather_hourly.parquet, reports/phase1/noaa_audit.csv
"""
from __future__ import annotations

import glob
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

from weather import parse_lcd

ROOT = Path(__file__).resolve().parents[1]
LCD_DIR = ROOT / "data" / "raw" / "noaa" / "lcd"
MAP = ROOT / "data" / "interim" / "airport_station_map.csv"
OUT = ROOT / "data" / "interim" / "weather_hourly.parquet"
AUDIT = ROOT / "reports" / "phase1" / "noaa_audit.csv"

KEEP = ["station", "obs_time_utc", "report_type", "temp_f", "dewpoint_f", "rel_humidity",
        "visibility_mi", "wind_speed_mph", "wind_dir_deg", "wind_dir_variable", "wind_gust_mph",
        "precip_in", "precip_is_trace", "station_pressure_inhg", "altimeter_inhg", "ceiling_ft",
        "wx_thunder", "wx_snow", "wx_freezing", "wx_rain", "wx_fog", "wx_hail"]


def one(args):
    path, tz = args
    raw = pd.read_parquet(path)
    w = parse_lcd(raw, tz)
    sid, year = Path(path).stem.split("_")
    w["station"] = sid
    # Audit: hourly coverage = share of UTC clock-hours in the year with >=1 observation.
    in_year = w.obs_time_utc.dt.year.eq(int(year))
    hours = w.loc[in_year, "obs_time_utc"].dt.floor("h").nunique()
    total_hours = 8760
    gaps = w.obs_time_utc.diff().dt.total_seconds().div(3600)
    rec = {"sid": sid, "year": int(year), "raw_rows": len(raw), "hourly_rows": len(w),
           "hour_coverage_pct": round(100 * hours / total_hours, 2),
           "max_gap_h": round(float(gaps.max()), 1) if len(w) > 1 else np.nan,
           "gaps_over_3h": int((gaps > 3).sum()),
           "n_suspect_values": int(w.filter(like="_suspect").sum().sum())}
    for c in ["temp_f", "visibility_mi", "wind_speed_mph", "precip_in", "station_pressure_inhg", "ceiling_ft"]:
        rec[f"miss_{c}"] = round(float(w[c].isna().mean()) * 100, 2)
    return w[KEEP], rec


def main():
    smap = pd.read_csv(MAP, dtype={"sid": str}).dropna(subset=["sid"])
    tz_of = dict(zip(smap.sid, smap.tz))
    jobs = [(f, tz_of[Path(f).stem.split("_")[0]]) for f in sorted(glob.glob(str(LCD_DIR / "*.parquet")))
            if Path(f).stem.split("_")[0] in tz_of]
    with ProcessPoolExecutor() as ex:
        res = list(ex.map(one, jobs, chunksize=4))
    w = pd.concat([r[0] for r in res], ignore_index=True)
    # A Dec-31 LST obs can land in Jan-1 UTC of the next file: dedupe across files.
    w = w.sort_values(["station", "obs_time_utc"]).drop_duplicates(["station", "obs_time_utc"], keep="last")
    w.to_parquet(OUT, index=False)
    audit = pd.DataFrame([r[1] for r in res])
    audit = audit.merge(smap[["sid", "iata"]], on="sid", how="left")
    audit.to_csv(AUDIT, index=False)
    print(f"stations: {w.station.nunique()}, observations: {len(w):,}")
    print(audit.describe().T[["mean", "min", "50%", "max"]].round(2).to_string())
    print("\nLowest hourly coverage:")
    print(audit.nsmallest(10, "hour_coverage_pct")[["iata", "sid", "year", "hour_coverage_pct", "max_gap_h"]].to_string())


if __name__ == "__main__":
    main()
