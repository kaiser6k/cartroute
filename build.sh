#!/bin/sh
# Inlines lib.js into index.src.html -> index.html (single self-contained file)
cd "$(dirname "$0")"
python3 - <<'PY'
src=open('index.src.html').read()
src=src.replace('/*STATES*/', open('states.js').read()).replace('/*EUROPE*/', open('europe.js').read()).replace('/*VEH*/', open('vehicles.js').read()).replace('/*DIR*/', open('directions.js').read()).replace('/*LIB*/', open('lib.js').read()).replace('/*PROFILE*/', open('profile.js').read()).replace('/*GEO*/', open('geo.js').read()).replace('/*PLACES*/', open('places.js').read()).replace('/*AC*/', open('autocomplete.js').read())
open('index.html','w').write(src)
PY
echo built index.html
