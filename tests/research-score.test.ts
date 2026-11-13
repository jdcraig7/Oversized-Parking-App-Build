import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { yieldScore } from '../scripts/research-score';

describe('yieldScore', () => {
  it('ranks named institutional garages above generic ones', () => {
    const campus = yieldScore({ name: 'Stadium Drive Garage', operator: 'University of Maryland', website: 'https://x.edu' });
    const generic = yieldScore({ name: 'Garage A' });
    const unnamed = yieldScore({});
    assert.ok(campus > generic);
    assert.ok(generic >= unnamed);
  });
  it('treats "Parking Garage" as generic', () => {
    assert.equal(yieldScore({ name: 'Parking Garage' }), 0);
    assert.ok(yieldScore({ name: 'Lavaca Plaza' }) > 0);
  });
});
