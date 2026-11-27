# Phase 1 — Data Acquisition, Verification & Feasibility

All figures below were produced by the scripts in `src/` on the real 2022-01 … 2023-12
downloads. Raw outputs: `reports/phase1/`.

## 1. Sources (verified)

| Source | Product | Access | Granularity |
|---|---|---|---|
| U.S. DOT BTS | Reporting Carrier On-Time Performance (1987–present) | `transtats.bts.gov/PREZIP/…_{YYYY}_{M}.zip`, 24 monthly zips (~28 MB each) | one row per scheduled flight |
| NOAA NCEI | Local Climatological Data (LCD) v1 | `ncei.noaa.gov/data/local-climatological-data/access/{YYYY}/{USAF}{WBAN}.csv` | ASOS reports (hourly FM-15 + special FM-16) |
| NOAA NCEI | ISD station history | `ncei.noaa.gov/pub/data/noaa/isd-history.csv` | station metadata (ICAO, lat/lon, period) |

**Why LCD and not raw ISD/global-hourly?** Same ASOS instruments, but LCD fields are already
decoded into physical units with quality flags, avoiding fragile parsing of packed ISD strings.
(NCEI's bulk global-hourly path now redirects to AWS; LCD stayed on NCEI.)

## 2. BTS schema & quality audit (`inspect_bts.py`)

* **Rows: 13,577,024 flights**, 2022-01-01 → 2023-12-31, 17 reporting carriers, 372 origin airports, 7,163 directed routes.
* 40 of ~110 columns retained, tagged **PRE-FLIGHT / TARGET / POST-FLIGHT** in `download_bts.py`.
* Status: 97.78 % completed, 1.98 % cancelled, 0.24 % diverted.
  Cancellation codes: B weather 52.4 %, A carrier 36.1 %, C NAS 11.1 %, D security 0.5 %.
* **Duplicates: 0** full-row, **0** on the business key (date, carrier, flight no., origin, dest, CRS dep).
* **Missingness is structural, not random.** For completed flights every operational column is 100 % filled;
  arrival fields are missing only for cancelled/diverted flights; delay-cause fields exist **iff** `ArrDel15 = 1`.
* **Delay causes are internally consistent**: present for 100 % of delayed flights, absent for 100 % of on-time
  flights, and sum exactly to `ArrDelay` in 100 % of cases. Minute shares: late aircraft 38.9 %, carrier 38.1 %,
  NAS 17.5 %, weather 5.4 %, security 0.2 %.
* Anomalies (to be dropped in Phase 3): 2 completed flights with no arrival record; 6 rows with negative
  `CRSElapsedTime`; 2 rows where elapsed ≠ air + taxi. **8 rows of 13.58 M.**
* 480,908 flights arrive the next calendar day (CRSArrTime < CRSDepTime) → arrival timestamps need day roll-over.
* 50,046 rows (0.37 %) lack a tail number (mostly cancellations) → matters for aircraft-rotation features.

### Targets
* **Classification (ArrDel15)** on completed flights: **20.82 % positive**, imbalance ≈ **3.8 : 1** →
  PR-AUC and recall are the right primary metrics; no resampling decided yet (benchmark in Phase 7).
* **Regression (ArrDelay, minutes)**: median −6, mean 6.8, p95 78, p99 202, max 4,405; skew 10.5.
  1.27 % of flights ≥ 180 min; 18,861 ≥ 600 min. Heavy right tail → MAE alongside RMSE, and a
  log/clipped-target variant must be benchmarked. Negative values are real early arrivals, not errors.

## 3. NOAA weather audit (`build_weather_table.py`)

* 373 BTS airports → **372 mapped** to an LCD station; 744 station-years downloaded, 0 missing files.
  Unmapped: **XWA** (Williston Basin, opened 2019; no ISD station exists).
* **8,526,764** hourly/special observations (372 stations) after keeping only FM-15/FM-16 METARs.
* Hourly coverage: median 99.86 %; 97.7 % of station-years ≥ 95 %. Weak stations: PSE 2022 (14 %), BQN (65 %),
  WYS (~50 %, seasonal airport), WRG, GST, HDN — all low-traffic.
* Variable completeness (median station): temperature, visibility, wind ≈ 99.9 %. Precipitation missing
  13.7 % (FM-16 specials often omit it); wind gust absent unless gusting; **ceiling "missing" ≈ 53 % means
  no BKN/OVC layer = unlimited ceiling**, a valid state to encode, not to impute.
* Values flagged suspect (`s`) are rare (median 30 per station-year); kept, with flags.

## 4. Integration issues found and how they were solved

| Issue | Evidence | Resolution |
|---|---|---|
| **LCD timestamps are Local *Standard* Time** | KATL July 2022: LCD 19:52 = ISD 00:52 UTC (UTC−5, not EDT −4) | LCD → UTC with each station's standard offset |
| BTS times are local *clock* time (DST) | BTS documentation | Localise per airport IANA zone (from station lat/lon), then UTC. DST fall-back ambiguous: 17 flights → standard time; spring-forward gaps: 0 |
| ICAO ≠ "K"+IATA for HI, AK, territories, renamed fields | 40 airports (e.g. OGG→PHOG, SJU→TJSJ, AZA→KIWA) | Explicit `ICAO_OVERRIDES` table |
| Wrong-station risk: **MQT** matched KMQT (NWS office, no METARs) | 0 hourly reports | MQT → KSAW (Sawyer Intl) |
| Validating the whole map | — | Station-to-station haversine vs BTS `Distance` over 7,159 routes: median error 1.4 mi, p99 6.3 mi, no airport systematically off |
| **Weather leakage** | Observed weather *at* departure is unknown when predicting ahead | Weather taken **as of t_pred = scheduled departure − 2 h**, latest obs ≤ t_pred, max age 3 h |

## 5. Merged dataset (`merge_flights_weather.py`)

* **13,577,024 rows × 85 columns** (BTS + `o_*` origin and `d_*` destination weather + timestamps).
* Origin weather matched **99.90 %**, destination **99.89 %**; median observation age at t_pred 24–27 min.
* Stored as 24 monthly Parquet files (656 MB). A single CSV would be ~6.5 GB; available with `--csv`.

### Descriptive signal check (not a model result; associations, not causes)

| Condition at origin at t_pred | Completed flights | ArrDel15 rate |
|---|---:|---:|
| All completed flights | 13,275,415 | 20.8 % |
| Thunderstorm reported | 105,590 | 54.5 % |
| Snow / ice pellets | 146,710 | 50.8 % |
| Wind ≥ 25 mph | 106,806 | 33.3 % |
| Visibility < 1 mi | 115,086 | 32.5 % |
| Ceiling < 500 ft | 201,841 | 24.8 % |
| Thunderstorm at destination | 103,290 | 45.1 % |

Cancellation rate is 1.98 % overall vs 12.5 % under origin snow and 7.8 % under origin thunder —
cancellation is strongly weather-linked and must be handled explicitly, not silently dropped.

## 6. Feasibility verdict

The data supports all three project questions: clean labels, complete pre-flight schedule fields,
reliable cause attribution for OAS, and near-complete leakage-safe weather. Severe-weather states are
rare (~1 % of flights each), so their effect must be read through PR-AUC and subgroup analysis.

## 7. Decisions needed before Phase 2

1. **Modelling scale.** Historical features (airline/airport/route rolling stats) will be computed on all
   13.58 M flights. Model training for RF / SFS / DBSCAN on 13 M rows is impractical on this machine
   (4 CPU, 15 GB RAM); proposed: a reproducible random sample per month (e.g. 1–2 M rows for
   XGBoost/LogReg, smaller nested samples for SFS, RF and DBSCAN), always evaluated on the full test period.
2. **Prediction horizon.** Default 2 h before scheduled departure. A 0 h "perfect weather" run can be
   reported only as an upper bound.
3. **Cancelled / diverted flights.** Proposed: excluded from the ArrDel15 and ArrDelay targets
   (no arrival exists) but kept for descriptive analytics and for historical disruption-rate features.
4. **Chronological split** (in `config/project.yaml`): train 2022-01 → 2023-06, validation 2023-07 → 09,
   test 2023-10 → 12.
