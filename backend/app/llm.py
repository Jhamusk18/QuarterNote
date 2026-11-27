"""LLM layer: model routing, structured outputs, caching hooks and a cost ledger.

Two interchangeable providers behind one function (_parse):
  - Anthropic (ANTHROPIC_API_KEY): Claude Haiku for bulk work, Claude Sonnet for reasoning.
  - Groq free tier (GROQ_API_KEY): gpt-oss-20b for bulk work, gpt-oss-120b for reasoning.
  - Google Gemini free tier (GEMINI_API_KEY): Flash-Lite.
FAST_MODEL  -> bulk work: classify filings, extract bios, extract guidance.
STRONG_MODEL -> reasoning: PULL answers, guidance-vs-actual verdicts.
If no API key is configured every function degrades gracefully and the UI says so."""
import json
import re
import threading
import time
from typing import Literal

import anthropic
import httpx
from pydantic import BaseModel, Field, ValidationError

from . import config

PRICES = {  # USD per 1M tokens (input, output)
    "claude-haiku-5-5": (0.10, 0.50),
    "claude-sonnet-5-5": (2.00, 10.00),
    "claude-opus-5-5": (4.00, 20.00),
}
FREE_TIER = {"groq", "gemini"}  # free-tier providers: calls recorded as $0

_client = None
_lock = threading.Lock()
LEDGER = {"calls": 0, "input_tokens": 0, "output_tokens": 0, "cache_read_tokens": 0, "usd": 0.0, "by_task": {}}


def enabled() -> bool:
    return config.llm_enabled()


def client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY, max_retries=2, timeout=120)
    return _client


def _record(task: str, model: str, usage) -> None:
    pin, pout = (0.0, 0.0) if config.PROVIDER in FREE_TIER else PRICES.get(model, (2.0, 10.0))
    inp = getattr(usage, "input_tokens", 0) or 0
    out = getattr(usage, "output_tokens", 0) or 0
    cr = getattr(usage, "cache_read_input_tokens", 0) or 0
    cw = getattr(usage, "cache_creation_input_tokens", 0) or 0
    usd = (inp * pin + cw * pin * 1.25 + cr * pin * 0.1 + out * pout) / 1e6
    with _lock:
        LEDGER["calls"] += 1
        LEDGER["input_tokens"] += inp + cw
        LEDGER["output_tokens"] += out
        LEDGER["cache_read_tokens"] += cr
        LEDGER["usd"] = round(LEDGER["usd"] + usd, 6)
        t = LEDGER["by_task"].setdefault(task, {"calls": 0, "usd": 0.0, "model": model})
        t["calls"] += 1
        t["usd"] = round(t["usd"] + usd, 6)


class _Usage:
    def __init__(self, meta: dict):
        self.input_tokens = meta.get("prompt_tokens", 0)
        self.output_tokens = meta.get("completion_tokens", 0)
        self.cache_read_input_tokens = 0


def _compat_parse(task: str, model: str, schema, system: str, user: str, max_tokens: int):
    """Free-tier call (Groq or Gemini, OpenAI-compatible format) with JSON output,
    validated against the same Pydantic schema as the Claude path."""
    url, key = config.OPENAI_COMPAT[config.PROVIDER]
    sys_text = (system + "\n\nReturn ONLY one JSON object (no markdown) that validates against this JSON Schema:\n"
                + json.dumps(schema.model_json_schema()))
    prompt = user
    last_err = None
    tries = 5
    for attempt in range(tries):
        body = {
            "model": model,
            "messages": [{"role": "system", "content": sys_text}, {"role": "user", "content": prompt}],
            "response_format": {"type": "json_object"},
            "temperature": 0.2,
            "max_tokens": min(3000 if config.PROVIDER == "groq" else 8000, max(2000, max_tokens)),
        }
        if config.PROVIDER == "groq":
            body["reasoning_effort"] = "low"  # keeps hidden reasoning short: faster, fewer free-tier tokens
        r = httpx.post(url, json=body, timeout=120,
                       headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
        last = attempt == tries - 1
        if r.status_code == 429 and not last:
            # Free-tier tokens-per-minute limit: wait as long as the provider asks (capped), then retry.
            wait = r.headers.get("retry-after")
            m = re.search(r"try again in ([\d.]+)s", r.text)
            secs = float(wait) if wait and wait.replace(".", "", 1).isdigit() else float(m.group(1)) if m else 10.0
            time.sleep(min(30.0, secs + 1))
            last_err = "rate limited"
            continue
        if r.status_code in (500, 502, 503, 504) and not last:
            time.sleep(4)
            last_err = f"HTTP {r.status_code}"
            continue
        if r.status_code == 400 and "json_validate_failed" in r.text and not last:
            last_err = "invalid JSON"
            prompt = user + "\n\nReply with ONE valid JSON object only."
            continue
        if r.status_code >= 400:
            raise RuntimeError(f"{config.PROVIDER} HTTP {r.status_code}: {r.text[:200]}")
        data = r.json()
        if isinstance(data, list):
            data = data[0]
        _record(task, model, _Usage(data.get("usage") or {}))
        choices = data.get("choices") or []
        if not choices:
            raise RuntimeError("model returned no answer (blocked or empty)")
        text = (choices[0].get("message", {}).get("content") or "").strip()
        text = text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        try:
            return schema.model_validate_json(text)
        except ValidationError as e:
            last_err = str(e)[:300]
            prompt = user + f"\n\nYour previous reply did not match the schema ({last_err}). Reply again with valid JSON only."
    raise RuntimeError(f"{config.PROVIDER} output invalid: {last_err}")


def _parse(task: str, model: str, schema, system: str, user: str, max_tokens: int = 4000, effort: str = "low"):
    if config.PROVIDER in config.OPENAI_COMPAT:
        return _compat_parse(task, model, schema, system, user, max_tokens)
    resp = client().messages.parse(
        model=model,
        max_tokens=max_tokens,
        system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user}],
        output_format=schema,
        output_config={"effort": effort},
    )
    _record(task, model, resp.usage)
    if resp.stop_reason == "refusal":
        raise RuntimeError("model declined")
    return resp.parsed_output


# ---------------------------------------------------------------- classification
class _Cat(BaseModel):
    category: str


def classify_announcement(title: str, summary: str, categories: list[str]) -> str | None:
    try:
        out = _parse(
            "classify", config.FAST_MODEL, _Cat,
            "You classify Indian stock-exchange corporate announcements. Reply with exactly one "
            "category key from this list: " + ", ".join(categories) + ". Use 'unclassified' for routine "
            "compliance paperwork.",
            f"Title: {title}\nSummary: {summary or '-'}", max_tokens=300,
        )
        return out.category
    except Exception:
        return None


# ---------------------------------------------------------------- management change bio
class Appointee(BaseModel):
    name: str | None = Field(None, description="Incoming person's name, null if not an appointment")
    role: str | None = None
    effective_date: str | None = None
    background: str | None = Field(None, description="2-3 short lines: previous roles, education. ONLY from the text.")
    outgoing: str | None = Field(None, description="Name of person resigning/retiring if stated")
    page: int | None = Field(None, description="Page number where the profile appears")


def extract_appointee(pages: list[tuple[int, str]]) -> dict | None:
    text = "\n".join(f"[page {p}]\n{t[:3500]}" for p, t in pages[:4])
    out = _parse(
        "mgmt_bio", config.FAST_MODEL, Appointee,
        "Extract the incoming executive/director from this Regulation 30 disclosure. Use only facts "
        "stated in the text (SEBI requires a 'brief profile'). Never add outside knowledge. If a field "
        "is not in the text, return null.",
        text, max_tokens=800,
    )
    return out.model_dump()


# ---------------------------------------------------------------- PULL answers
class Finding(BaseModel):
    text: str = Field(description="One concise finding with figures and periods")
    kind: Literal["reported", "calculated", "interpretation"]
    sources: list[str] = Field(description="Source ids like S1, S2 that support this finding")


class ResearchAnswer(BaseModel):
    answer: str = Field(description="Direct answer in 1-3 sentences with inline [S#] markers")
    findings: list[Finding]
    verdict: str | None = Field(None, description="Short takeaway / what it means for an investor")
    not_found: list[str] = Field(default_factory=list, description="Parts of the question the sources do not cover")


RESEARCH_SYSTEM = """You are QuarterNote, an equity research assistant for Indian listed companies.
STRICT RULES:
1. Use ONLY the numbered source excerpts provided ([S1], [S2]...). They come from the company's
   own primary documents (annual reports, results, concall transcripts, investor presentations)
   and QuarterNote's standardised financial tables compiled from exchange filings.
2. Do NOT use outside knowledge about the company, news, broker views or your memory. If the
   excerpts do not contain the information, say "Not found in sources" and list it in not_found.
3. Every finding must cite at least one source id. Never invent a source id.
4. Label each finding: reported (number stated in a document), calculated (you derived it from
   reported numbers — show the arithmetic briefly), interpretation (your analytical judgement).
5. Be concise and dense: figures, periods, direction. No filler. Indian number formats (₹ Cr)."""


def research_answer(company: str, question: str, history: list[dict], sources_block: str, view_hint: str = "") -> dict:
    hist = "\n".join(f"{h['role'].upper()}: {h['content'][:600]}" for h in history[-6:])
    user = (
        f"Company: {company}\n"
        + (f"Conversation so far:\n{hist}\n\n" if hist else "")
        + (f"Requested view: {view_hint}\n" if view_hint else "")
        + f"Question: {question}\n\nSOURCES:\n{sources_block}"
    )
    out = _parse("research", config.STRONG_MODEL, ResearchAnswer, RESEARCH_SYSTEM, user, max_tokens=4000, effort="medium")
    return out.model_dump()


# ---------------------------------------------------------------- guidance vs actuals
class GuidanceItem(BaseModel):
    metric: str = Field(description="e.g. Revenue growth (cc), Operating margin, Capex, EBITDA margin")
    period_guided_for: str = Field(description="Fiscal year/quarter the guidance applies to, e.g. FY27")
    guidance: str = Field(description="The numeric guidance, e.g. '3-5% cc growth' or 'margin 20-22%'")
    quote: str = Field(description="Short verbatim quote from the transcript")
    source: str = Field(description="Source id, e.g. S3")


class GuidanceList(BaseModel):
    items: list[GuidanceItem]


def extract_guidance(company: str, call_label: str, sources_block: str) -> list[dict]:
    out = _parse(
        "guidance_extract", config.FAST_MODEL, GuidanceList,
        "Extract management's explicit forward-looking NUMERICAL guidance (growth, margins, capex, "
        "volumes, ROE etc.) from these earnings-call excerpts. Only include statements made by management "
        "with a number or numeric range. Quote verbatim. If none, return an empty list.",
        f"Company: {company}\nCall: {call_label}\n\n{sources_block}", max_tokens=2500,
    )
    return [i.model_dump() for i in out.items]


class Verdict(BaseModel):
    metric: str
    guided: str
    guided_in: str = Field(description="Which call the guidance came from")
    guidance_source: str
    actual: str = Field(description="What was delivered, with figures; 'Not yet reported' if period not over")
    actual_source: str | None
    variance: str | None = Field(None, description="Gap vs guidance, e.g. '-1.2 pp' or 'within range'")
    verdict: Literal["Delivered", "Partially delivered", "Missed", "Pending", "Raised", "Cut"]
    reason: str | None = Field(None, description="Reason management gave for the gap, ONLY if in sources, else null")


class Scorecard(BaseModel):
    rows: list[Verdict]
    summary: str = Field(description="2 sentences: overall credibility of guidance, citing [S#]")


def judge_guidance(company: str, guidance_json: str, sources_block: str) -> dict:
    out = _parse(
        "guidance_judge", config.STRONG_MODEL, Scorecard,
        RESEARCH_SYSTEM + "\nTask: compare each guidance item with what was subsequently reported. "
        "Use the standardised quarterly table and later transcripts/presentations for actuals. "
        "Mark 'Pending' if the guided period has not finished. 'Raised'/'Cut' if management revised it.",
        f"Company: {company}\nGUIDANCE ITEMS:\n{guidance_json}\n\nSOURCES:\n{sources_block}",
        max_tokens=6000, effort="medium",
    )
    return out.model_dump()


def ledger() -> dict:
    with _lock:
        return json.loads(json.dumps(LEDGER)) | {
            "enabled": enabled(), "provider": config.PROVIDER, "fast_model": config.FAST_MODEL, "strong_model": config.STRONG_MODEL,
            "since": _START,
        }


_START = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
