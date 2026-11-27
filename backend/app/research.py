"""PULL: evidence-backed answers, deterministic financial cards, and the
Management Guidance vs Actuals scorecard."""
import hashlib
import json
import re

from . import cache, llm, rag

VIEWS = {
    "business": "Business snapshot: what the company does, its segments and revenue mix, key operating metrics.",
    "financial": "Financial snapshot: latest quarter and full-year revenue, margins, PAT and key ratios.",
    "trajectory": "Multi-year trajectory: which lines are growing and which are compressing over the last 5 years.",
    "balance": "Balance sheet: debt, leverage, working-capital cycle and funding structure.",
    "cash": "Cash quality: operating cash flow vs profit, free cash flow, cash conversion.",
    "narrative": "Narrative vs numbers: where management's commentary and the reported financials agree or diverge.",
    "bullbear": "Bull vs bear: a tight evidence-backed case each way.",
    "risks": "Key financial and business risks disclosed or discussed by management.",
}
NUMERIC_HINT = re.compile(r"revenue|margin|profit|pat|ebitda|growth|debt|cash|ratio|roe|roce|eps|sales|number|trajectory|financial|balance|quarter|year", re.I)


def _source_entry(sid: str, ch: dict, d: dict) -> dict:
    url = d["url"]
    if ch.get("page") and d["kind"] != "table":
        url = f"{url}#page={ch['page']}"
    return {"id": sid, "title": d["title"], "kind": d["kind"], "period": d.get("period"), "page": ch.get("page"),
            "url": url, "snippet": re.sub(r"\s+", " ", ch["text"])[:320]}


def gather(idx: dict, query: str, k: int = 8, include_tables: bool = True) -> tuple[list[dict], list[dict]]:
    hits = rag.search(idx, query, k=k, kinds={"transcript", "presentation", "annual_report", "upload"})
    if include_tables:
        hits = rag.search(idx, query, k=2, kinds={"table"}, per_doc=2) + hits
    sources, chunks = [], []
    for i, ch in enumerate(hits, 1):
        d = idx["docs"][ch["doc"]]
        sources.append(_source_entry(f"S{i}", ch, d))
        chunks.append(ch)
    return sources, chunks


def _block(sources, chunks) -> str:
    parts = []
    for s, ch in zip(sources, chunks):
        loc = f"p.{s['page']}" if s["page"] else "table"
        parts.append(f"[{s['id']}] {s['title']} ({loc})\n{ch['text']}")
    return "\n\n".join(parts)


def _best_window(text: str, terms: list[str], width: int = 300) -> str:
    sents = re.split(r"(?<=[.!?])\s+|\n", re.sub(r"[ \t]+", " ", text))
    best, score = "", -1
    for i in range(len(sents)):
        win = " ".join(sents[i:i + 3])
        sc = sum(win.lower().count(t) for t in terms)
        if sc > score:
            best, score = win, sc
    best = best.strip()
    return (best[:width] + "…") if len(best) > width else best


def _extractive(question: str, sources: list[dict], chunks: list[dict] | None = None) -> dict:
    terms = [t for t in rag._expand(question) if len(t) > 3]
    findings = []
    pairs = list(zip(sources, chunks or [{}] * len(sources)))
    pairs.sort(key=lambda p: p[0]["kind"] == "table")
    for s, ch in pairs[:5]:
        txt = _best_window(ch.get("text") or s["snippet"], terms) if s["kind"] != "table" else s["snippet"][:260] + "…"
        findings.append({"text": txt, "kind": "reported", "sources": [s["id"]]})
    return {
        "mode": "extractive",
        "answer": "AI reasoning is not configured on this server, so FINN is showing the most relevant passages "
                  "from the company's primary documents instead of a synthesised answer.",
        "findings": findings, "verdict": None, "not_found": [], "terms": terms,
    }


def answer(sym: str, question: str, history: list[dict], view: str | None = None) -> dict:
    idx = rag.get_index(sym) or rag.build_index(sym)
    q = question.strip()
    view_hint = VIEWS.get(view or "", "")
    prev_user = next((h["content"] for h in reversed(history or []) if h.get("role") == "user"), "")
    retrieval_q = " ".join(x for x in (q, view_hint, prev_user if len(q) < 60 else "") if x)
    key = json.dumps([sym, q.lower(), view, prev_user.lower()[:200], idx["built"] // 3600, llm.enabled()])
    hit = cache.get("research", key, ttl=6 * 3600)
    if hit:
        return {**hit, "cached": True}
    sources, chunks = gather(idx, retrieval_q, include_tables=bool(NUMERIC_HINT.search(retrieval_q)) or True)
    if not sources or all(c.get("score", 0) <= 0 for c in chunks if c.get("page")):
        res = {"mode": "none", "answer": "Not found in sources.", "findings": [], "verdict": None,
               "not_found": [q], "sources": sources}
        return res
    if llm.enabled():
        try:
            out = llm.research_answer(idx["company"]["name"], q, history or [], _block(sources, chunks), view_hint)
            out["mode"] = "ai"
        except Exception as e:
            out = _extractive(q, sources, chunks)
            out["answer"] = f"AI call failed ({type(e).__name__}); showing retrieved passages instead."
    else:
        out = _extractive(q, sources, chunks)
    valid = {s["id"] for s in sources}
    for f in out.get("findings", []):
        f["sources"] = [x for x in f.get("sources", []) if x in valid]
        f["text"] = re.sub(r"\s*\[S\d+(?:\s*[,;]\s*S\d+)*\]", "", f.get("text", ""))  # chips show the citations
    cited = set(re.findall(r"S\d+", out.get("answer", "") + " " + (out.get("verdict") or "")))
    for f in out.get("findings", []):
        cited |= set(f["sources"])
    out["sources"] = [s for s in sources if s["id"] in cited] or sources
    out["model"] = llm.config.STRONG_MODEL if out["mode"] == "ai" else None
    return cache.put("research", key, out)


# ---------------------------------------------------------------- deterministic cards
def _row(t, *names):
    for n in names:
        if t.get("rows", {}).get(n):
            return t["rows"][n]
    return None


def _cagr(a, b, years):
    try:
        if a and b and a > 0 and b > 0 and years > 0:
            return round(((b / a) ** (1 / years) - 1) * 100, 1)
    except Exception:
        pass
    return None


def snapshot(sym: str) -> dict:
    """Numbers computed directly from the standardised tables — no LLM, labelled 'calculated'."""
    from .connectors import screener
    c = screener.company(sym)
    q, a, bs, cf = c.get("quarters", {}), c.get("annual", {}), c.get("balance_sheet", {}), c.get("cash_flow", {})
    src = {"title": "Standardised financials (compiled from exchange filings)", "url": c["url"]}
    out = {"symbol": sym, "name": c["name"], "source": src, "ratios": c.get("ratios", {})}
    rev = _row(q, "Sales", "Revenue")
    pat = _row(q, "Net Profit")
    opm = _row(q, "OPM %", "Financing Margin %")
    op = _row(q, "Operating Profit")
    if rev and q.get("periods"):
        from .push import quarter_label
        out["latest_quarter"] = {"period": q["periods"][-1], "period_label": quarter_label(q["periods"][-1]),
                                 "basis": "Consolidated" if "/consolidated" in c["url"] else "Standalone",
                                 "revenue_label": "Sales" if q.get("rows", {}).get("Sales") else "Revenue",
                                 "operating_profit": op[-1] if op else None,
                                 "operating_profit_yoy": round((op[-1] / op[-5] - 1) * 100, 1) if op and len(op) > 4 and op[-5] and op[-5] > 0 else None,
                                 "revenue": rev[-1], "pat": pat[-1] if pat else None,
                                 "opm": opm[-1] if opm else None,
                                 "revenue_yoy": round((rev[-1] / rev[-5] - 1) * 100, 1) if len(rev) > 4 and rev[-5] else None,
                                 "pat_yoy": round((pat[-1] / pat[-5] - 1) * 100, 1) if pat and len(pat) > 4 and pat[-5] else None}
        out["quarters"] = {"periods": q["periods"][-8:], "revenue": rev[-8:], "pat": (pat or [])[-8:], "opm": (opm or [])[-8:]}
    arev, apat, aopm = _row(a, "Sales", "Revenue"), _row(a, "Net Profit"), _row(a, "OPM %", "Financing Margin %")
    if arev and a.get("periods"):
        periods = a["periods"]
        # drop TTM column if present
        cut = -1 if periods[-1].upper().startswith("TTM") else len(periods)
        P, R, N = periods[:cut], arev[:cut], (apat or [])[:cut]
        out["annual"] = {"periods": P[-6:], "revenue": R[-6:], "pat": N[-6:], "opm": (aopm or [])[:cut][-6:]}
        if len(R) >= 6:
            out["cagr"] = {"revenue_5y": _cagr(R[-6], R[-1], 5), "pat_5y": _cagr(N[-6], N[-1], 5) if len(N) >= 6 else None}
    if bs.get("rows"):
        borrow, eq, res = _row(bs, "Borrowings"), _row(bs, "Equity Capital"), _row(bs, "Reserves")
        if borrow and eq and res:
            nw = (eq[-1] or 0) + (res[-1] or 0)
            out["balance"] = {"period": bs["periods"][-1], "borrowings": borrow[-1], "net_worth": nw,
                              "debt_to_equity": round(borrow[-1] / nw, 2) if nw else None,
                              "borrowings_trend": borrow[-5:], "periods": bs["periods"][-5:]}
    if cf.get("rows") and apat:
        cfo = _row(cf, "Cash from Operating Activity")
        cfi = _row(cf, "Cash from Investing Activity")
        if cfo:
            n = min(5, len(cfo))
            pats = (apat[:cut] if arev else apat)[-n:]
            conv = round(sum(x or 0 for x in cfo[-n:]) / sum(x or 0 for x in pats) * 100) if sum(x or 0 for x in pats) else None
            out["cash"] = {"periods": cf["periods"][-n:], "cfo": cfo[-n:], "pat": pats, "conversion_pct_5y": conv,
                           "cfi": (cfi or [])[-n:]}
    return out


# ---------------------------------------------------------------- guidance vs actuals
GUIDANCE_Q = "guidance outlook expect expecting range target margin band growth FY capex for the year we guide aspire"


def guidance(sym: str) -> dict:
    idx = rag.get_index(sym) or rag.build_index(sym)
    transcripts = [d for d in idx["docs"].values() if d["kind"] == "transcript"][:4]
    if not llm.enabled():
        return {"available": False, "reason": "Guidance vs Actuals needs the AI layer (set GROQ_API_KEY or GEMINI_API_KEY for a free tier, or ANTHROPIC_API_KEY).",
                "calls_found": [d["title"] for d in transcripts]}
    if not transcripts:
        return {"available": False, "reason": "No earnings-call transcripts found for this company."}
    key = json.dumps([sym, sorted(d["id"] for d in transcripts)])
    hit = cache.get("guidance", key, ttl=24 * 3600)
    if hit:
        return {**hit, "cached": True}
    registry, chunks_for = [], []

    def reg(ch):
        for s, c in zip(registry, chunks_for):
            if c["doc"] == ch["doc"] and c["page"] == ch["page"] and c["text"][:60] == ch["text"][:60]:
                return s["id"]
        sid = f"S{len(registry) + 1}"
        registry.append(_source_entry(sid, ch, idx["docs"][ch["doc"]]))
        chunks_for.append(ch)
        return sid

    items = []
    for d in reversed(transcripts):  # oldest first
        hits = rag.search(idx, GUIDANCE_Q, k=4, doc_ids={d["id"]}, per_doc=4)
        ids = [reg(h) for h in hits]
        block = "\n\n".join(f"[{i}] {d['title']} (p.{h['page']})\n{h['text']}" for i, h in zip(ids, hits))
        ck = "gx:" + d["id"]
        extracted = cache.get("guidance_extract", ck)
        if extracted is None:
            extracted = cache.put("guidance_extract", ck, llm.extract_guidance(idx["company"]["name"], d["title"], block))
        for it in extracted:
            it["call"] = d["title"]
            items.append(it)
    if not items:
        return {"available": True, "rows": [], "summary": "No explicit numerical guidance found in the last four call transcripts.",
                "sources": registry}
    free_tier = llm.config.PROVIDER in llm.FREE_TIER  # tight tokens-per-minute budget on free tiers
    items = items[:8] if free_tier else items[:14]
    # The judge sees only what it needs: the passages the guidance was quoted from,
    # the standardised tables, and later commentary on each guided metric.
    needed = {it.get("source") for it in items}
    for t in rag.search(idx, "quarterly revenue operating profit margin net profit", k=2, kinds={"table"}, per_doc=2):
        needed.add(reg(t))
    for it in items:
        for h in rag.search(idx, f"{it['metric']} {it['period_guided_for']} actual delivered", k=1 if free_tier else 2,
                            kinds={"transcript", "presentation"}, per_doc=1):
            needed.add(reg(h))
    cap = 650 if free_tier else 1200
    block = "\n\n".join(f"[{s['id']}] {s['title']} ({'p.' + str(s['page']) if s['page'] else 'table'})\n{c['text'][:cap]}"
                        for s, c in zip(registry, chunks_for) if s["id"] in needed)
    card = llm.judge_guidance(idx["company"]["name"], json.dumps(items, ensure_ascii=False), block)
    valid = {s["id"] for s in registry}
    cited = set(re.findall(r"S\d+", json.dumps(card))) & valid
    out = {"available": True, **card, "sources": [s for s in registry if s["id"] in cited],
           "calls": [d["title"] for d in transcripts], "model": llm.config.STRONG_MODEL}
    return cache.put("guidance", key, out)
