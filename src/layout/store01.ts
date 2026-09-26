// Store 01 — transcribed from the planning-sheet screenshot Lan shared on 2026-09-26.
//
// Coordinates are the screenshot's pixel edges; `px` turns them into sheet cells (26 px per cell, origin at the
// store's top-left corner at x=48, y=30). Stock-quantity colours on the sheet are ignored.
//
// Confidential: this layout stays local. Racks whose code is partly hidden in the screenshot are marked
// `inferred` and named by their visible fragment and position.

import type { ItemKind, SheetItem, SheetLayout } from './schema'

const X0 = 48, Y0 = 30, G = 26
const C = (x: number) => (x - X0) / G
const R = (y: number) => (y - Y0) / G

const items: SheetItem[] = []
const box = (kind: ItemKind, x0: number, y0: number, x1: number, y1: number, id?: string, inferred?: boolean) =>
  items.push({ kind, id, c0: C(x0), r0: R(y0), c1: C(x1), r1: R(y1), ...(inferred ? { inferred } : {}) })

/** A run of rack modules along one sheet row: `xs` are the column edges, one more than the ids. */
const row = (ids: string[], xs: number[], y0: number, y1: number) =>
  ids.forEach((id, i) => box('rack', xs[i], y0, xs[i + 1], y1, id))

/** A run of rack modules down one sheet column: `ys` are the row edges. */
const col = (ids: string[], x0: number, x1: number, ys: number[], inferred = false) =>
  ids.forEach((id, i) => box('rack', x0, ys[i], x1, ys[i + 1], id, inferred))

// ---- Front of house ----------------------------------------------------------------------------------------
box('entrance', 48, 315, 108, 440, 'ENTRANCE')
box('desk', 108, 30, 148, 315, 'FRONT DESK')
box('wms', 108, 440, 148, 830, 'WMS SITTING AREA')
box('dropzone', 183, 440, 228, 830, 'DROP ZONE')
box('station', 228, 440, 268, 492, 'SE')
box('packing', 228, 492, 268, 830, 'PACKING TABLE')

// ---- Ambient racks, top half -------------------------------------------------------------------------------
const b1 = [370, 470, 563, 645]
row(['A5-06', 'A5-05', 'A5-04'], b1, 157, 183)
row(['A4-01', 'A4-02', 'A4-04'], b1, 183, 209)
row(['A3-15', 'A4-03', 'A4-05'], b1, 236, 262)
row(['A4-16', 'A3-14', 'A3-13'], b1, 262, 288)
row(['J1-01', 'J1-02', 'J1-03'], b1, 314, 340)
row(['H1-01', 'H1-02', 'H1-03'], b1, 340, 366)

const b2 = [697, 763, 840, 905]
row(['A5-03', 'A5-02', 'A5-01'], b2, 157, 183)
row(['A4-06', 'A4-08', 'A4-10'], b2, 183, 209)
row(['A4-07', 'A4-09', 'A4-11'], b2, 236, 262)
row(['A3-12', 'A3-10', 'A3-08'], b2, 262, 288)
row(['A3-11', 'A3-09', 'A3-07'], b2, 314, 340)
row(['A1-05', 'A1-07', 'A1-09'], b2, 340, 366)

box('rack', 932, 157, 1020, 183, 'C5-01')
box('rack', 932, 183, 1020, 209, 'A4-12')
const b3 = [932, 1020, 1098, 1170]
row(['A4-13', 'A4-14', 'A4-15'], b3, 236, 262)
row(['A3-06', 'A3-04', 'A3-02'], b3, 262, 288)
row(['A3-05', 'A3-03', 'A3-01'], b3, 314, 340)
row(['A2-01', 'A2-02', 'A2-04'], b3, 340, 366)

const b4 = [1220, 1300, 1378, 1458]
row(['O1-01', 'M1-01', 'L1-01'], b4, 236, 262)
row(['B2-06', 'B2-04', 'B2-02'], b4, 262, 288)
row(['B2-05', 'B2-03', 'B2-01'], b4, 314, 340)
row(['B1-01', 'B1-03', 'B1-05'], b4, 340, 366)

box('rack', 1510, 183, 1588, 209, 'B3-01')
const b5 = [1510, 1588, 1666, 1744]
row(['B3-02', 'B3-03', 'B3-04'], b5, 314, 340)
row(['B3-07', 'B3-06', 'B3-05'], b5, 340, 366)

row(['A1-01', 'A1-02', 'A1-03', 'A1-04', 'A1-06', 'A1-08', 'A1-10'], [370, 470, 535, 620, 697, 763, 840, 905], 392, 418)

// ---- HV cage -----------------------------------------------------------------------------------------------
row(['K1-01', 'K1-02', 'K1-03', 'K1-04', 'K1-05'], [1123, 1198, 1273, 1352, 1432, 1510], 105, 157)
box('wall', 1072, 105, 1098, 183)
box('wall', 1072, 157, 1588, 183)
box('wall', 1562, 30, 1588, 183)
box('door', 1072, 30, 1098, 105, 'HV GATE')

// ---- Chiller -----------------------------------------------------------------------------------------------
box('wall', 370, 418, 905, 440)   // top
box('wall', 425, 518, 438, 830)   // left partition, door above it
box('wall', 893, 440, 905, 830)   // right partition
box('wall', 750, 440, 763, 545)   // inner partition
box('wall', 750, 675, 763, 830)
box('wall', 750, 597, 865, 620)
box('door', 370, 440, 438, 518, 'CHILLER DOOR')
box('door', 750, 545, 788, 597, 'CHILLER DOOR 2')
box('door', 750, 620, 788, 675, 'CHILLER DOOR 3')

// Ambient I-column, outside the left partition, facing the packing side.
col(['I1-03', 'I1-01', 'I1-02', 'I1-04'], 370, 425, [518, 597, 675, 753, 830])
box('rack', 268, 805, 370, 830, 'I1-05')

// Inside the chiller. The vertical columns' codes are partly hidden in the screenshot (hence `inferred`).
col(['E1-01', 'E1-03', 'E1-05', 'E1-07'], 438, 470, [518, 597, 675, 753, 830], true)
col(['E1-02', 'E1-04', 'E1-06'], 497, 530, [518, 597, 675, 753], true)
col(['E2-01', 'E2-03', 'E2-05'], 530, 563, [518, 597, 675, 753], true)
col(['E2-02', 'E2-04', 'E2-06'], 620, 645, [518, 597, 675, 753], true)
col(['E1-14', 'E1-13', 'E1-12'], 645, 672, [518, 597, 675, 753])
row(['E1-18', 'E1-17', 'E1-16'], [470, 563, 645, 722], 440, 466)
row(['E1-08', 'E1-09', 'E1-10'], [470, 563, 645, 722], 805, 830)
box('rack', 722, 440, 750, 518, 'E1-15')
box('rack', 722, 727, 750, 805, 'E1-11')
box('rack', 763, 466, 788, 545, 'G1-05')
box('rack', 788, 440, 865, 466, 'G1-04')
box('rack', 788, 570, 865, 597, 'G1-01')
box('rack', 788, 620, 865, 648, 'F1-07')
box('rack', 788, 805, 865, 830, 'F1-03')
col(['F1-01', 'F1-02'], 763, 788, [675, 753, 830])
col(['G1-03', 'G1-02', 'F1-06', 'F1-05', 'F1-04'], 865, 893, [440, 518, 597, 675, 753, 830])

// The column just outside the right partition shows only "1-01 … 1-05"; its aisle letter is hidden.
col(['X1-01', 'X1-02', 'X1-03', 'X1-04', 'X1-05'], 905, 932, [440, 518, 597, 675, 753, 830], true)

// ---- Ambient racks, bottom right ---------------------------------------------------------------------------
const cb = [958, 1020, 1072]
row(['A2-03', 'A2-05'], cb, 416, 441)
row(['C4-04', 'C4-02'], cb, 441, 466)
row(['C4-03', 'C4-01'], cb, 518, 545)
row(['C3-01', 'C3-03'], cb, 545, 570)
row(['C3-02', 'C3-04'], cb, 622, 648)
row(['C2-04', 'C2-02'], cb, 648, 675)
row(['C2-03', 'C2-01'], cb, 727, 753)
row(['C1-06', 'C1-07'], cb, 753, 780)

const db = [1098, 1170, 1247, 1323]
row(['B1-02', 'B1-04', 'B1-06'], db, 416, 441)
row(['D4-06', 'D4-04', 'D4-02'], db, 441, 466)
row(['D4-05', 'D4-03', 'D4-01'], db, 518, 545)
row(['D3-01', 'D3-03', 'D3-05'], db, 545, 570)
row(['D3-02', 'D3-04', 'D3-06'], db, 622, 648)
row(['D2-06', 'D2-04', 'D2-02'], db, 648, 675)
row(['D2-05', 'D2-03', 'D2-01'], db, 727, 753)
row(['D1-01', 'D1-02', 'D1-03'], db, 753, 780)

// ---- Floor pallets -----------------------------------------------------------------------------------------
const pal: [string, number, number, number, number][] = [
  ['P1-01-04', 1350, 416, 1432, 466], ['P1-01-03', 1350, 518, 1432, 570],
  ['P1-01-02', 1350, 622, 1432, 675], ['P1-01-01', 1350, 727, 1432, 780],
  ['P2-01-01', 1458, 622, 1535, 675], ['P2-01-03', 1458, 727, 1535, 780],
  ['P1-01-05', 1535, 416, 1613, 466], ['P1-01-06', 1535, 518, 1613, 570],
  ['P1-01-08', 1640, 416, 1718, 466], ['P1-01-07', 1640, 518, 1718, 570],
  ['P2-01-04', 1744, 416, 1822, 466], ['P2-01-02', 1744, 518, 1822, 570],
]
for (const [id, x0, y0, x1, y1] of pal) box('pallet', x0, y0, x1, y1, id)

export const STORE01: SheetLayout = {
  name: 'Store 01',
  cell: { w: 0.6, h: 0.75 },
  cols: C(1930),
  rows: R(830),
  items,
  zones: [
    { kind: 'chiller', label: 'CHILLER  2–8 °C', c0: C(438), r0: R(440), c1: C(893), r1: R(830) },
    { kind: 'hv', label: 'HV CAGE', c0: C(1098), r0: R(30), c1: C(1562), r1: R(157) },
  ],
}
