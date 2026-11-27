import re

import pytest
from fastapi.testclient import TestClient

from app import llm, push, rag, updates
from app.main import app

ITC, TATA, ITC_Q1 = "8dccbd03b4cb", "b4145d9c3838", "8ae9fc9b3017"


def _norm(s):
    # PDF text layers split words at arbitrary points ("FM CG"), so compare without whitespace.
    return re.sub(r"\s+", "", s).lower()


def _on_page(excerpt, text):
    """Every segment of an excerpt (split at elisions) must appear verbatim on the page."""
    return all(seg in text for seg in (_norm(x) for x in re.split(r"\.\.\.|…", excerpt)) if len(seg) > 3)


def test_no_ai_key_needed(monkeypatch):
    def no_ai(*a, **k):
        raise AssertionError("AI was called")

    monkeypatch.setattr(llm, "enabled", lambda: False)
    monkeypatch.setattr(llm, "_parse", no_ai)
    c = TestClient(app)
    for rid in (ITC, TATA):
        assert c.get(f"/api/updates/{rid}").status_code == 200
    d = updates.detail_from_record(updates.RECORDS[ITC], in_feed=False)
    assert d["earnings"]["headline"] == "Sales rose, but operating profit fell."


def test_itc_figures_reconcile_with_third_party():
    e = updates.detail_from_record(updates.RECORDS[ITC], in_feed=False)["earnings"]
    for m in e["metrics"]:
        tp = m["evidence"].get("third_party")
        if tp:
            assert all(c["matches"] for c in tp["checks"]), m["label"]


def test_itc_comparisons():
    e = updates.detail_from_record(updates.RECORDS[ITC], in_feed=False)["earnings"]
    m = {x["key"]: x for x in e["metrics"]}
    assert m["margin"]["changes"]["yoy"]["kind"] == "pp"
    assert m["sales"]["changes"]["yoy"]["value"] == 3.9
    assert m["op"]["changes"]["yoy"]["value"] == -15.7
    gross = m["gross_revenue"]["changes"]
    assert not gross["yoy"]["comparable"] and "defined differently" in gross["yoy"]["reason"]
    assert gross["qoq"]["comparable"]
    assert not m["sales"]["changes"]["yoy"]["like_for_like"]
    assert all(m[k]["figures"][c]["verified"] for k in ("pbt", "pat", "gross_revenue") for c in ("cur", "yoy", "qoq"))
    assert not any(m[k]["figures"]["cur"]["verified"] for k in ("sales", "costs", "op", "margin"))


def test_tata_status_keeps_completed_and_approved_apart():
    facts = updates.detail_from_record(updates.RECORDS[TATA], in_feed=False)["disclosure"]["facts"]
    status = next(f for f in facts if f["key"] == "status")
    assert {"completed", "approved"} <= {i["state"] for i in status["items"]}
    assert all((f.get("source") or {}).get("page") or f.get("items") for f in facts)


def test_detail_survives_source_failure(monkeypatch):
    item = {"id": "x1", "kind": "announcement", "symbol": "ITC", "company": "ITC", "category": "results", "title": "Results",
            "summary": None, "datetime": "2026-11-02T18:20:16+05:30", "url": "https://nsearchives.nseindia.in/x.pdf",
            "feed": "NSE", "priority": "high", "why": "Results filing", "details": {"type": "results"}}
    monkeypatch.setitem(push.ID_INDEX, "x1", item)

    def boom(*a, **k):
        raise ConnectionError("down")

    from app.connectors import screener
    monkeypatch.setattr(screener, "company", boom)
    monkeypatch.setattr(rag, "pdf_pages", boom)
    c = TestClient(app)
    d = c.get("/api/updates/x1").json()
    assert d["layout"] == "filing" and d["disclosure"]["facts"][0]["state"] == "unavailable"
    p = c.get("/api/updates/x1/passages").json()
    assert p["state"] == "unavailable" and p["passages"] == []


def test_passages_refuse_unresolved_urls(monkeypatch):
    monkeypatch.setitem(push.ID_INDEX, "x2", {"id": "x2", "kind": "announcement", "url": "https://evil.example/doc.pdf", "symbol": "X"})
    assert updates.passages("x2")["state"] == "unavailable"


def test_itc_q1_not_restated_in_q2_filing():
    q1, q2 = updates.RECORDS[ITC_Q1], updates.RECORDS[ITC]
    assert q2["columns"]["qoq"]["period"] == q1["columns"]["cur"]["period"]
    for k, row in q1["rows"].items():
        assert q2["rows"][k]["values"]["qoq"] == row["values"]["cur"], k


def test_gross_revenue_qoq_cannot_compare_across_excise_change():
    m = {x["key"]: x for x in updates.detail_from_record(updates.RECORDS[ITC_Q1], in_feed=False)["earnings"]["metrics"]}
    assert not m["gross_revenue"]["changes"]["qoq"]["comparable"]
    assert not m["gross_revenue"]["changes"]["yoy"]["comparable"]
    assert m["sales"]["changes"]["qoq"]["comparable"]


def test_unknown_id_404():
    assert TestClient(app).get("/api/updates/doesnotexist").status_code == 404


@pytest.mark.network
@pytest.mark.parametrize("rid", sorted(updates.RECORDS))
def test_record_excerpts_are_on_cited_pages(rid):
    r = updates.RECORDS[rid]
    if r.get("text_layer") == "ocr_scan":
        pytest.skip("scanned PDF: values were read from page images; covered by test_itc_q1_not_restated_in_q2_filing")
    urls = {None: r["url"], **{f["id"]: f["url"] for f in r.get("related_filings", [])}}
    cache = {}

    def page_text(url, page):
        if url not in cache:
            try:
                cache[url] = dict((p, _norm(t)) for p, t in rag.pdf_pages(url))
            except Exception as e:
                pytest.skip(f"filing not reachable: {e}")
        return cache[url].get(page, "")

    if r["layout"] == "earnings":
        text = page_text(r["url"], r["statement"]["page"])
        for row in r["rows"].values():
            for c, v in row["values"].items():
                if row.get("note") and c == "yoy":
                    continue
                assert f"{v:.2f}" in text, (row["label"], c, v)
        for n in r["notes"]:
            assert _on_page(n["excerpt"], page_text(r["url"], n["page"])), n["ref"]
    else:
        srcs = []
        for f in r["facts"]:
            srcs += [i["source"] for i in f["items"]] if "items" in f else [f["source"]]
        for s in srcs:
            text = page_text(urls[s.get("filing")], s["page"])
            assert _on_page(s["excerpt"], text), s
