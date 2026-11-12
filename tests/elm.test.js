import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDTC, parsePID, parseFF, parseVIN, decodeDTC, encodeDTC } from '../js/elm.js';

test('decodes CAN single-frame DTC reply', () => {
  assert.deepEqual(parseDTC('430201330420\r\r', '03', true), ['P0133','P0420']);
});

test('decodes non-CAN DTC reply with spaces and padding', () => {
  assert.deepEqual(parseDTC('43 01 33 04 20 00 00\r', '03', false), ['P0133','P0420']);
});

test('decodes CAN multi-frame DTC reply', () => {
  assert.deepEqual(parseDTC('00A\r0:43040301030C\r1:C0350420000000\r', '03', true), ['P0301','P030C','U0035','P0420']);
});

test('empty and NO DATA replies give no codes', () => {
  assert.deepEqual(parseDTC('4300\r', '03', true), []);
  assert.deepEqual(parseDTC('NO DATA\r', '07', true), []);
});

test('pending (07) and permanent (0A) replies use their own prefixes', () => {
  assert.deepEqual(parseDTC('47010420\r', '07', true), ['P0420']);
  assert.deepEqual(parseDTC('4A010301\r', '0A', true), ['P0301']);
});

test('DTC encode/decode round-trip covers all four systems', () => {
  for (const c of ['P0301','C0035','B0012','U0121','P242F','P1A23']) assert.equal(decodeDTC(encodeDTC(c)), c);
});

test('reads VIN from multi-frame reply', () => {
  assert.equal(parseVIN('014\r0:490201314731\r1:4A433534343452\r2:37323532333637\r'), '1G1JC5444R7252367');
});

test('reads mode 01 PIDs, ignoring SEARCHING...', () => {
  assert.deepEqual(parsePID('410C1A2C\r', '0C'), [26,44]);
  assert.deepEqual(parsePID('SEARCHING...\r4101810761FF\r', '01'), [129,7,97,255]);
  assert.equal(parsePID('NO DATA', '0C'), null);
});

test('reads mode 02 freeze-frame bytes after the frame number', () => {
  assert.deepEqual(parseFF('4202000301\r', '02'), [3,1]);
  assert.deepEqual(parseFF('420C001A2C\r', '0C'), [26,44]);
});
