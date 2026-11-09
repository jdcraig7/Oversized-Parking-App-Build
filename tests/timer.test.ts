import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { durationChoices, durationLabel, formatRemaining, parseMaxStay, reminderTimes } from '../src/lib/timer';

describe('parking timer', () => {
  it('reads posted max stays', () => {
    assert.equal(parseMaxStay('2 hours'), 120);
    assert.equal(parseMaxStay('4h'), 240);
    assert.equal(parseMaxStay('90 min'), 90);
    assert.equal(parseMaxStay('1 day'), 1440);
    assert.equal(parseMaxStay('2 hrs, Mo-Fr'), 120);
    assert.equal(parseMaxStay('no limit'), null);
    assert.equal(parseMaxStay(undefined), null);
  });

  it('reminds 15 minutes early and at the end', () => {
    const now = 0;
    assert.deepEqual(reminderTimes(60 * 60_000, now), [
      { at: 45 * 60_000, kind: 'soon' },
      { at: 60 * 60_000, kind: 'ended' },
    ]);
    // Too short for a heads-up.
    assert.deepEqual(reminderTimes(10 * 60_000, now), [{ at: 10 * 60_000, kind: 'ended' }]);
    assert.deepEqual(reminderTimes(-1, now), []);
  });

  it('formats time left and choices', () => {
    assert.equal(formatRemaining(65 * 60_000), '1h 05m');
    assert.equal(formatRemaining(30_000), '1m');
    assert.equal(formatRemaining(-5), '0m');
    assert.deepEqual(durationChoices('90 minutes').slice(0, 3), [30, 60, 90]);
    assert.equal(durationLabel(1440), '1 day');
    assert.equal(durationLabel(120), '2 hr');
    assert.equal(durationLabel(90), '90 min');
  });
});
