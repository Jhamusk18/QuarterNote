"""Phase 1 — Integrate BTS flights with NOAA LCD weather (origin + destination).

Matching logic
--------------
1. Build the scheduled departure timestamp in the ORIGIN airport's local clock time
   (FlightDate + CRSDepTime; 2400 -> 00:00 next day), localise with the airport's IANA
   time zone (DST-aware), and convert to UTC.
2. Define the PREDICTION TIME  t_pred = sched_dep_utc - HORIZON  (default 2 h).
   This is the moment we pretend to make the forecast. Every predictive input — weather
   included — must be observable at t_pred. Using the observation *at* departure would be
   a "perfect weather forecast" and is only allowed as a labelled upper-bound experiment
   (--horizon-hours 0).
3. As-of join: for each flight take the latest LCD observation at the station with
   obs_time_utc <= t_pred and age <= TOLERANCE (default 3 h). Older -> left missing.
   Same for the destination station (current conditions at destination at t_pred).

Output: data/processed/flight_weather/bts_wx_YYYY_MM.parquet (+ optional single CSV).
"""
from __future__ import annotations

import argparse
import glob
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
BTS_DIR = ROOT / "data" / "raw" / "bts"
WX = ROOT / "data" / "interim" / "weather_hourly.parquet"
MAP = ROOT / "data" / "interim" / "airport_station_map.csv"
OUT_DIR = ROOT / "data" / "processed" / "flight_weather"

WX_VARS = ["temp_f", "dewpoint_f", "rel_humidity", "visibility_mi", "wind_speed_mph", "wind_dir_deg",
           "wind_dir_variable", "wind_gust_mph", "precip_in", "precip_is_trace", "station_pressure_inhg",
           "altimeter_inhg", "ceiling_ft", "wx_thunder", "wx_snow", "wx_freezing", "wx_rain", "wx_fog",
           "wx_hail"]


def local_to_utc(date: pd.Series, hhmm: pd.Series, tz: pd.Series) -> tuple[pd.Series, dict]:
    hhmm = hhmm.astype("int64")
    day_roll = (hhmm == 2400).astype(int)
    hhmm = hhmm.where(hhmm != 2400, 0)
    naive = (pd.to_datetime(date) + pd.to_timedelta(day_roll, "D")
             + pd.to_timedelta(hhmm // 100, "h") + pd.to_timedelta(hhmm % 100, "m"))
    out = pd.Series(pd.NaT, index=date.index, dtype="datetime64[ns, UTC]")
    stats = {"ambiguous": 0, "nonexistent": 0}
    for z, idx in naive.groupby(tz).groups.items():
        s = naive.loc[idx]
        # Count DST edge cases, then resolve them: fall-back hour (ambiguous) -> standard
        # time; spring-forward gap (nonexistent) -> shift forward to the first valid minute.
        stats["ambiguous"] += int(s.dt.tz_localize(z, ambiguous="NaT", nonexistent="shift_forward").isna().sum())
        stats["nonexistent"] += int(s.dt.tz_localize(z, ambiguous=False, nonexistent="NaT").isna().sum())
        out.loc[idx] = s.dt.tz_localize(z, ambiguous=False, nonexistent="shift_forward").dt.tz_convert("UTC")
    return out, stats


def asof(flights: pd.DataFrame, wx: pd.DataFrame, sid_col: str, prefix: str, tol: pd.Timedelta) -> pd.DataFrame:
    left = flights[["_row", sid_col, "pred_time_utc"]].dropna(subset=[sid_col, "pred_time_utc"]).sort_values("pred_time_utc")
    right = wx.rename(columns={"station": sid_col}).sort_values("obs_time_utc")
    m = pd.merge_asof(left, right, left_on="pred_time_utc", right_on="obs_time_utc", by=sid_col,
                      direction="backward", tolerance=tol, allow_exact_matches=True)
    m[f"{prefix}obs_age_min"] = (m.pred_time_utc - m.obs_time_utc).dt.total_seconds() / 60
    m = m.drop(columns=[sid_col, "pred_time_utc", "obs_time_utc", "report_type"])
    return m.rename(columns={v: prefix + v for v in WX_VARS})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--horizon-hours", type=float, default=2.0)
    ap.add_argument("--tolerance-hours", type=float, default=3.0)
    ap.add_argument("--csv", action="store_true", help="also write flight_delay_weather_2022_2023.csv")
    args = ap.parse_args()
    H, tol = pd.Timedelta(hours=args.horizon_hours), pd.Timedelta(hours=args.tolerance_hours)

    smap = pd.read_csv(MAP, dtype={"sid": str})
    sid_of = dict(zip(smap.iata, smap.sid))
    tz_of = dict(zip(smap.iata, smap.tz))
    wx = pd.read_parquet(WX)
    wx["obs_time_utc"] = wx.obs_time_utc.astype("datetime64[ns]").dt.tz_localize("UTC")
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    log = []
    for f in sorted(glob.glob(str(BTS_DIR / "bts_*.parquet"))):
        df = pd.read_parquet(f)
        df["_row"] = np.arange(len(df))
        df["origin_sid"], df["dest_sid"] = df.Origin.map(sid_of), df.Dest.map(sid_of)
        # The tz comes from the matched station's coordinates. Origins without a station
        # (only XWA) get no timestamp and no weather; counted in the merge log, never guessed.
        df["origin_tz"] = df.Origin.map(tz_of)
        has_tz = df.origin_tz.notna()
        df["sched_dep_utc"] = pd.Series(pd.NaT, index=df.index, dtype="datetime64[ns, UTC]")
        utc, st = local_to_utc(df.loc[has_tz, "FlightDate"], df.loc[has_tz, "CRSDepTime"], df.loc[has_tz, "origin_tz"])
        df.loc[has_tz, "sched_dep_utc"] = utc
        df["pred_time_utc"] = (df.sched_dep_utc - H).astype("datetime64[ns, UTC]")

        o = asof(df, wx, "origin_sid", "o_", tol)
        d = asof(df, wx, "dest_sid", "d_", tol)
        df = df.merge(o, on="_row", how="left").merge(d, on="_row", how="left").drop(columns="_row")
        out = OUT_DIR / Path(f).name.replace("bts_", "bts_wx_")
        df.to_parquet(out, index=False)
        rec = {"file": Path(f).name, "rows": len(df), "no_origin_tz": int((~has_tz).sum()),
               "dst_ambiguous": st["ambiguous"], "dst_nonexistent": st["nonexistent"],
               "origin_wx_match_pct": round(100 * df.o_temp_f.notna().mean(), 3),
               "dest_wx_match_pct": round(100 * df.d_temp_f.notna().mean(), 3),
               "origin_obs_age_median_min": float(df.o_obs_age_min.median())}
        log.append(rec)
        print(rec)
    pd.DataFrame(log).to_csv(ROOT / "reports" / "phase1" / "merge_log.csv", index=False)

    if args.csv:
        csv_path = ROOT / "data" / "processed" / "flight_delay_weather_2022_2023.csv"
        for i, f in enumerate(sorted(glob.glob(str(OUT_DIR / "*.parquet")))):
            pd.read_parquet(f).to_csv(csv_path, mode="w" if i == 0 else "a", header=i == 0, index=False)
        print("CSV written:", csv_path)


if __name__ == "__main__":
    main()
