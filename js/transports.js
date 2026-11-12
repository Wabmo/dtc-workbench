/* Browser connections to a real adapter: USB/serial (Web Serial) and Bluetooth LE (Web Bluetooth).
   Each returns { write(string), close(), onData, name }. */
const enc = new TextEncoder(), dec = new TextDecoder();

export async function serialTransport(baud){
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate: baud });
  let reader, alive = true;
  const t = { onData:null, name:'USB adapter',
    async write(s){ const w = port.writable.getWriter(); await w.write(enc.encode(s)); w.releaseLock(); },
    async close(){ alive=false; try{ if(reader) await reader.cancel(); }catch(e){} try{ await port.close(); }catch(e){} } };
  (async () => {
    while (alive && port.readable){
      reader = port.readable.getReader();
      try { for(;;){ const {value, done} = await reader.read(); if (done) break; t.onData && t.onData(dec.decode(value)); } }
      catch(e) {} finally { try{ reader.releaseLock(); }catch(e){} }
      if (!alive) break;
    }
  })();
  return t;
}

const BLE_SVC = [0xfff0, 0xffe0, 0x18f0, 0xffb0, 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '0000fff0-0000-1000-8000-00805f9b34fb'];

export async function bleTransport(onDisconnect){
  const dev = await navigator.bluetooth.requestDevice({ acceptAllDevices:true, optionalServices: BLE_SVC });
  const srv = await dev.gatt.connect();
  let wc, nc;
  for (const s of await srv.getPrimaryServices()){
    let cs; try { cs = await s.getCharacteristics(); } catch(e) { continue; }
    wc = cs.find(c=>c.properties.write||c.properties.writeWithoutResponse);
    nc = cs.find(c=>c.properties.notify||c.properties.indicate);
    if (wc && nc) break;
  }
  if (!wc || !nc) throw new Error('This Bluetooth device does not expose a serial service. Check that it is an OBD-II adapter.');
  const t = { onData:null, name: dev.name || 'BLE adapter',
    async write(s){
      const b = enc.encode(s);
      for (let i=0;i<b.length;i+=20){ const ch=b.slice(i,i+20); if (wc.properties.writeWithoutResponse && wc.writeValueWithoutResponse) await wc.writeValueWithoutResponse(ch); else await wc.writeValue(ch); }
    },
    async close(){ try{ dev.gatt.disconnect(); }catch(e){} } };
  await nc.startNotifications();
  nc.addEventListener('characteristicvaluechanged', e => t.onData && t.onData(dec.decode(e.target.value)));
  dev.addEventListener('gattserverdisconnected', () => onDisconnect && onDisconnect());
  return t;
}
