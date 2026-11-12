/* Builds the report in HTML, plain text and CSV from a report state object. Pure functions, no DOM.
   State shape: { vehicle:{shop,customer,tech,make,model,year,reg,odo,vin,notes}, mil, milCount,
                  dtcs:[{code,status}], ff:{code, vals:[{pid,v}]}|null, live:[{pid,v}], protocol, adapterV, scannedAt } */
import { lookup, correlations, DRIVE, SEVNAME } from './faults.js';
import { pidInfo } from './pids.js';

export function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

export function fmtDate(iso){
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-ZA',{year:'numeric',month:'short',day:'numeric'}) + ' ' + d.toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'});
}

export function faultList(S){
  return S.dtcs.map(d => Object.assign({status:d.status}, lookup(d.code)))
    .sort((a,b) => b.sev - a.sev || (a.status==='Stored' ? -1 : b.status==='Stored' ? 1 : 0));
}

export function verdict(list){
  const max = list.reduce((m,x) => Math.max(m,x.sev), 0);
  if (!list.length) return {cls:'v0', head:'No fault codes found', body:'The engine computer reported no stored, pending or permanent fault codes at the time of the scan.'};
  if (max===3) return {cls:'v3', head:'Attention required: critical fault present', body:'At least one fault can cause engine, catalytic converter or safety-system damage. Repair before further driving where possible.'};
  if (max===2) return {cls:'v2', head:'Repair recommended soon', body:'Faults were found that affect performance, fuel use or emissions. The vehicle is usually drivable short-term.'};
  return {cls:'v1', head:'Minor faults only', body:'Low-priority faults were found. Repair at the next service.'};
}

/* One-sentence description of the conditions stored in the freeze frame. */
export function ffSummary(ff){
  const v = pid => (ff.vals.find(x => x.pid===pid) || {}).v;
  const rpm=v('0C'), spd=v('0D'), ect=v('05'), load=v('04'), ltft=v('07'), stft=v('06');
  const p = [];
  if (spd!==undefined) p.push(spd<3 ? 'with the vehicle stationary' : `while driving at ${Math.round(spd)} km/h`);
  if (rpm!==undefined) p.push(`${Math.round(rpm)} rpm` + (rpm<1000 && (spd===undefined||spd<3) ? ' (idle)' : ''));
  if (ect!==undefined) p.push(ect<60 ? `engine cold (${Math.round(ect)} °C)` : ect<80 ? `engine warming up (${Math.round(ect)} °C)` : ect>105 ? `engine running hot (${Math.round(ect)} °C)` : `engine warm (${Math.round(ect)} °C)`);
  if (load!==undefined) p.push(load<30 ? 'light load' : load<65 ? 'moderate load' : 'heavy load');
  let s = p.length ? 'The fault was recorded ' + p.join(', ') + '.' : '';
  const trim = (ltft ?? 0) + (stft ?? 0);
  if (ltft!==undefined && trim>15) s += ` Combined fuel trim was +${trim.toFixed(1)} %, so the engine was running lean when the fault set.`;
  if (ltft!==undefined && trim<-15) s += ` Combined fuel trim was ${trim.toFixed(1)} %, so the engine was running rich when the fault set.`;
  if (ect!==undefined && ect<60) s += ' Faults that set only on a cold engine often point to sensors, thermostats or cold-start fuelling.';
  return s;
}

const LAMP = '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M8 10h4V8h6v2h3l2 3h3v-2h2v10h-2v-2h-3l-3 4H11l-3-3H6v3H4v-9h2v3h2z"/></svg>';
const flagText = fl => fl==='ok' ? 'Normal' : fl==='watch' ? 'Check' : fl==='bad' ? 'Out of range' : '—';
const fmtVal = (p, v) => `${v.toFixed(p.dp)} ${p.unit}`;

export function reportHTML(S, version){
  const v = S.vehicle || {}, list = faultList(S);
  const vd = verdict(list), hints = correlations(list.map(x => x.code));
  const count = s => list.filter(x => x.sev===s).length;
  const ref = 'DTC-' + (S.scannedAt ? S.scannedAt.slice(0,10).replace(/-/g,'') + '-' + S.scannedAt.slice(11,16).replace(':','') : 'DRAFT');
  const cell = (k, val, mono) => `<div><dt>${k}</dt><dd${mono?' class="mono"':''}>${esc(val)||'—'}</dd></div>`;
  const milTxt = S.mil==null ? 'Not read' : S.mil ? `ON (${S.milCount} code${S.milCount===1?'':'s'} reported)` : 'Off';
  let h = `<header class="rpt-head"><div><div class="rpt-shop">${esc(v.shop)||'Vehicle diagnostic report'}</div><h2>Vehicle Diagnostic Report</h2></div>
  <div class="rpt-meta">Ref ${esc(ref)}<br>Scanned ${esc(fmtDate(S.scannedAt))}<br>${esc(S.protocol)||'Protocol not recorded'}${S.demo?'<br><strong>DEMO DATA — simulated vehicle</strong>':''}</div></header>
  <dl class="rpt-grid">${cell('Customer',v.customer)}${cell('Vehicle',[v.year,v.make,v.model].filter(Boolean).join(' '))}${cell('Registration',v.reg)}${cell('Odometer',v.odo?v.odo+' km':'')}${cell('VIN',v.vin,true)}${cell('Technician',v.tech)}${cell('Check-engine light',milTxt)}${cell('Battery at OBD port',S.adapterV)}</dl>
  <div class="verdict ${vd.cls}"><div class="lamp${S.mil?' on':''}" aria-label="Check-engine light ${S.mil?'on':'off'}">${LAMP}</div><div><strong>${esc(vd.head)}</strong><p>${esc(vd.body)}</p>
  <div class="tally"><span class="chip">${list.length} fault code${list.length===1?'':'s'}</span>${count(3)?`<span class="chip s3">${count(3)} critical</span>`:''}${count(2)?`<span class="chip s2">${count(2)} repair soon</span>`:''}${count(1)?`<span class="chip s1">${count(1)} low priority</span>`:''}</div></div></div>`;
  if (v.notes) h += `<section class="rpt-sec"><h3>Customer complaint &amp; notes</h3><div class="notes">${esc(v.notes)}</div></section>`;
  h += `<section class="rpt-sec"><h3>Fault codes &amp; recommended repairs</h3>`;
  if (hints.length) h += hints.map(t => `<p class="hint"><strong>Diagnostic tip:</strong> ${esc(t)}</p>`).join('');
  if (!list.length) h += `<p>No faults to report.</p>`;
  for (const x of list){
    h += `<article class="fault s${x.sev}"><div class="fault-top"><div class="fcode">${esc(x.code)}</div><div class="ftitle">${esc(x.title)}</div>
    <div class="fchips"><span class="chip s${x.sev}">${SEVNAME[x.sev]}</span><span class="chip">${esc(x.status)}</span><span class="chip">${esc(x.sys)}</span></div></div>
    <div class="fbody"><div class="full"><h4>What this means</h4><p>${esc(x.mean)}</p>${x.status==='Pending'?'<p class="oem">Pending: the fault was seen once but not yet confirmed. It may become a stored code if it happens again.</p>':''}${x.status==='Permanent'?'<p class="oem">Permanent: this code cannot be cleared with a scan tool. It clears itself once the car confirms the repair over normal driving.</p>':''}${x.oem?'<p class="oem">Manufacturer-specific code: confirm the definition in the service information for this make.</p>':''}</div>
    <div><h4>Likely causes (most likely first)</h4><ol>${x.causes.map(c => `<li>${esc(c)}</li>`).join('')}</ol></div>
    <div><h4>How to fix</h4><ol>${x.fixes.map(c => `<li>${esc(c)}</li>`).join('')}</ol></div>
    ${S.ff && S.ff.code===x.code ? `<div class="full"><p class="hint" style="margin:6px 0 0"><strong>Freeze frame available:</strong> ${esc(ffSummary(S.ff))} See the freeze-frame section for the full readings.</p></div>` : ''}
    <div class="full drive"><strong>Can it be driven?</strong> ${esc(x.drive || DRIVE[x.sev])}</div></div></article>`;
  }
  h += `</section>`;
  if (S.ff && S.ff.vals.length){
    const live = id => (S.live.find(r => r.pid===id) || {}).v;
    h += `<section class="rpt-sec"><h3>Freeze frame — conditions when ${esc(S.ff.code)} was set</h3>
    <p style="margin:0 0 10px">${esc(ffSummary(S.ff))}</p>
    <div class="tblwrap"><table class="live"><thead><tr><th>Reading</th><th>At fault</th><th>Now (live)</th><th>Typical</th><th>Check</th></tr></thead><tbody>`;
    for (const r of S.ff.vals){
      const p = pidInfo(r.pid); if (!p) continue;
      const fl = p.chk ? p.chk(r.v) : null, lv = live(r.pid);
      h += `<tr><td>${esc(p.name)}</td><td class="num"><strong>${esc(fmtVal(p,r.v))}</strong></td><td class="num">${lv===undefined?'—':esc(fmtVal(p,lv))}</td><td>${esc(p.typ)}</td><td class="${fl?'flag-'+fl:''}">${flagText(fl)}</td></tr>`;
    }
    h += `</tbody></table></div><p class="small">The engine computer stores one snapshot of sensor readings at the moment the first emissions-related fault was confirmed. Recreating these conditions on a road test is the best way to confirm a repair.</p></section>`;
  }
  if (S.live.length){
    h += `<section class="rpt-sec"><h3>Live data snapshot</h3><div class="tblwrap"><table class="live"><thead><tr><th>Reading</th><th>Value</th><th>Typical</th><th>Check</th></tr></thead><tbody>`;
    for (const r of S.live){
      const p = pidInfo(r.pid); if (!p) continue;
      const fl = p.chk ? p.chk(r.v) : null;
      h += `<tr><td>${esc(p.name)}</td><td class="num">${esc(fmtVal(p,r.v))}</td><td>${esc(p.typ)}</td><td class="${fl?'flag-'+fl:''}">${flagText(fl)}</td></tr>`;
    }
    h += `</tbody></table></div><p class="small">Values captured at the time of the scan. Typical ranges are general guides for a warm petrol engine at idle; consult the manufacturer's specification.</p></section>`;
  }
  h += `<div class="sign"><div>Technician signature</div><div>Customer signature</div></div>
  <footer class="rpt-foot">This report interprets standard OBD-II fault codes (SAE J2012) and the vehicle's live data. Fault codes indicate where a problem was detected, not always which part has failed. Confirm the diagnosis with testing before replacing parts. Generated by DTC Workbench v${esc(version)}.</footer>`;
  return h;
}

export function reportText(S){
  const v = S.vehicle || {}, list = faultList(S), L = [];
  L.push('VEHICLE DIAGNOSTIC REPORT', v.shop||'', '='.repeat(48), `Scanned:   ${fmtDate(S.scannedAt)}`, `Customer:  ${v.customer||'-'}`, `Vehicle:   ${[v.year,v.make,v.model].filter(Boolean).join(' ')||'-'}`, `Reg:       ${v.reg||'-'}`, `Odometer:  ${v.odo?v.odo+' km':'-'}`, `VIN:       ${v.vin||'-'}`, `Protocol:  ${S.protocol||'-'}`, `MIL:       ${S.mil==null?'Not read':S.mil?'ON':'Off'}`, '');
  const vd = verdict(list); L.push('SUMMARY: '+vd.head, vd.body, '');
  if (v.notes) L.push('NOTES:', v.notes, '');
  correlations(list.map(x => x.code)).forEach(t => L.push('TIP: '+t));
  for (const x of list){
    L.push('', '-'.repeat(48), `${x.code}  [${x.status}] [${SEVNAME[x.sev]}]`, x.title, `System: ${x.sys}`, '', 'What this means:', x.mean, '', 'Likely causes:', ...x.causes.map((c,i) => `  ${i+1}. ${c}`), '', 'How to fix:', ...x.fixes.map((c,i) => `  ${i+1}. ${c}`), '', 'Driving: '+(x.drive || DRIVE[x.sev]));
  }
  const table = rows => rows.forEach(r => { const p = pidInfo(r.pid); if (p) L.push(`  ${p.name.padEnd(28)} ${fmtVal(p, r.v)}`); });
  if (S.ff && S.ff.vals.length){ L.push('', '='.repeat(48), `FREEZE FRAME (${S.ff.code})`, ffSummary(S.ff)); table(S.ff.vals); }
  if (S.live.length){ L.push('', '='.repeat(48), 'LIVE DATA'); table(S.live); }
  return L.join('\r\n');
}

export function reportCsv(S){
  const q = s => '"' + String(s ?? '').replace(/"/g,'""') + '"';
  const rows = [['Code','Status','Severity','System','Description','Meaning','Likely causes','How to fix','Driving advice','Freeze frame']];
  for (const x of faultList(S)) rows.push([x.code, x.status, SEVNAME[x.sev], x.sys, x.title, x.mean, x.causes.join(' | '), x.fixes.join(' | '), x.drive || DRIVE[x.sev], S.ff && S.ff.code===x.code ? ffSummary(S.ff) : '']);
  return '﻿' + rows.map(r => r.map(q).join(',')).join('\r\n');
}

export function fileBase(S){
  const v = S.vehicle || {};
  return ('diagnostic-report-' + [v.reg || v.make, (S.scannedAt || new Date().toISOString()).slice(0,10)].filter(Boolean).join('-')).replace(/[^\w-]+/g,'_');
}
