"""FINN API + static frontend (single service)."""
import json
import re
from datetime import datetime

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import config, llm, push, rag, research, updates
from .companies import ADHOC, ALL_KNOWN, PORTFOLIO, as_dicts
from .connectors import exchanges, prices, screener

app = FastAPI(title="FINN API", version="0.2.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/api/health")
def health():
    return {"ok": True, "time": datetime.utcnow().isoformat() + "Z"}


@app.get("/api/status")
def status():
    return {
        "llm": llm.ledger(),
        "sources": push.SOURCES,
        "exchanges": exchanges.STATUS,
        "market_open": prices.market_open(),
        "force_sample": config.FORCE_SAMPLE,
    }


@app.get("/api/companies")
def companies():
    return {"portfolio": as_dicts(PORTFOLIO, "portfolio"), "adhoc": as_dicts(ADHOC, "adhoc")}


@app.get("/api/company/search")
def company_search(q: str = Query("", min_length=0)):
    ql = q.strip().lower()
    local = [{"symbol": s, "name": n, "group": "portfolio" if s in dict((p[0], 1) for p in PORTFOLIO) else "adhoc"}
             for s, n in ALL_KNOWN.items() if ql and (ql in s.lower() or ql in n.lower())]
    remote = []
    if len(ql) >= 2:
        try:
            remote = [{**r, "group": "search"} for r in screener.search(q)]
        except Exception:
            remote = []
    seen, out = set(), []
    for r in local + remote:
        if r["symbol"] in seen:
            continue
        seen.add(r["symbol"])
        out.append(r)
    return {"results": out[:12]}


def _thresholds(vol: float | None, px: float | None, material: str | None, overrides: str | None):
    th = dict(push.DEFAULT_THRESHOLDS)
    if vol:
        th["volume_multiple"] = max(1.0, min(vol, 20.0))
    if px:
        th["price_move_pct"] = max(0.5, min(px, 50.0))
    if material is not None:
        th["material_categories"] = [m for m in material.split(",") if m]
    if overrides:
        try:
            th["overrides"] = json.loads(overrides)
        except ValueError:
            pass
    return th


@app.get("/api/digest")
def digest(vol: float | None = None, px: float | None = None, material: str | None = None, overrides: str | None = None,
           window: str | None = None, priority: str | None = None, companies: str | None = None, categories: str | None = None):
    d = push.digest(_thresholds(vol, px, material, overrides))
    # Optional server-side filtering (the app filters client-side from the full 30-day set).
    items = d["items"]
    if window:
        hours = {"24h": 24, "48h": 48, "7d": 168, "30d": 720}.get(window)
        if hours:
            cut = datetime.now(push.IST).timestamp() - hours * 3600
            items = [i for i in items if datetime.fromisoformat(i["datetime"]).timestamp() >= cut]
    if priority:
        items = [i for i in items if i["priority"] in priority.split(",")]
    if companies:
        items = [i for i in items if i["symbol"] in companies.split(",")]
    if categories:
        items = [i for i in items if i["category"] in categories.split(",")]
    return {**d, "items": items}


@app.get("/api/alerts")
def alerts(vol: float | None = None, px: float | None = None, material: str | None = None, overrides: str | None = None):
    d = push.digest(_thresholds(vol, px, material, overrides))
    return {"generated_at": d["generated_at"], "thresholds": d["thresholds"], "items": [i for i in d["items"] if i.get("alert")]}


@app.get("/api/updates/historical")
def updates_historical():
    return {"items": updates.historical()}


@app.get("/api/updates/{item_id}")
def update_detail(item_id: str):
    d = updates.get_detail(item_id)
    if not d:
        raise HTTPException(404, "This update is not in the last 30 days of filings any more.")
    return {**d, "refreshed_at": datetime.now(push.IST).isoformat()}


@app.get("/api/updates/{item_id}/passages")
def update_passages(item_id: str):
    return updates.passages(item_id)


@app.get("/api/updates/{item_id}/track")
def update_track(item_id: str, metric: str, baseline: str):
    return updates.track(item_id, metric, baseline)


@app.get("/api/updates/{item_id}/management")
def update_management(item_id: str):
    return updates.management_said(item_id)


@app.get("/api/market")
def market():
    return push.market()


@app.get("/api/quote/{symbol}")
def quote(symbol: str):
    sym = re.sub(r"[^A-Z0-9&-]", "", symbol.upper())
    try:
        return prices.eod_stats(sym)
    except Exception as e:
        return JSONResponse({"error": f"No reliable EOD price available ({type(e).__name__})"}, status_code=404)


def _sym(symbol: str) -> str:
    sym = re.sub(r"[^A-Z0-9&-]", "", symbol.upper())
    if not sym:
        raise HTTPException(400, "bad symbol")
    return sym


@app.post("/api/research/{symbol}/prepare")
def prepare(symbol: str):
    sym = _sym(symbol)
    try:
        screener.company(sym)
    except LookupError:
        raise HTTPException(404, f"{sym}: no fundamentals found on screener.in")
    except Exception as e:
        raise HTTPException(502, f"Could not reach fundamentals source: {type(e).__name__}")
    return rag.ensure_async(sym)


@app.get("/api/research/{symbol}/status")
def research_status(symbol: str):
    sym = _sym(symbol)
    st = rag.STATUS.get(sym) or {"state": "idle"}
    idx = rag.get_index(sym)
    docs = [{k: d.get(k) for k in ("id", "title", "kind", "period", "url", "pages")} for d in idx["docs"].values()] if idx else []
    return {**st, "indexed_docs": docs, "llm": llm.enabled()}


@app.get("/api/research/{symbol}/snapshot")
def research_snapshot(symbol: str):
    try:
        return research.snapshot(_sym(symbol))
    except LookupError as e:
        raise HTTPException(404, str(e))


class Ask(BaseModel):
    symbol: str
    question: str
    history: list[dict] = []
    view: str | None = None


@app.post("/api/research")
def ask(body: Ask):
    sym = _sym(body.symbol)
    if not body.question.strip() and not body.view:
        raise HTTPException(400, "empty question")
    q = body.question.strip() or research.VIEWS.get(body.view or "", "")
    try:
        return research.answer(sym, q, body.history, body.view)
    except LookupError as e:
        raise HTTPException(404, str(e))


@app.get("/api/research/{symbol}/guidance-vs-actuals")
def gva(symbol: str):
    try:
        return research.guidance(_sym(symbol))
    except LookupError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        return JSONResponse({"available": False, "reason": f"Guidance analysis failed: {type(e).__name__}: {str(e)[:120]}"}, status_code=200)


@app.post("/api/research/{symbol}/upload")
async def upload(symbol: str, file: UploadFile = File(...)):
    sym = _sym(symbol)
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(413, "PDF larger than 25 MB")
    if not data.startswith(b"%PDF"):
        raise HTTPException(415, "That file is not a PDF")
    try:
        doc = rag.add_upload(sym, file.filename or "document.pdf", data)
    except Exception as e:
        raise HTTPException(422, f"Could not process PDF: {e}")
    return {"ok": True, "doc": doc}


@app.get("/api/files/{name}")
def files(name: str):
    if not re.fullmatch(r"[0-9a-f]{12}\.pdf", name):
        raise HTTPException(404)
    p = config.CACHE_DIR / "uploads" / name
    if not p.exists():
        raise HTTPException(404)
    return FileResponse(p, media_type="application/pdf")


# ---------------------------------------------------------------- frontend
if config.FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=config.FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        f = config.FRONTEND_DIST / path
        if path and f.is_file():
            return FileResponse(f)
        return FileResponse(config.FRONTEND_DIST / "index.html")
