/* High-level scan steps on top of an Elm channel. No DOM, so the same code
   runs against a real adapter in the browser and against the simulator in tests. */
import { parseDTC, parsePID, parseFF, parseVIN, decodeDTC, PROTOCOLS } from './elm.js';
import { PIDS, FF_PIDS, pidInfo } from './pids.js';

/* Reset and configure the adapter, then confirm it can talk to the car. */
export async function initAdapter(elm){
  let id = '';
  try { id = (await elm.cmd('ATZ', 4000)).replace(/[\r\n>]+/g,' ').trim(); } catch(e) { id = ''; }
  for (const c of ['ATE0','ATL0','ATS0','ATH0','ATAT1','ATSP0']) await elm.cmd(c, 3000);
  const r = await elm.cmd('0100', 20000);
  if (/UNABLE|NO DATA|ERROR|STOPPED/i.test(r)) throw new Error('The adapter could not talk to the car. Check the ignition is on and the adapter is firmly plugged in.');
  const dp = (await elm.cmd('ATDPN', 3000)).replace(/[^0-9A-F]/gi,'').toUpperCase().replace(/^A(?=.)/,'');
  return {
    adapter: (id.match(/ELM327\s*v?[\d.]+/i) || ['ELM327'])[0],
    protocolCode: dp,
    protocol: PROTOCOLS[dp] || ('Protocol '+dp),
    isCAN: /^[6-9ABC]$/.test(dp)
  };
}

export async function readLive(elm){
  const out = [];
  for (const p of PIDS){
    try { const b = parsePID(await elm.cmd('01'+p.pid, 3000), p.pid); if (b && b.length>=p.n) out.push({pid:p.pid, v:p.f(...b)}); } catch(e) {}
  }
  return out;
}

export async function readFreeze(elm){
  let code = null;
  try {
    const b = parseFF(await elm.cmd('020200', 4000), '02');
    if (b && b.length>=2 && (b[0]||b[1])) code = decodeDTC(b.slice(0,2).map(x=>x.toString(16).padStart(2,'0')).join('').toUpperCase());
  } catch(e) {}
  if (!code) return null;
  const vals = [];
  for (const pid of FF_PIDS){
    const p = pidInfo(pid);
    try { const b = parseFF(await elm.cmd('02'+pid+'00', 3000), pid); if (b && b.length>=p.n) vals.push({pid, v:p.f(...b)}); } catch(e) {}
  }
  return {code, vals};
}

/* Everything the report needs: MIL status, VIN, battery, codes, freeze frame, live data. */
export async function fullScan(elm, { isCAN }){
  const res = { mil:null, milCount:null, vin:'', adapterV:'', dtcs:[], ff:null, live:[] };
  const st = parsePID(await elm.cmd('0101', 5000), '01');
  if (st){ res.mil = !!(st[0]&0x80); res.milCount = st[0]&0x7F; }
  try { res.vin = parseVIN(await elm.cmd('0902', 6000)); } catch(e) {}
  try { res.adapterV = (await elm.cmd('ATRV', 3000)).replace(/[^\d.V]/g,''); } catch(e) {}
  const seen = new Set();
  for (const [mode, status] of [['03','Stored'],['07','Pending'],['0A','Permanent']]){
    try {
      const r = await elm.cmd(mode, 8000);
      for (const code of parseDTC(r, mode, isCAN)) if (!seen.has(code)){ seen.add(code); res.dtcs.push({code, status}); }
    } catch(e) {}
  }
  res.ff = res.dtcs.length ? await readFreeze(elm) : null;
  res.live = await readLive(elm);
  return res;
}

/* Mode 04. Returns true when the car confirms the clear. */
export async function clearCodes(elm){
  const r = await elm.cmd('04', 8000);
  return /44/.test(r.replace(/\s/g,''));
}
