"""Direct NSE / BSE corporate-announcement APIs.

Both sit behind Akamai bot protection. From cloud/datacenter IPs they answer 403
(verified 13 Nov 2026), so QuarterNote tries them first, remembers the failure for an hour,
and falls back to screener.in's announcement feed (which links to the same BSE filing PDFs)."""
import re
import time
from datetime import datetime, timedelta

import httpx

from .. import cache
from ..config import USER_AGENT

STATUS = {"nse": {"ok": None, "checked": None, "detail": "not tried yet"},
          "bse": {"ok": None, "checked": None, "detail": "not tried yet"}}


def _blocked(name):
    s = STATUS[name]
    return s["ok"] is False and s["checked"] and time.time() - s["checked"] < 3600


def nse_announcements(symbol: str) -> list[dict] | None:
    if _blocked("nse"):
        return None
    try:
        with httpx.Client(headers={"User-Agent": USER_AGENT, "Accept": "*/*", "Accept-Language": "en-US,en;q=0.9",
                                   "Referer": "https://www.nseindia.com/companies-listing/corporate-filings-announcements"},
                          timeout=10, follow_redirects=True) as c:
            c.get("https://www.nseindia.com/")  # cookie warm-up
            r = c.get("https://www.nseindia.com/api/corporate-announcements", params={"index": "equities", "symbol": symbol})
            r.raise_for_status()
            rows = r.json()
        STATUS["nse"] = {"ok": True, "checked": time.time(), "detail": "working"}
        out = []
        cutoff = datetime.now() - timedelta(days=31)
        for row in rows[:120]:
            dt = datetime.strptime(row["an_dt"], "%d-%b-%Y %H:%M:%S")
            if dt < cutoff:
                break
            text = (row.get("attchmntText") or "").strip()
            title = re.sub(r"^.*?has (informed|intimated) the Exchange (about|regarding|that)\s*", "", text, flags=re.I).strip()
            title = (title[:1].upper() + title[1:]) if title else row.get("desc", "")
            vs = (row.get("voiceSummary") or "").strip()
            summary = " ".join(re.split(r"(?<=[.!?])\s+", vs)[:2])[:260] if vs else None
            out.append({"title": title[:160], "subject": row.get("desc"), "summary": summary,
                        "url": row.get("attchmntFile"), "datetime": dt.isoformat() + "+05:30", "feed": "NSE",
                        "summary_source": "NSE filing summary" if summary else None})
        return out
    except Exception as e:
        STATUS["nse"] = {"ok": False, "checked": time.time(), "detail": f"blocked/failed: {type(e).__name__} {str(e)[:80]}"}
        return None


def bse_announcements(bse_code: str) -> list[dict] | None:
    if _blocked("bse") or not bse_code:
        return None
    try:
        today = datetime.now()
        params = {"pageno": 1, "strCat": -1, "strPrevDate": (today - timedelta(days=30)).strftime("%Y%m%d"),
                  "strScrip": bse_code, "strSearch": "P", "strToDate": today.strftime("%Y%m%d"), "strType": "C", "subcategory": -1}
        r = httpx.get("https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w", params=params, timeout=10,
                      headers={"User-Agent": USER_AGENT, "Referer": "https://www.bseindia.com/", "Origin": "https://www.bseindia.com"})
        r.raise_for_status()
        rows = r.json().get("Table", [])
        STATUS["bse"] = {"ok": True, "checked": time.time(), "detail": "working"}
        return [{"title": row.get("HEADLINE") or row.get("NEWSSUB"), "summary": None,
                 "url": f"https://www.bseindia.com/xml-data/corpfiling/AttachLive/{row['ATTACHMENTNAME']}" if row.get("ATTACHMENTNAME") else None,
                 "datetime": (row.get("NEWS_DT") or "")[:19] + "+05:30", "feed": "BSE"} for row in rows]
    except Exception as e:
        STATUS["bse"] = {"ok": False, "checked": time.time(), "detail": f"blocked/failed: {type(e).__name__} {str(e)[:80]}"}
        return None
