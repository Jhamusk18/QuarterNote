# QuarterNote

> **What changed, and where can I verify it?**

QuarterNote explains a company announcement in the format that event needs, and puts every figure one tap from its filing row. It is built on FINN, my earlier Indian equity research app, for a Product Manager assignment (Option B).

**Live app:** [quarternote.onrender.com/updates](https://quarternote.onrender.com/updates) (free server: the first load after it sleeps can take up to a few minutes)

## Submission

| File | What it is |
|---|---|
| [`submission/QuarterNote_PM_Deck.pdf`](submission/QuarterNote_PM_Deck.pdf) | Two-slide deck: problem, prototype, market, competitors, funnel, metric tree, unit economics, risks, next steps |
| [`submission/QuarterNote_PM_Assignment.pdf`](submission/QuarterNote_PM_Assignment.pdf) | Two-page written brief covering all eight areas, with sources beside each claim |
| [`prototype/quarternote.html`](prototype/quarternote.html) | Early clickable concept with sample data (open in any browser) |

## The problem

> “When a company I follow makes an announcement, I want to understand what changed and find the evidence quickly. For earnings, I need to know which figures changed and whether they can be compared. For an acquisition, I need to know what has happened and what is still pending.”

Two real examples in the app: ITC’s Q1 FY27 results filing says some periods are not strictly comparable, and Tata Steel disclosed its APL Apollo Tubes deal and the first completed tranche in separate filings.

## What the app does

### Updates
- Live NSE filings for an 18-company watchlist, ranked High, Medium and Routine, with price and volume alerts.
- **Investigate** opens an analysis page built for the event:
  - **QuarterNote’s read:** one finding and a size-of-change meter.
  - **Is the growth real?** Overview (revenue and profit bars with a margin line), Growth % and Profit tabs over 8 quarters.
  - **Why did profit move?** A year-on-year profit bridge: sales, margin, other income, interest, depreciation, tax.
  - **Quality checks:** other income share, tax rate, cash conversion.
  - **Filing evidence:** each figure labelled verified, calculated or not verified, with the filing row and page one tap away.
- Deals show completed and pending steps with their conditions.

### Research
- Ask about any listed company. Answers come from annual reports, earnings calls and filings, with page citations.
- **Financial results** shows the same charts, profit bridge and checks; **Guidance vs Actuals** compares what management promised with what was reported.

### Profile
- Guest mode, followed companies, alert thresholds and theme, stored on the device.

## Deliberately left out
Trading and buy or sell recommendations. QuarterNote explains and shows evidence; it does not advise.

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React, Vite, Tailwind CSS |
| Backend | Python, FastAPI |
| Financial data | Yahoo Finance chart API, NSE announcements, Screener.in |
| Document processing | PyMuPDF, page-aware text extraction |
| Retrieval | BM25 |
| AI | Groq free tier (gpt-oss-20b / gpt-oss-120b) by default; Anthropic Claude or Google Gemini also supported |
| Deployment | Docker, Railway |

## System Architecture

```text
React + Vite + Tailwind
        |
        | REST API
        v
FastAPI Backend
        |
        +---- PUSH
        |       +-- Corporate announcement ingestion
        |       +-- Classification and prioritisation
        |       +-- EOD price and volume alerts
        |       +-- Results and management-change summaries
        |
        +---- PULL
        |       +-- Company document retrieval
        |       +-- PDF page extraction
        |       +-- BM25 retrieval
        |       +-- AI-generated cited answers
        |       +-- Guidance vs Actuals analysis
        |
        +---- PROFILE
                +-- Device-local preferences

External sources:
NSE / BSE / Screener.in / Yahoo Finance / Company PDFs
```

The Dockerfile builds the frontend and serves it through FastAPI, allowing the application to run as a single service.

The workflow:
1. Retrieve relevant earnings-call transcripts.
2. Extract explicitly stated guidance and its reporting period.
3. Retrieve subsequent reported financial results.
4. Compare guidance with actual performance on a comparable basis.
5. Calculate variance and classify the outcome where evidence supports a verdict.
6. Preserve source references for the underlying statements and reported figures.


## API Overview

| Endpoint | Purpose |
|---|---|
| `GET /api/digest` | Portfolio digest with filter and threshold parameters |
| `GET /api/alerts` | Material and threshold-triggered alerts |
| `GET /api/market` | NIFTY 50, SENSEX and NIFTY IT data |
| `GET /api/company/search?q=` | Company search |
| `GET /api/quote/{sym}` | Company quote |
| `POST /api/research/{sym}/prepare` | Prepare and index company documents |
| `GET /api/research/{sym}/status` | Document processing status |
| `POST /api/research` | Conversational company research |
| `GET /api/research/{sym}/snapshot` | Deterministic financial snapshots |
| `GET /api/research/{sym}/guidance-vs-actuals` | Management guidance scorecard |
| `POST /api/research/{sym}/upload` | Upload a company PDF |

For the complete parameter definitions, refer to the backend implementation.

## Model Routing and Cost Efficiency

QuarterNote uses a tiered approach to reduce unnecessary model calls.

| Task | Approach |
|---|---|
| Filing classification | Rules first; fast model (Groq gpt-oss-20b) only for ambiguous cases |
| Executive background | Filing extraction, with AI extraction where needed |
| Results numbers | Standardised financial tables |
| Document retrieval | BM25 over page-tagged text chunks |
| Research answers | Stronger model (Groq gpt-oss-120b) |
| Guidance extraction | Fast model (Groq gpt-oss-20b) |
| Guidance evaluation | Stronger model (Groq gpt-oss-120b) |

Frequently repeated operations use caching where implemented.

Cost figures are estimates and depend on input/output token usage, document length, caching and current provider pricing. On the Groq free tier the AI layer costs $0; QuarterNote retries automatically when the free-tier tokens-per-minute limit is reached. With a paid provider, check usage against the application's cost ledger and the provider account.

## Data Sources and Transparency

QuarterNote uses:
- NSE corporate announcements as the primary corporate-filings feed.
- BSE announcements as a fallback where accessible.
- Screener.in for company information, financial tables and document discovery.
- Yahoo Finance chart data for end-of-day prices and volume.
- Company and exchange-hosted PDFs for research evidence.

The application displays data mode and timestamps. When live feeds are unavailable, fallback or simulated data is labelled.

**AI availability:** Set `GROQ_API_KEY` (free, console.groq.com) to enable the AI layer; `ANTHROPIC_API_KEY` or `GEMINI_API_KEY` also work. Without any key, the application can still provide available evidence and PUSH functionality, but AI-powered research and Guidance vs Actuals are limited or unavailable.

See [INTEGRATIONS.md](INTEGRATIONS.md) for source-by-source verification and known limitations.

## Run Locally

### Requirements
- Python 3.11+
- Node.js 18+
- npm

### 1. Backend

From the repository root:

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp ../.env.example ../.env
```

Add a free `GROQ_API_KEY` (or `ANTHROPIC_API_KEY` / `GEMINI_API_KEY`) to the root `.env` file if AI features are required.

Start the backend:

```bash
.venv/bin/uvicorn app.main:app --reload --port 8000
```

### 2. Frontend

Open a second terminal at the repository root:

```bash
cd frontend
npm install
npm run dev
```

Open the local frontend URL shown by Vite (typically `http://localhost:5173`).

The development server proxies `/api` requests to the FastAPI backend.

### 3. Single-process production build

The Dockerfile builds the frontend and serves the generated static files through FastAPI.

```bash
docker build -t finn .
docker run -p 8000:8000 -e GROQ_API_KEY=your_key finn
```

Do not commit API keys or `.env` files to GitHub.

## Deployment

QuarterNote is deployed as a Docker-based service on Railway.

To reproduce the deployment:
1. Connect the GitHub repository to a Railway project.
2. Deploy using the repository's Dockerfile.
3. Configure `GROQ_API_KEY` (free tier) in the Railway service's Variables section if AI features are required.
4. Generate a public domain in Railway Networking.
5. Open the generated URL and verify the application.


## Known Limitations

- BSE API access may be blocked from cloud environments; the application uses its configured fallback chain.
- Availability and completeness of filings depend on external source access.
- Some financial values, including EBITDA, may be derived from standardised tables and are labelled accordingly.
- Scanned image-only PDFs may not be extractable without OCR.
- AI-powered research and Guidance vs Actuals require an AI key (free Groq key supported). Free-tier rate limits can make the first Guidance vs Actuals run take up to about a minute; results are then cached.
- Guest preferences are stored locally and are not synchronised across devices.
- Market data is not guaranteed to be real-time.

## Repository Structure

```text
backend/
  app/
    connectors/
    push.py
    research.py
    rag.py
    llm.py
    classify.py

frontend/
  src/
    screens/
    components/
    lib/

reference/
  challenge documents and design references

Dockerfile
.env.example
INTEGRATIONS.md
WRITEUP.md
```

## Disclaimer

QuarterNote is a prototype developed for the ENAM Holdings AI Engineer Build Challenge. It is an informational research and monitoring tool, not investment advice or a recommendation to buy or sell securities.
