"""Phase 1 — Download BTS Airline On-Time Performance (Reporting Carrier) monthly files.

Source: https://transtats.bts.gov/PREZIP/
File:   On_Time_Reporting_Carrier_On_Time_Performance_1987_present_{YEAR}_{MONTH}.zip

Each zip holds one CSV (~110 columns). We keep a documented subset and store one
Parquet file per month so later stages never re-parse the raw CSVs.

Usage:
    python src/download_bts.py --start 2022-01 --end 2023-12
"""
from __future__ import annotations

import argparse
import io
import time
import zipfile
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw" / "bts"
URL = ("https://transtats.bts.gov/PREZIP/"
       "On_Time_Reporting_Carrier_On_Time_Performance_1987_present_{y}_{m}.zip")

# Columns kept. Grouped by how they may be used later (see docs/phase1_data_feasibility.md):
#   PRE-FLIGHT  -> allowed as predictive inputs (known before scheduled departure)
#   TARGET      -> outcome variables (never features)
#   POST-FLIGHT -> realised operations / causes; used only for analysis, OAS, and to
#                  build *lagged* historical features (strictly prior information)
KEEP = {
    # PRE-FLIGHT identifiers & schedule
    "FlightDate": "str", "Reporting_Airline": "str", "DOT_ID_Reporting_Airline": "Int32",
    "Tail_Number": "str", "Flight_Number_Reporting_Airline": "Int32",
    "OriginAirportID": "Int32", "Origin": "str", "OriginCityName": "str", "OriginState": "str",
    "DestAirportID": "Int32", "Dest": "str", "DestCityName": "str", "DestState": "str",
    "CRSDepTime": "Int32", "CRSArrTime": "Int32", "CRSElapsedTime": "float32",
    "Distance": "float32", "DistanceGroup": "Int8",
    # POST-FLIGHT realised operations
    "DepTime": "Int32", "DepDelay": "float32", "DepDelayMinutes": "float32", "DepDel15": "float32",
    "TaxiOut": "float32", "WheelsOff": "Int32", "WheelsOn": "Int32", "TaxiIn": "float32",
    "ArrTime": "Int32", "ActualElapsedTime": "float32", "AirTime": "float32",
    # TARGET
    "ArrDelay": "float32", "ArrDelayMinutes": "float32", "ArrDel15": "float32",
    # Outcome status
    "Cancelled": "float32", "CancellationCode": "str", "Diverted": "float32",
    # POST-FLIGHT delay causes (minutes; populated only when ArrDelay >= 15)
    "CarrierDelay": "float32", "WeatherDelay": "float32", "NASDelay": "float32",
    "SecurityDelay": "float32", "LateAircraftDelay": "float32",
}


def month_range(start: str, end: str):
    p = pd.Period(start, "M")
    stop = pd.Period(end, "M")
    while p <= stop:
        yield p.year, p.month
        p += 1


def download_month(y: int, m: int, retries: int = 4) -> Path:
    out = RAW_DIR / f"bts_{y}_{m:02d}.parquet"
    if out.exists():
        print(f"[skip] {out.name}")
        return out
    url = URL.format(y=y, m=m)
    for attempt in range(retries):
        try:
            r = requests.get(url, timeout=300)
            r.raise_for_status()
            break
        except requests.RequestException as e:
            wait = 2 ** (attempt + 1)
            print(f"[retry {attempt + 1}] {y}-{m:02d}: {e}; sleeping {wait}s")
            time.sleep(wait)
    else:
        raise RuntimeError(f"Failed to download {url}")

    with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
        csv_name = next(n for n in zf.namelist() if n.lower().endswith(".csv"))
        with zf.open(csv_name) as f:
            df = pd.read_csv(f, usecols=list(KEEP), dtype=KEEP, low_memory=False)
    df.to_parquet(out, index=False)
    print(f"[ok]   {out.name}: {len(df):,} rows, {len(r.content) / 1e6:.1f} MB zip")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default="2022-01")
    ap.add_argument("--end", default="2023-12")
    args = ap.parse_args()
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    for y, m in month_range(args.start, args.end):
        download_month(y, m)


if __name__ == "__main__":
    main()
