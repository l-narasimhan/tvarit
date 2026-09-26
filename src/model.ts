// Sheet layout -> store model, in metres. Pure data: no rendering, no clock. The scene draws this, and later the
// sim will move people through it.
//
// World frame: x runs along the sheet's columns (left -> right), z along its rows (top -> bottom), y is up.

import { CATALOG, byGroup, groupForRack, type Group, type Product } from './catalog'
import type { SheetItem, SheetLayout } from './layout/schema'
import { hash, rng } from './rng'

export type Zone = 'ambient' | 'chiller' | 'hv'
export type Face = 'N' | 'S' | 'E' | 'W'

export interface Rect { x0: number; z0: number; x1: number; z1: number }

export interface Rack {
  id: string
  zone: Zone
  group: Group
  inferred: boolean
  /** The rack's cell on the sheet, in metres. */
  foot: Rect
  /** The side pickers work from. */
  face: Face
  /** Centre of the shelving body, and its yaw: local +z is the pick face, local +x runs bin 1 -> n. */
  cx: number
  cz: number
  ry: number
  len: number
  depth: number
  height: number
  levels: number
  perLevel: number
  /** Floor-to-shelf-surface height of each level, bottom first. */
  shelfY: number[]
  /** Clear height above each shelf. */
  gap: number
}

export type SlotKind = 'bin' | 'ph' | 'pallet'

export interface Slot {
  code: string
  kind: SlotKind
  /** Owning rack / pigeon-hole wall / pallet location. */
  owner: string
  zone: Zone
  level: string
  pos: number
  /** Centre of the slot's volume, world metres. */
  x: number
  y: number
  z: number
  w: number
  h: number
  d: number
  ry: number
  sku: Product | null
  qty: number
  cap: number
}

export interface Wall extends Rect { style: 'plain' | 'cold' | 'cage'; height: number }
export interface Door { id: string; axis: 'x' | 'z'; a: number; b: number; at: number; style: Wall['style'] | 'front' }
export interface Fixture extends Rect { kind: 'desk' | 'wms' | 'dropzone' | 'packing' | 'station' | 'entrance'; id: string }
export interface ZoneArea extends Rect { kind: 'chiller' | 'hv'; label: string }

export interface PigeonWall {
  rect: Rect
  cx: number
  cz: number
  len: number
  depth: number
  height: number
  rows: number
  cols: number
}

export interface Store {
  name: string
  W: number
  D: number
  racks: Rack[]
  slots: Slot[]
  walls: Wall[]
  doors: Door[]
  fixtures: Fixture[]
  zones: ZoneArea[]
  pigeon: PigeonWall | null
  warnings: string[]
}

const LEVEL = 'ABCDEFGH'
const SPEC: Record<Zone, { height: number; levels: number; depth: number; bin: number }> = {
  ambient: { height: 2.1, levels: 5, depth: 0.5, bin: 0.46 },
  chiller: { height: 1.95, levels: 5, depth: 0.5, bin: 0.46 },
  hv: { height: 1.8, levels: 4, depth: 0.55, bin: 0.55 },
}
const FACE_RY: Record<Face, number> = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 }

const inside = (r: Rect, x: number, z: number) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1
const touches = (a: Rect, b: Rect, pad: number) =>
  a.x0 < b.x1 + pad && a.x1 > b.x0 - pad && a.z0 < b.z1 + pad && a.z1 > b.z0 - pad

/** Local (x along the rack, z out of the pick face) -> world. */
export function toWorld(cx: number, cz: number, ry: number, lx: number, lz: number): [number, number] {
  const c = Math.cos(ry), s = Math.sin(ry)
  return [cx + lx * c + lz * s, cz - lx * s + lz * c]
}

export function buildStore(L: SheetLayout): Store {
  const { w: cw, h: ch } = L.cell
  const W = L.cols * cw, D = L.rows * ch
  const m = (i: SheetItem): Rect => ({ x0: i.c0 * cw, z0: i.r0 * ch, x1: i.c1 * cw, z1: i.r1 * ch })
  const warnings: string[] = []

  const zones: ZoneArea[] = L.zones.map(z => ({ kind: z.kind, label: z.label, x0: z.c0 * cw, z0: z.r0 * ch, x1: z.c1 * cw, z1: z.r1 * ch }))
  const zoneAt = (x: number, z: number): Zone => zones.find(a => inside(a, x, z))?.kind ?? 'ambient'

  // Everything that blocks a rack's face: other racks, walls, fixtures, pallets, and the outside of the store.
  const solids = L.items.filter(i => i.kind !== 'door' && i.kind !== 'entrance').map(m)
  const blocked = (x: number, z: number) => x <= 0 || z <= 0 || x >= W || z >= D || solids.some(r => inside(r, x, z))

  // ---- Racks ---------------------------------------------------------------------------------------------
  const racks: Rack[] = []
  const seen = new Set<string>()
  for (const it of L.items.filter(i => i.kind === 'rack')) {
    const id = it.id ?? `R${racks.length + 1}`
    if (seen.has(id)) warnings.push(`Duplicate rack code ${id}`)
    seen.add(id)
    const f = m(it)
    const fw = f.x1 - f.x0, fd = f.z1 - f.z0
    const across = fw >= fd                      // long side runs along x: faces N or S
    const mx = (f.x0 + f.x1) / 2, mz = (f.z0 + f.z1) / 2
    // Pick the long side with the most open floor in front of it, sampled along its length.
    const probe = 0.15
    const openness = (pt: (t: number) => [number, number]) =>
      [0.1, 0.3, 0.5, 0.7, 0.9].filter(t => !blocked(...pt(t))).length
    let face: Face
    if (across) {
      const n = openness(t => [f.x0 + t * fw, f.z0 - probe]), s = openness(t => [f.x0 + t * fw, f.z1 + probe])
      face = n > s ? 'N' : 'S'
    } else {
      const w = openness(t => [f.x0 - probe, f.z0 + t * fd]), e = openness(t => [f.x1 + probe, f.z0 + t * fd])
      face = w > e ? 'W' : 'E'
    }
    const zone = zoneAt(mx, mz)
    const spec = SPEC[zone]
    const len = (across ? fw : fd) - 0.03
    const depth = Math.min(spec.depth, across ? fd : fw)
    // The shelving stands against its back edge; the rest of the cell is aisle.
    let cx = mx, cz = mz
    if (face === 'S') cz = f.z0 + depth / 2
    if (face === 'N') cz = f.z1 - depth / 2
    if (face === 'E') cx = f.x0 + depth / 2
    if (face === 'W') cx = f.x1 - depth / 2
    const base = 0.1, top = 0.06
    const gap = (spec.height - base - top) / spec.levels
    racks.push({
      id, zone, group: groupForRack(id, zone), inferred: !!it.inferred, foot: f, face,
      cx, cz, ry: FACE_RY[face], len, depth, height: spec.height, levels: spec.levels,
      perLevel: Math.max(1, Math.round(len / spec.bin)),
      shelfY: Array.from({ length: spec.levels }, (_, k) => base + k * gap + 0.02), gap: gap - 0.02,
    })
  }

  // ---- Bins ----------------------------------------------------------------------------------------------
  const slots: Slot[] = []
  for (const r of racks) {
    const pool = byGroup(r.group)
    const bw = r.len / r.perLevel
    r.shelfY.forEach((sy, k) => {
      for (let j = 0; j < r.perLevel; j++) {
        const code = `${r.id}-${LEVEL[k]}${j + 1}`
        const rand = rng(hash(code))
        const lx = -r.len / 2 + (j + 0.5) * bw
        const [x, z] = toWorld(r.cx, r.cz, r.ry, lx, 0)
        const empty = rand() < 0.04
        const sku = pool[Math.floor(rand() * pool.length)]
        const cap = r.zone === 'hv' ? 12 : r.zone === 'chiller' ? 24 : 36
        const qty = empty ? 0 : r.zone === 'hv' ? 1 + Math.floor(rand() * 8) : 3 + Math.floor(rand() * (cap - 3))
        slots.push({
          code, kind: 'bin', owner: r.id, zone: r.zone, level: LEVEL[k], pos: j + 1,
          x, y: sy + r.gap / 2, z, w: bw - 0.01, h: r.gap, d: r.depth - 0.02, ry: r.ry,
          sku, qty, cap,
        })
      }
    })
  }

  // ---- Walls and doors ------------------------------------------------------------------------------------
  const T = 0.2
  const walls: Wall[] = []
  for (const it of L.items.filter(i => i.kind === 'wall')) {
    const f = m(it)
    const style: Wall['style'] = zones.some(z => z.kind === 'hv' && touches(f, z, 0.4)) ? 'cage'
      : zones.some(z => z.kind === 'chiller' && touches(f, z, 0.4)) ? 'cold' : 'plain'
    const horiz = f.x1 - f.x0 >= f.z1 - f.z0
    const c = horiz ? (f.z0 + f.z1) / 2 : (f.x0 + f.x1) / 2
    walls.push(horiz
      ? { x0: f.x0, x1: f.x1, z0: c - T / 2, z1: c + T / 2, style, height: style === 'cage' ? 2.4 : 2.8 }
      : { x0: c - T / 2, x1: c + T / 2, z0: f.z0, z1: f.z1, style, height: style === 'cage' ? 2.4 : 2.8 })
  }

  const doors: Door[] = []
  for (const it of L.items.filter(i => i.kind === 'door')) {
    const f = m(it)
    // A door sits in line with the nearest wall.
    let best: Wall | null = null, bd = Infinity
    for (const w of walls) {
      const dx = Math.max(0, w.x0 - f.x1, f.x0 - w.x1), dz = Math.max(0, w.z0 - f.z1, f.z0 - w.z1)
      const d = Math.hypot(dx, dz)
      if (d < bd) { bd = d; best = w }
    }
    if (!best) { warnings.push(`Door ${it.id ?? ''} has no wall near it`); continue }
    const horiz = best.x1 - best.x0 >= best.z1 - best.z0
    doors.push(horiz
      ? { id: it.id ?? 'DOOR', axis: 'x', a: f.x0, b: f.x1, at: (best.z0 + best.z1) / 2, style: best.style }
      : { id: it.id ?? 'DOOR', axis: 'z', a: f.z0, b: f.z1, at: (best.x0 + best.x1) / 2, style: best.style })
  }

  // ---- Fixtures, perimeter ------------------------------------------------------------------------------
  const fixtures: Fixture[] = L.items
    .filter(i => ['desk', 'wms', 'dropzone', 'packing', 'station', 'entrance'].includes(i.kind))
    .map(i => ({ ...m(i), kind: i.kind as Fixture['kind'], id: i.id ?? i.kind.toUpperCase() }))

  const H = 3.2
  const ent = fixtures.find(f => f.kind === 'entrance')
  walls.push({ x0: -T, x1: W + T, z0: -T, z1: 0, style: 'plain', height: H })
  walls.push({ x0: -T, x1: W + T, z0: D, z1: D + T, style: 'plain', height: H })
  walls.push({ x0: W, x1: W + T, z0: 0, z1: D, style: 'plain', height: H })
  if (ent) {
    walls.push({ x0: -T, x1: 0, z0: 0, z1: ent.z0, style: 'plain', height: H })
    walls.push({ x0: -T, x1: 0, z0: ent.z1, z1: D, style: 'plain', height: H })
    doors.push({ id: 'ENTRANCE', axis: 'z', a: ent.z0, b: ent.z1, at: -T / 2, style: 'front' })
  } else {
    walls.push({ x0: -T, x1: 0, z0: 0, z1: D, style: 'plain', height: H })
    warnings.push('No entrance on the sheet; riders have no way in')
  }

  // ---- Pigeon holes --------------------------------------------------------------------------------------
  let pigeon: PigeonWall | null = null
  const dz = fixtures.find(f => f.kind === 'dropzone')
  if (dz) {
    const alongZ = dz.z1 - dz.z0 >= dz.x1 - dz.x0
    const len = (alongZ ? dz.z1 - dz.z0 : dz.x1 - dz.x0) - 0.4
    const depth = 0.5, height = 1.9, rows = 5, cols = Math.floor(len / 0.45)
    const cx = (dz.x0 + dz.x1) / 2, cz = (dz.z0 + dz.z1) / 2
    pigeon = { rect: dz, cx, cz, len, depth, height, rows, cols }
    // Through-slots, long axis along z: pickers load from the west face, packers clear from the east.
    const cwid = len / cols, rh = (height - 0.2) / rows
    for (let rI = 0; rI < rows; rI++) {
      for (let c = 0; c < cols; c++) {
        const code = `PH-${LEVEL[rI]}${String(c + 1).padStart(2, '0')}`
        const rand = rng(hash(code))
        const along = -len / 2 + (c + 0.5) * cwid
        const full = rand() < 0.3
        slots.push({
          code, kind: 'ph', owner: 'DROP ZONE', zone: 'ambient', level: LEVEL[rI], pos: c + 1,
          x: alongZ ? cx : cx + along, y: 0.15 + rI * rh + rh / 2, z: alongZ ? cz - along : cz,
          w: cwid - 0.02, h: rh - 0.03, d: depth - 0.02, ry: alongZ ? Math.PI / 2 : 0,
          sku: null, qty: full ? 1 + Math.floor(rand() * 4) : 0, cap: 6,
        })
      }
    }
  } else warnings.push('No drop zone on the sheet; pickers have nowhere to drop orders')

  // ---- Pallets -------------------------------------------------------------------------------------------
  const bulk = byGroup('bulk')
  for (const it of L.items.filter(i => i.kind === 'pallet')) {
    const f = m(it), id = it.id ?? `P${slots.length}`
    const rand = rng(hash(id))
    const x = (f.x0 + f.x1) / 2, z = (f.z0 + f.z1) / 2
    const w = Math.min(1.2, f.x1 - f.x0 - 0.1), d = Math.min(1.0, f.z1 - f.z0 - 0.1)
    slots.push({
      code: id, kind: 'pallet', owner: id, zone: zoneAt(x, z), level: 'FLOOR', pos: 1,
      x, y: 0.7, z, w, h: 1.4, d, ry: 0,
      sku: bulk[Math.floor(rand() * bulk.length)], qty: 12 + Math.floor(rand() * 30), cap: 48,
    })
  }

  if (!CATALOG.length) warnings.push('Empty catalogue')
  return { name: L.name, W, D, racks, slots, walls, doors, fixtures, zones, pigeon, warnings }
}
