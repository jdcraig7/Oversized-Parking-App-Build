import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { bearing, offset, streetViewTarget, streetViewUrls } from '../src/lib/streetview';

describe('street view aiming', () => {
  it('computes bearings and offsets', () => {
    assert.ok(Math.abs(bearing({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 }) - 0) < 0.01);
    assert.ok(Math.abs(bearing({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }) - 90) < 0.01);
    const p = offset({ latitude: 34, longitude: -118 }, 0, 111_195);
    assert.ok(Math.abs(p.latitude - 35) < 0.01 && Math.abs(p.longitude + 118) < 1e-9);
  });

  it('stands outside the entrance looking in', () => {
    // Garage middle, entrance 40 m to the east: stand further east, look west.
    const spot = { latitude: 34.1425, longitude: -118.2551, entrance: { latitude: 34.1425, longitude: -118.25466 } };
    const t = streetViewTarget(spot);
    assert.ok(t.viewpoint.longitude > spot.entrance.longitude);
    assert.ok(Math.abs(t.heading! - 270) < 1);
  });

  it('falls back to the building middle without an entrance', () => {
    assert.deepEqual(streetViewTarget({ latitude: 1, longitude: 2 }), { viewpoint: { latitude: 1, longitude: 2 } });
  });

  it('opens the Google Maps app first, then the web', () => {
    const spot = { latitude: 34.1425, longitude: -118.2551, entrance: { latitude: 34.1425, longitude: -118.25466 } };
    const [android] = streetViewUrls(spot, 'android');
    assert.match(android, /^google\.streetview:cbll=34\.14250\d,-118\.2544\d+&cbp=0,270,0,0,0$/);
    const [ios, web] = streetViewUrls(spot, 'ios');
    assert.match(ios, /^comgooglemaps:\/\/\?center=.+&mapmode=streetview$/);
    assert.match(web, /map_action=pano&viewpoint=.+&heading=270$/);
  });
});
