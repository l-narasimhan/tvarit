// A generic darkstore, for when no store is loaded, and the source of the downloadable sample files. About
// 6,000 sq ft: ambient aisles, a walk-in chiller of glass-door fridges, an HV cage, floor pallets, pigeon holes,
// packing table, front desk and WMS desks. Same sheet conventions as a real planning sheet: 0.6 m columns,
// 0.75 m rows, one rack module per cell run.

import type { ItemKind, SheetItem, SheetLayout } from './schema'

const items: SheetItem[] = []
const box = (kind: ItemKind, c0: number, r0: number, c1: number, r1: number, id?: string) => items.push({ kind, id, c0, r0, c1, r1 })
const pad = (n: number) => String(n).padStart(2, '0')

// Front of house.
box('entrance', 0, 8, 1.5, 12, 'ENTRANCE')
box('desk', 1.5, 0, 3, 7, 'FRONT DESK')
box('wms', 1.5, 13, 3, 26, 'WMS SITTING AREA')
box('dropzone', 4, 13, 5.5, 26, 'DROP ZONE')
box('packing', 5.5, 14, 7, 26, 'PACKING TABLE')

// Ambient: four back-to-back rack pairs, five 2.1 m modules each; aisles A–D, clear of the GRN area.
const W = 3.5
'ABCD'.split('').forEach((aisle, p) => {
  const r = 1 + p * 3
  for (let m = 0; m < 5; m++) {
    box('rack', 12 + m * W, r, 12 + (m + 1) * W, r + 1, `${aisle}1-${pad(m + 1)}`)
    box('rack', 12 + m * W, r + 1, 12 + (m + 1) * W, r + 2, `${aisle}2-${pad(m + 1)}`)
  }
})

// Chiller: walled room, door on its left wall, fridge rows along both walls and one back-to-back pair.
box('wall', 8.6, 13, 30.4, 13.4)
box('wall', 8.6, 16.5, 9, 26)
box('wall', 30, 13, 30.4, 26)
box('door', 8.4, 13.4, 9.2, 16.5, 'CHILLER DOOR')
for (let m = 0; m < 5; m++) {
  const c = 10 + m * 4
  box('rack', c, 13.5, c + 4, 14.5, `E1-${pad(m + 1)}`)
  box('rack', c, 18, c + 4, 19, `E2-${pad(m + 1)}`)
  box('rack', c, 19, c + 4, 20, `E3-${pad(m + 1)}`)
  box('rack', c, 25, c + 4, 26, `E4-${pad(m + 1)}`)
}

// HV cage, top right: wire walls, gate on its left side, cabinets against the back wall facing in.
box('wall', 33, 2, 33.4, 5.4)
box('wall', 33, 5, 48, 5.4)
box('wall', 47.6, 0, 48, 5.4)
box('door', 33, 0, 33.4, 2, 'HV GATE')
for (let m = 0; m < 4; m++) box('rack', 34.5 + m * 3.2, 3.4, 34.5 + (m + 1) * 3.2, 5, `K1-${pad(m + 1)}`)

// Floor pallets for bulk: three columns of four.
for (let c = 0; c < 3; c++) for (let r = 0; r < 4; r++)
  box('pallet', 34 + c * 5, 9 + r * 4, 37.5 + c * 5, 11 + r * 4, `P${c + 1}-01-${pad(r + 1)}`)

export const GENERIC: SheetLayout = {
  name: 'Generic darkstore',
  cell: { w: 0.6, h: 0.75 },
  cols: 50,
  rows: 26,
  items,
  zones: [
    { kind: 'chiller', label: 'CHILLER  2–8 °C', c0: 9, r0: 13.4, c1: 30, r1: 26 },
    { kind: 'hv', label: 'HV CAGE', c0: 33.4, r0: 0, c1: 47.6, r1: 5 },
  ],
}
