# DTC Workbench

A browser-based OBD-II diagnostics tool. Plug an ELM327 scanner into a car, read the fault codes, and get a clear report with what each fault means, likely causes, how to fix it and whether the car is safe to drive. You can print the report, save it as a PDF, or download it as HTML, CSV or text.

**Live site:** https://wabmo.github.io/dtc-workbench/

## What it does

- Connects to ELM327-compatible adapters over **USB** (Web Serial) or **Bluetooth LE** (Web Bluetooth)
- Reads stored, pending and permanent fault codes, the check-engine light status, the VIN and the battery voltage
- Explains about 190 common codes in plain language, with tips for codes that appear together
- Captures **freeze-frame** data (conditions when the fault was set) and a live-data snapshot
- **Simulator mode** with four demo cars, so you can practise or demo without a scanner
- Saves reports in the browser and builds printable, customer-ready reports

## Using it

1. Open the live site in **Google Chrome or Microsoft Edge** on a computer, or Chrome on Android for Bluetooth LE adapters.
2. Plug the adapter into the car's OBD port and switch the ignition on.
3. Choose the connection type and click **Connect**, then **Run full scan**.
4. Fill in the vehicle and job details, then print or download the report.

No scanner? Choose **Simulator (demo car)** as the connection.

Bluetooth Classic adapters (most cheap "ELM327 Bluetooth" dongles) can't be used from a browser. Use a USB cable or a BLE adapter instead.

## Project layout

| Path | What it is |
|---|---|
| `index.html` | Page markup |
| `css/report.css` | Report styles and colour tokens (also embedded in downloaded reports) |
| `css/app.css` | App layout, dark mode and print styles |
| `js/app.js` | UI wiring |
| `js/faults.js` | Fault code library and cross-code tips |
| `js/pids.js` | Live-data definitions |
| `js/elm.js` | ELM327 response parsing |
| `js/scanner.js` | Scan sequence (connect, read codes, freeze frame, live data, clear) |
| `js/transports.js` | USB and Bluetooth connections |
| `js/simulator.js` | Fake adapter and demo cars |
| `js/report.js` | Report builders (HTML, text, CSV) |
| `tests/` | Automated tests (`npm test`) |

## Development

No build step and no dependencies. You need Node 20 or later to run the tests.

```bash
npm test      # run the tests
npm start     # serve locally at http://localhost:3000
```

Opening `index.html` straight from disk won't work, because browsers block JavaScript modules on `file://`. Use `npm start` or the live site.

Every push to `main` runs the tests and, if they pass, publishes the site to GitHub Pages.

See [ROADMAP.md](ROADMAP.md) for planned features and [CHANGELOG.md](CHANGELOG.md) for releases.

## Disclaimer

Fault codes show where a problem was detected, not always which part has failed. Confirm the diagnosis with testing before replacing parts.
