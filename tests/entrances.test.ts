import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyEntrances, EntranceIndex, entranceFrom } from '../src/lib/entrances';
import type { TileRecord } from '../src/lib/tiles';

describe('garage entrances', () => {
  it('recognizes entrances, ramps and bars that carry a height', () => {
    assert.equal(entranceFrom({ amenity: 'parking_entrance' }, 1, 2)?.kind, 'entrance');
    assert.equal(entranceFrom({ amenity: 'parking_entrance', maxheight: `6'8"` }, 1, 2)?.height, `6'8"`);
    assert.equal(entranceFrom({ highway: 'service', maxheight: '2.1' }, 1, 2)?.kind, 'ramp');
    assert.equal(entranceFrom({ highway: 'service' }, 1, 2), null);
    assert.equal(entranceFrom({ barrier: 'height_restrictor', maxheight: 'default' }, 1, 2), null);
  });

  it('copies the nearest entrance height onto a garage without one', () => {
    const index = new EntranceIndex();
    index.add({ lat: 34.14260, lon: -118.25510, kind: 'ramp', height: `7'0"` }); // ~11 m away
    index.add({ lat: 34.14300, lon: -118.25510, kind: 'barrier', height: '2.0' }); // ~55 m away
    index.add({ lat: 34.14262, lon: -118.25515, kind: 'entrance' }); // no height
    const garage: TileRecord = ['w', 1, 34.1425, -118.2551, { amenity: 'parking', parking: 'multi-storey' }];
    const known: TileRecord = ['w', 2, 34.1425, -118.2551, { amenity: 'parking', parking: 'multi-storey', maxheight: '2.4' }];
    const lot: TileRecord = ['w', 3, 34.1425, -118.2551, { amenity: 'parking', parking: 'surface' }];
    assert.equal(applyEntrances([garage, known, lot], index), 1);
    assert.equal(garage[4].maxheight, `7'0"`);
    assert.equal(garage[4]['maxheight:source'], 'ramp');
    assert.equal(garage[4].entrance, '34.14262,-118.25515');
    assert.equal(known[4].maxheight, '2.4'); // never overwritten
    assert.equal(lot[4].maxheight, undefined); // open-air lots don't need one
  });

  it('ignores entrances too far away', () => {
    const index = new EntranceIndex();
    index.add({ lat: 34.1440, lon: -118.2551, kind: 'ramp', height: '2.0' }); // ~170 m
    const garage: TileRecord = ['w', 1, 34.1425, -118.2551, { amenity: 'parking', parking: 'underground' }];
    assert.equal(applyEntrances([garage], index), 0);
  });
});
