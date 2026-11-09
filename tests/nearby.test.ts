import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { blockingClearances, isDumpStation, isLowClearanceCandidate, lowClearanceFrom, parseLengthMeters } from '../src/lib/nearby';

const here = { latitude: 34.1425, longitude: -118.2551 };

describe('low clearances', () => {
  it('keeps roads and barriers with a low posted height, not parking or tall limits', () => {
    assert.ok(isLowClearanceCandidate({ highway: 'primary', maxheight: '3.5', bridge: 'yes' }));
    assert.ok(isLowClearanceCandidate({ barrier: 'height_restrictor', maxheight: `9'6"` }));
    assert.ok(!isLowClearanceCandidate({ amenity: 'parking', maxheight: '2.1' }));
    assert.ok(!isLowClearanceCandidate({ highway: 'primary', maxheight: '5.2' })); // 17' - irrelevant
    assert.ok(!isLowClearanceCandidate({ highway: 'service', maxheight: 'default' }));
    assert.ok(!isLowClearanceCandidate({ building: 'yes', maxheight: '2' }));
    // Garage ramps and entrance bars are the garage's own limit, not a road hazard.
    assert.ok(!isLowClearanceCandidate({ highway: 'service', service: 'parking_aisle', maxheight: `6'6"` }));
    assert.ok(!isLowClearanceCandidate({ barrier: 'height_restrictor', maxheight: `6'8"` }));
  });

  it('describes and filters what a vehicle won’t fit under', () => {
    const near = lowClearanceFrom('w1', 34.143, -118.2551, { highway: 'secondary', maxheight: `11'0"`, bridge: 'yes', name: 'Main St' }, here)!;
    const far = lowClearanceFrom('w2', 34.2, -118.2551, { highway: 'secondary', maxheight: '3.0' }, here)!;
    const tall = lowClearanceFrom('n3', 34.1426, -118.2551, { barrier: 'height_restrictor', maxheight: '4.2' }, here)!;
    assert.equal(near.what, 'Bridge');
    assert.equal(near.name, 'Main St');
    assert.equal(tall.what, 'Height barrier');
    // An 11'6" RV with a 3" margin: the 11' bridge blocks; the 4.2 m barrier doesn't; 'far' is out of range.
    const blocking = blockingClearances([far, tall, near], 3.505, 0.0762, 1609);
    assert.deepEqual(blocking.map((b) => b.id), ['w1']);
  });
});

describe('RV details', () => {
  it('reads length limits', () => {
    assert.equal(parseLengthMeters('12'), 12);
    assert.ok(Math.abs(parseLengthMeters(`40'`)! - 12.192) < 0.001);
    assert.ok(Math.abs(parseLengthMeters('40 ft')! - 12.192) < 0.001);
    assert.equal(parseLengthMeters('none'), undefined);
    assert.equal(parseLengthMeters('200'), undefined);
  });

  it('finds public dump stations', () => {
    assert.ok(isDumpStation({ amenity: 'sanitary_dump_station' }));
    assert.ok(!isDumpStation({ amenity: 'sanitary_dump_station', access: 'private' }));
  });
});

describe('RV and overnight filters', () => {
  it('reads RV, overnight and length tags and filters on them', async () => {
    const { parseOverpass } = await import('../src/lib/osm');
    const { applyFilters, DEFAULT_FILTERS, evaluate, overnightBlocked } = await import('../src/lib/search');
    const el = (id: number, tags: Record<string, string>) => ({ type: 'way' as const, id, lat: 34.1, lon: -118.2, tags: { amenity: 'parking', access: 'yes', ...tags } });
    const spots = parseOverpass({
      elements: [
        el(1, { name: 'RV lot', motorhome: 'designated', overnight: 'yes', maxlength: '12' }),
        el(2, { name: 'Truck lot', parking: 'surface', hgv: 'designated', access: 'yes' }),
        el(3, { name: 'Day lot', opening_hours: 'Mo-Su 06:00-22:00' }),
        el(4, { name: 'Short stay', maxstay: '2 hours' }),
        el(5, { name: 'No overnight', overnight: 'no' }),
      ],
    });
    const [rv, , day, short, banned] = spots;
    assert.equal(rv.rvFriendly, true);
    assert.equal(rv.maxLengthMeters, 12);
    assert.equal(overnightBlocked(rv), false);
    assert.equal(overnightBlocked(day), true);
    assert.equal(overnightBlocked(short), true);
    assert.equal(overnightBlocked(banned), true);

    const origin = { latitude: 34.1, longitude: -118.2 };
    // A 45 ft rig is too long for the 12 m (39 ft) RV lot.
    const results = spots.map((s) => evaluate(s, origin, 3.5, 0.08, undefined, undefined, 45));
    assert.equal(results[0].tooLong, true);
    const names = (f: Partial<typeof DEFAULT_FILTERS>) => applyFilters(results, { ...DEFAULT_FILTERS, publicOnly: false, ...f }).map((r) => r.spot.name);
    assert.ok(!names({}).includes('RV lot')); // hidden as too long
    assert.deepEqual(names({ hideTooLow: false, rvOnly: true }), ['RV lot', 'Truck lot']);
    assert.deepEqual(names({ hideTooLow: false, overnightOk: true }).sort(), ['RV lot', 'Truck lot']);
  });
});
