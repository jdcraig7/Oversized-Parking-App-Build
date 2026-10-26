import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { feetInchesToMeters } from '../src/lib/height';
import { parseOverpass } from '../src/lib/osm';
import { applyFilters, DEFAULT_FILTERS, evaluate, summarize } from '../src/lib/search';

const spots = parseOverpass({
  elements: [
    // Low garage, close by, paid.
    { type: 'way', id: 1, center: { lat: 40.0, lon: -105.0 }, tags: { amenity: 'parking', parking: 'multi-storey', maxheight: '2.0', fee: 'yes' } },
    // Free open lot, farther away.
    { type: 'way', id: 2, center: { lat: 40.02, lon: -105.0 }, tags: { amenity: 'parking', fee: 'no' } },
    // Tall garage, middle distance.
    { type: 'way', id: 3, center: { lat: 40.01, lon: -105.0 }, tags: { amenity: 'parking', parking: 'multi-storey', maxheight: '2.6' } },
    // Garage with no reported height.
    { type: 'way', id: 4, center: { lat: 40.005, lon: -105.0 }, tags: { amenity: 'parking', parking: 'underground' } },
  ],
});

const origin = { latitude: 40.0, longitude: -105.0 };
const truck = feetInchesToMeters(7, 6); // 2.286 m
const margin = feetInchesToMeters(0, 3);
const results = spots.map((s) => evaluate(s, origin, truck, margin));
const ids = (rs: ReturnType<typeof applyFilters>) => rs.map((r) => r.spot.id);

describe('applyFilters', () => {
  it('hides spots the truck will not fit by default and sorts by distance', () => {
    assert.deepEqual(ids(applyFilters([...results], DEFAULT_FILTERS)), ['osm:way/4', 'osm:way/3', 'osm:way/2']);
  });

  it('can hide unknown clearances', () => {
    assert.deepEqual(ids(applyFilters([...results], { ...DEFAULT_FILTERS, hideUnknown: true })), ['osm:way/3', 'osm:way/2']);
  });

  it('filters free and open-air only', () => {
    assert.deepEqual(ids(applyFilters([...results], { ...DEFAULT_FILTERS, freeOnly: true })), ['osm:way/2']);
    assert.deepEqual(ids(applyFilters([...results], { ...DEFAULT_FILTERS, lotsOnly: true })), ['osm:way/2']);
    assert.deepEqual(ids(applyFilters([...results], { ...DEFAULT_FILTERS, garagesOnly: true })), ['osm:way/4', 'osm:way/3']);
  });

  it('sorts by best fit', () => {
    const sorted = ids(applyFilters([...results], { ...DEFAULT_FILTERS, hideTooLow: false, sort: 'best-fit' }));
    assert.deepEqual(sorted, ['osm:way/3', 'osm:way/2', 'osm:way/4', 'osm:way/1']);
  });

  it("uses the user's on-site clearance report over published data", () => {
    const reported = evaluate(spots[0], origin, truck, margin, {
      spotId: spots[0].id,
      clearanceMeters: 2.5,
      updatedAt: '2026-01-01',
    });
    assert.equal(reported.fit.status, 'fits');
  });
});

describe('summarize', () => {
  it('counts totals, fits and free spots', () => {
    assert.deepEqual(summarize(results), { total: 4, fits: 2, free: 1 });
  });
});
