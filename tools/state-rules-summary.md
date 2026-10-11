# State golf cart / LSV rules - research summary (2026-10-11)

Files: /workspace/state-rules.json (51 entries: 50 states + DC), this summary. No app code changed, nothing pushed.

## How to read the confidence ratings
- **high (5)** - rule text read from a statute, enacted act, or state agency page this session: FL, KY, NC, SC, VA.
- **medium (42)** - official statute/agency URL located and summarized by search, or backed by Connecticut OLR reports (2008, 2023) or the 2020 Louisiana LTRC review. I did NOT read full statute text for these. Verify before relying.
- **low (4)** - thin or conflicting: AZ, DC, WV, WY.
- Nothing is marked 'not verified' wholesale, but individual fields are (e.g. AZ golf-cart rule, AR/DC/WY LSV road limit).

## Main patterns
- **LSV (federal def.: 4 wheels, >20-25 mph, <3,000 lb, FMVSS 500):** about 37 states cap LSV roads at **35 mph** (crossing higher-speed roads usually allowed at intersections). Exceptions: **KS 40**, **MT 45** (medium-speed EVs), **MD 30**, **MA 30**, **NJ 25** (35 with approval), **PA 25** (26-35 with permit), **WV 25** (municipal, some 35 by ordinance). **CT** does not authorize LSVs; **AR, WY** have no LSV law found; **DC, MS, CO** have no numeric statewide limit found (local-option).
- **Golf carts:** no state allows them statewide without conditions. Typical rule is **local option** (32 states): the city/county must designate roads and sign them. Common caps: roads **25 mph** (VA, CT, WA, WI, OK, SD, CA) or **30 mph** (FL, KS, MD, MI) or **35 mph** (KY, SC, NC, NE, OH, IL, TX). 
- **Mostly not street-legal unless registered as an LSV (13 states):** AL(local option via municipality), DE, DC, HI, MA, NH, NJ, NY, RI, TN, UT, VT, WV, WY.
- **Limited / crossing only:** PA (crossing only), TX (golf-course trips within 5 miles / master-planned communities), AK, ME.
- State highways: almost universally off-limits to golf carts except crossings; LSVs can cross higher-speed roads at intersections.
- Typical other conditions: valid driver license (most), daylight only (FL, GA, IA, KY, NE, CT, TX, SC), insurance, slow-moving-vehicle emblem.

## Clear, high-confidence rules (usable for a routing overlay)
FL (30 mph roads, designated; LSV 35), VA (designated roads 25; crossings <=35), KY (local ordinance, 35 mph roads), NC (local ordinance, 35 mph roads; LSV 35), SC (secondary roads 35 mph, 4-mile radius, daylight; changed May 2025), GA (local PTV ordinance; cap not confirmed so rated medium overall).

## Needs local-law checks (everything else)
Because most states are local-option, the state layer can only say "may be allowed where the city/county designates it." A true routing legality layer needs local ordinance data, which this research did not cover.

## Caveats / known conflicts
- The 2020 LTRC table is stale: SC and TX changed; its AZ/ME entries conflicted with later search.
- ID LSV limit: 2008 source 25 mph vs newer AFDC 35 mph.
- Maine, Arizona golf-cart rules unresolved (Arizona 'not verified').
- Search tools gave summaries, not full text, for most states; eCFR blocked automated access so 49 CFR 571.500 was confirmed only via Federal Register/OLR reports.
- Not legal advice; recommend a statute check against each state's official site before shipping.
