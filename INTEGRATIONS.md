# QuarterNote – data integrations and status

> **Re-verified 28 Nov 2026** from a cloud container with an explicit network allowlist: NSE API working for all 18 companies (210 filings), Yahoo prices and indices working, screener.in working, AI layer working with **Gemini** (`GEMINI_API_KEY`). NSE now redirects `www.nseindia.com` to **`www.nseindia.in`** and serves filing PDFs from **`nsearchives.nseindia.in`**. If you run behind an allowlist, allow both domains. BSE still returns 403 from cloud IPs.

Last verified: **13 Nov 2026**, from a cloud container (datacenter IP).

| Source | Used for | Status | Notes |
|---|---|---|---|
| **NSE corporate announcements API** (`nseindia.com/api/corporate-announcements`) | PUSH filings feed (primary) | ✅ **Verified working** | The homepage cookie warm-up returns 403 (Akamai), but the API still answers 200 with full history, NSE subject tags and a filing summary. If NSE starts blocking, QuarterNote caches the failure for 1h and falls back. |
| **BSE announcements API** (`api.bseindia.com/.../AnnSubCategoryGetData`) | Fallback filings feed | ⚠️ **Not working from cloud IPs** | Akamai answers `403 Access Denied` even with browser headers, Referer and Origin. Code is in place (`connectors/exchanges.py`); it is only tried when NSE fails. |
| **screener.in company page** | Second fallback feed (5 most recent filings, with timestamps); document links (annual reports, transcripts, PPTs); standardised quarterly/annual P&L, balance sheet, cash flow; company search for *any* listed company | ✅ **Verified working** | The per-quarter "Raw PDF" results links need a screener login, so QuarterNote does not use them. |
| **BSE / NSE filing PDFs** (`bseindia.com/xml-data/...`, `nsearchives.nseindia.com/...`) | PULL documents; executive-bio extraction | ✅ **Verified working** | Downloaded server-side, text extracted with PyMuPDF, page numbers kept. |
| **Yahoo Finance chart API** (same data as `yfinance`) | EOD close, % change, volume, 20-day average volume; NIFTY 50 / SENSEX / NIFTY IT | ✅ **Verified working** | Alerts use **completed** daily bars only. Index tiles are labelled LIVE only during NSE hours (quotes may be delayed), otherwise EOD 15:30 IST. |
| **AI layer: Groq (default, free tier) · Anthropic · Google Gemini** | Ambiguous-filing classification, bio extraction, PULL answers, Guidance vs Actuals | ✅ **Verified with Groq free tier (15 Nov 2026)** | Set `GROQ_API_KEY` (or `ANTHROPIC_API_KEY` / `GEMINI_API_KEY`). Groq free tier allows 8,000 tokens per minute per model, so QuarterNote trims prompts and waits/retries on rate limits. Without any key the app still runs: PULL shows cited passages labelled "Evidence only · AI off" and Guidance vs Actuals says it is unavailable. |
| LinkedIn / web search for executive bios | – | ❌ Not used | The bio comes from the company's own Regulation 30 disclosure, which SEBI requires to include a "brief profile". If the filing has no profile, QuarterNote says so instead of guessing. |

## Fallback chain (PUSH)
`NSE API → BSE API → screener.in feed → SIMULATED sample (clearly labelled)`

The header pill shows the data mode: **EOD Data**, **EOD · Partial** or **Simulated data**. Every simulated card carries a "Simulated" chip and a banner explains it.

## Known limitations
- screener.in "consolidated" numbers are used when available, otherwise standalone. The card shows which.
- EBITDA = revenue − operating expenses (screener's "Operating Profit", before other income). It is labelled **derived**. It is not shown for banks, where it is not meaningful.
- Results numbers come from screener's standardised tables (compiled from exchange filings) and link to the original filing. They are not re-extracted from the PDF.
