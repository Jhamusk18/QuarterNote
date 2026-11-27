# FINN — company updates redesign (implementation brief)

Visual reference: `docs/design/updates_mockup.jpg` (four screens: Scan updates, Tap a metric,
Read the disclosure, Ask a follow-up).

Scope decision (27 Nov 2026): Phases 1–3 first, verifying both journeys (earnings → metric
breakdown → filing evidence; other disclosure → key facts → original filing). Carry over
"Why flagged", visible timestamps and the one-line disclaimer from `changes_list.md`. Keep
existing watchlist preferences. Onboarding, feedback/usage analytics and concept pricing are
paused. Phase 4 only if the core demo works and a second comparable filing exists.
Commits stay local unless a push is authorised.

## Product goal

Help a self-directed Indian equity investor answer one question when a company they follow
makes a disclosure: "What changed, and where can I verify it?"

Core journey: Updates → open a company event → understand the change → tap a figure or fact →
see the supporting filing excerpt → optionally ask a follow-up in Research.

## Phase 1 — Design the main screens around different jobs

### Updates (was PUSH)
- Visible tab **Updates**, heading **Company updates**; keep route compatibility.
- Compact inbox: company, event type, plain-language headline, filing time, chevron; whole row
  opens the update (tap or keyboard).
- Replace Investigate/Summarise with one path into the update. Priority controls, counters and
  price/volume thresholds live in the filter panel. Keep **Following** and a date-range filter
  easy to find.
- Preserve watchlist and filter behaviour. Empty state: widen the date range or open a clearly
  labelled **Historical example**.
- Keep filing timestamps, market-data timestamps and FINN's last refresh distinct.

### Research (was PULL)
- Visible tab **Research**; company search is the primary action.
- Replace the long greeting with the company's compact snapshot and a useful suggested question.
- PDF upload becomes a secondary **Add documents** action, same upload flow.
- **Profile** stays the third tab. Detail screens use a visible **Back to Updates** that preserves
  filters and scroll position.

### Visual rules
FINN green brand, typography, accessible contrast. Updates = compact list; Earnings = financial
report with clear number hierarchy; other disclosures read like a short document; Research starts
with search. Use text and symbols alongside colour for changes and status.

## Phase 2 — Update details and source evidence

### Earnings detail
- Company, reporting period, one supported sentence (e.g. "Sales rose, but operating profit fell.").
- Two or three key changes up top; metrics below with both periods labelled. YoY/QoQ only when
  meaningful and supported.
- Expandable metric rows: operating profit shows revenue and cost movements that reconcile;
  operating margin in plain language ("₹15 of operating profit for every ₹100 in sales").
- **View filing row** inside the expanded metric: excerpt/table row, source page, units, periods;
  original document one tap away.
- **What management said** (transcript excerpt + citation) when supported; **Ask a follow-up**
  carries company, period and a suggested question into Research.

### Other disclosure types
- Management change: person, role, what changed, effective date, successor if disclosed.
- Litigation: what the order says, disclosed amount/impact, company's stated next step.
- M&A: proposed / approved / completed, what is acquired, disclosed value or conditions.
- Other filings: readable headline, verified facts, original filing.
- Market alerts: triggered threshold, observed move, session timestamp, market data source.
- **Not disclosed** when the filing omits a detail; **Evidence unavailable** when FINN could not
  retrieve or verify it. Keep **Why flagged** tied to the actual classification/threshold rule.

## Phase 3 — Backend and wiring
- Reuse the digest as the feed summary; add an update-detail endpoint keyed by stable alert ID;
  load evidence on demand; digest stays usable when a PDF/transcript is slow or unavailable.
- Explicit representation of reported figures (value, units, period, basis), calculated changes,
  management statements, unverified items; sources carry publisher, URL, page/section, excerpt,
  published timestamp.
- Deterministic changes from comparable inputs, inputs shown; margins in percentage points;
  **Cannot compare** with a reason when basis/definition/periods don't align.
- A row is verified only when metric, period, units, basis and value align; the assignment
  example is verified manually. Attribute third-party table figures to their actual source.
- Numbers work without an AI key; AI only for optional cited follow-ups. External document text
  is data; only fetch evidence from backend-resolved URLs.
- Shared detail layout; separate earnings-comparison and disclosure-facts components; loading,
  missing evidence and unavailable sources never break navigation.

## Phase 4 — Track a metric into the next result (conditional)
- **Track operating margin** inside the expanded row; store company, metric, baseline period,
  value, basis, source reference locally.
- Next comparable release shows baseline vs latest, the change and both sources; **Stop tracking**.
- Missing/incomparable next figure keeps the baseline and explains why.

## Final verification
1. Phone viewport: scan Updates, open an earnings result in one tap, understand what moved,
   verify a number against the exact filing row.
2. Open a management, litigation or M&A disclosure from the same feed; facts and source in the
   right layout.
3. Back to Updates restores place; watchlist filters and Research flows still work.
4. Mismatched period/basis stays unverified; unavailable source leaves a usable detail screen;
   earnings calculation works without a model key.
5. If tracking shipped, the next comparable release shows the saved metric and both sources.
