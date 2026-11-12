# DTC Workbench: notes for Claude

OBD-II diagnostics web app for Abdus (GitHub: Wabmo), based in Johannesburg. It reads ELM327 adapters in the browser and produces customer-ready fault reports. It's hosted on GitHub Pages at https://wabmo.github.io/dtc-workbench/.

## Ground rules
- **No build step, no runtime dependencies.** Plain ES modules served as static files. Don't add frameworks or bundlers unless Abdus asks.
- **Run `npm test` before every commit.** The deploy only runs if tests pass. Add tests for new parsing, scan or report logic.
- **Keep logic modules DOM-free** (`elm.js`, `scanner.js`, `faults.js`, `pids.js`, `report.js`, `simulator.js`) so they stay testable in Node. Only `app.js` and `transports.js` touch the browser.
- **New scanner features:** add the request/response to `simulator.js` scenarios first, then write the scanner code against the simulator, then test it.
- **Releases:** bump `js/version.js` and `package.json` version, add a CHANGELOG.md entry, and tick ROADMAP.md.
- **Audience is South African:** km, °C, ZAR, en-ZA dates, SA vehicle examples (Polo Vivo, Corolla, Ranger, Hilux). The writing is plain English that a car owner can understand.
- Report styles in `css/report.css` are embedded into downloaded HTML reports, so keep that file self-contained.
- Never present simulator output as real vehicle data. Demo reports must stay labelled.

## Layout
`index.html` · `css/` · `js/` (see README table) · `tests/*.test.js` (node:test) · `.github/workflows/pages.yml` (test → deploy to Pages)
