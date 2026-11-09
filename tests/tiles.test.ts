import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseOverpass } from '../src/lib/osm';
import {
  BUNDLE_TILES,
  elementsWithin,
  isLibraryCandidate,
  planTiles,
  slimTags,
  tileKeyFor,
  tilePath,
  tilesForCircle,
  type ParkingTile,
} from '../src/lib/tiles';

describe('tile keys', () => {
  it('maps a point to its quarter-degree tile', () => {
    // Glendale, CA
    assert.equal(tileKeyFor({ latitude: 34.1425, longitude: -118.2551 }), '136/-474');
    assert.equal(tilePath('136/-474'), 'v1/136/-474.json');
  });

  it('covers every tile a search circle touches', () => {
    const center = { latitude: 34.1425, longitude: -118.2551 };
    // Glendale is ~0.3 mi from the -118.25 tile edge, so even 2 miles touches two tiles.
    assert.deepEqual(tilesForCircle(center, 3219), ['136/-474', '136/-473']);
    // Downtown Bakersfield sits mid-tile: 2 miles stays in one.
    assert.deepEqual(tilesForCircle({ latitude: 35.37, longitude: -119.12 }, 3219), ['141/-477']);
    // 10 miles spills into the neighbors.
    const wide = tilesForCircle(center, 16093);
    assert.ok(wide.includes('136/-474') && wide.includes('135/-474') && wide.includes('136/-473'));
    assert.ok(wide.length <= 9);
  });
});

describe('elementsWithin', () => {
  const tile: ParkingTile = {
    v: 1,
    updated: '2026-11-07',
    records: [
      ['w', 1, 34.1425, -118.2551, { amenity: 'parking', parking: 'multi-storey', maxheight: '2.4' }],
      ['n', 2, 34.3, -118.2551, { amenity: 'parking' }], // ~11 miles north
      ['w', 1, 34.1425, -118.2551, { amenity: 'parking' }], // duplicate across tiles
    ],
  };

  it('keeps records inside the radius once, as Overpass-style elements', () => {
    const els = elementsWithin([tile, tile], { latitude: 34.1425, longitude: -118.2551 }, 3219);
    assert.equal(els.length, 1);
    assert.deepEqual(els[0], { type: 'way', id: 1, lat: 34.1425, lon: -118.2551, tags: tile.records[0][4] });
    // The app's normal parser reads them unchanged.
    const [spot] = parseOverpass({ elements: els });
    assert.equal(spot.id, 'osm:way/1');
    assert.equal(spot.clearance.status, 'limited');
  });
});

describe('build filters', () => {
  it('keeps public parking and truck stops, like the old query', () => {
    assert.ok(isLibraryCandidate({ amenity: 'parking' }));
    assert.ok(isLibraryCandidate({ amenity: 'parking', access: 'customers' }));
    assert.ok(!isLibraryCandidate({ amenity: 'parking', access: 'private' }));
    assert.ok(isLibraryCandidate({ amenity: 'fuel', hgv: 'yes' }));
    assert.ok(!isLibraryCandidate({ amenity: 'fuel' }));
    assert.ok(!isLibraryCandidate({ amenity: 'cafe' }));
  });

  it('drops tags the app never reads', () => {
    assert.deepEqual(
      slimTags({ amenity: 'parking', maxheight: '2.1', 'payment:cash': 'yes', 'payment:coins': 'no', source: 'survey', 'tiger:cfcc': 'A41' }),
      { amenity: 'parking', maxheight: '2.1', 'payment:cash': 'yes' },
    );
  });
});

describe('planTiles', () => {
  const manifest = { v: 1, updated: '2026-11-07', total: 30, tiles: { '136/-474': 20, '136/-473': 10 } };

  it('downloads only listed tiles; unlisted ones are empty', () => {
    assert.deepEqual(planTiles(manifest, ['136/-474', '135/-474', '136/-473']), { covered: true, fetch: ['136/-474', '136/-473'] });
  });

  it('reports areas outside the library so the app can use another source', () => {
    assert.deepEqual(planTiles(manifest, ['158/-480']), { covered: false, fetch: [] });
  });
});

describe('research sheet', () => {
  it('reads quoted CSV fields', async () => {
    const { parseCsv } = await import('../scripts/build-parking-library');
    const rows = parseCsv('osm_id,clearance,note\nway/1,6\'7",plain\nway/2,"7\' 2""","has, a comma and ""quotes"""\n');
    assert.deepEqual(rows, [
      { osm_id: 'way/1', clearance: `6'7"`, note: 'plain' },
      { osm_id: 'way/2', clearance: `7' 2"`, note: 'has, a comma and "quotes"' },
    ]);
  });
});

describe('osmium id mapping', () => {
  it('keeps nodes, ways and relation areas, and drops way areas (duplicates)', async () => {
    const { osmIdOf } = await import('../scripts/build-parking-library');
    assert.deepEqual(osmIdOf('n35677198'), ['n', 35677198]);
    assert.deepEqual(osmIdOf('w4341172'), ['w', 4341172]);
    assert.deepEqual(osmIdOf('a3463091'), ['r', 1731545]); // Mickey and Friends Parking Structure
    assert.equal(osmIdOf('a8682344'), null); // way 4341172 again, as an area
    assert.equal(osmIdOf('x1'), null);
  });
});

describe('bundles', () => {
  it('packs tiles so the worker can slice any one back out', async () => {
    const { makeBundles, bundleKeyOf } = await import('../scripts/library-bundles');
    const worker = await import('../library-worker/worker.js');
    const a = JSON.stringify({ v: 1, updated: 'x', records: [['w', 1, 34.1, -118.2, { name: 'Café ✓' }]] });
    const b = JSON.stringify({ v: 1, updated: 'x', records: [] });
    const bundles = makeBundles(
      new Map([
        ['v1/136/-474.json', a],
        ['v1/137/-473.json', b],
        ['v1/144/-474.json', b],
        ['manifest.json', '{}'],
      ]),
    );
    assert.equal(bundleKeyOf('136/-474'), '17/-60');
    assert.equal(worker.bundleKeyOf(136, -474), '17/-60');
    assert.equal(worker.BUNDLE, BUNDLE_TILES);
    assert.deepEqual([...bundles.keys()].sort(), ['17/-60', '18/-60']);
    const first = bundles.get('17/-60')!;
    assert.deepEqual(first.tiles.sort(), ['136/-474', '137/-473']);
    assert.match(first.hash, /^[0-9a-f]{16}$/);
    const ab = first.data.buffer.slice(first.data.byteOffset, first.data.byteOffset + first.data.length);
    assert.equal(new TextDecoder().decode(worker.tileFromBundle(ab, '136/-474')!), a);
    assert.equal(new TextDecoder().decode(worker.tileFromBundle(ab, '137/-473')!), b);
    assert.equal(worker.tileFromBundle(ab, '144/-474'), null);
  });
});

describe('Overpass states (Alaska, Hawaii)', () => {
  it('writes features with the same ids osmium uses', async () => {
    const { toFeatureLine } = await import('../scripts/fetch-overpass-states');
    const { osmIdOf } = await import('../scripts/build-parking-library');
    const rel = JSON.parse(toFeatureLine({ type: 'relation', id: 1731545, center: { lat: 61.2, lon: -149.9 }, tags: { amenity: 'parking' } })!);
    assert.deepEqual(osmIdOf(rel.id), ['r', 1731545]);
    assert.deepEqual(rel.geometry, { type: 'Point', coordinates: [-149.9, 61.2] });
    const way = JSON.parse(toFeatureLine({ type: 'way', id: 5, center: { lat: 21.3, lon: -157.8 }, tags: { amenity: 'parking' } })!);
    assert.deepEqual(osmIdOf(way.id), ['w', 5]);
    assert.equal(toFeatureLine({ type: 'node', id: 1, lat: 1, lon: 2 }), null); // no tags
  });
});
