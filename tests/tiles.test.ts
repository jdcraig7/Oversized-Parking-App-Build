import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseOverpass } from '../src/lib/osm';
import {
  elementsWithin,
  isLibraryCandidate,
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
