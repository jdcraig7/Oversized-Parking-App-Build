import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { feetInchesToMeters } from '../src/lib/height';
import { parseOverpass } from '../src/lib/osm';
import { evaluate } from '../src/lib/search';
import { listingToSpot, parseListingRow, pickSponsored, seededRandom, type ListingRow, type SponsoredListing } from '../src/lib/sponsors';

const truck = feetInchesToMeters(7, 6); // 2.29 m
const margin = feetInchesToMeters(0, 3);
const origin = { latitude: 40, longitude: -105 };

const row = (over: Partial<ListingRow>): ListingRow => ({
  id: 'a',
  kind: 'spot',
  spot_id: null,
  title: 'Acme Garage',
  tagline: null,
  offer: null,
  category: null,
  latitude: 40,
  longitude: -105,
  address: null,
  phone: null,
  website: null,
  price: null,
  hours: null,
  clearance_m: '2.60',
  open_air: false,
  weight: 1,
  ...over,
});
const listing = (over: Partial<ListingRow>): SponsoredListing => parseListingRow(row(over));

describe('parseListingRow', () => {
  it('reads clearance as meters, open air, or unknown', () => {
    assert.deepEqual(listing({}).clearance, { status: 'limited', meters: 2.6 });
    assert.deepEqual(listing({ open_air: true, clearance_m: null }).clearance, { status: 'open' });
    assert.deepEqual(listing({ kind: 'business', clearance_m: null }).clearance, { status: 'unknown' });
  });
});

describe('pickSponsored', () => {
  it('never shows a parking sponsor the vehicle does not fit', () => {
    const low = listing({ id: 'low', clearance_m: '2.10' }); // too low
    const tight = listing({ id: 'tight', clearance_m: '2.33' }); // inside the 3" margin
    assert.equal(pickSponsored([low, tight], [], truck, margin, 'seed'), null);
  });

  it('uses the lower of the sponsor claim and the map/driver data', () => {
    const [osm] = parseOverpass({
      elements: [{ type: 'way', id: 9, center: { lat: 40, lon: -105 }, tags: { amenity: 'parking', parking: 'multi-storey', maxheight: '2.1' } }],
    });
    const result = evaluate(osm, origin, truck, margin);
    const claimsTall = listing({ spot_id: osm.id, clearance_m: '3.00' });
    assert.equal(pickSponsored([claimsTall], [result], truck, margin, 'seed'), null);
  });

  it('shows a fitting parking sponsor with its search result', () => {
    const [osm] = parseOverpass({
      elements: [{ type: 'way', id: 9, center: { lat: 40, lon: -105 }, tags: { amenity: 'parking', parking: 'multi-storey', maxheight: '2.8' } }],
    });
    const result = evaluate(osm, origin, truck, margin);
    const pick = pickSponsored([listing({ spot_id: osm.id })], [result], truck, margin, 'seed');
    assert.equal(pick?.listing.spotId, osm.id);
    assert.equal(pick?.result, result);
  });

  it('always allows business sponsors and keeps the same pick for the same search', () => {
    const shop = listing({ id: 'shop', kind: 'business', clearance_m: null });
    const garage = listing({ id: 'garage' });
    const a = pickSponsored([shop, garage], [], truck, margin, 'denver|2');
    const b = pickSponsored([shop, garage], [], truck, margin, 'denver|2');
    assert.ok(a);
    assert.equal(a.listing.id, b?.listing.id);
  });

  it('splits picks by weight across many searches', () => {
    const heavy = listing({ id: 'heavy', weight: 3 });
    const light = listing({ id: 'light', weight: 1 });
    let heavyCount = 0;
    for (let i = 0; i < 4000; i++) {
      if (pickSponsored([heavy, light], [], truck, margin, `search-${i}`)?.listing.id === 'heavy') heavyCount++;
    }
    assert.ok(heavyCount > 2800 && heavyCount < 3200, `heavy picked ${heavyCount} of 4000`);
  });
});

describe('seededRandom', () => {
  it('stays in [0, 1)', () => {
    for (const s of ['', 'a', 'zzzz', 'x'.repeat(500)]) {
      const r = seededRandom(s);
      assert.ok(r >= 0 && r < 1);
    }
  });
});

describe('listingToSpot', () => {
  it('builds a details-screen spot with a sponsor id', () => {
    const spot = listingToSpot(listing({ id: 'abc', price: 'Free for customers', open_air: true, clearance_m: null }));
    assert.equal(spot.id, 'sponsor:abc');
    assert.equal(spot.fee, 'free');
    assert.equal(spot.kind, 'surface');
  });
});
