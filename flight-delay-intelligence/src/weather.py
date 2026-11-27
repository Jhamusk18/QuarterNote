"""Parse NOAA LCD hourly observations into clean numeric, UTC-stamped records.

LCD value conventions handled here (NCEI LCD documentation):
  * trailing "s"  -> value flagged suspect; we keep the number and count the flag
  * trailing "V"  -> variable; keep number
  * "*"           -> missing/erroneous
  * "M" / blank   -> missing
  * "T" (precip)  -> trace amount (< 0.01 in); encoded as 0.001 with is_trace flag
  * "VRB" (wind direction) -> variable direction; NaN + wind_dir_variable flag
Timestamps: LCD DATE is Local Standard Time (LST, no DST). Converted to UTC with the
station's *standard* UTC offset (verified empirically at KATL in Phase 1).
"""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

# Routine (FM-15) and special (FM-16) METAR reports. SOD/SOM are daily/monthly summaries;
# FM-12 SYNOP reports duplicate the same instruments at 3/6-hour cadence.
HOURLY_REPORTS = {"FM-15", "FM-16"}

NUMERIC = {
    "HourlyDryBulbTemperature": "temp_f",
    "HourlyDewPointTemperature": "dewpoint_f",
    "HourlyRelativeHumidity": "rel_humidity",
    "HourlyVisibility": "visibility_mi",
    "HourlyWindSpeed": "wind_speed_mph",
    "HourlyWindDirection": "wind_dir_deg",
    "HourlyWindGustSpeed": "wind_gust_mph",
    "HourlyPrecipitation": "precip_in",
    "HourlyStationPressure": "station_pressure_inhg",
    "HourlySeaLevelPressure": "sea_level_pressure_inhg",
    "HourlyAltimeterSetting": "altimeter_inhg",
}
def to_number(s: pd.Series) -> pd.Series:
    """Leading numeric part of an LCD string ('0.05s' -> 0.05, 'M' -> NaN, '10.00V' -> 10.0)."""
    num = s.astype("string").str.strip().str.extract(r"^(-?\d+(?:\.\d+)?)", expand=False)
    return pd.to_numeric(num, errors="coerce")


def standard_offset(tz: str) -> pd.Timedelta:
    """UTC offset of the zone's *standard* time (utcoffset minus DST component)."""
    z = ZoneInfo(tz)
    d = datetime(2022, 1, 15, 12, tzinfo=z)
    return pd.Timedelta(d.utcoffset() - d.dst())


def ceiling_ft(sky: pd.Series) -> pd.Series:
    """Lowest BKN/OVC/VV layer height in feet (aviation ceiling). No ceiling -> NaN.

    Example LCD string: 'FEW:02 25 BKN:07 60 OVC:08 120' (heights in hundreds of ft).
    """
    s = sky.astype("string")
    layers = s.str.findall(r"(BKN|OVC|VV):\d+\s+(\d+)")
    return layers.map(lambda L: min(int(h) for _, h in L) * 100.0 if isinstance(L, list) and L else np.nan)


def parse_lcd(raw: pd.DataFrame, tz: str) -> pd.DataFrame:
    df = raw[raw.REPORT_TYPE.astype("string").str.strip().isin(HOURLY_REPORTS)].copy()
    out = pd.DataFrame({"station": df.STATION.values})
    lst = pd.to_datetime(df.DATE, format="%Y-%m-%dT%H:%M:%S")
    out["obs_time_utc"] = (lst - standard_offset(tz)).values
    out["report_type"] = df.REPORT_TYPE.str.strip().values

    for src, dst in NUMERIC.items():
        col = df[src].astype("string").str.strip() if src in df else pd.Series(pd.NA, index=df.index)
        out[dst] = to_number(col).values
        if src == "HourlyPrecipitation":
            trace = col.eq("T").values
            out.loc[trace, dst] = 0.001
            out["precip_is_trace"] = trace
        if src == "HourlyWindDirection":
            out["wind_dir_variable"] = col.eq("VRB").values
        out[f"{dst}_suspect"] = col.str.endswith("s").fillna(False).values

    wx = df.HourlyPresentWeatherType.astype("string").fillna("")
    out["present_weather"] = wx.values
    for flag, pat in {"wx_thunder": r"TS", "wx_snow": r"SN|SG|PL|IC", "wx_freezing": r"FZ",
                      "wx_rain": r"RA|DZ", "wx_fog": r"FG|BR", "wx_hail": r"GR|GS"}.items():
        out[flag] = wx.str.contains(pat, regex=True).values
    out["ceiling_ft"] = ceiling_ft(df.HourlySkyConditions).values
    # Physical plausibility filter: drop impossible values rather than winsorising here.
    bounds = {"temp_f": (-80, 135), "dewpoint_f": (-100, 100), "visibility_mi": (0, 100),
              "wind_speed_mph": (0, 150), "wind_gust_mph": (0, 200), "precip_in": (0, 10),
              "station_pressure_inhg": (15, 32), "wind_dir_deg": (0, 360)}
    for c, (lo, hi) in bounds.items():
        out.loc[~out[c].between(lo, hi), c] = np.nan
    return out.sort_values("obs_time_utc").drop_duplicates(["obs_time_utc"], keep="last").reset_index(drop=True)
