# Prototype changes for the PM assignment version of FINN

> Status (27 Nov 2026): superseded by `docs/redesign_brief.md` as the implementation roadmap.
> Carried into the redesign: "Why this was flagged" (2), visible timestamps + disclaimer (5),
> upload behind a secondary action (6). Paused for this submission: onboarding (1),
> feedback + usage analytics (4), concept pricing (7). Item 3 is covered by the redesign's
> update detail + filing evidence.

Goal: show ONE clean journey — watchlist -> earnings alert -> what changed and why ->
source filing — and support the document's claims. Do not break the existing demo.
Order below is priority order; stop when time runs out.

## 1. Onboarding + default watchlist
- On first open, a short step: pick 5-10 stocks, or accept a preset watchlist (e.g. a
  mixed-sector list of 8 NSE names already in the seed data).
- Lands directly on the digest. No dead-end empty state.

## 2. "Why this was flagged" line on every alert
- Each alert card shows one short reason line, generated from the same rule that chose
  its priority (e.g. "Results filed: revenue +12% YoY, PAT -8% QoQ" or "Volume 3x the
  20-day average").
- This is the line a PM reviewer will read to judge the prioritisation logic.

## 3. Evidence reachable in one tap from the alert
- Tapping an alert (not a second screen) opens the source drawer/panel showing the
  exact filing line next to the number it supports.
- This is the core differentiation claim in the document; it must be fast to find.

## 4. Feedback + lightweight usage log
- A "Useful / Not useful" tap on each alert.
- Log four events: alert_shown, alert_opened, source_opened, feedback_given.
- Add one small "Usage" panel showing counts from these events, clearly labelled
  "Sample data from my own test runs" (not real users).

## 5. Disclaimer + timestamps
- One line on the digest: "Summaries are automated. Always check the filing. Not
  investment advice."
- A visible timestamp (filed at / last updated) on every alert and every source view.

## 6. Move document upload behind "Add your own documents"
- Preload annual report / transcript data for 2-3 companies so Pull research works
  immediately without any upload step.
- Keep ticker search visible (supports the "works on any ticker" claim); tuck the
  PDF upload control behind a secondary link so it doesn't look like the main action.

## 7. Pricing concept note (no billing)
- One small, clearly labelled line on the watchlist page: "Free: up to 10 stocks ·
  Premium (concept): more stocks + guidance history." No payment flow, no real gating
  unless trivial to add. Label it "Concept" in the UI itself.

## Explicitly out of scope (state this in the Design section of the write-up)
- Trading, price targets, buy/sell signals, portfolio recommendations.
- Real billing or payment integration.
- Any new data source beyond what already exists in the FINN build.

## Definition of done for each item
- App still runs end to end after the change.
- The one journey above still works without extra clicks added.
- Anything not fully real (sample data, concept pricing) is visibly labelled as such
  in the UI, not just in the document.
