import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { addDays, legs, moveStop, routeUrl, schedule, totalNights } from '../src/lib/trips';
import { garageFrom, guessType } from '../src/lib/vehicles';

const stop = (nights: number) => ({ id: String(nights), nights, spot: {} as never });

describe('trip schedule', () => {
  it('works out arrival and departure for each stop in order', () => {
    assert.deepEqual(schedule({ startDate: '2026-12-30', stops: [stop(2), stop(0), stop(3)] }), [
      { arrive: '2026-12-30', leave: '2027-01-01' },
      { arrive: '2027-01-01', leave: '2027-01-01' },
      { arrive: '2027-01-01', leave: '2027-01-04' },
    ]);
    assert.equal(totalNights({ stops: [stop(2), stop(0), stop(3)] }), 5);
  });

  it('needs a start date', () => {
    assert.equal(schedule({ stops: [stop(1)] }), null);
    assert.equal(schedule({ startDate: 'soon', stops: [stop(1)] }), null);
  });

  it('crosses month and leap-day boundaries', () => {
    assert.equal(addDays('2028-02-28', 1), '2028-02-29');
    assert.equal(addDays('2026-03-31', 1), '2026-04-01');
  });
});

describe('reordering', () => {
  it('moves a stop up or down', () => {
    assert.deepEqual(moveStop(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
    assert.deepEqual(moveStop(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c']);
    assert.deepEqual(moveStop(['a', 'b', 'c'], 0, -1), ['a', 'b', 'c']);
    assert.deepEqual(moveStop(['a', 'b', 'c'], 2, 9), ['a', 'b', 'c']);
  });
});

describe('route links', () => {
  it('goes through every stop in order', () => {
    const url = routeUrl([
      { latitude: 34.1, longitude: -118.2 },
      { latitude: 35, longitude: -119 },
      { latitude: 36.5, longitude: -120.25 },
    ])!;
    const q = new URL(url).searchParams;
    assert.equal(q.get('destination'), '36.500000,-120.250000');
    assert.equal(q.get('waypoints'), '34.100000,-118.200000|35.000000,-119.000000');
  });

  it('splits long trips into connected legs', () => {
    const l = legs([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 10);
    assert.deepEqual(l, [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [10, 11, 12]]);
  });
});

describe('my garage', () => {
  it('turns the old single vehicle into the first garage vehicle', () => {
    const g = garageFrom({ vehicleName: 'Class C RV', vehicleMeters: 3.5 });
    assert.equal(g.vehicles.length, 1);
    assert.equal(g.vehicles[0].type, 'rv');
    assert.equal(g.activeVehicleId, g.vehicles[0].id);
  });

  it('keeps an existing garage and fixes a missing active id', () => {
    const vehicles = [
      { id: 'a', name: 'F-250', type: 'pickup' as const, heightMeters: 2.1 },
      { id: 'b', name: 'Airstream', type: 'trailer' as const, heightMeters: 3 },
    ];
    assert.equal(garageFrom({ vehicleName: '', vehicleMeters: 2, vehicles, activeVehicleId: 'b' }).activeVehicleId, 'b');
    assert.equal(garageFrom({ vehicleName: '', vehicleMeters: 2, vehicles, activeVehicleId: 'zzz' }).activeVehicleId, 'a');
  });

  it('guesses types from names', () => {
    assert.equal(guessType('Sprinter van'), 'van');
    assert.equal(guessType('Lifted truck'), 'pickup');
    assert.equal(guessType('Semi truck'), 'semi');
    assert.equal(guessType('Box truck'), 'box-truck');
  });
});
