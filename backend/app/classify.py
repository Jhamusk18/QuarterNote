"""Announcement classification into the 17 reference categories + priority.

Routing: deterministic rules first (free, instant, auditable). Only titles the rules
can't place fall through to the cheap LLM (FAST_MODEL), and every LLM verdict is cached
by announcement URL so each filing is classified at most once."""
import re

from . import cache, llm

CATEGORIES = [
    ("results", "Results"),
    ("M&A", "M&A"),
    ("fund_raise", "Fund raise"),
    ("management_change", "Management change"),
    ("litigation", "Litigation"),
    ("insider_trading", "Insider trading"),
    ("earnings_call", "Earnings call"),
    ("investor_meetings", "Investor meetings"),
    ("credit_rating", "Credit rating"),
    ("dividend", "Dividend"),
    ("bonus_split", "Bonus / split"),
    ("capex", "Capex"),
    ("press_release", "Press release"),
    ("postal_ballot", "Postal ballot"),
    ("agm_egm", "AGM / EGM"),
    ("pledging", "Pledging"),
    ("unclassified", "Unclassified"),
]
CATEGORY_KEYS = [c for c, _ in CATEGORIES]

# Order matters: first match wins.
RULES = [
    ("earnings_call", r"transcript|earnings call|conference call|concall|analysts?/institutional investor meet.*(audio|recording)|audio recording|call recording"),
    ("results", r"financial results?|\bresults?\b.*(quarter|half year|year ended|q[1-4])|outcome of board meeting.*result|integrated filing.*financial|results? press release|unaudited.*results|audited.*results|shareholder letter|fact sheet"),
    ("management_change", r"appoint|resign|cessation|re-?designat|chief executive|\bceo\b|\bcfo\b|managing director|whole[- ]time director|independent director|key managerial|\bkmp\b|change in (directors|management|senior management)|retire"),
    ("M&A", r"acqui|merger|amalgamat|demerger|joint venture|\bjv\b|scheme of arrangement|stake (sale|purchase)|divest|incorporation of (a )?(wholly owned )?subsidiary|investment in (wholly owned )?subsidiary|slump sale|business transfer"),
    ("fund_raise", r"\bqip\b|qualified institution|rights issue|preferential (issue|allotment)|buy-?back|commercial paper|non-?convertible debenture|\bncds?\b|fund rais|raising of funds|private placement|bonds?\b"),
    ("credit_rating", r"credit rating|\brating\b|crisil|icra|\bcare ratings|india ratings|brickwork"),
    ("dividend", r"dividend"),
    ("bonus_split", r"bonus|sub-?division|stock split|split of"),
    ("pledging", r"pledg|encumbrance"),
    ("insider_trading", r"insider trading|reg(ulation)?\.? ?7\(2\)|sast|substantial acquisition|disclosure under regulation 29"),
    ("litigation", r"litigation|penalt|\bfine\b|show cause|\border\b.*(court|tribunal|sebi|authority|commission|tax)|tax demand|nclt|insolvency|\bgst\b.*(demand|order)|arbitration|lawsuit|regulatory action|warning letter|\bfda\b|form 483|import alert"),
    ("capex", r"capex|capacity expansion|new (plant|facility|manufacturing)|commission(ing|ed) of|greenfield|brownfield|expansion of (the )?(plant|facility|capacity|centre|center)"),
    ("investor_meetings", r"investor (meet|conference|presentation|day)|analyst(s)? meet|institutional investor|one-on-one|schedule of (analyst|investor)|participation in.*conference"),
    ("agm_egm", r"\bagm\b|\begm\b|annual general meeting|extra-?ordinary general meeting|general meeting"),
    ("postal_ballot", r"postal ballot|e-?voting|scrutini[sz]er"),
    ("unclassified", r"trading window|newspaper (publication|advertisement)|compliance certificate|regulation 74\(5\)|loss of share certificate|duplicate share|esop|esos|allotment of.*(equity shares|securities).*employee|stock option|trading window|book closure|certificate under|reg(ulation)? 40\(9\)|secretarial|esg|brsr|sustainability report|change in registrar|statement of deviation|intimation of record date$|address change|investor complaints|auditor"),
    ("press_release", r"press release|order|contract|wins?|launch|partner|collaborat|agreement|mou|clarification|award|announces|expansion|signs"),
]
_COMPILED = [(c, re.compile(p, re.I)) for c, p in RULES]

# Default priority per category (High = material, Medium = noteworthy, Routine = everything else)
BASE_PRIORITY = {
    "results": "high", "M&A": "high", "management_change": "high", "litigation": "high",
    "fund_raise": "high", "pledging": "high", "credit_rating": "medium",
    "dividend": "medium", "bonus_split": "medium", "capex": "medium", "insider_trading": "medium",
    "earnings_call": "medium", "press_release": "routine", "investor_meetings": "routine",
    "agm_egm": "routine", "postal_ballot": "routine", "unclassified": "routine",
}

_SENIOR = re.compile(r"\bceo\b|\bcfo\b|chief|managing director|\bmd\b|chairman|whole[- ]time|president", re.I)
_BIG_PR = re.compile(r"\border|bagging|contract|acqui|launch|partnership|agreement|bags|secures", re.I)
_NOISE_MGMT = re.compile(r"senior management personnel|smp|company secretary|compliance officer|auditor", re.I)


SUBJECT_MAP = [
    (r"financial result", "results"), (r"investor presentation", "results"),
    (r"credit rating", "credit_rating"), (r"^dividend", "dividend"), (r"bonus|split", "bonus_split"),
    (r"acquisition|amalgamation|merger|scheme of arrangement|joint venture|demerger", "M&A"),
    (r"change in director|resignation|retirement|appointment|cessation|change in management|key managerial", "management_change"),
    (r"newspaper|trading window|change in auditor|certificate|loss of share|duplicate|esop|esos|xbrl|compliance", "unclassified"),
    (r"shareholders meeting|agm|egm|general meeting", "agm_egm"), (r"postal ballot", "postal_ballot"),
    (r"insolvency|litigation|dispute|penalty|action\(s\) initiated|order", "litigation"),
    (r"buyback|rights issue|qip|preferential|fund raising|private placement", "fund_raise"),
    (r"pledge|encumbrance", "pledging"), (r"insider|sast|regulation 29", "insider_trading"),
    (r"press release", "press_release"),
]
_SUBJ = [(re.compile(p, re.I), c) for p, c in SUBJECT_MAP]
_ROUTINE_OVERRIDE = re.compile(r"redemption of commercial paper|esop|esos|employee stock|stock option|newspaper|trading window|"
                               r"loss of share|duplicate share|certificate pursuant|reg(ulation)? ?74|compliance certificate|"
                               r"intimation of (the )?record date for (interest|redemption)|payment of interest|interest payment|repayment of commercial paper|"
                               r"auditor|esg rating|brsr", re.I)


def rule_category(text: str) -> str | None:
    for cat, rx in _COMPILED:
        if rx.search(text):
            return cat
    return None


BASE_REASON = {
    "results": "Results filing",
    "M&A": "Acquisition, merger, divestment or restructuring",
    "management_change": "Board or management change",
    "litigation": "Legal or regulatory matter",
    "fund_raise": "Equity fund-raise or buyback (QIP, rights, preferential, buyback)",
    "pledging": "Promoter pledge or encumbrance",
    "credit_rating": "Credit rating update",
    "dividend": "Dividend announcement",
    "bonus_split": "Bonus issue or stock split",
    "capex": "Capacity expansion or capex",
    "insider_trading": "Insider or substantial-holding disclosure",
    "earnings_call": "Earnings-call transcript filed",
    "press_release": "Press release",
    "investor_meetings": "Analyst or investor meeting schedule",
    "agm_egm": "General meeting notice",
    "postal_ballot": "Postal ballot or e-voting notice",
    "unclassified": "Routine compliance filing",
}


def priority_rule(cat: str, text: str) -> tuple[str, str]:
    """(priority, reason). The reason names the exact branch that set the priority, so the
    "Why flagged" line in the app can never drift from the prioritisation logic."""
    p, why = BASE_PRIORITY.get(cat, "routine"), BASE_REASON.get(cat, "Routine compliance filing")
    if cat == "management_change":
        if _SENIOR.search(text) and not _NOISE_MGMT.search(text):
            return "high", "Senior management change (CEO, CFO, MD, chair or whole-time director)"
        return "medium", "Board or management change below the top roles"
    if cat == "earnings_call" and not re.search(r"transcript", text, re.I):
        return "routine", "Earnings-call schedule or recording, not a transcript"
    if cat == "litigation":
        if not re.search(r"insolvency|nclt|nclat|sebi|penalt|fraud|ban|suspend|warning|import alert|483", text, re.I):
            return "medium", "Legal or regulatory matter without insolvency, SEBI, penalty or regulator-action terms"
        return "high", "Legal matter mentioning insolvency, SEBI, a penalty or regulator action"
    if cat == "credit_rating" and re.search(r"downgrad|negative|watch", text, re.I):
        return "high", "Credit rating downgrade or negative watch"
    if cat == "press_release" and _BIG_PR.search(text):
        return "medium", "Order, contract, acquisition, partnership or launch announced"
    if cat == "results" and re.search(r"presentation|newspaper|press release|fact ?sheet", text, re.I) and not re.search(r"outcome of board|financial result", text, re.I):
        return "medium", "Results-related document (presentation or press release), not the results statement"
    if cat == "fund_raise" and not re.search(r"qip|qualified institution|rights|buy-?back|preferential|warrant", text, re.I):
        return "medium", "Debt or other fund-raising (not QIP, rights, preferential or buyback)"
    return p, why


def priority_for(cat: str, text: str) -> str:
    return priority_rule(cat, text)[0]


def explain(item: dict, cat: str) -> tuple[str, str]:
    """Re-run the priority rule for a (possibly cached) classification, using the same text
    that classify() used, and return (priority, reason)."""
    text = f"{item.get('subject') or ''} {item.get('title') or ''} {item.get('summary') or ''}"
    return priority_rule(cat, text)


def classify(item: dict) -> dict:
    """Returns {category, priority, method} for an announcement dict (title, summary, url)."""
    title = item.get("title") or ""
    summary = item.get("summary") or ""
    text = f"{title} {summary}"
    key = item.get("url") or title
    hit = cache.get("classify", key)
    if hit:
        return hit
    subject = item.get("subject") or ""
    cat = None
    if _ROUTINE_OVERRIDE.search(f"{subject} {title}"):
        cat = "unclassified"
    if cat is None and re.search(r"analyst|investor meet|con\. call", subject, re.I):
        cat = "earnings_call" if re.search(r"transcript|recording|audio|video", title, re.I) else "investor_meetings"
    if cat is None and re.search(r"outcome of board meeting", subject + " " + title, re.I):
        if re.search(r"result", title, re.I):
            cat = "results"
        else:
            cat = rule_category(title) or ("results" if re.search(r"financial results", text, re.I) else rule_category(text))
    if cat is None and subject and not re.search(r"general update|updates$|^other", subject, re.I):
        for rx, c in _SUBJ:
            if rx.search(subject):
                cat = c
                break
    cat = cat or rule_category(title) or rule_category(text)
    method = "rules"
    text = f"{subject} {text}"
    if cat is None and llm.enabled():
        cat = llm.classify_announcement(title, summary, CATEGORY_KEYS)
        method = "llm-fast"
    if cat not in CATEGORY_KEYS:
        cat, method = "unclassified", method if cat else "rules-default"
    out = {"category": cat, "priority": priority_for(cat, text), "method": method}
    return cache.put("classify", key, out)
