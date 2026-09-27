// Layout from a PDF of the store's planning sheet (Google Sheets → Download → PDF). A sheet exported that way is
// vector: every cell background is a filled rectangle and every label is text. We read both, then decide what
// each cell is:
//   rack code (e.g. A5-06, or any code the bin master lists) → rack      P1-01-04 → floor pallet
//   EN → door        ENTRANCE → entrance      FRONT DESK → desk      WMS / SITTING → WMS desks
//   DROP ZONE → pigeon holes      PACKING (TABLE) → packing table      purple, unlabelled → wall
//   anything else labelled → a station the twin shows by its label (e.g. SE); legend cells (… Qty) are ignored.
// Vertical labels come out one letter per text item; letters inside the same cell are joined top to bottom.
// A scanned (image-only) PDF has no text or rectangles to read and is reported as such.

import type { ItemKind, SheetItem, SheetLayout, SheetZone } from '../layout/schema'
import type { BinZone } from './bins'

export interface PdfText { str: string; x: number; y: number; w: number; h: number }
export interface PdfRect { x: number; y: number; w: number; h: number; fill: [number, number, number] | null }
/** Page content in points, y downward from the page top. */
export interface Drawing { width: number; height: number; texts: PdfText[]; rects: PdfRect[] }

// ---- Extraction (pdf.js) -------------------------------------------------------------------------------------

type PdfJs = typeof import('pdfjs-dist')

export async function extractDrawing(data: ArrayBuffer, pdfjs: PdfJs): Promise<Drawing> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise
  const page = await doc.getPage(1)
  const [vx0, vy0, vx1, vy1] = page.view
  const H = vy1 - vy0
  const flip = (y: number) => vy1 - y

  const tc = await page.getTextContent()
  const texts: PdfText[] = []
  for (const it of tc.items as { str: string; transform: number[]; width: number; height: number }[]) {
    if (!it.str?.trim()) continue
    const [a, b, , , e, f] = it.transform
    const rotated = Math.abs(b) > Math.abs(a)
    const w = rotated ? it.height : it.width, h = rotated ? it.width : it.height || Math.hypot(a, b)
    // Baseline origin → top-left box, y downward.
    texts.push({ str: it.str, x: e - vx0 - (rotated ? w : 0), y: flip(f) - (rotated ? 0 : h), w, h })
  }

  const OPS = pdfjs.OPS
  const ol = await page.getOperatorList()
  const rects: PdfRect[] = []
  let ctm = [1, 0, 0, 1, 0, 0]
  const stack: number[][] = []
  let fill: [number, number, number] | null = [0, 0, 0]
  const fillStack: ([number, number, number] | null)[] = []
  let pending: [number, number, number, number][] = []
  const mul = (m: number[], n: number[]) => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ]
  const pt = (x: number, y: number) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]
  const color = (args: unknown[]): [number, number, number] => {
    if (typeof args[0] === 'string') { const h = args[0].replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number] }
    const v = Array.from(args[0] instanceof Object && 'length' in (args[0] as object) ? (args[0] as ArrayLike<number>) : (args as number[])).slice(0, 3).map(Number)
    const k = v.every(n => n <= 1) ? 255 : 1
    return [v[0] * k, v[1] * k, v[2] * k] as [number, number, number]
  }
  const emit = (painted: boolean, filled: boolean) => {
    if (painted) for (const [x, y, w, h] of pending) {
      const c = [pt(x, y), pt(x + w, y), pt(x, y + h), pt(x + w, y + h)]
      const xs = c.map(p => p[0]), ys = c.map(p => p[1])
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
      rects.push({ x: x0 - vx0, y: flip(y1), w: x1 - x0, h: y1 - y0, fill: filled ? fill : null })
    }
    pending = []
  }
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i], args = ol.argsArray[i] as unknown[]
    switch (fn) {
      case OPS.save: stack.push(ctm); fillStack.push(fill); break
      case OPS.restore: ctm = stack.pop() ?? ctm; fill = fillStack.pop() ?? fill; break
      case OPS.transform: ctm = mul(ctm, args as number[]); break
      case OPS.setFillRGBColor: fill = color(args); break
      case OPS.setFillGray: { const g = Number((args as number[])[0]) * 255; fill = [g, g, g]; break }
      case OPS.constructPath: {
        const [ops, coords] = args as [number[], number[]]
        let k = 0
        const poly: number[][] = []
        for (const op of ops) {
          if (op === OPS.rectangle) { pending.push([coords[k], coords[k + 1], coords[k + 2], coords[k + 3]]); k += 4 }
          else if (op === OPS.moveTo || op === OPS.lineTo) { poly.push([coords[k], coords[k + 1]]); k += 2 }
          else if (op === OPS.curveTo) k += 6
          else if (op === OPS.curveTo2 || op === OPS.curveTo3) k += 4
        }
        // An axis-aligned closed polygon of 4–5 points is a rectangle too.
        if (poly.length >= 4 && poly.length <= 5) {
          const xs = poly.map(p => p[0]), ys = poly.map(p => p[1])
          const x0 = Math.min(...xs), y0 = Math.min(...ys)
          if (poly.every(p => (p[0] === x0 || p[0] === Math.max(...xs)) && (p[1] === y0 || p[1] === Math.max(...ys))))
            pending.push([x0, y0, Math.max(...xs) - x0, Math.max(...ys) - y0])
        }
        break
      }
      case OPS.fill: case OPS.eoFill: case OPS.fillStroke: case OPS.eoFillStroke:
      case OPS.closeFillStroke: case OPS.closeEOFillStroke: emit(true, true); break
      case OPS.stroke: case OPS.closeStroke: emit(true, false); break
      case OPS.endPath: pending = []; break
    }
  }
  await doc.destroy()
  return { width: vx1 - vx0, height: H, texts, rects }
}

// ---- Classification ------------------------------------------------------------------------------------------

export interface LayoutParse {
  layout: SheetLayout
  issues: string[]
  found: { racks: number; walls: number; doors: number; pallets: number; stations: string[] }
}

const RACK_RE = /^[A-Z]{1,2}\d{0,2}-\d{2}$/
const PALLET_RE = /^P\d{1,2}-\d{2}-\d{2}$/

const hue = ([r, g, b]: [number, number, number]) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  if (!d) return { h: 0, s: 0, l: mx / 255 }
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  h *= 60; if (h < 0) h += 360
  return { h, s: d / mx, l: mx / 255 }
}
const isPurple = (c: [number, number, number] | null) => { if (!c) return false; const { h, s } = hue(c); return h >= 270 && h <= 345 && s > 0.12 }
const isWhite = (c: [number, number, number] | null) => !c || (c[0] > 240 && c[1] > 240 && c[2] > 240)

export function layoutFromDrawing(d: Drawing, opts: { name: string; rackZones?: Map<string, BinZone>; storeWidth?: number }): LayoutParse {
  const issues: string[] = []
  if (!d.texts.length && !d.rects.length) {
    return { layout: empty(opts.name), issues: ['This PDF has no text or shapes to read — it looks scanned. Export the sheet from Google Sheets as PDF instead.'], found: { racks: 0, walls: 0, doors: 0, pallets: 0, stations: [] } }
  }
  const known = opts.rackZones ? new Set(opts.rackZones.keys()) : null
  const isRack = (s: string) => (known ? known.has(s) : false) || RACK_RE.test(s)

  // Cells: filled or stroked rectangles, not page-sized, not hairlines.
  const area = d.width * d.height
  const cells = d.rects.filter(r => r.w > 3 && r.h > 3 && r.w * r.h < area * 0.4)
  const inside = (t: PdfText, r: PdfRect) => { const cx = t.x + t.w / 2, cy = t.y + t.h / 2; return cx >= r.x - 0.5 && cx <= r.x + r.w + 0.5 && cy >= r.y - 0.5 && cy <= r.y + r.h + 0.5 }
  const owner = new Map<PdfRect, PdfText[]>()
  const orphans: PdfText[] = []
  for (const t of d.texts) {
    let best: PdfRect | null = null
    for (const r of cells) if (inside(t, r) && (!best || r.w * r.h < best.w * best.h)) best = r
    if (best) owner.set(best, [...(owner.get(best) ?? []), t]); else orphans.push(t)
  }

  type Box = { kind: ItemKind; id?: string; x0: number; y0: number; x1: number; y1: number }
  const boxes: Box[] = []
  const stations: string[] = []
  const push = (kind: ItemKind, r: { x: number; y: number; w: number; h: number }, id?: string) =>
    boxes.push({ kind, id, x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h })

  for (const r of cells) {
    const ts = owner.get(r)
    if (!ts) { if (isPurple(r.fill)) push('wall', r); continue }
    // Whole codes, one per text item: a cell run merged into one rectangle is split between them.
    const codes = ts.map(t => t.str.trim().toUpperCase()).filter(isRack)
    if (codes.length >= 2 && codes.length === ts.length) {
      const across = r.w >= r.h
      const sorted = [...ts].sort((a, b) => across ? a.x - b.x : a.y - b.y)
      const mids = sorted.map(t => across ? t.x + t.w / 2 : t.y + t.h / 2)
      sorted.forEach((t, i) => {
        const lo = i === 0 ? (across ? r.x : r.y) : (mids[i - 1] + mids[i]) / 2
        const hi = i === sorted.length - 1 ? (across ? r.x + r.w : r.y + r.h) : (mids[i] + mids[i + 1]) / 2
        push('rack', across ? { x: lo, y: r.y, w: hi - lo, h: r.h } : { x: r.x, y: lo, w: r.w, h: hi - lo }, t.str.trim().toUpperCase())
      })
      continue
    }
    const sorted = [...ts].sort((a, b) => Math.abs(a.y - b.y) > 2 ? a.y - b.y : a.x - b.x)
    const joined = sorted.map(t => t.str.trim()).join('').toUpperCase().replace(/\s+/g, '')
    const spaced = sorted.map(t => t.str.trim()).join(' ').toUpperCase()
    if (isRack(joined)) push('rack', r, joined)
    else if (PALLET_RE.test(joined)) push('pallet', r, joined)
    else if (joined === 'EN') push('door', r, 'DOOR')
    else if (joined.includes('ENTRANCE')) push('entrance', r, 'ENTRANCE')
    else if (joined.includes('FRONT') || joined.includes('DESK')) push('desk', r, 'FRONT DESK')
    else if (joined.includes('WMS') || joined.includes('SITTING')) push('wms', r, 'WMS SITTING AREA')
    else if (joined.includes('DROP') || joined.includes('PIGEON')) push('dropzone', r, 'DROP ZONE')
    else if (joined.includes('PACK')) push('packing', r, 'PACKING TABLE')
    else if (/QTY/.test(joined) || /^\d/.test(joined)) continue                      // legend
    else if (isPurple(r.fill)) push('wall', r)
    else if (!isWhite(r.fill) && joined.length <= 12) { push('station', r, spaced.replace(/\s+/g, ' ')); stations.push(joined) }
  }

  // Codes with no cell of their own (a white, unfilled cell): size them like their neighbours.
  const rackBoxes = () => boxes.filter(b => b.kind === 'rack')
  const short = median(rackBoxes().map(b => Math.min(b.x1 - b.x0, b.y1 - b.y0))) || 18
  const long = median(rackBoxes().map(b => Math.max(b.x1 - b.x0, b.y1 - b.y0))) || short * 3
  for (const t of orphans) {
    const s = t.str.trim().toUpperCase()
    if (isRack(s) || PALLET_RE.test(s)) {
      const cx = t.x + t.w / 2, cy = t.y + t.h / 2
      const w = PALLET_RE.test(s) ? Math.max(t.w + 8, short * 2) : long, h = PALLET_RE.test(s) ? short * 2 : short
      push(PALLET_RE.test(s) ? 'pallet' : 'rack', { x: cx - w / 2, y: cy - h / 2, w, h }, s)
    }
  }

  const racks = rackBoxes()
  if (!racks.length) issues.push('No rack codes found in the PDF. Racks are cells labelled like A5-06, or any rack code listed in the bin master.')
  const ids = new Set(racks.map(b => b.id))
  if (known) {
    const missing = [...known].filter(k => !ids.has(k))
    if (missing.length) issues.push(`${missing.length} rack${missing.length > 1 ? 's' : ''} in the bin master not found on the layout: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ' …' : ''}`)
    const extra = [...ids].filter(k => k && !known.has(k))
    if (extra.length) issues.push(`${extra.length} rack${extra.length > 1 ? 's' : ''} on the layout with no bins in the bin master (shown empty): ${extra.slice(0, 8).join(', ')}${extra.length > 8 ? ' …' : ''}`)
  }
  for (const k of ['entrance', 'dropzone'] as const) if (!boxes.some(b => b.kind === k)) issues.push(`No ${k === 'entrance' ? 'ENTRANCE' : 'DROP ZONE'} cell found`)

  // Store extent = everything recognised; origin at its top-left.
  const used = boxes.length ? boxes : [{ x0: 0, y0: 0, x1: d.width, y1: d.height } as Box]
  const ox = Math.min(...used.map(b => b.x0)), oy = Math.min(...used.map(b => b.y0))
  const W = Math.max(...used.map(b => b.x1)) - ox, Hh = Math.max(...used.map(b => b.y1)) - oy
  // Scale: the store width if given, else a rack's short side reads as 0.7 m.
  const m = opts.storeWidth ? opts.storeWidth / W : 0.7 / short
  const items: SheetItem[] = boxes.map(b => ({ kind: b.kind, id: b.id, c0: b.x0 - ox, r0: b.y0 - oy, c1: b.x1 - ox, r1: b.y1 - oy }))

  // Chiller and HV areas: the extent of the racks the bin master puts there.
  const zones: SheetZone[] = []
  for (const [kind, label] of [['chiller', 'CHILLER  2–8 °C'], ['hv', 'HV CAGE']] as const) {
    const zr = racks.filter(b => opts.rackZones?.get(b.id!) === kind)
    if (!zr.length) continue
    const pad = short * 0.35
    zones.push({ kind, label, c0: Math.min(...zr.map(b => b.x0)) - ox - pad, r0: Math.min(...zr.map(b => b.y0)) - oy - pad, c1: Math.max(...zr.map(b => b.x1)) - ox + pad, r1: Math.max(...zr.map(b => b.y1)) - oy + pad })
  }
  if (opts.rackZones && !zones.some(z => z.kind === 'chiller')) issues.push('No chiller racks in the bin master (zone column) — the store has no chiller')

  return {
    layout: { name: opts.name, cell: { w: m, h: m }, cols: W, rows: Hh, items, zones },
    issues,
    found: { racks: racks.length, walls: boxes.filter(b => b.kind === 'wall').length, doors: boxes.filter(b => b.kind === 'door').length, pallets: boxes.filter(b => b.kind === 'pallet').length, stations },
  }
}

function median(a: number[]) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
function empty(name: string): SheetLayout { return { name, cell: { w: 1, h: 1 }, cols: 10, rows: 10, items: [], zones: [] } }
