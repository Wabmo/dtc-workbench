import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DB, lookup, correlations, DTC_RE } from '../js/faults.js';

test('every library entry is complete and valid', () => {
  const codes = Object.keys(DB);
  assert.ok(codes.length > 150, `expected a sizeable library, got ${codes.length}`);
  for (const c of codes){
    const e = DB[c];
    assert.match(c, DTC_RE, `${c} is not a valid code`);
    assert.equal(e.code, c);
    assert.ok([1,2,3].includes(e.sev), `${c} severity`);
    assert.ok(e.title && e.mean && e.sys, `${c} text fields`);
    assert.ok(e.causes.length >= 1 && e.fixes.length >= 1, `${c} causes/fixes`);
  }
});

test('known code lookup', () => {
  const x = lookup('P0420');
  assert.equal(x.known, true);
  assert.match(x.title, /Catalyst/);
});

test('unknown manufacturer code falls back with a sensible system', () => {
  const x = lookup('P1234');
  assert.equal(x.known, false);
  assert.equal(x.oem, true);
  assert.match(x.sys, /manufacturer/i);
});

test('unknown airbag-range body code is flagged critical', () => {
  const x = lookup('B0071');
  assert.equal(x.sev, 3);
  assert.match(x.drive, /airbag/i);
});

test('cross-code tips fire for known combinations', () => {
  assert.equal(correlations(['P0420']).length, 0);
  assert.ok(correlations(['P0301','P0171']).some(t => /lean condition first/.test(t)));
  assert.ok(correlations(['P0420','P0301']).some(t => /Catalyst/.test(t)));
  assert.ok(correlations(['U0100','U0121']).some(t => /lost communication/i.test(t)));
});
