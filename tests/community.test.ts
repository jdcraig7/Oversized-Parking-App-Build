import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseSummaryRow, resolveClearance, resolvePrice, toDbMeters, type CommunitySummary } from '../src/lib/community';
import { parseOverpass } from '../src/lib/osm';

const [garage, lot, unknownGarage] = parseOverpass({
  elements: [
    { type: 'way', id: 1, center: { lat: 40, lon: -105 }, tags: { amenity: 'parking', parking: 'multi-storey', maxheight: '2.2', charge: '$3/hr' } },
    { type: 'way', id: 2, center: { lat: 40, lon: -105 }, tags: { amenity: 'parking' } },
    { type: 'way', id: 3, center: { lat: 40, lon: -105 }, tags: { amenity: 'parking', parking: 'underground' } },
  ],
});

const summary = (median?: number, extra: Partial<CommunitySummary> = {}): CommunitySummary => ({
  spotId: 'x',
  reportCount: 3,
  clearanceReports: median == null ? 0 : 3,
  medianClearanceMeters: median,
  recentNotes: [],
  lastReportAt: '2026-10-01T00:00:00Z',
  ...extra,
});

describe('parseSummaryRow', () => {
  it('converts Postgres numeric strings and nulls', () => {
    const s = parseSummaryRow({
      spot_id: 'osm:way/1',
      report_count: 2,
      clearance_reports: 2,
      median_clearance_m: '2.22',
      latest_price: '$6/hr',
      latest_price_at: '2026-10-26T03:10:28Z',
      recent_notes: ['low pipes L2'],
      last_report_at: '2026-10-26T03:10:28Z',
    });
    assert.equal(s.medianClearanceMeters, 2.22);
    assert.equal(s.latestPrice, '$6/hr');
    assert.deepEqual(s.recentNotes, ['low pipes L2']);

    const empty = parseSummaryRow({
      spot_id: 'osm:way/2',
      report_count: 1,
      clearance_reports: 0,
      median_clearance_m: null,
      latest_price: null,
      latest_price_at: null,
      recent_notes: null,
      last_report_at: '2026-10-26T03:10:28Z',
    });
    assert.equal(empty.medianClearanceMeters, undefined);
    assert.equal(empty.latestPrice, undefined);
    assert.deepEqual(empty.recentNotes, []);
  });
});

describe('resolveClearance', () => {
  it('prefers your own report over everything', () => {
    const r = resolveClearance(garage, { spotId: garage.id, clearanceMeters: 2.5, updatedAt: '' }, summary(1.9));
    assert.deepEqual(r, { clearance: { status: 'limited', meters: 2.5 }, source: 'you' });
  });

  it('uses the lower of map data and driver reports', () => {
    assert.deepEqual(resolveClearance(garage, undefined, summary(2.0)), {
      clearance: { status: 'limited', meters: 2.0 },
      source: 'drivers',
    });
    assert.deepEqual(resolveClearance(garage, undefined, summary(2.5)), {
      clearance: { status: 'limited', meters: 2.2 },
      source: 'map',
    });
  });

  it('lets drivers fill in unknown clearances and flag open lots with a barrier', () => {
    assert.equal(resolveClearance(unknownGarage, undefined, summary(2.1)).source, 'drivers');
    assert.deepEqual(resolveClearance(lot, undefined, summary(2.4)).clearance, { status: 'limited', meters: 2.4 });
  });

  it('falls back to map data when drivers only reported prices', () => {
    assert.deepEqual(resolveClearance(lot, undefined, summary(undefined)), { clearance: { status: 'open' }, source: 'map' });
  });
});

describe('resolvePrice', () => {
  it('prefers you, then drivers, then the map', () => {
    assert.equal(resolvePrice(garage, { spotId: garage.id, price: '$1', updatedAt: '' }, summary(undefined, { latestPrice: '$2' })).price, '$1');
    assert.deepEqual(resolvePrice(garage, undefined, summary(undefined, { latestPrice: '$2' })), { price: '$2', source: 'drivers' });
    assert.deepEqual(resolvePrice(garage), { price: '$3/hr', source: 'map' });
    assert.deepEqual(resolvePrice(lot), {});
  });
});

describe('toDbMeters', () => {
  it('rounds to centimeters without changing the inch value', () => {
    const m = (7 * 12 + 6) * 0.0254;
    assert.equal(toDbMeters(m), 2.29);
    assert.equal(Math.round(toDbMeters(m) / 0.0254), 90);
  });
});
