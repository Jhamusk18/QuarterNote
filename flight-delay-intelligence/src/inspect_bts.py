"""Phase 1 — BTS schema inspection & data-quality audit.

Writes reports/phase1/bts_audit.json and prints a readable summary. Nothing is
cleaned here: the audit only measures, so Phase 3 cleaning decisions are evidence-based.
"""
from __future__ import annotations

import glob
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
BTS_DIR = ROOT / "data" / "raw" / "bts"
OUT = ROOT / "reports" / "phase1"
CAUSES = ["CarrierDelay", "WeatherDelay", "NASDelay", "SecurityDelay", "LateAircraftDelay"]
KEY = ["FlightDate", "Reporting_Airline", "Flight_Number_Reporting_Airline", "Origin", "Dest", "CRSDepTime"]


def load() -> pd.DataFrame:
    files = sorted(glob.glob(str(BTS_DIR / "bts_*.parquet")))
    return pd.concat((pd.read_parquet(f) for f in files), ignore_index=True)


def valid_hhmm(s: pd.Series) -> pd.Series:
    """BTS hhmm integers: 1..2400 with minutes < 60 (2400 = midnight end of day)."""
    s = s.astype("float")
    return s.between(0, 2400) & ((s % 100) < 60)


def pct(x) -> float:
    return round(100 * float(x), 3)


def main():
    df = load()
    a: dict = {}
    n = len(df)
    a["rows_total"] = n
    a["months"] = df.FlightDate.str[:7].value_counts().sort_index().to_dict()
    a["date_min"], a["date_max"] = df.FlightDate.min(), df.FlightDate.max()
    a["n_carriers"] = int(df.Reporting_Airline.nunique())
    a["carrier_share_pct"] = (df.Reporting_Airline.value_counts(normalize=True) * 100).round(2).to_dict()
    a["n_origin_airports"] = int(df.Origin.nunique())
    a["n_routes"] = int(df.groupby(["Origin", "Dest"]).ngroups)
    a["dtypes"] = df.dtypes.astype(str).to_dict()

    # --- Flight status
    canc, div = df.Cancelled.eq(1), df.Diverted.eq(1)
    done = ~canc & ~div
    a["status_pct"] = {"completed": pct(done.mean()), "cancelled": pct(canc.mean()), "diverted": pct(div.mean())}
    a["cancellation_code_pct"] = (df.loc[canc, "CancellationCode"].value_counts(normalize=True) * 100).round(2).to_dict()

    # --- Missingness, overall and conditional on status (missingness is mostly structural)
    a["missing_pct_all"] = (df.isna().mean() * 100).round(3).to_dict()
    a["missing_pct_completed"] = (df[done].isna().mean() * 100).round(3).to_dict()

    # --- Duplicates
    a["dup_full_rows"] = int(df.duplicated().sum())
    a["dup_business_key"] = int(df.duplicated(KEY).sum())

    # --- Logical consistency
    c = df[done]
    chk = {
        "ArrDel15_vs_ArrDelay_mismatch": int((c.ArrDel15 != (c.ArrDelay >= 15).astype(float)).sum()),
        "ArrDelayMinutes_vs_clip_mismatch": int((c.ArrDelayMinutes != c.ArrDelay.clip(lower=0)).sum()),
        "completed_missing_ArrDelay": int(c.ArrDelay.isna().sum()),
        "origin_equals_dest": int((df.Origin == df.Dest).sum()),
        "nonpositive_distance": int((df.Distance <= 0).sum()),
        "nonpositive_CRSElapsed": int((df.CRSElapsedTime <= 0).sum()),
        "invalid_CRSDepTime": int((~valid_hhmm(df.CRSDepTime)).sum()),
        "invalid_CRSArrTime": int((~valid_hhmm(df.CRSArrTime)).sum()),
        "CRSDepTime_eq_2400": int((df.CRSDepTime == 2400).sum()),
        "overnight_sched_arrival": int((df.CRSArrTime < df.CRSDepTime).sum()),
        "missing_tail_number": int(df.Tail_Number.isna().sum()),
        "cancelled_with_ArrDelay": int(df.loc[canc, "ArrDelay"].notna().sum()),
    }
    # Actual elapsed vs air+taxi
    comp = c.ActualElapsedTime - (c.AirTime + c.TaxiIn + c.TaxiOut)
    chk["elapsed_ne_air_plus_taxi"] = int((comp.abs() > 1).sum())
    a["consistency"] = chk

    # --- Delay-cause fields (post-flight; for OAS only)
    late = c.ArrDel15.eq(1)
    has_cause = c[CAUSES].notna().any(axis=1)
    cause_sum = c[CAUSES].sum(axis=1, min_count=1)
    a["delay_causes"] = {
        "delayed_flights": int(late.sum()),
        "delayed_with_causes_pct": pct(has_cause[late].mean()),
        "on_time_with_causes": int(has_cause[~late].sum()),
        "cause_sum_eq_ArrDelay_pct": pct((cause_sum[late & has_cause] == c.loc[late & has_cause, "ArrDelay"]).mean()),
        "cause_minutes_share_pct": (c.loc[late, CAUSES].sum() / c.loc[late, CAUSES].sum().sum() * 100).round(2).to_dict(),
    }

    # --- Target distribution (completed flights)
    a["target_classification"] = {
        "ArrDel15_rate_pct": pct(c.ArrDel15.mean()),
        "imbalance_ratio_neg_to_pos": round(float((1 - c.ArrDel15.mean()) / c.ArrDel15.mean()), 2),
    }
    q = [0, .001, .01, .05, .25, .5, .75, .95, .99, .999, 1]
    a["ArrDelay_quantiles"] = {str(k): float(v) for k, v in c.ArrDelay.quantile(q).items()}
    a["ArrDelay_mean"] = round(float(c.ArrDelay.mean()), 2)
    a["ArrDelay_skew"] = round(float(c.ArrDelay.skew()), 2)
    a["ArrDelay_ge_180_pct"] = pct((c.ArrDelay >= 180).mean())
    a["ArrDelay_ge_600_count"] = int((c.ArrDelay >= 600).sum())
    a["ArrDelay_le_-60_count"] = int((c.ArrDelay <= -60).sum())
    a["delayed_only_ArrDelay_quantiles"] = {str(k): float(v) for k, v in c.loc[late, "ArrDelay"].quantile(q).items()}

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "bts_audit.json").write_text(json.dumps(a, indent=2, default=str))

    # Readable summary
    skip = {"dtypes", "missing_pct_all", "missing_pct_completed", "months", "carrier_share_pct"}
    for k, v in a.items():
        if k not in skip:
            print(f"{k}: {v}")
    miss = pd.DataFrame({"all_%": a["missing_pct_all"], "completed_%": a["missing_pct_completed"]})
    print("\nMissingness (columns with any missing):")
    print(miss[miss["all_%"] > 0].sort_values("all_%", ascending=False).to_string())
    print("\nRows per month:", a["months"])


if __name__ == "__main__":
    main()
