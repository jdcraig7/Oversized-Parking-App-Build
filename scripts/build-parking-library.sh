#!/usr/bin/env bash
# Builds (or adds to) the parking library from an OpenStreetMap .osm.pbf extract.
#   scripts/build-parking-library.sh california.osm.pbf parking-library/
# Needs osmium-tool (apt-get install osmium-tool) and the repo's npm packages.
set -euo pipefail

input=$1
out=$2
repo=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# Date of the data, from the extract's header (falls back to today).
updated=$(osmium fileinfo -g header.option.osmosis_replication_timestamp "$input" 2>/dev/null | cut -c1-10)
[ -n "$updated" ] || updated=$(date -u +%F)

echo "Filtering parking and truck stops from $input (data from $updated)..."
osmium tags-filter "$input" nwr/amenity=parking nwr/amenity=fuel nwr/amenity=sanitary_dump_station n/amenity=parking_entrance nw/maxheight nw/maxheight:physical -o "$work/parking.pbf"
osmium export "$work/parking.pbf" -f geojsonseq --add-unique-id=type_id -o "$work/parking.geojsonseq"

mkdir -p "$out"
# Hosting rules (Cloudflare Pages): tiles can be cached for a day.
printf '/*\n  Access-Control-Allow-Origin: *\n  Cache-Control: public, max-age=86400\n' > "$out/_headers"
cd "$repo"
npx tsx scripts/build-parking-library.ts "$work/parking.geojsonseq" "$out" "$updated"
