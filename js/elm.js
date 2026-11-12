/* ELM327 protocol: response parsing and the command/response channel.
   Everything here is pure (no DOM) so it can be tested in Node. */

/* Split a raw ELM reply into clean upper-case lines without spaces. */
export function lines(resp){
  return resp.toUpperCase().replace(/SEARCHING\.\.\./g,'').split(/[\r\n]+/).map(s=>s.replace(/\s+/g,'').trim()).filter(Boolean);
}

/* Join ISO-TP multi-frame replies ("014", "0:....", "1:....") into whole messages. */
export function messages(resp){
  const ls = lines(resp).filter(l => /^[0-9A-F:]+$/.test(l));
  const out = []; let multi = '';
  for (const l of ls){
    const m = l.match(/^([0-9A-F]):(.*)$/);
    if (m){ multi += m[2]; continue; }
    if (/^[0-9A-F]{3}$/.test(l)){ if (multi) out.push(multi); multi=''; continue; } // ISO-TP length header
    if (multi){ out.push(multi); multi=''; }
    out.push(l);
  }
  if (multi) out.push(multi);
  return out;
}

/* Two bytes (4 hex chars) → a code like P0301. */
export function decodeDTC(w){
  const b0 = parseInt(w.slice(0,2),16);
  return ('PCBU'[b0>>6] + ((b0>>4)&3) + w[1] + w.slice(2,4)).toUpperCase();
}

/* Code like P0301 → 4 hex chars (used by the simulator and tests). */
export function encodeDTC(code){
  const L = 'PCBU'.indexOf(code[0]);
  const b0 = (L<<6) | (parseInt(code[1],16)<<4) | parseInt(code[2],16);
  return b0.toString(16).padStart(2,'0').toUpperCase() + code.slice(3,5).toUpperCase();
}

/* Fault codes from a mode 03 / 07 / 0A reply. CAN replies carry a count byte first. */
export function parseDTC(resp, mode, isCAN){
  const pre = (0x40 + parseInt(mode,16)).toString(16).toUpperCase();
  const out = [];
  for (const m of messages(resp)){
    if (!m.startsWith(pre)) continue;
    let d = m.slice(2);
    if (isCAN){ const n = parseInt(d.slice(0,2),16); d = d.slice(2); if (!isNaN(n)) d = d.slice(0, n*4); }
    for (let i=0;i+4<=d.length;i+=4){ const w = d.slice(i,i+4); if (w!=='0000') out.push(decodeDTC(w)); }
  }
  return [...new Set(out)];
}

/* Data bytes from a mode 01 reply ("41 PP AA BB …"). */
export function parsePID(resp, pid){
  for (const m of messages(resp)){
    if (m.indexOf('41'+pid)===0){ const bytes=[]; for (let j=4;j+2<=m.length;j+=2) bytes.push(parseInt(m.slice(j,j+2),16)); return bytes; }
  }
  return null;
}

/* Data bytes from a mode 02 freeze-frame reply ("42 PP 00 AA BB …"). */
export function parseFF(resp, pid){
  for (const m of messages(resp)){
    if (m.indexOf('42'+pid)===0){ const bytes=[]; for (let j=6;j+2<=m.length;j+=2) bytes.push(parseInt(m.slice(j,j+2),16)); return bytes; }
  }
  return null;
}

/* 17-character VIN from a mode 09 PID 02 reply. */
export function parseVIN(resp){
  let hex = '';
  for (const m of messages(resp)){ const i = m.indexOf('4902'); if (i<0) continue; hex += m.slice(i+6); }
  let s=''; for (let i=0;i+2<=hex.length;i+=2){ const c=String.fromCharCode(parseInt(hex.slice(i,i+2),16)); if (/[A-HJ-NPR-Z0-9]/.test(c)) s+=c; }
  return s.length>=17 ? s.slice(-17) : '';
}

export const PROTOCOLS = {'1':'SAE J1850 PWM','2':'SAE J1850 VPW','3':'ISO 9141-2','4':'ISO 14230-4 KWP (5 baud)','5':'ISO 14230-4 KWP (fast)','6':'ISO 15765-4 CAN (11 bit, 500 kbaud)','7':'ISO 15765-4 CAN (29 bit, 500 kbaud)','8':'ISO 15765-4 CAN (11 bit, 250 kbaud)','9':'ISO 15765-4 CAN (29 bit, 250 kbaud)','A':'SAE J1939 CAN'};

/* Sends one command at a time and resolves with the text before the ">" prompt.
   transport: { write(string): Promise, onData: callback set by Elm }. */
export class Elm {
  constructor(transport, onLog = () => {}){
    this.t = transport; this.onLog = onLog; this.buf = ''; this.w = null;
    transport.onData = s => {
      this.buf += s;
      const i = this.buf.indexOf('>');
      if (i>=0 && this.w){ const r=this.buf.slice(0,i); this.buf=this.buf.slice(i+1); const w=this.w; this.w=null; clearTimeout(w.tm); w.res(r); }
    };
  }
  cmd(c, ms = 5000){
    this.buf = '';
    return new Promise((res, rej) => {
      const tm = setTimeout(() => { this.w = null; this.onLog('! no reply to '+c); rej(new Error('Scanner did not reply to '+c)); }, ms);
      this.w = { res: r => { this.onLog('> '+c+'\n'+r.trim()); res(r); }, tm };
      this.t.write(c+'\r').catch(e => { clearTimeout(tm); this.w = null; rej(e); });
    });
  }
}
