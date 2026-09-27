// Renders a layout the way Google Sheets exports a planning sheet to PDF — coloured cells, labels (tall cells
// get their letters stacked one per line), purple walls, a quantity legend — plus a matching bin-master CSV.
//   npx tsx scripts/make-samples.ts generic public/samples          (the shareable sample)
//   npx tsx scripts/make-samples.ts store01 <private dir>           (never into the repo: confidential)
import { writeFileSync, mkdirSync } from 'node:fs'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { GENERIC } from '../src/layout/generic'
import { STORE01 } from '../src/layout/store01'
import type { SheetLayout } from '../src/layout/schema'
import { buildStore } from '../src/model'

const [which = 'generic', out = 'public/samples'] = process.argv.slice(2)
const L: SheetLayout = which === 'store01' ? STORE01 : GENERIC
const base = which === 'store01' ? 'store01' : 'generic_darkstore'
const PX = 26, M = 30
const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255)
const QTY = ['#ffe599', '#f6b26b', '#cc4125', '#b6d7a8', '#ffffff']

const doc = await PDFDocument.create()
const font = await doc.embedFont(StandardFonts.HelveticaBold)
const W = L.cols * PX + 2 * M, H = L.rows * PX + 2 * M
const page = doc.addPage([W, H])
const X = (c: number) => M + c * PX, Y = (r: number) => H - M - r * PX          // PDF y is up

// Sheet gridlines, as thin lines (not cells).
for (let c = 0; c <= L.cols; c++) page.drawLine({ start: { x: X(c), y: Y(0) }, end: { x: X(c), y: Y(L.rows) }, thickness: 0.3, color: hex('#e0e0e0') })
for (let r = 0; r <= L.rows; r++) page.drawLine({ start: { x: X(0), y: Y(r) }, end: { x: X(L.cols), y: Y(r) }, thickness: 0.3, color: hex('#e0e0e0') })

const label = (text: string, c0: number, r0: number, c1: number, r1: number, size = 9) => {
  const w = (c1 - c0) * PX, h = (r1 - r0) * PX
  if (w >= h || text.length <= 2) {
    const tw = font.widthOfTextAtSize(text, size)
    page.drawText(text, { x: X(c0) + (w - tw) / 2, y: Y(r0) - h / 2 - size / 3, size, font })
  } else {
    // Wrapped text in a narrow cell: one letter per line, centred.
    const letters = text.replace(/\s+/g, ' ').split('')
    const lh = Math.min(size + 1, h / letters.length)
    letters.forEach((ch, i) => {
      if (ch === ' ') return
      const tw = font.widthOfTextAtSize(ch, Math.min(size, lh))
      page.drawText(ch, { x: X(c0) + (w - tw) / 2, y: Y(r0) - (h - letters.length * lh) / 2 - (i + 0.8) * lh, size: Math.min(size, lh), font })
    })
  }
}
const cell = (c0: number, r0: number, c1: number, r1: number, fill: string, border = false) =>
  page.drawRectangle({ x: X(c0), y: Y(r1), width: (c1 - c0) * PX, height: (r1 - r0) * PX, color: hex(fill), ...(border ? { borderColor: hex('#333333'), borderWidth: 0.8 } : {}) })

let n = 0
for (const it of L.items) {
  const { c0, r0, c1, r1 } = it
  switch (it.kind) {
    case 'rack': cell(c0, r0, c1, r1, QTY[(n++ * 7) % QTY.length], QTY[(n * 7) % QTY.length] === '#ffffff'); label(it.id!, c0, r0, c1, r1); break
    case 'wall': cell(c0, r0, c1, r1, '#b57ba6'); break
    case 'door': cell(c0, r0, c1, r1, '#9fc5e8'); label('EN', c0, r0, c1, r1); break
    case 'entrance': cell(c0, r0, c1, r1, '#9fc5e8'); label('ENTRANCE', c0, r0, c1, r1, 7); break
    case 'desk': cell(c0, r0, c1, r1, '#b6d7a8'); label('FRONT DESK', c0, r0, c1, r1, 11); break
    case 'wms': cell(c0, r0, c1, r1, '#b6d7a8'); label('WMS SITTING AREA', c0, r0, c1, r1, 11); break
    case 'dropzone': cell(c0, r0, c1, r1, '#ffff00'); label('DROPZONE', c0, r0, c1, r1, 11); break
    case 'packing': cell(c0, r0, c1, r1, '#f9cb9c'); label('PACKING TABLE', c0, r0, c1, r1, 11); break
    case 'station': cell(c0, r0, c1, r1, '#f9cb9c'); label(it.id ?? 'ST', c0, r0, c1, r1); break
    case 'pallet': cell(c0, r0, c1, r1, '#ffffff', true); label(it.id!, c0, r0, c1, r1, 8); break
  }
}
for (const z of L.zones) if (z.kind === 'hv') { const t = 'HV CAGE'; page.drawText(t, { x: X((z.c0 + z.c1) / 2) - font.widthOfTextAtSize(t, 11) / 2, y: Y(z.r0 + 1), size: 11, font }) }
// Stock-quantity legend, top right, as the real sheet has.
;[['6 - 10 Qty', '#ffe599'], ['11 - 15 Qty', '#f6b26b'], ['> 15 Qty', '#cc4125']].forEach(([t, c], i) => {
  page.drawRectangle({ x: W - M - 70, y: H - 14 - i * 10, width: 70, height: 10, color: hex(c) })
  page.drawText(t, { x: W - M - 68, y: H - 12 - i * 10, size: 7, font })
})

mkdirSync(out, { recursive: true })
writeFileSync(`${out}/${base}_layout.pdf`, await doc.save())

// Bin master, from the store model built on the same layout.
const store = buildStore(L)
const rows = ['bin_code,rack,level,position,zone,sku,product,qty,capacity']
for (const s of store.slots.filter(s => s.kind === 'bin')) {
  rows.push([s.code, s.owner, s.level, s.pos, s.zone, s.sku?.sku ?? '', `"${(s.sku?.name ?? '').replace(/"/g, '""')}"`, s.qty, s.cap].join(','))
}
writeFileSync(`${out}/${base}_bins.csv`, rows.join('\n'))
console.log(`${out}/${base}_layout.pdf · ${out}/${base}_bins.csv (${rows.length - 1} bins)`)
