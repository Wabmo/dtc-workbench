/* End-to-end: the real scan code talking to the simulated adapter, for every demo car. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Elm } from '../js/elm.js';
import { initAdapter, fullScan, clearCodes } from '../js/scanner.js';
import { createSimTransport, SCENARIOS } from '../js/simulator.js';

async function connect(id){
  const elm = new Elm(createSimTransport(id, { delay: 0 }));
  const info = await initAdapter(elm);
  return { elm, info };
}

test('Polo: CAN scan finds stored, pending and permanent codes, VIN and freeze frame', async () => {
  const { elm, info } = await connect('polo');
  assert.equal(info.isCAN, true);
  assert.match(info.protocol, /CAN \(11 bit/);
  const r = await fullScan(elm, info);
  assert.equal(r.mil, true);
  assert.equal(r.milCount, 2);
  assert.equal(r.vin, 'AAVZZZ6RZGU012345');
  assert.deepEqual(r.dtcs, [{code:'P0301',status:'Stored'},{code:'P0171',status:'Stored'},{code:'P0420',status:'Pending'}]);
  assert.equal(r.ff.code, 'P0301');
  const rpm = r.ff.vals.find(v => v.pid==='0C').v;
  assert.equal(rpm, 2310);
  const ltft = r.live.find(v => v.pid==='07').v;
  assert.ok(Math.abs(ltft - 22.7) < 0.5, `LTFT ${ltft}`);
  assert.equal(r.adapterV, '14.1V');
});

test('Corolla: clean car reports no codes and no freeze frame', async () => {
  const { elm, info } = await connect('clean');
  const r = await fullScan(elm, info);
  assert.equal(r.mil, false);
  assert.deepEqual(r.dtcs, []);
  assert.equal(r.ff, null);
  assert.ok(r.live.length >= 10);
});

test('Corsa: older non-CAN car decodes multi-line replies and survives missing VIN', async () => {
  const { elm, info } = await connect('older');
  assert.equal(info.isCAN, false);
  assert.equal(info.protocol, 'ISO 9141-2');
  const r = await fullScan(elm, info);
  assert.equal(r.vin, '');
  assert.deepEqual(r.dtcs.map(d => d.code), ['P0135','P0442','P0304','P0171']);
  assert.equal(r.ff.code, 'P0304');
});

test('Ranger: 29-bit CAN diesel', async () => {
  const { elm, info } = await connect('diesel');
  assert.match(info.protocol, /29 bit/);
  const r = await fullScan(elm, info);
  assert.deepEqual(r.dtcs.map(d => d.code), ['P2463','P0299','P0401']);
});

test('clearing codes empties stored/pending but keeps permanent', async () => {
  const { elm, info } = await connect('polo');
  assert.equal(await clearCodes(elm), true);
  const r = await fullScan(elm, info);
  assert.equal(r.mil, false);
  assert.deepEqual(r.dtcs, [{code:'P0301',status:'Permanent'}]);
});

test('every scenario scans without throwing', async () => {
  for (const id of Object.keys(SCENARIOS)){
    const { elm, info } = await connect(id);
    const r = await fullScan(elm, info);
    assert.ok(Array.isArray(r.dtcs), id);
  }
});
