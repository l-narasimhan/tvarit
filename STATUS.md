# Tvarit — status

Paused 2026-09-27. Run: `npm run dev` in `~/dtwin/darkstore` → http://localhost:5220

## Built
| Milestone | What |
|---|---|
| M0 | Store 01 transcribed from the planning sheet; racks with real Code 128 bin barcodes; chiller, HV cage, pigeon holes, packing, pallets, rider bay |
| extras | First-person walk (V; ←→ turn), glass-door fridges, chiller evaporators + synthesised cooling sound, pendency TV, real pack shapes and art for 88 Indian q-comm SKUs |
| M2 | People: store manager, ASM, pickers, riders with scooters (no packers — pickers bag and drop in pigeon holes; riders collect from them) |
| M3 → M4 | Headless, seeded simulation engine (`src/sim/engine.ts`): 60–80 orders/h demand curve, 2-min O2D target, pickers + riders on real orders, live stock, TV fully live, order trace, clock/speed; full day runs in ~4 s (`npx tsx scripts/sim-day.ts`) |
| M5 | Night inbound 01:00–04:00: lorries dock, unload → GRN check → putaway by pickers; orders-first rule |
| Intake | ＋ New darkstore: name + layout PDF (Google Sheets export) + bin master CSV/XLSX → preview → saved in the browser; header dropdown switches stores; generic darkstore + samples |
| Roster | Rider shifts by hour (up to 36 at the evening peak); natural idle behaviour |
| M6 | Scenario lab: A vs B knobs, multi-day runs in Web Workers, KPI comparison, hourly charts, replay any run in 3D |

## Resume here
1. **M7 calibration** — needs from Lan: real floor area (the scale is a guess; the pick walk dominates O2D), time standards (pick per line, bag, putaway, rider round trip), picker/rider rosters by shift, a real bin master export (confirm the bin-code format and the `zone` column), what "SE" is, the partly hidden chiller rack codes.
2. Sharing stores across people — stores saved via the form live only in one browser. Options: export/import file, or a small internal server.
3. Smaller: people pass through each other; >36 riders share bay spots; store manager and ASM not yet in the engine; daytime replenishment from floor pallets.

## Checks
- `npx tsx scripts/sim-day.ts` — headless day, prints hourly KPIs and a determinism check
- `npx tsx scripts/check-intake.ts <layout.pdf> <bins.csv>` — read intake files headless
- `node scripts/cdp-shot.mjs "<query>" <secs> "<selector>" <out.png>` — real-time browser check (workers, IndexedDB)
- `node scripts/shot.mjs <view|key=value>` — quick screenshots (virtual time; stalls on the PDF worker)

Store 01's layout comes from a confidential sheet: the repo is private — keep it that way.
