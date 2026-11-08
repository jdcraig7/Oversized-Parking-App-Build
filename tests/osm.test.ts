import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildParkingQuery, overpassFailure, parseOverpass, type OverpassResponse } from '../src/lib/osm';

// Shapes and tag values mirror real Overpass `out center tags` output.
const fixture: OverpassResponse = {
  elements: [
    {
      type: 'way',
      id: 101,
      center: { lat: 39.7475, lon: -104.9935 },
      tags: {
        amenity: 'parking',
        parking: 'multi-storey',
        name: 'Larimer Square Garage',
        maxheight: `6'8"`,
        fee: 'yes',
        charge: '$5/hour; $25/day',
        opening_hours: '24/7',
        capacity: '640',
        'payment:credit_cards': 'yes',
        'payment:app': 'yes',
        'addr:housenumber': '1400',
        'addr:street': 'Larimer Street',
        'addr:city': 'Denver',
        'addr:state': 'CO',
        website: 'example.com/garage',
      },
    },
    {
      type: 'way',
      id: 102,
      center: { lat: 39.75, lon: -105.0 },
      tags: { amenity: 'parking', parking: 'surface', fee: 'no', access: 'yes', capacity: '120' },
    },
    {
      type: 'node',
      id: 103,
      lat: 39.76,
      lon: -104.98,
      tags: { amenity: 'parking', hgv: 'designated', name: 'Truck Lot', 'capacity:hgv': '30', lit: 'yes' },
    },
    {
      type: 'node',
      id: 104,
      lat: 39.77,
      lon: -104.97,
      tags: { amenity: 'fuel', hgv: 'yes', brand: "Love's", 'fuel:diesel': 'yes', shower: 'yes' },
    },
    {
      type: 'way',
      id: 105,
      center: { lat: 39.74, lon: -104.99 },
      tags: { amenity: 'parking', parking: 'underground', access: 'customers', fee: 'Mo-Fr 07:00-19:00' },
    },
    // Tiny lot: dropped.
    { type: 'way', id: 106, center: { lat: 39.7, lon: -104.9 }, tags: { amenity: 'parking', capacity: '2' } },
    // No coordinates: dropped.
    { type: 'relation', id: 107, tags: { amenity: 'parking' } },
    // Duplicate: dropped.
    { type: 'way', id: 102, center: { lat: 39.75, lon: -105.0 }, tags: { amenity: 'parking' } },
  ],
};

describe('parseOverpass', () => {
  const spots = parseOverpass(fixture, '2026-01-01T00:00:00.000Z');
  const byId = Object.fromEntries(spots.map((s) => [s.id, s]));

  it('keeps valid spots and drops tiny, unlocated and duplicate ones', () => {
    assert.deepEqual(
      spots.map((s) => s.id),
      ['osm:way/101', 'osm:way/102', 'osm:node/103', 'osm:node/104', 'osm:way/105'],
    );
  });

  it('parses a garage with clearance, price and details', () => {
    const g = byId['osm:way/101'];
    assert.equal(g.kind, 'garage');
    assert.equal(g.clearance.status, 'limited');
    assert.equal(g.clearanceRaw, `6'8"`);
    assert.equal(g.fee, 'paid');
    assert.equal(g.price, '$5/hour; $25/day');
    assert.equal(g.hours, '24/7');
    assert.equal(g.capacity, 640);
    assert.deepEqual(g.payment, ['Credit cards', 'Mobile app']);
    assert.equal(g.address, '1400 Larimer Street, Denver, CO');
    assert.equal(g.website, 'https://example.com/garage');
    assert.equal(g.sourceUrl, 'https://www.openstreetmap.org/way/101');
  });

  it('treats open-air lots as having no height limit', () => {
    const lot = byId['osm:way/102'];
    assert.equal(lot.kind, 'surface');
    assert.deepEqual(lot.clearance, { status: 'open' });
    assert.equal(lot.fee, 'free');
    assert.equal(lot.access, 'public');
    assert.equal(lot.unnamed, true);
    assert.equal(lot.name, 'Open-air lot');
  });

  it('recognizes truck parking and truck stops', () => {
    const truck = byId['osm:node/103'];
    assert.equal(truck.kind, 'truck');
    assert.equal(truck.truckFriendly, true);
    assert.equal(truck.truckCapacity, 30);
    assert.ok(truck.amenities.includes('Lit at night'));

    const stop = byId['osm:node/104'];
    assert.equal(stop.kind, 'truck-stop');
    assert.equal(stop.name, "Love's");
    assert.ok(stop.amenities.includes('Diesel'));
    assert.ok(stop.amenities.includes('Showers'));
  });

  it('marks an underground garage with no posted height as unknown, with part-time fees', () => {
    const u = byId['osm:way/105'];
    assert.equal(u.kind, 'underground');
    assert.deepEqual(u.clearance, { status: 'unknown' });
    assert.equal(u.fee, 'paid');
    assert.equal(u.feeHours, 'Mo-Fr 07:00-19:00');
    assert.equal(u.access, 'customers');
  });
});

describe('access classification', () => {
  const access = (tags: Record<string, string>) =>
    parseOverpass({ elements: [{ type: 'way', id: 1, center: { lat: 34.14, lon: -118.25 }, tags: { amenity: 'parking', ...tags } }] })[0]?.access;

  it('trusts explicit access tags', () => {
    assert.equal(access({ access: 'yes' }), 'public');
    assert.equal(access({ access: 'permissive' }), 'public');
    assert.equal(access({ access: 'customers' }), 'customers');
    assert.equal(access({ access: 'employees' }), 'restricted');
    assert.equal(access({ access: 'permit' }), 'restricted');
  });

  it('treats paid, city-run, park & ride and numbered city lots as public', () => {
    assert.equal(access({ fee: 'yes' }), 'public');
    assert.equal(access({ operator: 'City of Glendale' }), 'public');
    assert.equal(access({ park_ride: 'yes' }), 'public');
    assert.equal(access({ name: 'Parking Lot 30' }), 'public');
    assert.equal(access({ name: 'Orange Street Public Parking Structure' }), 'public');
  });

  it('reads restrictions and customer-only use from names', () => {
    assert.equal(access({ name: 'Wells Fargo Customer Parking' }), 'customers');
    assert.equal(access({ name: 'Visitor Parking' }), 'customers');
    assert.equal(access({ name: 'Physician and Staff Parking' }), 'restricted');
    assert.equal(access({ name: '400 & 450 North Brand (Monthly Parking Only)' }), 'restricted');
    assert.equal(access({ name: 'Resident Parking', access: 'yes' }), 'restricted');
  });

  it('leaves untagged lots unverified (usually store or apartment lots)', () => {
    assert.equal(access({}), 'unverified');
    assert.equal(access({ name: 'Glendale Plaza' }), 'unverified');
  });

  it('reads our research notes', () => {
    const [spot] = parseOverpass({
      elements: [{ type: 'way', id: 2, center: { lat: 34.14, lon: -118.25 }, tags: { amenity: 'parking', parking: 'multi-storey', maxheight: `6'7"`, 'research:source': 'listing', 'research:url': 'https://example.com/listing', 'research:checked': '2026-11-08' } }],
    });
    assert.deepEqual(spot.research, { source: 'listing', url: 'https://example.com/listing', checked: '2026-11-08', note: undefined });
  });
});

describe('buildParkingQuery', () => {
  it('queries parking and truck stops around a point and excludes private lots', () => {
    const q = buildParkingQuery(39.7392, -104.9903, 8046.7);
    assert.match(q, /\[out:json\]/);
    assert.match(q, /nwr\["amenity"="parking"\]\["access"!~"\^\(private\|no\|delivery\)\$"\]\(around:8047,39\.73920,-104\.99030\)/);
    assert.match(q, /\["amenity"="fuel"\]\["hgv"~/);
    assert.match(q, /out center tags;/);
  });
});

describe('overpassFailure', () => {
  it('passes normal responses', () => {
    assert.equal(overpassFailure({ elements: [] }), null);
    assert.equal(overpassFailure({ elements: [], remark: 'some harmless note' }), null);
  });

  it('flags timeouts and server errors reported inside a 200 response', () => {
    assert.equal(
      overpassFailure({ elements: [], remark: 'runtime error: Query timed out in "query" at line 3 after 26 seconds.' }),
      'server busy (query timed out)',
    );
    assert.equal(overpassFailure({ elements: [], remark: 'runtime error: Query run out of memory using about 2048 MB of RAM.' }), 'server error');
    assert.equal(overpassFailure({} as never), 'unexpected response');
  });
});
