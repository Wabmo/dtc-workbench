/* Live-data PIDs (OBD-II mode 01 / mode 02).
   n = data bytes, f = formula from raw bytes, dp = decimals shown, typ = typical range text,
   chk = optional check returning 'ok' | 'watch' | 'bad'. */
const trimChk = v => Math.abs(v) > 20 ? 'bad' : Math.abs(v) > 10 ? 'watch' : 'ok';

export const PIDS = [
  {pid:'0C', name:'Engine speed', unit:'rpm', n:2, f:(a,b)=>(a*256+b)/4, dp:0, typ:'650–900 at warm idle'},
  {pid:'0D', name:'Vehicle speed', unit:'km/h', n:1, f:a=>a, dp:0, typ:'—'},
  {pid:'05', name:'Coolant temperature', unit:'°C', n:1, f:a=>a-40, dp:0, typ:'85–105 when warm', chk:v=>v>110?'bad':v>105?'watch':v<70?'watch':'ok'},
  {pid:'0F', name:'Intake air temperature', unit:'°C', n:1, f:a=>a-40, dp:0, typ:'Near outside temp, +10–30 when hot'},
  {pid:'04', name:'Calculated engine load', unit:'%', n:1, f:a=>a*100/255, dp:1, typ:'15–40 at idle'},
  {pid:'11', name:'Throttle position', unit:'%', n:1, f:a=>a*100/255, dp:1, typ:'0–20 closed (varies)'},
  {pid:'06', name:'Short-term fuel trim B1', unit:'%', n:1, f:a=>(a-128)*100/128, dp:1, typ:'−10 to +10', chk:trimChk},
  {pid:'07', name:'Long-term fuel trim B1', unit:'%', n:1, f:a=>(a-128)*100/128, dp:1, typ:'−10 to +10', chk:trimChk},
  {pid:'08', name:'Short-term fuel trim B2', unit:'%', n:1, f:a=>(a-128)*100/128, dp:1, typ:'−10 to +10', chk:trimChk},
  {pid:'09', name:'Long-term fuel trim B2', unit:'%', n:1, f:a=>(a-128)*100/128, dp:1, typ:'−10 to +10', chk:trimChk},
  {pid:'0B', name:'Intake manifold pressure', unit:'kPa', n:1, f:a=>a, dp:0, typ:'25–40 at idle (non-turbo)'},
  {pid:'10', name:'Mass air flow', unit:'g/s', n:2, f:(a,b)=>(a*256+b)/100, dp:2, typ:'2–7 at idle (small petrol)'},
  {pid:'0E', name:'Ignition timing advance', unit:'°', n:1, f:a=>a/2-64, dp:1, typ:'5–20 at idle'},
  {pid:'42', name:'Control module voltage', unit:'V', n:2, f:(a,b)=>(a*256+b)/1000, dp:2, typ:'13.5–14.8 running', chk:v=>v<12?'bad':v<13.2||v>15?'watch':'ok'},
];

export const pidInfo = pid => PIDS.find(p => p.pid === pid);

/* PIDs requested from the freeze frame (mode 02). */
export const FF_PIDS = ['0C','0D','05','04','11','06','07','08','09','0B','10','0F','0E','42'];
