# Tvarit

Tvarit (त्वरित, "swift") — a layout-driven 3D digital twin and simulator of a quick-commerce darkstore.

Layout-driven 3D twin of a quick-commerce darkstore. `npm run dev` → http://localhost:5220

- `src/layout/schema.ts` — the layout format (sheet cells → metres via `cell`)
- `src/layout/store01.ts` — Store 01, transcribed from the planning sheet (confidential, local only)
- `src/model.ts` — sheet → store model: racks, faces, bins + barcodes, walls, doors, pigeon holes, pallets
- `src/scene/*` — rendering; `src/ui.ts` — panels
- `npm run shot -- overview top find=A5-06-C3` — headless screenshots into `shots/`
- `src/sim/engine.ts` — the simulation engine: headless, fixed 0.2 s steps, seeded; owns time, orders, pickers, riders, stock
- `npx tsx scripts/sim-day.ts [seed] [pickers] [riders]` — run a full 24 h day headless (~3 s) and print hour-by-hour KPIs
- URL: `?hour=19&seed=1` start time and seed; `?order=1&skip=60` trace an order and fast-forward (checks)
