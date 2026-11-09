#!/usr/bin/env bash
# Rebuilds the whole-US parking library from fresh OpenStreetMap data and
# publishes it. Used by the weekly update; safe to re-run (finished steps in
# the work dir are reused).
#
#   scripts/update-library.sh [work-dir]          build + deploy
#   DEPLOY=0 scripts/update-library.sh [work-dir] build only
#
# Deploying needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (in a Claude
# cloud session the token is injected by the network proxy; any value works).
# Disk: about 6 GB free (one region at a time is downloaded, then filtered).
set -euo pipefail

repo=$(cd "$(dirname "$0")/.." && pwd)
work=${1:-$(mktemp -d)}
mkdir -p "$work"
cd "$work"
mirror=https://download.openstreetmap.fr/extracts/north-america
regions="us-west us-northeast us-midwest us-south"

# In a Claude cloud session, Node must use the session's proxy and CA, and the
# proxy adds the real Cloudflare token.
if [ -f /root/.ccr/ca-bundle.crt ]; then
  export NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt
  export CLOUDFLARE_API_TOKEN=${CLOUDFLARE_API_TOKEN:-proxy-injected}
  export CLOUDFLARE_ACCOUNT_ID=${CLOUDFLARE_ACCOUNT_ID:-17bb38bf5c1449f4cfa3bf5c3cb69587}
fi

command -v osmium >/dev/null || { apt-get update -qq && apt-get install -y -qq osmium-tool; }

for r in $regions; do
  [ -s "$r.parking.pbf" ] && { echo "$r: already filtered"; continue; }
  echo "$(date -u +%T) $r: downloading"
  for i in 1 2 3 4 5; do curl -sS -C - --retry 5 -o "$r.osm.pbf" "$mirror/$r-latest.osm.pbf" && break; sleep 10; done
  curl -sS -o "$r.md5" "$mirror/$r.osm.pbf.md5"
  if [ "$(cut -d' ' -f1 "$r.md5")" != "$(md5sum "$r.osm.pbf" | cut -d' ' -f1)" ]; then
    echo "$r: checksum mismatch, start again"; rm -f "$r.osm.pbf"; exit 1
  fi
  osmium fileinfo -g header.option.osmosis_replication_timestamp "$r.osm.pbf" | cut -c1-10 > "$r.date" || true
  osmium tags-filter "$r.osm.pbf" nwr/amenity=parking nwr/amenity=fuel nwr/amenity=sanitary_dump_station nw/maxheight nw/maxheight:physical -o "$r.parking.pbf.tmp" -f pbf --overwrite
  mv "$r.parking.pbf.tmp" "$r.parking.pbf"
  rm -f "$r.osm.pbf"
  echo "$(date -u +%T) $r: filtered"
done

# One file for the whole country; objects on region borders appear once.
osmium merge $(for r in $regions; do echo "$r.parking.pbf"; done) -o us.parking.pbf --overwrite
updated=$(sort us-*.date 2>/dev/null | head -1)
[ -n "$updated" ] || updated=$(date -u +%F)
osmium export us.parking.pbf -f geojsonseq --add-unique-id=type_id -o us.geojsonseq --overwrite

# Alaska and Hawaii aren't on the extract mirror; fetch them from Overpass.
# Best effort: if Overpass refuses, the deploy keeps last week's AK/HI tiles.
if (cd "$repo" && npx tsx scripts/fetch-overpass-states.ts "$work/ak-hi.geojsonseq" US-AK US-HI); then
  cat ak-hi.geojsonseq >> us.geojsonseq
else
  echo "warning: Alaska/Hawaii not fetched this time (Overpass unavailable); keeping what's published"
fi

rm -rf library && mkdir library
cd "$repo"
npx tsx scripts/build-parking-library.ts "$work/us.geojsonseq" "$work/library" "$updated"

if [ "${DEPLOY:-1}" = 1 ]; then
  npx tsx scripts/deploy-parking-library.ts "$work/library"
fi
echo "Library built in $work/library (data from $updated)"
