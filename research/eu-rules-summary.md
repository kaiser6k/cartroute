# EU / UK golf cart & LSV road rules (research summary)
**Honesty note:** the EU-level framework is real, but I read NO national statute in full. EUR-Lex fetches timed out; I only saw search excerpts of Reg. 168/2013 and Dir. 2006/126/EC. Country-specific ages come from a non-government comparison site (tactac-gps.com) and Wikipedia. Confidence counts: high 0, medium 0, low 30 (27 EU + UK + NO + CH). Everything not listed is "not verified".

## Patterns
- No "golf cart" or "LSV" road class in the EU. Road-legal equivalents are quadricycles under Reg. (EU) 168/2013: **L6e** (light, <=45 km/h, <=425 kg unladen excluding batteries, <=4 kW; L6e-B <=6 kW) and **L7e** (heavy, up to 15 kW, 450 kg passenger). A true golf cart without type approval is generally not road-legal.
- Licence: category **AM** covers L6e (Dir. 2006/126/EC). Minimum age default 16; states may set 14-18. Seen: FR 14, IT 14*, ES 15, DE 15*, FI 15, BE/NL/PT/UK 16, CH 18 (*domestic-only for young holders). Others not verified.
- L7e: needs a higher licence (e.g. B1/B, varies); not researched per country.
- Plates and insurance: expected for any road vehicle; details not verified.
- Motorways: Italy bans quadricycles (secondary source); others not verified, many likely ban them.
- UK keeps AM (16) but is outside EU type approval. Switzerland (18) and Norway differ.

## Gaps
Every national statute/ministry page, plates, insurance, urban speed limits, L7e licences, motorway bans, NO, and UK type-approval. Suggested next step: verify countries one by one from official sources, starting with FR, DE, ES, IT, NL, UK.

## App-design recommendation
- Use km/h and km in EU/UK mode (UK road signs use mph; consider mph there).
- EU default profile: "L6e light quadricycle, 45 km/h, avoid motorways/expressways, avoid roads signed faster than ~50 km/h where possible." Do not claim a golf cart is legal.
- Show a warning: "Rules vary by country; unverified. Your vehicle must be type-approved (L6e/L7e), plated and insured. Check national rules." Link to the national transport authority.
- Show a per-country age/licence note only where verified; otherwise "not verified".
- Keep Florida as the only verified rule set; treat EU as advisory.
