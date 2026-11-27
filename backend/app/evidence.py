"""Evidence model + deterministic comparisons. No AI here: every number shown in an update
detail is either a reported figure (with its source) or computed from reported figures by
the functions below, with the inputs carried alongside.

Shapes (plain dicts, JSON-serialisable):

  Source    {publisher, url, page, section, excerpt, published_at}
  Figure    {metric, value, unit, period, basis, definition, source, verified, verify_note}
  Change    {metric, kind: "pct"|"pp", from_period, to_period, from_value, to_value,
             value, comparable, reason, like_for_like, caveat}
  Statement {text, speaker, source}               # what management said
  Fact      {label, value, state, source}         # state: "reported" | "not_disclosed" | "unavailable" | "candidate"
"""
from __future__ import annotations

import re

UNIT_TO_CRORE = {"₹ crore": 1.0, "₹ lakh": 0.01, "₹ million": 0.1, "₹ billion": 100.0}
Q_ORDER = {"Q1": 1, "Q2": 2, "Q3": 3, "Q4": 4}


def source(publisher=None, url=None, page=None, section=None, excerpt=None, published_at=None) -> dict:
    return {"publisher": publisher, "url": url, "page": page, "section": section, "excerpt": excerpt, "published_at": published_at}


def figure(metric, value, unit, period, basis, src=None, definition=None, verified=False, verify_note=None) -> dict:
    return {"metric": metric, "value": value, "unit": unit, "period": period, "basis": basis, "definition": definition or metric,
            "source": src, "verified": verified, "verify_note": verify_note}


def _parse_q(period: str) -> tuple[int, int] | None:
    m = re.fullmatch(r"(Q[1-4]) FY(\d{2})", period or "")
    return (int(m.group(2)), Q_ORDER[m.group(1)]) if m else None


def period_relation(a: str, b: str) -> str | None:
    """'yoy' if b is the same quarter one year after a, 'qoq' if b is the quarter right after a."""
    pa, pb = _parse_q(a), _parse_q(b)
    if not pa or not pb:
        return None
    if pb == (pa[0] + 1, pa[1]):
        return "yoy"
    idx_a, idx_b = pa[0] * 4 + pa[1], pb[0] * 4 + pb[1]
    return "qoq" if idx_b - idx_a == 1 else None


def to_crore(value: float, unit: str) -> float | None:
    f = UNIT_TO_CRORE.get(unit)
    return None if f is None or value is None else value * f


def compare(a: dict, b: dict, expect: str, *, percent_metric: bool = False, caveat: str | None = None) -> dict:
    """Change from figure a (earlier) to figure b (later). Returns comparable=False with a
    reason whenever basis, unit, definition or period alignment fails."""
    out = {"metric": b["metric"], "kind": "pp" if percent_metric else "pct", "from_period": a["period"], "to_period": b["period"],
           "from_value": a["value"], "to_value": b["value"], "value": None, "comparable": False, "reason": None,
           "like_for_like": caveat is None, "caveat": caveat}
    rel = period_relation(a["period"], b["period"])
    if a["value"] is None or b["value"] is None:
        out["reason"] = "One of the two figures is missing."
    elif a["basis"] != b["basis"]:
        out["reason"] = f"Different reporting basis ({a['basis']} vs {b['basis']})."
    elif a["unit"] != b["unit"] and not percent_metric:
        out["reason"] = f"Different units ({a['unit']} vs {b['unit']})."
    elif a["definition"] != b["definition"]:
        out["reason"] = f"The metric is defined differently in the two periods: {b['definition']} vs {a['definition']}."
    elif rel != expect:
        out["reason"] = f"{a['period']} → {b['period']} is not a {'year-on-year' if expect == 'yoy' else 'quarter-on-quarter'} comparison."
    elif percent_metric:
        out.update(value=round(b["value"] - a["value"], 1), comparable=True)
    elif a["value"] == 0 or a["value"] < 0:
        out["reason"] = "A percentage change from a zero or negative base is not meaningful."
    else:
        out.update(value=round((b["value"] / a["value"] - 1) * 100, 1), comparable=True)
    return out


def verify(fig: dict, row: dict) -> tuple[bool, str]:
    """A figure is verified only when metric, period, units, reporting basis and value all
    align with a row read from the original filing. Returns (verified, reason)."""
    problems = []
    if row.get("metric") != fig["metric"]:
        problems.append(f"metric differs (filing row is '{row.get('metric')}')")
    if row.get("period") != fig["period"]:
        problems.append(f"period differs (filing column is {row.get('period')}, figure is {fig['period']})")
    if row.get("basis") != fig["basis"]:
        problems.append(f"basis differs (filing is {row.get('basis')}, figure is {fig['basis']})")
    fv, rv = to_crore(fig["value"], fig["unit"]), to_crore(row.get("value"), row.get("unit"))
    if fv is None or rv is None:
        problems.append(f"units can't be aligned ({fig['unit']} vs {row.get('unit')})")
    elif abs(fv - rv) > (0.5 if row.get("rounded") else 0.005):
        problems.append(f"value differs ({fig['value']:,} {fig['unit']} vs {row.get('value'):,} {row.get('unit')} in the filing)")
    if problems:
        return False, "Not verified: " + "; ".join(problems) + "."
    return True, "Verified against the filing: metric, period, units, basis and value match."


def margin_plain(margin_pct: float) -> str:
    return f"₹{margin_pct:.0f} of operating profit for every ₹100 of sales"
