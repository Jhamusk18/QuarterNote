"""Phase 1 — Validate the airport->station mapping against BTS route distances.

BTS 'Distance' is the official great-circle airport-to-airport distance (miles). If both
endpoints map to the correct airport weather station, the station-to-station haversine
distance should agree closely. Airports whose routes disagree systematically are mis-mapped.
"""
from __future__ import annotations

import glob
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
MAP = ROOT / "data" / "interim" / "airport_station_map.csv"
OUT = ROOT / "reports" / "phase1" / "station_map_validation.csv"


def haversine_mi(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(np.radians, (lat1, lon1, lat2, lon2))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return 3958.8 * 2 * np.arcsin(np.sqrt(a))


def main():
    smap = pd.read_csv(MAP, dtype={"sid": str}).dropna(subset=["sid"])
    routes = pd.concat(pd.read_parquet(f, columns=["Origin", "Dest", "Distance"])
                       for f in glob.glob(str(ROOT / "data/raw/bts/bts_*.parquet")))
    routes = routes.groupby(["Origin", "Dest"], as_index=False).Distance.median()
    c = smap.set_index("iata")[["lat", "lon"]]
    r = routes.join(c, on="Origin").join(c, on="Dest", rsuffix="_d").dropna()
    r["station_mi"] = haversine_mi(r.lat, r.lon, r.lat_d, r.lon_d)
    r["abs_err_mi"] = (r.station_mi - r.Distance).abs()
    # An airport is suspicious if its median route error is large (both directions pooled).
    per_airport = pd.concat([r[["Origin", "abs_err_mi"]].rename(columns={"Origin": "iata"}),
                             r[["Dest", "abs_err_mi"]].rename(columns={"Dest": "iata"})])
    per_airport = per_airport.groupby("iata").abs_err_mi.agg(["median", "count"]).sort_values("median", ascending=False)
    per_airport.to_csv(OUT)
    print(f"routes checked: {len(r):,}; median abs error {r.abs_err_mi.median():.1f} mi; "
          f"p99 {r.abs_err_mi.quantile(.99):.1f} mi")
    print("Airports with largest median route-distance error:")
    print(per_airport.head(12).round(1).to_string())


if __name__ == "__main__":
    main()
