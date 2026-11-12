# Changelog

## 1.2 — 2026-11-12
- Moved to a GitHub repository with automatic testing and GitHub Pages hosting
- Split the single HTML file into modules (fault library, parser, scanner, report, UI)
- ELM327 simulator with four demo cars: VW Polo (misfire + lean), Toyota Corolla (no faults), Opel Corsa (older non-CAN), Ford Ranger diesel (DPF + boost)
- Demo reports are labelled "DEMO DATA"
- 27 automated tests covering parsing, the fault library, reports and full simulated scans
- New cross-code tip: underboost with a soot-loaded DPF

## 1.1 — 2026-11-09
- Freeze-frame data (mode 02): the code that triggered it, readings at the time of the fault next to live readings, and a plain-language summary
- Freeze frame included in the TXT and CSV downloads

## 1.0 — 2026-11-09
- First release: USB and Bluetooth LE ELM327 connection; stored, pending and permanent codes; library of about 190 codes; live data; printable report with HTML/CSV/TXT downloads; saved reports; clearing codes with confirmation
