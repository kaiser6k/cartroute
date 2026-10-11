# CartRoute future plans (not being built now)

1. Optional anonymous location sharing: one-time consent card over the map (Allow / Not now), Settings toggle, GDPR-aligned (explicit consent, export, deletion, named privacy contact, retention limits), privacy policy. App must keep opening straight to the map; no welcome screen.
2. Accounts with self-serve account deletion (supports the GDPR deletion right; replaces deletion by random device ID).
3. $2.99/month subscription with a 14-day free trial, added only once payments exist (Stripe, accounts, feature locks). Everything stays free until then.
4. Clerk for sign-up, login and secure auth (supports items 2 and 3). Pricing noted Oct 10 2026: Hobby free up to 50,000 monthly retained users per app; Pro $25/mo or $20/mo billed annually; Business $300/mo ($250 annually).


## Statute-verify every state (planned)
- All 50 states plus DC are enabled with unverified defaults and a compact "rules aren't fully verified" warning. Only Florida is statute-verified.
- Later: for each state, read the actual statute and local-option rules, confirm LSV road limit, golf cart road rules, equipment and licensing, then set `verified` in `tools/gen-states.js` and replace the warning for that state. Research starting point: `tools/state-rules.json` (only FL, VA, KY, NC, SC were read from the law itself; AZ, DC, WV, WY are low confidence).
- Better state detection near borders (the bundled outlines are coarse, about 4 km), and use the geocoder's state when available.

## Europe and new vehicle types: verify before trusting (planned)

Europe mode and the Moped / Motorcycle / E-scooter / L6e types are **unverified**. The research behind them (`tools/eu-rules.json`, `/workspace/eu-rules-summary.md`) is LOW confidence for all 30 countries: government sites timed out, no national statute was read, and country ages came from a comparison site and Wikipedia.

To do, country by country (statute by statute, official source only):
- Confirm the road-legal category for each country (L6e / L7e, mopeds, motorcycles, e-scooters) and the licence and minimum age.
- Confirm motorway / expressway bans per class (only Italy is even suggested to ban quadricycles from motorways; everything else is unverified).
- Confirm plates, insurance, helmets and equipment, and urban speed limits.
- Cover L7e, Norway, Switzerland and UK type approval after Brexit.
- Replace the web-search links with the national transport authority page for each country once verified.
- Verify per US state what mopeds, e-scooters and e-bikes may use (bike lanes, paths, 45 mph moped cutoffs, freeway bans, helmet laws). The current table is a general assumption.
- Add per-edge cycleway / bike-lane tags (`cycleway=lane`) and local scooter bans.
