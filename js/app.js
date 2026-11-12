/* UI wiring: buttons, forms, saved reports and exports. Logic lives in the other modules. */
import { APP_VERSION } from './version.js';
import { lookup, DTC_RE } from './faults.js';
import { Elm } from './elm.js';
import { initAdapter, fullScan, readLive, clearCodes as clearDTCs } from './scanner.js';
import { serialTransport, bleTransport } from './transports.js';
import { createSimTransport, SCENARIOS } from './simulator.js';
import { reportHTML, reportText, reportCsv, fileBase, fmtDate, esc } from './report.js';

const $ = id => document.getElementById(id);
const VF = ['shop','customer','tech','make','model','year','reg','odo','vin','notes'];
let elm = null, transport = null, isCAN = true, logText = '';
let S = blank();

function blank(){ return {id:null, sample:false, demo:false, vehicle:{}, mil:null, milCount:null, dtcs:[], live:[], ff:null, protocol:'', adapterV:'', scannedAt:null}; }
function sampleState(){
  const pv = (o) => Object.entries(o).map(([pid,v]) => ({pid, v}));
  return {id:null, sample:true, demo:false, mil:true, milCount:2, protocol:'ISO 15765-4 CAN (11 bit, 500 kbaud)', adapterV:'12.4V', scannedAt:new Date().toISOString(),
    vehicle:{shop:'Sample Auto Diagnostics', customer:'Sample customer', tech:'Sample technician', make:'Volkswagen', model:'Polo Vivo 1.4', year:'2016', reg:'AB 12 CD GP', odo:'148 320', vin:'AAVZZZ6RZGU000000', notes:'Engine shakes at idle, check-engine light came on last week. Fuel consumption up.'},
    dtcs:[{code:'P0301',status:'Stored'},{code:'P0171',status:'Stored'},{code:'P0420',status:'Pending'}],
    ff:{code:'P0301', vals:pv({'0C':2310,'0D':64,'05':88,'04':46.3,'11':18.4,'06':9.4,'07':21.9,'0B':52,'10':14.61,'0F':31,'0E':14.5})},
    live:pv({'0C':812,'05':91,'0F':29,'04':27.8,'06':6.3,'07':22.7,'10':3.12,'0B':34,'42':14.08})};
}

function log(s){ logText += s+'\n'; const el=$('log'); el.textContent = logText.slice(-12000); el.scrollTop = el.scrollHeight; }
function toast(s){ const t=$('toast'); t.textContent=s; t.hidden=false; clearTimeout(toast.tm); toast.tm=setTimeout(()=>t.hidden=true,3800); }
function setConn(state, txt){
  const sim = transport && transport.simulated;
  $('connDot').className = 'dot' + (state==='on' ? (sim ? ' sim' : ' on') : state==='busy' ? ' busy' : '');
  $('connTxt').textContent = txt;
  const on = state!=='off';
  $('btnScan').disabled = !on || state==='busy'; $('btnLive').disabled = !on || state==='busy'; $('btnClear').disabled = !on || state==='busy';
  $('btnConnect').disabled = on; $('btnDisconnect').disabled = !on;
}
function leaveSample(){ if (S.sample){ S = blank(); VF.forEach(k => $('v_'+k).value = ''); $('sampleNote').hidden = true; } }
function vehicleFromForm(){ VF.forEach(k => S.vehicle[k] = $('v_'+k).value.trim()); }
function formFromVehicle(){ VF.forEach(k => $('v_'+k).value = S.vehicle[k] || ''); }

/* ---------- Connection & scanning ---------- */
async function connect(){
  const type = $('connType').value;
  try {
    setConn('busy','Connecting…');
    transport = type==='ble' ? await bleTransport(onDisconnected)
              : type==='sim' ? createSimTransport($('simScenario').value)
              : await serialTransport(+$('baud').value);
    elm = new Elm(transport, log);
    const info = await initAdapter(elm);
    isCAN = info.isCAN;
    $('adapterTxt').textContent = transport.simulated ? 'Simulator' : (info.adapter || transport.name);
    $('protoTxt').textContent = info.protocol;
    setConn('on', transport.simulated ? 'Simulator connected' : 'Connected');
    toast(transport.simulated ? 'Demo car connected. Run a full scan to read it.' : 'Scanner connected. Run a full scan to read the car.');
  } catch(e) {
    log('! '+e.message);
    toast(/No port selected/.test(e.message) || e.name==='NotFoundError' ? 'No device selected.' : e.message);
    await disconnect(true);
  }
}
async function disconnect(silent){
  try { transport && await transport.close(); } catch(e) {}
  transport = null; elm = null; setConn('off','Not connected');
  $('protoTxt').textContent = '—'; $('adapterTxt').textContent = '—';
  if (!silent) toast('Disconnected.');
}
function onDisconnected(){ if (transport){ transport = null; elm = null; setConn('off','Not connected'); toast('The adapter disconnected.'); } }

async function scan(){
  if (!elm) return;
  setConn('busy','Scanning…');
  try {
    leaveSample();
    const r = await fullScan(elm, { isCAN });
    const manual = S.dtcs.filter(d => d.manual);
    const seen = new Set(r.dtcs.map(d => d.code));
    S.dtcs = [...r.dtcs, ...manual.filter(d => !seen.has(d.code))];
    Object.assign(S, { mil:r.mil, milCount:r.milCount, adapterV:r.adapterV, ff:r.ff, live:r.live, protocol:$('protoTxt').textContent, scannedAt:new Date().toISOString(), demo: !!transport.simulated });
    if (r.vin){ S.vehicle.vin = r.vin; $('v_vin').value = r.vin; }
    if (transport.simulated){
      const v = SCENARIOS[transport.scenario].vehicle;
      for (const k of ['make','model','year']) if (!$('v_'+k).value){ $('v_'+k).value = v[k]; }
      if (!$('v_shop').value) $('v_shop').value = 'DEMO — simulated vehicle';
    }
    const n = r.dtcs.length;
    toast(n ? `Scan complete: ${n} fault code${n>1?'s':''} found.` : 'Scan complete: no fault codes stored.');
  } catch(e) { toast(e.message); }
  setConn(elm ? 'on' : 'off', elm ? (transport.simulated ? 'Simulator connected' : 'Connected') : 'Not connected');
  render();
}
async function refreshLive(){
  if (!elm) return;
  setConn('busy','Reading live data…'); leaveSample();
  S.live = await readLive(elm); S.scannedAt = S.scannedAt || new Date().toISOString();
  setConn('on', transport.simulated ? 'Simulator connected' : 'Connected'); render(); toast('Live data updated.');
}
async function clearCodes(){
  $('clearConfirm').hidden = true; if (!elm) return;
  setConn('busy','Clearing…');
  try {
    if (await clearDTCs(elm)){ toast('Fault codes cleared. Run a scan to confirm none return.'); S.dtcs = S.dtcs.filter(d => d.manual); S.mil = false; S.milCount = 0; S.ff = null; }
    else toast('The car did not confirm the clear. Some cars require the engine to be off with ignition on.');
  } catch(e) { toast(e.message); }
  setConn('on', transport.simulated ? 'Simulator connected' : 'Connected'); render();
}

/* ---------- Rendering ---------- */
function renderCodeList(){
  const ul = $('codeList');
  if (!S.dtcs.length){ ul.innerHTML = '<li style="justify-content:center;color:var(--muted)">No fault codes yet.</li>'; return; }
  ul.innerHTML = S.dtcs.map((d,i) => { const x = lookup(d.code); return `<li><span class="c">${esc(d.code)}</span><span class="chip s${x.sev}">${esc(d.status)}</span><span class="t" title="${esc(x.title)}">${esc(x.title)}</span><button class="x" data-rm="${i}" aria-label="Remove ${esc(d.code)}">×</button></li>`; }).join('');
}
function render(){ vehicleFromForm(); $('report').innerHTML = reportHTML(S, APP_VERSION); renderCodeList(); $('sampleNote').hidden = !S.sample; }

/* ---------- Exports ---------- */
function download(name, data, type){
  const b = new Blob([data], {type}); const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
async function reportCss(){
  try { const r = await fetch('css/report.css'); if (r.ok) return await r.text(); } catch(e) {}
  try { return [...$('reportCssLink').sheet.cssRules].map(r => r.cssText).join('\n'); } catch(e) { return ''; }
}
async function exportHtml(){
  render();
  const css = await reportCss();
  download(fileBase(S)+'.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Diagnostic report ${esc(S.vehicle.reg||'')}</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"><style>${css} body{margin:0;background:#fff}.rpt{max-width:900px;margin:0 auto;padding:32px 20px} @media print{.rpt{padding:0}@page{margin:14mm}} *{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body><article class="rpt">${reportHTML(S, APP_VERSION)}</article></body></html>`, 'text/html');
}

/* ---------- Saved reports (this browser only) ---------- */
const HK = 'dtcWorkbench.reports';
function hGet(){ try { return JSON.parse(localStorage.getItem(HK) || '[]'); } catch(e) { return []; } }
function hSet(a){ try { localStorage.setItem(HK, JSON.stringify(a)); return true; } catch(e) { return false; } }
function renderHist(){
  const a = hGet();
  $('hist').innerHTML = a.length ? a.map((r,i) => `<li><span>${esc([r.vehicle.reg, r.vehicle.make, r.vehicle.model].filter(Boolean).join(' · ') || 'Unnamed vehicle')}${r.demo?' (demo)':''}<small>${esc(fmtDate(r.scannedAt || r.savedAt))} · ${r.dtcs.map(d=>d.code).join(', ') || 'no codes'}</small></span><button class="btn sm" data-load="${i}">Open</button><button class="x" data-del="${i}" aria-label="Delete saved report">×</button></li>`).join('')
    : '<li style="color:var(--muted)">No saved reports yet. Reports are stored in this browser only.</li>';
}
function saveReport(){
  vehicleFromForm();
  const a = hGet(); const r = JSON.parse(JSON.stringify(S));
  r.sample = false; r.savedAt = new Date().toISOString(); r.id = r.id || ('r'+Date.now()); S.id = r.id;
  const i = a.findIndex(x => x.id===r.id); if (i>=0) a[i] = r; else a.unshift(r);
  toast(hSet(a.slice(0,60)) ? 'Report saved in this browser.' : 'This browser blocked saving. Download the report instead.');
  renderHist();
}

/* ---------- Events ---------- */
function addManual(){
  const codes = ($('manualCodes').value.toUpperCase().match(/[PCBU][0-3][0-9A-F]{3}/g) || []).filter(c => DTC_RE.test(c));
  if (!codes.length){ toast('Enter codes like P0301 or C0035: one letter (P, C, B or U) followed by four characters.'); return; }
  leaveSample();
  const st = $('manualStatus').value;
  for (const c of new Set(codes)) if (!S.dtcs.some(d => d.code===c)) S.dtcs.push({code:c, status:st, manual:true});
  S.scannedAt = S.scannedAt || new Date().toISOString(); $('manualCodes').value = ''; render();
}
function syncConnType(){
  const t = $('connType').value;
  $('baudWrap').hidden = t!=='serial'; $('simWrap').hidden = t!=='sim'; $('simNote').hidden = t!=='sim';
  $('connHelp').hidden = t==='sim';
}

$('btnAdd').onclick = addManual;
$('manualCodes').addEventListener('keydown', e => { if (e.key==='Enter'){ e.preventDefault(); addManual(); } });
$('codeList').onclick = e => { const i = e.target.dataset.rm; if (i!==undefined){ S.dtcs.splice(+i,1); render(); } };
$('connType').onchange = syncConnType;
$('btnConnect').onclick = connect;
$('btnDisconnect').onclick = () => disconnect();
$('btnScan').onclick = scan;
$('btnLive').onclick = refreshLive;
$('btnClear').onclick = () => $('clearConfirm').hidden = false;
$('btnClearNo').onclick = () => $('clearConfirm').hidden = true;
$('btnClearYes').onclick = clearCodes;
$('btnPrint').onclick = () => { render(); window.print(); };
$('btnHtml').onclick = exportHtml;
$('btnCsv').onclick = () => { render(); download(fileBase(S)+'.csv', reportCsv(S), 'text/csv'); };
$('btnTxt').onclick = () => { render(); download(fileBase(S)+'.txt', reportText(S), 'text/plain'); };
$('btnLog').onclick = () => download('obd-traffic-log.txt', logText || 'No traffic.', 'text/plain');
$('btnSave').onclick = saveReport;
$('btnNew').onclick = () => { S = blank(); formFromVehicle(); render(); toast('New report started.'); };
$('hist').onclick = e => {
  const a = hGet();
  if (e.target.dataset.load!==undefined){ S = Object.assign(blank(), a[+e.target.dataset.load]); formFromVehicle(); render(); toast('Saved report opened.'); }
  if (e.target.dataset.del!==undefined){ a.splice(+e.target.dataset.del,1); hSet(a); renderHist(); }
};
VF.forEach(k => $('v_'+k).addEventListener('input', () => { if (S.sample){ S.sample = false; $('sampleNote').hidden = true; } render(); }));

/* ---------- Start ---------- */
(function init(){
  $('verTxt').textContent = 'v'+APP_VERSION;
  $('simScenario').innerHTML = Object.entries(SCENARIOS).map(([id,s]) => `<option value="${id}">${esc(s.label)}</option>`).join('');
  const w = [];
  if (!window.isSecureContext) w.push('Open this page over https:// (or localhost) for the scanner connection to work. The simulator works anywhere.');
  const hasSerial = 'serial' in navigator, hasBle = 'bluetooth' in navigator;
  if (!hasSerial && !hasBle) w.push('This browser cannot talk to scanners. Use Google Chrome or Microsoft Edge on a computer, or Chrome on Android (Bluetooth LE only). You can still use the simulator or add codes by hand.');
  if (!hasSerial) $('connType').querySelector('[value=serial]').disabled = true;
  if (!hasBle) $('connType').querySelector('[value=ble]').disabled = true;
  if (!hasSerial) $('connType').value = hasBle ? 'ble' : 'sim';
  if (w.length){ $('supportWarn').textContent = w.join(' '); $('supportWarn').hidden = false; }
  if (hasSerial) navigator.serial.addEventListener('disconnect', onDisconnected);
  syncConnType();
  S = sampleState(); formFromVehicle(); render(); renderHist(); setConn('off','Not connected');
})();
