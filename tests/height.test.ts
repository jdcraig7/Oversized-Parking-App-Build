import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { checkFit, describeFit, feetInchesToMeters, formatFeetInches, parseHeight } from '../src/lib/height';

const inches = (m: number) => Math.round(m / 0.0254);

describe('parseHeight', () => {
  it('reads metric values (OSM default unit)', () => {
    assert.deepEqual(parseHeight('2.1'), { kind: 'meters', meters: 2.1 });
    assert.deepEqual(parseHeight('2.1 m'), { kind: 'meters', meters: 2.1 });
    assert.deepEqual(parseHeight('2,3'), { kind: 'meters', meters: 2.3 });
  });

  it('reads imperial values in all common spellings', () => {
    for (const raw of [`6'8"`, `6' 8"`, '6 ft 8 in', '6ft8in', '6′8″', '80"', '80 in']) {
      const h = parseHeight(raw);
      assert.equal(h.kind, 'meters', raw);
      if (h.kind === 'meters') assert.equal(inches(h.meters), 80, raw);
    }
    const h = parseHeight(`7'`);
    assert.ok(h.kind === 'meters' && inches(h.meters) === 84);
  });

  it('takes the lowest of several values', () => {
    const h = parseHeight(`2.4;7'`);
    assert.ok(h.kind === 'meters' && inches(h.meters) === 84);
  });

  it('handles "none" and placeholders', () => {
    assert.deepEqual(parseHeight('none'), { kind: 'none' });
    assert.deepEqual(parseHeight('default'), { kind: 'unknown' });
    assert.deepEqual(parseHeight('below_default'), { kind: 'unknown' });
    assert.deepEqual(parseHeight(undefined), { kind: 'unknown' });
    assert.deepEqual(parseHeight(''), { kind: 'unknown' });
  });

  it('rejects implausible values', () => {
    assert.deepEqual(parseHeight('0.5'), { kind: 'unknown' });
    assert.deepEqual(parseHeight('45'), { kind: 'unknown' });
    assert.deepEqual(parseHeight(`6'14"`), { kind: 'unknown' });
  });
});

describe('formatFeetInches', () => {
  it('formats feet and inches', () => {
    assert.equal(formatFeetInches(feetInchesToMeters(7, 2)), `7' 2"`);
    assert.equal(formatFeetInches(feetInchesToMeters(7, 0)), `7'`);
    assert.equal(formatFeetInches(2.1), `6' 11"`);
  });
});

describe('checkFit', () => {
  const truck = feetInchesToMeters(7, 6);
  const margin = feetInchesToMeters(0, 3);

  it('fits with room to spare', () => {
    const fit = checkFit({ status: 'limited', meters: feetInchesToMeters(8, 2) }, truck, margin);
    assert.equal(fit.status, 'fits');
    assert.equal(describeFit(fit), `Fits: 8" to spare`);
  });

  it('is tight inside the safety margin', () => {
    const fit = checkFit({ status: 'limited', meters: feetInchesToMeters(7, 8) }, truck, margin);
    assert.equal(fit.status, 'tight');
  });

  it('treats an exactly equal clearance as tight, not too low', () => {
    assert.equal(checkFit({ status: 'limited', meters: truck }, truck, margin).status, 'tight');
  });

  it('is too low when clearance is under vehicle height', () => {
    const fit = checkFit({ status: 'limited', meters: feetInchesToMeters(6, 8) }, truck, margin);
    assert.equal(fit.status, 'too-low');
    assert.equal(describeFit(fit), `Too low by 10"`);
  });

  it('open-air always fits and unknown stays unknown', () => {
    assert.equal(checkFit({ status: 'open' }, truck, margin).status, 'fits');
    assert.equal(checkFit({ status: 'unknown' }, truck, margin).status, 'unknown');
  });
});
