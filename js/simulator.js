/* ELM327 simulator: a fake adapter that answers like a real one plugged into a car.
   Used for the in-app demo mode and the automated tests. Add a car by adding a scenario. */
import { encodeDTC } from './elm.js';

/* Physical value → raw bytes (inverse of the formulas in pids.js). */
const ENC = {
  '0C': v => w16(Math.round(v*4)),
  '0D': v => [Math.round(v)],
  '05': v => [Math.round(v+40)], '0F': v => [Math.round(v+40)],
  '04': v => [Math.round(v*255/100)], '11': v => [Math.round(v*255/100)],
  '06': trim, '07': trim, '08': trim, '09': trim,
  '0B': v => [Math.round(v)],
  '10': v => w16(Math.round(v*100)),
  '0E': v => [Math.round((v+64)*2)],
  '42': v => w16(Math.round(v*1000)),
};
function trim(v){ return [Math.max(0, Math.min(255, Math.round(v*128/100+128)))]; }
function w16(n){ return [(n>>8)&255, n&255]; }
const hex = bytes => bytes.map(b => b.toString(16).padStart(2,'0')).join('').toUpperCase();
const asciiHex = s => hex([...s].map(c => c.charCodeAt(0)));

export const SCENARIOS = {
  polo: {
    label: '2016 VW Polo Vivo 1.4 — misfire and lean',
    vehicle: {make:'Volkswagen', model:'Polo Vivo 1.4', year:'2016'},
    protocol: '6', vin: 'AAVZZZ6RZGU012345', battery: '14.1V',
    stored: ['P0301','P0171'], pending: ['P0420'], permanent: ['P0301'],
    ff: {code:'P0301', vals:{'0C':2310,'0D':64,'05':88,'04':46.3,'11':18.4,'06':9.4,'07':21.9,'0B':52,'10':14.61,'0F':31,'0E':14.5,'42':14.05}},
    live: {'0C':812,'0D':0,'05':91,'0F':29,'04':27.8,'11':14.1,'06':6.3,'07':22.7,'0B':34,'10':3.12,'0E':9.5,'42':14.08},
  },
  clean: {
    label: '2019 Toyota Corolla 1.8 — no faults',
    vehicle: {make:'Toyota', model:'Corolla 1.8', year:'2019'},
    protocol: '6', vin: 'AHTBB3CE10A123456', battery: '14.3V',
    stored: [], pending: [], permanent: [], ff: null,
    live: {'0C':705,'0D':0,'05':93,'0F':27,'04':21.2,'11':12.5,'06':-1.6,'07':2.3,'0B':31,'10':2.48,'0E':11,'42':14.31},
  },
  older: {
    label: '2006 Opel Corsa 1.4 — older non-CAN car',
    vehicle: {make:'Opel', model:'Corsa 1.4', year:'2006'},
    protocol: '3', vin: null, battery: '13.9V', noPermanent: true,
    stored: ['P0135','P0442','P0304','P0171'], pending: [], permanent: [],
    ff: {code:'P0304', vals:{'0C':1980,'0D':52,'05':84,'04':39.2,'06':7.8,'07':18.0,'0B':47,'0F':26}},
    live: {'0C':850,'0D':0,'05':89,'0F':28,'04':25.1,'11':9.4,'06':4.7,'07':19.5,'0B':36,'0E':8},
  },
  diesel: {
    label: '2017 Ford Ranger 2.2 TDCi — DPF and boost',
    vehicle: {make:'Ford', model:'Ranger 2.2 TDCi', year:'2017'},
    protocol: '7', vin: 'AFAPXXMJ2PKR12345', battery: '14.0V',
    stored: ['P2463','P0299'], pending: ['P0401'], permanent: [],
    ff: {code:'P2463', vals:{'0C':1850,'0D':78,'05':86,'04':71.4,'0B':148,'10':48.2,'0F':34,'42':13.98}},
    live: {'0C':790,'0D':0,'05':84,'0F':30,'04':24.3,'0B':102,'10':9.85,'42':14.02},
  },
};

/* Returns a transport that behaves like a real adapter: write("01 0C\r") → onData("410C0CB0\r\r>"). */
export function createSimTransport(scenarioId = 'polo', { delay = 25 } = {}){
  const sc = SCENARIOS[scenarioId];
  if (!sc) throw new Error('Unknown simulator scenario: '+scenarioId);
  const st = { stored:[...sc.stored], pending:[...sc.pending], permanent:[...sc.permanent], ff: sc.ff, mil: sc.stored.length>0, searched:false };
  const isCAN = /^[6-9AB]$/.test(sc.protocol);

  /* CAN frames: single frame up to 7 bytes, otherwise ISO-TP multi-frame like the ELM prints it. */
  function canMsg(payload){
    const n = payload.length/2;
    if (n <= 7) return payload;
    const out = [n.toString(16).padStart(3,'0').toUpperCase()];
    out.push('0:' + payload.slice(0,12));
    let rest = payload.slice(12), i = 1;
    while (rest.length){ out.push((i % 16).toString(16).toUpperCase() + ':' + rest.slice(0,14).padEnd(14,'0')); rest = rest.slice(14); i++; }
    return out.join('\r');
  }
  function dtcReply(mode, codes){
    const pre = (0x40 + parseInt(mode,16)).toString(16).toUpperCase();
    const body = codes.map(encodeDTC).join('');
    if (isCAN) return canMsg(pre + codes.length.toString(16).padStart(2,'0').toUpperCase() + body);
    if (!codes.length) return pre + '000000000000';
    const ls = []; for (let i=0;i<codes.length;i+=3) ls.push(pre + codes.slice(i,i+3).map(encodeDTC).join('').padEnd(12,'0'));
    return ls.join('\r');
  }

  function answer(raw){
    const c = raw.replace(/\s+/g,'').toUpperCase();
    if (!c) return '';
    if (c === 'ATZ') return 'ELM327 v1.5 (Simulator)';
    if (c === 'ATDPN') return 'A' + sc.protocol;
    if (c === 'ATRV') return sc.battery;
    if (c.startsWith('AT')) return 'OK';
    if (c === '0100'){ const r = (st.searched ? '' : 'SEARCHING...\r') + '4100BE3FA813'; st.searched = true; return r; }
    if (c === '0101') return '4101' + hex([(st.mil?0x80:0) | st.stored.length, 0x07, 0xE5, 0x00]);
    if (c.startsWith('01') && c.length === 4){ const pid = c.slice(2); const v = sc.live[pid]; return v===undefined || !ENC[pid] ? 'NO DATA' : '41' + pid + hex(ENC[pid](v)); }
    if (c === '03') return dtcReply('03', st.stored);
    if (c === '07') return dtcReply('07', st.pending);
    if (c === '0A') return sc.noPermanent ? 'NO DATA' : dtcReply('0A', st.permanent);
    if (c === '04'){ st.stored = []; st.pending = []; st.ff = null; st.mil = false; return '44'; }
    if (c === '020200') return '420200' + (st.ff ? encodeDTC(st.ff.code) : '0000');
    if (c.startsWith('02') && c.length === 6){ const pid = c.slice(2,4); const v = st.ff && st.ff.vals[pid]; return v===undefined || !ENC[pid] ? 'NO DATA' : '42' + pid + '00' + hex(ENC[pid](v)); }
    if (c === '0902') return sc.vin && isCAN ? canMsg('490201' + asciiHex(sc.vin)) : 'NO DATA';
    return 'NO DATA';
  }

  const t = {
    onData: null, name: 'Simulator', scenario: scenarioId, simulated: true,
    async write(s){
      const reply = answer(s.replace(/\r/g,''));
      const send = () => t.onData && t.onData(reply + '\r\r>');
      if (delay) setTimeout(send, delay); else queueMicrotask(send);
    },
    async close(){},
  };
  return t;
}
