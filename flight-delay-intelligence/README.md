# Flight Delay Risk & Operational Intelligence

A leakage-safe, explainable tabular ML system on U.S. BTS On-Time Performance (2022–2023)
integrated with NOAA hourly weather. It answers three questions:

1. Will a flight arrive ≥ 15 minutes late? (classification)
2. How many minutes of arrival delay should we expect? (regression)
3. Which factors drive delay, and which are plausibly airline-controllable? (SHAP + Operational Actionability Score)

> Status: **Phase 1 — data acquisition, verification and integration.** No modelling yet.
> Every number in `docs/` and `reports/` is produced by the scripts here; nothing is hand-entered.

## Reproduce Phase 1

```bash
pip install -r requirements.txt
python src/download_bts.py --start 2022-01 --end 2023-12   # 24 monthly files -> data/raw/bts
python src/download_noaa.py                                # station map + LCD hourly weather
python src/validate_station_map.py                         # route-distance check of the map
python src/inspect_bts.py                                  # BTS audit -> reports/phase1
cd src && python build_weather_table.py && cd ..           # parse LCD -> UTC hourly table + audit
python src/merge_flights_weather.py                        # flights + origin/dest weather
```

Add `--csv` to the merge step to also export `data/processed/flight_delay_weather_2022_2023.csv`.

## Layout

| Path | Purpose |
|---|---|
| `src/download_bts.py` | BTS monthly zips → Parquet (documented column subset) |
| `src/download_noaa.py` | Airport → NOAA station mapping; LCD downloads |
| `src/validate_station_map.py` | Validates the mapping against official route distances |
| `src/weather.py` | LCD parsing: flags, trace precip, ceiling, LST → UTC |
| `src/build_weather_table.py` | One UTC hourly weather table + per-station audit |
| `src/inspect_bts.py` | BTS schema & quality audit |
| `src/merge_flights_weather.py` | DST-aware timestamps, as-of weather join at prediction time |
| `config/project.yaml` | Shared choices (targets, horizon, split) |
| `docs/phase1_data_feasibility.md` | Phase 1 findings and decisions |

## Data sources

* **BTS** Reporting Carrier On-Time Performance (1987–present), `transtats.bts.gov/PREZIP/`
* **NOAA NCEI** Local Climatological Data (LCD) hourly ASOS observations, plus `isd-history.csv` station metadata
