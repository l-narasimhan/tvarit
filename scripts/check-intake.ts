// Reads a layout PDF + bin master exactly as the app does, builds the store, and reports what it found.
//   npx tsx scripts/check-intake.ts <layout.pdf> <bins.csv|xlsx> [name]
import { readFileSync } from 'node:fs'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { parseBinRows, readTable } from '../src/intake/bins'
import { extractDrawing, layoutFromDrawing } from '../src/intake/pdf'
import { buildStore } from '../src/model'

const [pdfPath, binPath, name = 'check'] = process.argv.slice(2)
const ab = (p: string) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer }
const bp = parseBinRows(await readTable(ab(binPath)))
const zones = new Map<string, 'ambient' | 'chiller' | 'hv'>()
for (const b of bp.bins) if (b.zone && !zones.has(b.rack)) zones.set(b.rack, b.zone)
for (const b of bp.bins) if (!zones.has(b.rack)) zones.set(b.rack, 'ambient')
const d = await extractDrawing(ab(pdfPath), pdfjs as never)
console.log(`PDF: ${d.texts.length} text items, ${d.rects.length} rectangles, page ${d.width.toFixed(0)}×${d.height.toFixed(0)} pt`)
const lp = layoutFromDrawing(d, { name, rackZones: zones })
console.log('found', lp.found)
console.log('bin issues', bp.issues)
console.log('layout issues', lp.issues)
const s = buildStore(lp.layout, bp.bins)
const z: Record<string, number> = {}; s.racks.forEach(r => (z[r.zone] = (z[r.zone] ?? 0) + 1))
console.log(`store ${s.W.toFixed(1)} × ${s.D.toFixed(1)} m · ${s.racks.length} racks ${JSON.stringify(z)} · ${s.slots.filter(x => x.kind === 'bin').length} bins · ${s.slots.filter(x => x.kind === 'pallet').length} pallets · doors ${s.doors.length} · fixtures ${s.fixtures.map(f => f.kind).join(',')}`)
console.log('model warnings', s.warnings)
