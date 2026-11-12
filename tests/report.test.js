import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportHTML, reportText, reportCsv, verdict, ffSummary, faultList, fileBase } from '../js/report.js';

const S = {
  vehicle: {customer:'<script>x</script>', make:'Volkswagen', model:'Polo', year:'2016', reg:'AB 12 CD GP', notes:'Shakes at idle'},
  mil: true, milCount: 2, protocol: 'ISO 15765-4 CAN (11 bit, 500 kbaud)', adapterV: '14.1V', scannedAt: '2026-11-12T08:30:00.000Z',
  dtcs: [{code:'P0420',status:'Pending'},{code:'P0301',status:'Stored'}],
  ff: {code:'P0301', vals:[{pid:'0C',v:2310},{pid:'0D',v:64},{pid:'05',v:88},{pid:'04',v:46.3},{pid:'06',v:9.4},{pid:'07',v:21.9}]},
  live: [{pid:'0C',v:812},{pid:'07',v:22.7}],
};

test('faults sort by severity, critical first', () => {
  assert.deepEqual(faultList(S).map(x => x.code), ['P0301','P0420']);
});

test('verdict reflects the worst fault', () => {
  assert.equal(verdict(faultList(S)).cls, 'v3');
  assert.equal(verdict([]).cls, 'v0');
});

test('freeze-frame summary describes driving conditions and lean running', () => {
  const s = ffSummary(S.ff);
  assert.match(s, /64 km\/h/);
  assert.match(s, /running lean/);
});

test('HTML report includes codes, freeze frame, live data and escapes user input', () => {
  const h = reportHTML(S, '9.9');
  assert.match(h, /P0301/); assert.match(h, /P0420/);
  assert.match(h, /Freeze frame — conditions when P0301/);
  assert.match(h, /Live data snapshot/);
  assert.match(h, /v9\.9/);
  assert.ok(!h.includes('<script>x</script>'), 'customer name must be escaped');
  assert.match(h, /&lt;script&gt;/);
});

test('demo reports are labelled', () => {
  assert.match(reportHTML({...S, demo:true}, '1'), /DEMO DATA/);
  assert.doesNotMatch(reportHTML(S, '1'), /DEMO DATA/);
});

test('text and CSV exports contain the faults', () => {
  const t = reportText(S);
  assert.match(t, /FREEZE FRAME \(P0301\)/);
  assert.match(t, /P0420  \[Pending\]/);
  const c = reportCsv(S);
  assert.equal(c.split('\r\n').length, 3);
  assert.match(c, /"P0301","Stored","Critical"/);
});

test('file names are safe', () => {
  assert.equal(fileBase(S), 'diagnostic-report-AB_12_CD_GP-2026-11-12');
});
