"""Update detail: one endpoint per feed item, built on demand.

The digest stays the feed summary. Details are assembled here from (a) manually verified
records in data/verified/ and (b) the live digest item plus data FINN already holds
(screener.in tables, appointee extraction, EOD stats). PDF reads happen only in the lazy
/passages and /management calls, so a slow or missing document never blocks a detail page.
Every number is reported (with source) or computed in evidence.py from reported inputs."""
from __future__ import annotations

import json
import re
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutTimeout
from datetime import datetime

from . import config, rag
from .evidence import compare, figure, margin_plain, source, verify

VERIFIED_DIR = config.BASE_DIR / "data" / "verified"
_pool = ThreadPoolExecutor(4)


# ------------------------------------------------------------------ verified records
def _records() -> dict[str, dict]:
    out = {}
    for p in sorted(VERIFIED_DIR.glob("*.json")):
        r = json.loads(p.read_text())
        out[r["id"]] = r
    return out


RECORDS = _records()


def historical() -> list[dict]:
    """Feed-row summaries of the verified examples (shown when the live feed is empty)."""
    rows = []
    for r in RECORDS.values():
        d = detail_from_record(r, in_feed=False)
        rows.append({k: d["item"][k] for k in ("id", "symbol", "company", "category", "category_label", "headline", "why",
                                               "datetime", "kind", "priority", "historical")})
    return rows


def _pstr(v: float | None) -> str:
    return "—" if v is None else f"{v:,.2f}"


def _earnings_from_record(r: dict) -> dict:
    cols, rows, basis, unit, page = r["columns"], r["rows"], r["basis"], r["unit"], r["statement"]["page"]
    published = r["datetime"]

    def src(row_key=None, note=None, p=page, excerpt=None):
        sec = r["statement"]["title"] if row_key else None
        if row_key:
            row = rows[row_key]
            excerpt = excerpt or f"{row['label']} (line {row['line']}): " + " | ".join(
                f"{cols[c]['printed']}: {_pstr(row['values'][c])}" for c in ("cur", "yoy", "qoq"))
        return source(r["publisher"], f"{r['url']}#page={p}", p, sec, excerpt, published)

    def reported(key, metric, definition=None, defs_by_col=None):
        row = rows[key]
        figs = {}
        for c in ("cur", "yoy", "qoq"):
            f = figure(metric, row["values"][c], unit, cols[c]["period"], basis, src(key),
                       definition=(defs_by_col or {}).get(c, definition or metric))
            filing_row = {"metric": metric, "period": cols[c]["period"], "basis": basis, "unit": unit, "value": row["values"][c]}
            f["verified"], f["verify_note"] = verify(f, filing_row)
            figs[c] = f
        return figs

    def derived(metric, fn, inputs, definition):
        figs = {}
        for c in ("cur", "yoy", "qoq"):
            v = round(fn({k: rows[k]["values"][c] for k in inputs}), 2)
            figs[c] = figure(metric, v, unit, cols[c]["period"], basis, None, definition=definition, verified=False,
                             verify_note="Calculated by FINN from verified filing rows (see formula).")
        return figs

    general = [n for n in r["notes"] if "all" in n["applies_to"]]
    caveat = (f"Not like-for-like. The company says acquisitions make these results not comparable with previous periods "
              f"({', '.join(n['ref'] for n in general)}, p.{general[0]['page']}).") if general else None

    gross_defs = rows["revenue_from_operations"].get("definitions")

    F = {
        "gross_revenue": reported("revenue_from_operations", "Revenue from operations (gross)", defs_by_col=gross_defs),
        "sales": derived("Sales (net of excise)", lambda x: x["revenue_from_operations"] - x["excise_duty"],
                         ["revenue_from_operations", "excise_duty"], "Revenue from operations minus excise duty"),
        "costs": derived("Operating costs", lambda x: x["total_expenses"] - x["excise_duty"] - x["finance_costs"] - x["depreciation"],
                         ["total_expenses", "excise_duty", "finance_costs", "depreciation"],
                         "Total expenses minus excise duty, finance costs and depreciation"),
    }
    F["op"] = {c: figure("Operating profit", round(F["sales"][c]["value"] - F["costs"][c]["value"], 2), unit, cols[c]["period"], basis,
                         None, definition="Sales (net of excise) minus operating costs", verify_note="Calculated by FINN from verified filing rows (see formula).")
               for c in ("cur", "yoy", "qoq")}
    F["margin"] = {c: figure("Operating margin", round(F["op"][c]["value"] / F["sales"][c]["value"] * 100, 2), "%", cols[c]["period"], basis,
                             None, definition="Operating profit ÷ sales (net of excise)", verify_note="Calculated by FINN from verified filing rows (see formula).")
                   for c in ("cur", "yoy", "qoq")}
    F["pbt"] = reported("pbt", "Profit before tax")
    F["pat"] = reported("pat", "Net profit (profit for the period)")

    def changes(key, pct_metric=False, cav=caveat):
        f = F[key]
        return {"yoy": compare(f["yoy"], f["cur"], "yoy", percent_metric=pct_metric, caveat=cav),
                "qoq": compare(f["qoq"], f["cur"], "qoq", percent_metric=pct_metric, caveat=cav)}

    third = r.get("third_party_check") or {}

    def tp_check(metric_key, screener_key):
        vals = (third.get("values") or {}).get(screener_key)
        if not vals:
            return None
        out = []
        for c in ("cur", "yoy", "qoq"):
            fig = figure(F[metric_key][c]["metric"], vals[c], unit, cols[c]["period"], basis)
            ok, note = verify(fig, {"metric": fig["metric"], "period": cols[c]["period"], "basis": basis, "unit": unit,
                                    "value": F[metric_key][c]["value"], "rounded": True})
            out.append({"period": cols[c]["period"], "third_party_value": vals[c], "filing_value": F[metric_key][c]["value"], "matches": ok})
        return {"source": third["source"], "url": third["url"], "retrieved": third.get("retrieved"), "checks": out}

    def row_ev(keys):
        return [{"label": rows[k]["label"], "line": rows[k]["line"], "page": page,
                 "values": {c: rows[k]["values"][c] for c in ("cur", "yoy", "qoq")}, "note": rows[k].get("note")} for k in keys]

    stmt = {"title": r["statement"]["title"], "page": page, "units_printed": r["statement"]["units_printed"], "basis": basis,
            "columns": {c: cols[c] for c in ("cur", "yoy", "qoq")}, "url": f"{r['url']}#page={page}"}
    note7 = next((n for n in r["notes"] if "revenue_from_operations" in n["applies_to"]), None)

    sales_ch, op_ch, m_ch = changes("sales"), changes("op"), changes("margin", True)
    costs_ch = changes("costs")
    d_sales = F["sales"]["cur"]["value"] - F["sales"]["yoy"]["value"]
    d_costs = F["costs"]["cur"]["value"] - F["costs"]["yoy"]["value"]
    d_op = F["op"]["cur"]["value"] - F["op"]["yoy"]["value"]

    def word(v):
        return "rose" if v > 0 else "fell"

    metrics = [
        {"key": "sales", "label": "Sales (net of excise)", "kind": "calculated", "figures": F["sales"], "changes": sales_ch,
         "formula": "Revenue from operations (line 1) − Excise duty (line 4 d)",
         "evidence": {"status": "calculated_from_verified", "statement": stmt, "rows": row_ev(["revenue_from_operations", "excise_duty"]),
                      "third_party": tp_check("sales", "Sales"),
                      "note": "FINN uses sales net of excise so periods before and after the 1 Feb 2026 excise increase can be compared."}},
        {"key": "costs", "label": "Operating costs", "kind": "calculated", "figures": F["costs"], "changes": costs_ch,
         "formula": "Total expenses (line 4) − Excise duty (4 d) − Finance costs (4 f) − Depreciation (4 g)",
         "evidence": {"status": "calculated_from_verified", "statement": stmt,
                      "rows": row_ev(["total_expenses", "excise_duty", "finance_costs", "depreciation"]),
                      "third_party": tp_check("costs", "Expenses")}},
        {"key": "op", "label": "Operating profit", "kind": "calculated", "figures": F["op"], "changes": op_ch,
         "formula": "Sales (net of excise) − Operating costs",
         "breakdown": {"sales_change": round(d_sales, 2), "costs_change": round(d_costs, 2), "op_change": round(d_op, 2),
                       "from_period": cols["yoy"]["period"], "to_period": cols["cur"]["period"],
                       "text": f"Sales {word(d_sales)} by ₹{abs(d_sales):,.0f} crore. Operating costs {word(d_costs)} by ₹{abs(d_costs):,.0f} crore. "
                               f"So operating profit {word(d_op)} by ₹{abs(d_op):,.0f} crore ({cols['yoy']['period']} → {cols['cur']['period']})."},
         "evidence": {"status": "calculated_from_verified", "statement": stmt,
                      "rows": row_ev(["revenue_from_operations", "excise_duty", "total_expenses", "finance_costs", "depreciation"]),
                      "third_party": tp_check("op", "Operating Profit")}},
        {"key": "margin", "label": "Operating margin", "kind": "calculated", "figures": F["margin"], "changes": m_ch,
         "formula": "Operating profit ÷ Sales (net of excise)",
         "plain": f"{margin_plain(F['margin']['cur']['value'])} in {cols['cur']['period']}, "
                  f"versus ₹{F['margin']['yoy']['value']:.0f} in {cols['yoy']['period']}.",
         "evidence": {"status": "calculated_from_verified", "statement": stmt,
                      "rows": row_ev(["revenue_from_operations", "excise_duty", "total_expenses", "finance_costs", "depreciation"])},
         "trackable": True},
        {"key": "pbt", "label": "Profit before tax", "kind": "reported", "figures": F["pbt"], "changes": changes("pbt"),
         "evidence": {"status": "verified", "statement": stmt, "rows": row_ev(["pbt"]), "third_party": tp_check("pbt", "Profit before tax")}},
        {"key": "pat", "label": "Net profit", "kind": "reported", "figures": F["pat"], "changes": changes("pat"),
         "evidence": {"status": "verified", "statement": stmt, "rows": row_ev(["pat"]), "third_party": tp_check("pat", "Net Profit")}},
        {"key": "gross_revenue", "label": "Revenue from operations (gross, incl. excise)", "kind": "reported", "figures": F["gross_revenue"],
         "changes": changes("gross_revenue"),
         "evidence": {"status": "verified", "statement": stmt, "rows": row_ev(["revenue_from_operations"]),
                      "company_note": note7 and {"ref": note7["ref"], "page": note7["page"], "excerpt": note7["excerpt"],
                                                 "url": f"{r['url']}#page={note7['page']}"}}},
    ]

    headline = None
    if sales_ch["yoy"]["comparable"] and op_ch["yoy"]["comparable"]:
        s, o = sales_ch["yoy"]["value"], op_ch["yoy"]["value"]
        headline = f"Sales {word(s)}, but operating profit {word(o)}." if (s > 0) != (o > 0) else f"Sales and operating profit both {word(s)}."
    key_changes = [
        {"metric": "Sales (net of excise)", "change": sales_ch["yoy"]},
        {"metric": "Operating profit", "change": op_ch["yoy"]},
        {"metric": "Operating margin", "change": m_ch["yoy"]},
    ]
    caveats = [{"text": n["excerpt"], "ref": n["ref"], "page": n["page"], "url": f"{r['url']}#page={n['page']}"} for n in r["notes"]]
    return {"headline": headline, "headline_note": "Year on year, reported basis (not like-for-like)." if caveat else "Year on year.",
            "periods": {c: cols[c] for c in ("cur", "yoy", "qoq")}, "basis": basis, "unit": unit, "metrics": metrics,
            "key_changes": key_changes, "caveats": caveats, "statement": stmt,
            "verification": {"status": "manually_verified", "by": r["verified_by"]}}


def _disclosure_from_record(r: dict) -> dict:
    rel = {f["id"]: f for f in r.get("related_filings", [])}

    def src(s):
        f = rel.get(s.get("filing")) if s.get("filing") else None
        url = (f or r)["url"]
        return source(r["publisher"], f"{url}#page={s['page']}", s["page"], (f or {}).get("title") or r["title"], s["excerpt"],
                      (f or r)["datetime"])

    facts = []
    for f in r["facts"]:
        if "items" in f:
            facts.append({"key": f["key"], "label": f["label"], "state": "reported", "verified": True,
                          "items": [{"state": i["state"], "text": i["text"], "source": src(i["source"])} for i in f["items"]]})
        else:
            facts.append({"key": f["key"], "label": f["label"], "value": f["value"], "state": "reported", "verified": True,
                          "source": src(f["source"])})
    return {"facts": facts, "related_filings": r.get("related_filings", []),
            "verification": {"status": "manually_verified", "by": r["verified_by"]}}


def detail_from_record(r: dict, in_feed: bool) -> dict:
    item = {k: r.get(k) for k in ("id", "symbol", "company", "sector", "category", "category_label", "title", "subject", "datetime", "url", "feed")}
    from .classify import explain
    pr, why = explain(r, r["category"])
    item.update(kind="announcement", priority=pr, why=why, historical=not in_feed, verified=True, period_label=r.get("period_label"))
    out = {"layout": r["layout"], "item": item, "in_feed": in_feed}
    if r["layout"] == "earnings":
        out["earnings"] = _earnings_from_record(r)
        item["headline"] = out["earnings"]["headline"] or r["title"]
    else:
        out["disclosure"] = _disclosure_from_record(r)
        item["headline"] = r.get("headline") or r["title"]
    return out


# ------------------------------------------------------------------ live (unverified) items
def _screener_earnings(it: dict) -> dict | None:
    from . import push
    from .connectors import screener
    try:
        c = screener.company(it["symbol"])
    except Exception:
        return None
    q = c.get("quarters") or {}
    periods, rows = q.get("periods") or [], q.get("rows") or {}
    if len(periods) < 2:
        return None
    col = len(periods) - 1
    try:
        if datetime.fromisoformat(it["datetime"]).replace(tzinfo=None) < datetime.strptime(periods[col], "%b %Y"):
            col -= 1
    except Exception:
        pass
    basis = "Consolidated" if "consolidated" in c.get("url", "") else "Standalone"
    unit = "₹ crore"
    pub = "screener.in standardised quarterly P&L (compiled from exchange filings)"
    cols = {"cur": col, "qoq": col - 1, "yoy": col - 4}
    plabel = {k: (push.quarter_label(periods[i]) if i >= 0 else None) for k, i in cols.items()}
    is_bank = "Financing Profit" in rows

    def figs(metric, vals, pct_metric=False):
        out = {}
        for k, i in cols.items():
            v = vals[i] if vals and 0 <= i < len(vals) else None
            out[k] = figure(metric, v, "%" if pct_metric else unit, plabel[k], basis,
                            source(pub, c.get("url"), None, "Quarterly results table", None, None),
                            verify_note="Not verified: from screener.in's standardised table. FINN has not matched it to a row in this filing.")
        return out

    def ch(f, pct_metric=False):
        return {"yoy": compare(f["yoy"], f["cur"], "yoy", percent_metric=pct_metric) if f["yoy"]["period"] else
                {"comparable": False, "reason": "No year-ago quarter in the table.", "kind": "pp" if pct_metric else "pct"},
                "qoq": compare(f["qoq"], f["cur"], "qoq", percent_metric=pct_metric)}

    ev = {"status": "not_verified", "note": "These numbers come from screener.in's standardised table, which is compiled from exchange filings. "
                                            "FINN has not matched them to a row in this filing. Open the filing to check."}
    metrics = []
    sales_key = "Sales" if rows.get("Sales") else "Revenue"
    S = figs("Sales" if sales_key == "Sales" else "Revenue", rows.get(sales_key))
    metrics.append({"key": "sales", "label": "Sales" if sales_key == "Sales" else "Revenue", "kind": "reported", "figures": S, "changes": ch(S), "evidence": ev})
    head = None
    if not is_bank and rows.get("Operating Profit"):
        C = figs("Operating costs", rows.get("Expenses"))
        O = figs("Operating profit", rows.get("Operating Profit"))
        M = {k: figure("Operating margin", round(O[k]["value"] / S[k]["value"] * 100, 2) if O[k]["value"] is not None and S[k]["value"] else None,
                       "%", plabel[k], basis, None, verify_note="Calculated by FINN from screener.in figures.") for k in cols}
        oc, sc, mc = ch(O), ch(S), ch(M, True)
        metrics += [
            {"key": "costs", "label": "Operating costs", "kind": "reported", "figures": C, "changes": ch(C), "evidence": ev},
            {"key": "op", "label": "Operating profit", "kind": "reported", "figures": O, "changes": oc, "evidence": ev,
             "formula": "Sales − Operating costs (screener.in definition, before other income)"},
            {"key": "margin", "label": "Operating margin", "kind": "calculated", "figures": M, "changes": mc, "evidence": ev,
             "formula": "Operating profit ÷ Sales",
             "plain": f"{margin_plain(M['cur']['value'])} in {plabel['cur']}." if M["cur"]["value"] is not None else None},
        ]
        if O["yoy"]["value"] is not None and S["yoy"]["value"] is not None and sc["yoy"].get("comparable") and oc["yoy"].get("comparable"):
            d_s, d_c, d_o = S["cur"]["value"] - S["yoy"]["value"], (C["cur"]["value"] or 0) - (C["yoy"]["value"] or 0), O["cur"]["value"] - O["yoy"]["value"]
            w = lambda v: "rose" if v > 0 else "fell"
            metrics[2]["breakdown"] = {"sales_change": d_s, "costs_change": d_c, "op_change": d_o, "from_period": plabel["yoy"], "to_period": plabel["cur"],
                                       "text": f"Sales {w(d_s)} by ₹{abs(d_s):,.0f} crore. Operating costs {w(d_c)} by ₹{abs(d_c):,.0f} crore. "
                                               f"So operating profit {w(d_o)} by ₹{abs(d_o):,.0f} crore ({plabel['yoy']} → {plabel['cur']})."}
            s, o = sc["yoy"]["value"], oc["yoy"]["value"]
            head = f"Sales {w(s)}, but operating profit {w(o)}." if (s > 0) != (o > 0) else f"Sales and operating profit both {w(s)}."
        key = [{"metric": "Sales", "change": sc["yoy"]}, {"metric": "Operating profit", "change": oc["yoy"]}, {"metric": "Operating margin", "change": mc["yoy"]}]
    else:
        key = [{"metric": metrics[0]["label"], "change": metrics[0]["changes"]["yoy"]}]
    P = figs("Profit before tax", rows.get("Profit before tax"))
    N = figs("Net profit", rows.get("Net Profit"))
    metrics += [{"key": "pbt", "label": "Profit before tax", "kind": "reported", "figures": P, "changes": ch(P), "evidence": ev},
                {"key": "pat", "label": "Net profit", "kind": "reported", "figures": N, "changes": ch(N), "evidence": ev}]
    if is_bank:
        key.append({"metric": "Net profit", "change": metrics[-1]["changes"]["yoy"]})
    return {"headline": head, "headline_note": "Year on year, from screener.in figures (not verified against the filing).",
            "periods": {k: {"period": plabel[k], "printed": None} for k in cols}, "basis": basis, "unit": unit, "metrics": metrics,
            "key_changes": key, "caveats": [], "statement": None,
            "verification": {"status": "not_verified", "by": None}, "numbers_source": {"publisher": pub, "url": c.get("url")}}


_ORDER_RX = re.compile(r"(order|tribunal|court|nclt|nclat|authority|appeal|demand|penalt)", re.I)


def _facts_live(it: dict) -> list[dict]:
    d = it.get("details") or {}
    cat = it["category"]
    summary = it.get("summary")
    sum_src = source("NSE announcement summary" if it.get("feed") == "NSE" else it.get("summary_source") or it.get("feed"),
                     it.get("url"), None, "Exchange announcement text", summary, it.get("datetime")) if summary else None

    def unavailable(label, why="FINN has not read this detail from the filing. Open the original to check."):
        return {"label": label, "state": "unavailable", "value": "Evidence unavailable", "note": why}

    if cat == "management_change":
        ok = d.get("status") in ("ok", "excerpt")
        msrc = source(d.get("source"), d.get("source_url"), d.get("page"), "Regulation 30 disclosure", d.get("background"), it.get("datetime")) if ok else None
        change = re.search(r"appoint|resign|retire|cessation|re-?appoint|re-?designat", it.get("title") or "", re.I)
        return [
            {"label": "Person", "state": "candidate" if d.get("name") else "unavailable", "value": d.get("name") or "Evidence unavailable", "source": msrc},
            {"label": "Role", "state": "candidate" if d.get("role") else "unavailable", "value": d.get("role") or "Evidence unavailable", "source": msrc},
            {"label": "What changed", "state": "candidate" if change else "unavailable",
             "value": (it.get("title") if change else "Evidence unavailable"), "source": sum_src or source(it.get("feed"), it.get("url"), None, "Filing title", it.get("title"), it.get("datetime"))},
            {"label": "Effective date", "state": "candidate" if d.get("effective_date") else "unavailable", "value": d.get("effective_date") or "Evidence unavailable", "source": msrc},
            {"label": "Background", "state": "candidate" if ok else "unavailable", "value": d.get("background") if ok else (d.get("note") or "Evidence unavailable"), "source": msrc},
            unavailable("Successor", "FINN does not extract successors yet. Open the filing to check whether one is named."),
        ]
    if cat == "litigation":
        return [
            {"label": "What the filing says", "state": "candidate" if summary else "unavailable", "value": summary or "Evidence unavailable", "source": sum_src},
            unavailable("Disclosed amount or impact"), unavailable("Next step stated by the company"),
        ]
    if cat == "M&A":
        status = None
        if summary:
            m = re.search(r"\b(completed|completion|approved|approval|proposed|propose|entered into|executed|signed)\b", summary, re.I)
            status = m and m.group(1)
        return [
            {"label": "What the filing says", "state": "candidate" if summary else "unavailable", "value": summary or "Evidence unavailable", "source": sum_src},
            {"label": "Status", "state": "candidate" if status else "unavailable",
             "value": f"The exchange summary uses the word “{status}”. Check the filing for the exact status." if status else "Evidence unavailable", "source": sum_src if status else None},
            unavailable("Disclosed value or conditions"),
        ]
    return [{"label": "What the filing says", "state": "candidate" if summary else "unavailable", "value": summary or "Evidence unavailable", "source": sum_src}]


def detail_from_item(it: dict) -> dict:
    item = {**it, "historical": False, "verified": False}
    d = it.get("details") or {}
    if it.get("kind") == "market":
        return {"layout": "market", "item": item, "in_feed": True, "market": {
            "category": it["category"], "threshold": d.get("threshold"), "observed_change_pct": d.get("change_pct"),
            "volume": d.get("volume"), "avg_volume_20d": d.get("avg_volume_20d"), "volume_multiple": d.get("volume_multiple"),
            "close": d.get("close"), "prev_close": d.get("prev_close"), "session_date": d.get("session_date"), "as_of": d.get("as_of"),
            "source": source(d.get("source") or it.get("feed"), it.get("url"), None, "End-of-day price and volume", None, d.get("as_of"))}}
    if it["category"] == "results" and d.get("type") == "results":
        e = _screener_earnings(it)
        if e:
            if e["headline"]:
                item["headline"] = e["headline"]
            item["period_label"] = e["periods"]["cur"]["period"]
            return {"layout": "earnings", "item": item, "in_feed": True, "earnings": e}
    layout = {"management_change": "management", "litigation": "litigation", "M&A": "ma"}.get(it["category"], "filing")
    return {"layout": layout, "item": item, "in_feed": True,
            "disclosure": {"facts": _facts_live(it), "verification": {"status": "not_verified", "by": None}}}


# ------------------------------------------------------------------ lookup
def find_item(item_id: str) -> dict | None:
    from . import push
    if not push.ID_INDEX:
        try:
            push.digest()
        except Exception:
            pass
    return push.ID_INDEX.get(item_id)


def get_detail(item_id: str) -> dict | None:
    live = find_item(item_id)
    if item_id in RECORDS:
        return detail_from_record(RECORDS[item_id], in_feed=live is not None)
    if live:
        return detail_from_item(live)
    return None


def track(item_id: str, metric_key: str, baseline_id: str) -> dict:
    """Carry a tracked metric from the baseline release into this one. Both figures keep their own source."""
    from .evidence import _parse_q, period_relation
    cur, base = get_detail(item_id), get_detail(baseline_id)
    if not cur or not base or cur["layout"] != "earnings" or base["layout"] != "earnings":
        return {"state": "unavailable", "reason": "One of the two releases is no longer available."}

    def pick(d):
        m = next((x for x in d["earnings"]["metrics"] if x["key"] == metric_key), None)
        if not m:
            return None
        st = d["earnings"].get("statement")
        return {"update_id": d["item"]["id"], "figure": m["figures"]["cur"], "status": m["evidence"]["status"],
                "url": st["url"] if st else d["item"].get("url"), "page": st["page"] if st else None,
                "filed": d["item"]["datetime"], "label": m["label"], "like_for_like_qoq": m["changes"]["qoq"].get("like_for_like", True)}

    a, b = pick(base), pick(cur)
    if not a or not b:
        return {"state": "unavailable", "reason": "This release does not report the tracked metric."}
    pa, pb = _parse_q(a["figure"]["period"]), _parse_q(b["figure"]["period"])
    if pa and pb and pa == pb:
        return {"state": "baseline", "baseline": a}
    if pa and pb and pb < pa:
        return {"state": "older", "baseline": a, "latest": b,
                "reason": f"This release ({b['figure']['period']}) is older than your baseline ({a['figure']['period']})."}
    rel = period_relation(a["figure"]["period"], b["figure"]["period"])
    caveat = None if b["like_for_like_qoq"] else "The company says the latest quarter is not comparable with previous periods."
    ch = compare(a["figure"], b["figure"], rel or "qoq", percent_metric=a["figure"]["unit"] == "%", caveat=caveat)
    if not rel:
        ch["reason"] = (f"{a['figure']['period']} and {b['figure']['period']} are neither consecutive quarters "
                        f"nor the same quarter a year apart. Your baseline is kept.")
    return {"state": "ok" if ch["comparable"] else "cannot_compare", "baseline": a, "latest": b, "change": ch}


def _resolved_url(item_id: str) -> tuple[str | None, str | None]:
    """Only URLs FINN itself resolved (verified records or the digest) are ever fetched."""
    if item_id in RECORDS:
        return RECORDS[item_id]["url"], RECORDS[item_id]["symbol"]
    it = find_item(item_id)
    if it and it.get("kind") == "announcement" and str(it.get("url", "")).startswith(("https://nsearchives.nseindia.in/", "https://www.bseindia.com/")):
        return it["url"], it["symbol"]
    return None, None


_AMOUNT = re.compile(r"(?<![a-z])(?:₹|rs\.|inr)\s?\d[\d,]*(?:\.\d+)?\s*(?:crores?|cr\.?|lakhs?|million|billion)?", re.I)
_STATUS = re.compile(r"\b(completed|approved|proposed|executed|entered into|subject to|effective)\b", re.I)
_NEXT = re.compile(r"\b(appeal|intends? to|will (?:file|challenge|take)|evaluating|next (?:date|hearing)|no material impact|impact)\b", re.I)


def passages(item_id: str, timeout: float = 20.0) -> dict:
    """Candidate passages located by PDF text search. Never marked verified."""
    url, _ = _resolved_url(item_id)
    if not url:
        return {"state": "unavailable", "reason": "No original filing URL resolved for this update.", "passages": []}
    try:
        pages = _pool.submit(rag.pdf_pages, url).result(timeout=timeout)
    except FutTimeout:
        return {"state": "unavailable", "reason": "The filing took too long to download. Try again or open the original.", "passages": []}
    except Exception as e:
        return {"state": "unavailable", "reason": f"Could not read the filing ({type(e).__name__}).", "passages": []}
    out = []
    for pno, txt in pages:
        flat = re.sub(r"\s+", " ", txt)
        spans = []
        for kind, rx in (("amount", _AMOUNT), ("status", _STATUS), ("next_step", _NEXT)):
            if sum(o["kind"] == kind for o in out) >= 3:
                continue
            for m in rx.finditer(flat):
                if any(a <= m.start() < b for a, b in spans):
                    continue
                s = max(flat.rfind(". ", 0, m.start()) + 2, m.start() - 220, 0)
                e = flat.find(". ", m.end())
                e = e + 1 if e != -1 and e - m.end() < 220 else min(len(flat), m.end() + 220)
                snippet = ("…" if s > 0 and flat[s - 2: s] != ". " else "") + flat[s:e].strip() + ("" if flat[e - 1: e] == "." else "…")
                spans.append((s, e))
                out.append({"kind": kind, "page": pno, "excerpt": snippet, "url": f"{url}#page={pno}"})
                if sum(o["kind"] == kind for o in out) >= 3:
                    break
    return {"state": "ok", "passages": out[:9], "pages": len(pages),
            "note": "Located by text search in the filing. Candidate passages, not verified by FINN."}


def management_said(item_id: str) -> dict:
    """Transcript excerpt for the same period, if FINN has indexed one. Never blocks."""
    det = get_detail(item_id)
    if not det or det["layout"] != "earnings":
        return {"state": "unavailable", "reason": "Not an earnings update."}
    sym = det["item"]["symbol"]
    idx = rag.get_index(sym)
    if not idx:
        st = rag.ensure_async(sym)
        return {"state": "preparing", "reason": st.get("message") or "Preparing documents"}
    period = det["earnings"]["periods"]["cur"]["period"]
    q = re.fullmatch(r"Q([1-4]) FY(\d{2})", period or "")
    if not q:
        return {"state": "unavailable", "reason": "Reporting period unknown."}
    end_month = {1: 6, 2: 9, 3: 12, 4: 3}[int(q.group(1))]
    end_year = 2000 + int(q.group(2)) - (0 if q.group(1) == "4" else 1)
    want = [datetime(end_year + (end_month + k > 12), (end_month + k - 1) % 12 + 1, 1).strftime("%b %Y") for k in (1, 2)]
    docs = [d for d in idx["docs"].values() if d["kind"] == "transcript" and d.get("period") in want]
    if not docs:
        return {"state": "unavailable", "reason": f"No earnings-call transcript for {period} in FINN's sources for {sym}."}
    hits = rag.search(idx, "operating margin costs profit growth demand outlook", k=2, doc_ids={docs[0]["id"]}, per_doc=2)
    if not hits:
        return {"state": "unavailable", "reason": "The transcript had no passage about costs or margins."}
    return {"state": "ok", "statements": [
        {"text": re.sub(r"\s+", " ", h["text"])[:600], "speaker": None,
         "source": source(f"{sym} earnings call transcript", f"{docs[0]['url']}#page={h['page']}", h["page"], docs[0]["title"], None, None)}
        for h in hits], "note": "Excerpt retrieved by search. FINN has not interpreted it."}
