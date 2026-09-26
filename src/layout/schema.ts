// The layout format. A layout is what a store's planning sheet says, in sheet units: every item is a rectangle
// measured in sheet columns (c) and rows (r), exactly as it sits on the grid. `cell` turns those into metres.
//
// This is the one input the twin is built from. The default store and an uploaded sheet both land here, so
// nothing about a particular store is hard-coded anywhere else.

export type ItemKind =
  | 'rack'      // a shelving module; its id is the rack location code, e.g. A5-06
  | 'pallet'    // a floor pallet location, e.g. P1-01-04
  | 'wall'      // a wall or partition (purple on the sheet)
  | 'door'      // an opening in a wall (EN on the sheet)
  | 'entrance'  // the store front door, where riders collect
  | 'desk'      // front desk: store manager
  | 'wms'       // WMS sitting area: terminals
  | 'dropzone'  // pigeon holes: pickers drop bagged orders, riders collect
  | 'packing'   // packing table
  | 'station'   // any other labelled station the twin does not model yet (e.g. SE)

export type ZoneKind = 'chiller' | 'hv'

export interface SheetItem {
  kind: ItemKind
  id?: string
  /** Left, top, right, bottom, in sheet columns / rows (fractions allowed). */
  c0: number
  r0: number
  c1: number
  r1: number
  /** True when the id could not be read off the source and was inferred. */
  inferred?: boolean
}

export interface SheetZone {
  kind: ZoneKind
  label: string
  c0: number
  r0: number
  c1: number
  r1: number
}

export interface SheetLayout {
  name: string
  /** Metres per sheet column (w) and per sheet row (h). Spreadsheets are not to scale; this is the scale. */
  cell: { w: number; h: number }
  cols: number
  rows: number
  items: SheetItem[]
  zones: SheetZone[]
}
