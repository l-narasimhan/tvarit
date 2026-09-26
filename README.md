# Darkstore Twin

Layout-driven 3D twin of a quick-commerce darkstore. `npm run dev` → http://localhost:5220

- `src/layout/schema.ts` — the layout format (sheet cells → metres via `cell`)
- `src/layout/store01.ts` — Store 01, transcribed from the planning sheet (confidential, local only)
- `src/model.ts` — sheet → store model: racks, faces, bins + barcodes, walls, doors, pigeon holes, pallets
- `src/scene/*` — rendering; `src/ui.ts` — panels
- `npm run shot -- overview top find=A5-06-C3` — headless screenshots into `shots/`
