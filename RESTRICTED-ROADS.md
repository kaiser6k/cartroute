# Restricted / no-go roads from official data (proposal + minimal overlay)

Status: **proposal**, plus a display-only overlay loader (`restricted.geojson`, one clearly-labelled EXAMPLE feature). The router does not read it yet.

## What official data exists (checked 2026-10-10)

### Confirmed with curl (HTTP 200, real responses)
| Source | URL | What it gives |
|---|---|---|
| FDOT ArcGIS REST, `RCI_Layers` FeatureServer (v11.3, query + GeoJSON/JSON/PBF) | https://gis.fdot.gov/arcgis/rest/services/RCI_Layers/FeatureServer | 30 layers |
| – layer 15 **State Roads** | .../RCI_Layers/FeatureServer/15 | polylines; fields `ROADWAY, RANK, ROUTE` (e.g. "SR  507"), `ROUTENUM, COUNTY`. Returned SR 5, SR 9, SR 507, SR 514 for a Palm Bay bbox. **Use: "state road, golf carts may only cross"** |
| – layer 29 **RCI Top 30** | .../FeatureServer/29 | polylines; `ROADWAY, STROADNO, FUNCLASS` (FHWA codes 1-19), `MAXSPEED_R/MAXSPEED_L` (0 = unknown), `TYPEROAD, RDACCESS, NHS, COUNTY`. 227 features in the Palm Bay bbox. Copyright text: FDOT TDA and FTO |
| – layer 3 Functional Classification, layer 2 County Roads, layer 20 US Routes, layer 7 Interstates, layer 24 Toll Roads | same service, ids 3/2/20/7/24 | classification / county road flag / limited-access |
| FDOT GIS data page (statewide weekly shapefiles/geodatabases: Functional Classification, Maximum Speed Limits, State Roads, County Roads, Interstates...) | https://www.fdot.gov/statistics/gis/default.shtm | bulk download alternative; metadata XML linked from that page |
| FDOT RCI Handbook (field definitions: FUNCLASS feature 121, Speed Limits feature 311 `MAXSPEED`) | https://www.fdot.gov/statistics/rci/default.shtm | documentation |
| Brevard County GIS ArcGIS REST root (v10.91) | https://gis.brevardfl.gov/gissrv/rest/services | folders incl. `Public_Works`, `Base_Map`, `Planning_Development` |
| – `Public_Works/Public_Works_Roadway` MapServer layer 11 "Roadway" | https://gis.brevardfl.gov/gissrv/rest/services/Public_Works/Public_Works_Roadway/MapServer | county roadway centerlines. **Not yet inspected for fields; no speed-limit or golf-cart field confirmed** |

### NOT confirmed
- **License.** I found no explicit open-data license text on the FDOT pages (only a disclaimer: no liability for the data). Treat as public records of a state agency, but confirm terms with FDOT TDA (CO-RCI@dot.state.fl.us is the contact the RCI handbook lists) before redistributing derived files in the repo.
- The `gis.fdot.opendata.arcgis.com` hub did not respond from here (no connection). I did not use it.
- **Palm Bay city GIS** and any city "golf cart" layer: palmbayflorida.org returned 403 to curl, so I could not check. I found **no** published GIS layer of golf-cart-designated streets for Palm Bay or Brevard.
- Palm Bay Code of Ordinances ch. 75 (amlegal): https://codelibrary.amlegal.com/codes/palmbay/latest/palmbay_fl/0-0-0-64753 came back **403 to curl**; I only saw the text through a web-search snippet, so re-read it directly before relying on it. Snippet says (s. 75.04): outside golf cart communities, golf carts are prohibited on streets over 35 mph except approved controlled crossings, and on streets without golf-cart crossing signage (MUTCD W11-11) or outside a designated golf cart community. Brevard County's Viera/Suntree/Barefoot Bay designations are in a County ordinance PDF (https://www.cvcaviera.com/wp-content/uploads/2016/08/BC-Ordinance-2014-33-Viera-Golf-Carts.pdf, HTTP 202 on a HEAD request; text seen via search only).

### Big limit (important for correctness)
**Which streets are golf-cart roads is decided by each city/county, usually by ordinance text, signs and PDFs, not by FDOT.** FDOT RCI only covers the State Highway System plus non-state roads classified rural major collector and up (per FDOT's own description), so ordinary neighborhood streets are mostly absent. Consequence: the app's "assumed designated at <=25 mph" rule is a guess. In Palm Bay, if the snippet is right, ordinary streets outside a golf cart community are not open to golf carts at all unless signed. The app already labels these "assumed"; the overlay can only subtract roads, it cannot prove a street is allowed.

## Data model
`restricted.geojson` (FeatureCollection, WGS84). Per feature `properties`:
`kind` (`state-road-no-drive` | `limited-access` | `local-ban` | `no-go-zone`), `reason` (shown to the user), `source`, `source_url`, `retrieved` (YYYY-MM-DD), `confidence` (`official` | `derived` | `reported`), `applies_to` (`["golf"]`, `["lsv"]`, or both), optional `osm_way_ids`, `jurisdiction`, `ordinance`. Geometry: LineString/MultiLineString for roads, Polygon for zones (e.g. a golf-cart-community boundary where rules differ).

## Ingestion (build-time script, not runtime)
1. `tools/fetch_fdot.js` queries FDOT `RCI_Layers/15` (state roads) and `/29` (functional class, MAXSPEED) per county with `where=COUNTY='Brevard'&outFields=...&f=geojson`, paging by `resultOffset` (maxRecordCount is 1000). Simplify geometry and write `restricted/<county>.geojson` with `source`, `retrieved`, `confidence:"official"`.
2. Match to OSM: buffer each FDOT line ~15 m and select OSM ways with the same `ref`/name and parallel geometry (or just match OSM `ref` against the FDOT `ROUTE`). Output `osm_way_ids` so the router can use ids and the file stays a fallback for display.
3. County ordinances: a hand-curated file per jurisdiction (`allowed-<city>.geojson` / `banned-<city>.geojson`) with `ordinance` citation. Maintained by editing in GitHub (pull request, reviewed), with the retrieval date. User-reported segments can be collected as GitHub issues and promoted to `confidence:"reported"` only after someone checks them against the ordinance.

## Router
`lib.js` stays pure. Add an optional `g.restricted = {wayIds:Set, zones:[polygons]}` input; in `buildAdj`, a way in `wayIds` (for the cart's class) is classed not-allowed with the feature's `reason` and source (still crossable at intersections for state roads). Zone polygons make edges with a midpoint inside the polygon not-allowed. The first step already done in this change: **`classifyWay` now refuses to drive golf carts along state roads (OSM `ref` like FL 507 / US 192 / A1A) unless tagged `golf_cart=yes`, while allowing crossings**, which is the same fact FDOT layer 15 provides, using OSM data the router already has.

## Rendering
Red dashed lines (`#b00020`, dash 8/6) for restricted segments, hatched fill for zones; tap shows reason, source, retrieved date, confidence (implemented for lines). A legend entry and a "Show restricted roads overlay" checkbox are in the Map card of the bottom sheet (remembered in localStorage `cartroute.showRestricted`). The loader fetches `restricted.geojson` next to `index.html`; on `file://` fetch is blocked so the box is disabled with "(not available here)". Sample file is marked `"example": true` and the popup says EXAMPLE.

## Open items
Get FDOT's license/terms in writing; read Palm Bay ch. 75 and Brevard ordinances directly; inspect Brevard `Public_Works_Roadway` fields; decide whether to change the Palm Bay default from "assumed <=25 mph" to "no roads unless tagged/in a golf cart community".
