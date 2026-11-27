"""PUSH engine: windowed digest of filings + threshold alerts on EOD data.

The digest endpoint returns every item in the last 30 days (the widest window) and the
client applies filters, so counters, feed and labels always come from ONE dataset."""
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

from . import cache, classify, config, llm, rag
from .companies import BANKS, INDICES, PORTFOLIO
from .connectors import exchanges, prices, screener

IST = timezone(timedelta(hours=5, minutes=30))
SOURCES = {}  # integration status, surfaced in /api/status

DEFAULT_THRESHOLDS = {
    "volume_multiple": 2.0,
    "price_move_pct": 5.0,
    "material_categories": ["results", "M&A", "management_change", "fund_raise", "litigation", "credit_rating", "pledging"],
    "overrides": {},
}

Q_MAP = {"Jun": "Q1", "Sep": "Q2", "Dec": "Q3", "Mar": "Q4"}


def quarter_label(period: str) -> str:
    try:
        mon, yr = period.split()
        yr = int(yr)
        fy = yr + 1 if mon in ("Jun", "Sep", "Dec") else yr
        return f"{Q_MAP.get(mon, mon)} FY{str(fy)[2:]}"
    except Exception:
        return period


def _pct(a, b):
    if a is None or b in (None, 0):
        return None
    return round((a / b - 1) * 100 * (1 if b > 0 else -1), 1)


def results_card(sym: str, c: dict, ann_dt: datetime) -> dict | None:
    q = c.get("quarters") or {}
    periods, rows = q.get("periods") or [], q.get("rows") or {}
    if len(periods) < 2:
        return None
    # The column the announcement refers to: latest quarter ending before the announcement.
    col = len(periods) - 1
    try:
        end = datetime.strptime(periods[col], "%b %Y")
        if ann_dt and ann_dt.replace(tzinfo=None) < end:
            col -= 1
    except Exception:
        pass
    is_bank = sym in BANKS or "Financing Profit" in rows
    rev = rows.get("Sales") or rows.get("Revenue")
    spec = [("Revenue", rev, None)]
    if is_bank:
        spec.append(("EBITDA", None, "Not meaningful for banks"))
    else:
        spec.append(("EBITDA", rows.get("Operating Profit"), "Derived: revenue − operating expenses (before other income)"))
    spec += [("PBT", rows.get("Profit before tax"), None), ("PAT", rows.get("Net Profit"), None)]
    metrics = []
    for name, vals, note in spec:
        if not vals:
            metrics.append({"metric": name, "value": None, "qoq": None, "yoy": None, "note": note or "Not reported"})
            continue
        v = vals[col] if col < len(vals) else None
        qoq = _pct(v, vals[col - 1]) if col >= 1 else None
        yoy = _pct(v, vals[col - 4]) if col >= 4 else None
        metrics.append({"metric": name, "value": v, "qoq": qoq, "yoy": yoy, "note": note})
    return {
        "quarter": quarter_label(periods[col]),
        "period": periods[col],
        "unit": "₹ Cr",
        "basis": "Consolidated" if "consolidated" in c.get("url", "") else "Standalone",
        "metrics": metrics,
        "numbers_source": "screener.in standardised quarterly P&L (compiled from exchange filings)",
        "numbers_url": c.get("url"),
    }


_PROFILE_RX = re.compile(r"(brief profile|profile of|brief resume|background|experience)", re.I)


def appointee_card(item: dict) -> dict:
    """Pull the incoming person's background from the filing itself (Reg. 30 requires a brief profile)."""
    key = item["url"]
    hit = cache.get("appointee", key)
    if hit:
        return hit
    out = {"status": "unavailable", "source": "Company's Regulation 30 disclosure"}
    try:
        pages = rag.pdf_pages(item["url"])
        if llm.enabled():
            a = llm.extract_appointee(pages)
            out = {**a, "status": "ok" if a.get("name") else "no_profile", "method": "AI extraction (fast model) from filing",
                   "source": "Company's Regulation 30 disclosure", "source_url": item["url"] + (f"#page={a['page']}" if a.get("page") else "")}
        else:
            for pno, txt in pages:
                m = _PROFILE_RX.search(txt)
                if m:
                    snip = re.sub(r"\s+", " ", txt[m.start(): m.start() + 420]).strip()
                    if re.search(r"not applicable", snip[:70], re.I):
                        out = {"status": "no_profile", "source": "Company's Regulation 30 disclosure",
                               "note": "Filing does not name an incoming appointee (departure / re-appointment)."}
                        break
                    out = {"status": "excerpt", "background": snip + "…", "page": pno, "method": "Verbatim excerpt (AI not configured)",
                           "source": "Company's Regulation 30 disclosure", "source_url": f"{item['url']}#page={pno}"}
                    break
            else:
                out["status"] = "no_profile"
    except Exception as e:
        out = {"status": "error", "error": str(e)[:120], "source": "Company's Regulation 30 disclosure"}
    if out.get("status") in ("ok", "excerpt", "no_profile"):
        cache.put("appointee", key, out)
    return out


def _company_items(sym: str, name: str, sector: str) -> tuple[list[dict], str]:
    feed = "screener.in"
    c = None
    raw = exchanges.nse_announcements(sym)
    if raw:
        feed = "NSE"
    try:
        c = screener.company(sym, ttl=1800)
    except Exception:
        c = None
    if not raw and c:
        raw = exchanges.bse_announcements(c.get("bse_code")) if c.get("bse_code") else None
        feed = "BSE" if raw else "screener.in"
    if not raw:
        raw = (c or {}).get("docs", {}).get("announcements") or []
    if not raw and c is None:
        return [], "failed"
    items = []
    for a in raw:
        if not a.get("datetime") or not a.get("url"):
            continue
        try:
            dt = datetime.fromisoformat(a["datetime"])
        except ValueError:
            continue
        cl = classify.classify(a)
        cl["priority"], why = classify.explain(a, cl["category"])
        if cl["method"] == "llm-fast":
            why += " (category assigned by AI)"
        it = {
            "id": rag.doc_id(a["url"]), "kind": "announcement", "symbol": sym, "company": name, "sector": sector,
            "title": a["title"], "subject": a.get("subject"), "summary": a.get("summary"),
            "summary_source": a.get("summary_source") or ("screener.in auto-summary" if a.get("summary") else None),
            "datetime": dt.isoformat(), "url": a["url"], "feed": feed,
            **cl, "category_label": dict(classify.CATEGORIES).get(cl["category"], cl["category"]),
            "simulated": False, "details": None, "why": why,
        }
        if cl["category"] == "results" and c and cl["priority"] == "high":
            it["details"] = {"type": "results", **(results_card(sym, c, dt) or {})}
        elif cl["category"] == "management_change":
            it["details"] = {"type": "management", **appointee_card(it)}
        items.append(it)
    return items, feed


def _market_items(th: dict) -> tuple[list[dict], dict]:
    items, stats = [], {}

    def one(row):
        sym, name, sector = row
        try:
            return sym, name, sector, prices.eod_stats(sym)
        except Exception:
            return sym, name, sector, None

    with ThreadPoolExecutor(8) as ex:
        res = list(ex.map(one, PORTFOLIO))
    for sym, name, sector, s in res:
        if not s:
            continue
        stats[sym] = s
        ov = th.get("overrides", {}).get(sym, {})
        vm = float(ov.get("volume_multiple") or th["volume_multiple"])
        pm = float(ov.get("price_move_pct") or th["price_move_pct"])
        ts = s["as_of"]
        base = {"symbol": sym, "company": name, "sector": sector, "datetime": ts, "simulated": False,
                "data_mode": "EOD", "feed": "Yahoo Finance", "url": f"https://finance.yahoo.com/quote/{sym}.NS",
                "alert": True, "method": "threshold"}
        if abs(s["change_pct"]) >= pm:
            hi = abs(s["change_pct"]) >= 2 * pm
            items.append({**base, "id": f"px-{sym}-{s['session_date']}", "kind": "market", "category": "price_movement",
                          "category_label": "Price movement",
                          "priority": "high" if hi else "medium",
                          "why": f"Price moved {s['change_pct']:+.1f}%, beyond your ±{pm:g}% threshold"
                                 + (f" (at least 2× the threshold, so High)" if hi else ""),
                          "title": f"{'Up' if s['change_pct'] > 0 else 'Down'} {abs(s['change_pct']):.1f}% at ₹{s['close']:,.2f}",
                          "summary": f"Moved beyond your ±{pm:g}% threshold · prev close ₹{s['prev_close']:,.2f}",
                          "details": {"type": "market", **s, "threshold": pm}})
        if s["volume_multiple"] and s["volume_multiple"] >= vm:
            hi = s["volume_multiple"] >= 2 * vm
            items.append({**base, "id": f"vol-{sym}-{s['session_date']}", "kind": "market", "category": "volume_surge",
                          "category_label": "Volume surge",
                          "priority": "high" if hi else "medium",
                          "why": f"Volume {s['volume_multiple']:.1f}× its 20-day average, above your {vm:g}× threshold"
                                 + (" (at least 2× the threshold, so High)" if hi else ""),
                          "title": f"Volume {s['volume_multiple']:.1f}× its 20-day average",
                          "summary": f"{s['volume']:,} shares vs 20D avg {s['avg_volume_20d']:,} · close {s['change_pct']:+.1f}%",
                          "details": {"type": "market", **s, "threshold": vm}})
    return items, stats


def _sample_items() -> list[dict]:
    rows = json.loads((config.SAMPLE_DIR / "announcements.json").read_text())
    now = datetime.now(IST)
    out = []
    for r in rows:
        dt = now - timedelta(minutes=r.pop("minutes_ago"))
        pr, why = classify.explain(r, r["category"])
        out.append({**r, "priority": pr, "why": why, "datetime": dt.isoformat(), "simulated": True, "feed": "SIMULATED"})
    return out


_GENERIC_TITLE = re.compile(
    r"^(general updates?|updates?|disclosure under regulation|'?disclosure under regulation|outcome of board meeting|"
    r"press release|intimation|announcement under regulation|.*has (submitted|informed) (to )?the exchange)", re.I)


_ABBREV = re.compile(r"\b(mr|ms|mrs|dr|rs|no|ltd|pvt|co|inc|i\.e|e\.g|viz|w\.e\.f|st|sr|jr|inr)\.$", re.I)


def _sentence(s: str, n: int = 120) -> str:
    s = re.sub(r"\s+", " ", s or "").strip()
    cut = s
    for m in re.finditer(r"[.;]\s", s):
        if not _ABBREV.search(s[: m.start() + 1]):
            cut = s[: m.start() + 1]
            break
    return cut if len(cut) <= n else cut[: n - 1].rsplit(" ", 1)[0] + "…"


def results_headline(d: dict) -> str | None:
    """Direction-only sentence from comparable figures (same source, same basis, YoY)."""
    m = {x["metric"]: x for x in d.get("metrics") or []}
    sales = m.get("Revenue", {}).get("yoy")
    prof = (m.get("EBITDA") or {}).get("yoy")
    plabel = "operating profit"
    if prof is None:
        prof, plabel = (m.get("PAT") or {}).get("yoy"), "net profit"
    if sales is None or prof is None:
        return None
    up = lambda v: "rose" if v > 0 else "fell" if v < 0 else "was flat"
    if (sales > 0) == (prof > 0):
        return f"Sales {up(sales)} and {plabel} {up(prof)} year on year."
    return f"Sales {up(sales)}, but {plabel} {up(prof)} year on year."


def plain_headline(it: dict) -> str:
    d = it.get("details") or {}
    if d.get("type") == "results" and d.get("metrics"):
        h = results_headline(d)
        if h:
            return h
    if d.get("type") == "management" and d.get("name"):
        return f"{d['role'] + ': ' if d.get('role') else ''}{d['name']}"
    title = re.sub(r"&#8377;", "₹", it.get("title") or "").strip(" '\"")
    if _GENERIC_TITLE.search(title) and it.get("summary"):
        return _sentence(it["summary"])
    return _sentence(title, 140)


def digest(thresholds: dict | None = None) -> dict:
    th = {**DEFAULT_THRESHOLDS, **(thresholds or {})}
    key = json.dumps(th, sort_keys=True)
    hit = cache.get("digest", key, ttl=600)
    if hit:
        SOURCES.update(hit.get("sources", {}))
        for k, v in (hit.get("exchanges") or {}).items():
            if exchanges.STATUS[k]["ok"] is None:
                exchanges.STATUS[k] = v
        return hit
    items, feeds, failed = [], {}, []
    if not config.FORCE_SAMPLE:
        with ThreadPoolExecutor(6) as ex:
            res = list(ex.map(lambda r: (r[0], _company_items(*r)), PORTFOLIO))
        for sym, (its, feed) in res:
            feeds[sym] = feed
            if feed == "failed":
                failed.append(sym)
            items += its
        try:
            mitems, stats = _market_items(th)
            SOURCES["prices"] = {"ok": bool(stats), "detail": f"{len(stats)}/{len(PORTFOLIO)} tickers"}
        except Exception as e:
            mitems, stats = [], {}
            SOURCES["prices"] = {"ok": False, "detail": str(e)[:100]}
        items += mitems
    simulated = False
    if config.FORCE_SAMPLE or len(failed) == len(PORTFOLIO):
        items = _sample_items() + items
        simulated = True
    cutoff = datetime.now(IST) - timedelta(days=30)
    material = set(th["material_categories"])
    for it in items:
        if it["kind"] == "announcement":
            it["alert"] = it["category"] in material and it["priority"] != "routine"
    items = [i for i in items if datetime.fromisoformat(i["datetime"]) >= cutoff]
    for it in items:
        it["headline"] = plain_headline(it)
    rank = {"high": 0, "medium": 1, "routine": 2}
    items.sort(key=lambda i: (rank[i["priority"]], -datetime.fromisoformat(i["datetime"]).timestamp()))
    mode = "SIMULATED" if simulated else ("PARTIAL" if failed else "LIVE_FEEDS")
    out = {
        "generated_at": datetime.now(IST).isoformat(),
        "data_mode": mode,
        "feeds": feeds,
        "failed": failed,
        "exchanges": exchanges.STATUS,
        "thresholds": th,
        "items": items,
    }
    SOURCES["announcements"] = {"ok": not simulated, "detail": f"{len(PORTFOLIO) - len(failed)}/{len(PORTFOLIO)} companies via {', '.join(sorted(set(feeds.values())))}"}
    out["sources"] = dict(SOURCES)
    return cache.put("digest", key, out)


def market() -> dict:
    tiles = []
    for sym, label in INDICES:
        try:
            tiles.append(prices.index_tile(sym, label))
        except Exception as e:
            tiles.append({"symbol": sym, "label": label, "error": str(e)[:80]})
    return {"tiles": tiles, "market_open": prices.market_open(), "generated_at": datetime.now(IST).isoformat()}
