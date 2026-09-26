// The working stations: pigeon holes, packing table, front desk, WMS desks, floor pallets, and any station the
// twin does not model yet.

import * as THREE from 'three'
import { byGroup } from '../catalog'
import type { Fixture, Slot, Store } from '../model'
import type { Goods } from './goods'
import { drawBinLabel, drawSign, LabelAtlas } from './labels'
import { boxAt, merged, rackMatrix } from './util'

const std = (color: number, roughness = 0.6, metalness = 0.2) => new THREE.MeshStandardMaterial({ color, roughness, metalness })

export function buildFixtures(store: Store, atlas: LabelAtlas, goods: Goods): THREE.Object3D {
  const g = new THREE.Group()
  g.name = 'fixtures'
  const parts: Record<string, THREE.BufferGeometry[]> = {}
  const add = (k: string, geo: THREE.BufferGeometry) => (parts[k] ??= []).push(geo)

  pigeonHoles(store, add, atlas, goods)
  pallets(store.slots.filter(s => s.kind === 'pallet'), add, atlas, goods)
  for (const f of store.fixtures) {
    if (f.kind === 'desk') desks(f, 2, add)
    if (f.kind === 'wms') desks(f, 4, add)
    if (f.kind === 'packing') packing(f, add)
    if (f.kind === 'station') station(f, add, atlas)
  }

  const mats: Record<string, THREE.Material> = {
    phFrame: std(0xf2c200, 0.5, 0.3),
    pallet: std(0xa88656, 0.9, 0),
    desk: std(0xd9d2c3, 0.6, 0.05),
    deskLeg: std(0x6c7075, 0.4, 0.6),
    dark: std(0x1b1c1e, 0.5, 0.3),
    screen: new THREE.MeshStandardMaterial({ color: 0x0c1a2a, emissive: 0x3a7bd5, emissiveIntensity: 0.6, roughness: 0.3 }),
    kraft: std(0xb5895a, 0.85, 0),
    grey: std(0x9aa0a6, 0.5, 0.5),
    white: std(0xf1f1f1, 0.5, 0.1),
    tape: std(0xf2c200, 0.7, 0),
  }
  for (const k in parts) g.add(merged(parts[k], mats[k] ?? mats.grey, k !== 'tape'))
  return g
}

function pigeonHoles(store: Store, add: (k: string, g: THREE.BufferGeometry) => void, atlas: LabelAtlas, goods: Goods) {
  const p = store.pigeon
  if (!p) return
  const alongZ = p.rect.z1 - p.rect.z0 >= p.rect.x1 - p.rect.x0
  // Local frame: x along the wall, z through the slots.
  const m = rackMatrix(p.cx, 0, p.cz, alongZ ? Math.PI / 2 : 0)
  const { len: L, depth: D, height: H, rows, cols } = p
  const rh = (H - 0.2) / rows, cw = L / cols
  for (let r = 0; r <= rows; r++) add('phFrame', boxAt(L, 0.018, D, 0, 0.15 + r * rh, 0, m))
  for (let c = 0; c <= cols; c++) add('phFrame', boxAt(0.015, H - 0.15, D, -L / 2 + c * cw, 0.15 + (H - 0.15) / 2 - 0.1, 0, m))
  for (const x of [-L / 2, L / 2]) add('phFrame', boxAt(0.05, 0.15, D, x, 0.075, 0, m))

  const q = new THREE.Matrix4()
  const lw = Math.min(0.15, cw - 0.04), lh = lw / LabelAtlas.ASPECT
  for (const s of store.slots.filter(x => x.kind === 'ph')) {
    const r = 'ABCDEFGH'.indexOf(s.level), c = s.pos - 1
    const lx = -L / 2 + (c + 0.5) * cw, y = 0.15 + r * rh + 0.009 - lh / 2 - 0.002
    // Label on both faces: pickers load one side, packers clear the other.
    q.makeTranslation(lx, y, D / 2 + 0.002)
    atlas.add(drawBinLabel(s.code, '#fff8d6'), m.clone().multiply(q), lw, lh)
    q.makeRotationY(Math.PI).setPosition(lx, y, -D / 2 - 0.002)
    atlas.add(drawBinLabel(s.code, '#fff8d6'), m.clone().multiply(q), lw, lh)
    // A dropped order: one kraft bag per pick batch.
    for (let b = 0; b < Math.min(2, s.qty); b++) {
      const bw = Math.min(0.26, cw - 0.06), bh = Math.min(0.28, rh - 0.06)
      goods.push({ shape: 'bag', color: b ? 0xa77d4f : 0xc09562 }, s.x + (b - 0.5) * 0.18 * (alongZ ? 1 : 0), s.y - s.h / 2 + bh / 2, s.z, bw * 0.9, bh, 0.16, s.ry)
    }
  }
  // Big signs at both ends.
  for (const e of [-1, 1]) {
    q.makeRotationY(e > 0 ? Math.PI / 2 : -Math.PI / 2).setPosition(e * (L / 2 + 0.03), H + 0.15, 0)
    atlas.add(drawSign('PIGEON HOLES', '#b58900'), m.clone().multiply(q), 0.9, 0.9 / LabelAtlas.ASPECT)
  }
}

function pallets(list: Slot[], add: (k: string, g: THREE.BufferGeometry) => void, atlas: LabelAtlas, goods: Goods) {
  for (const s of list) {
    const m = rackMatrix(s.x, 0, s.z, 0)
    const { w: W, d: D } = s
    // Deck and three stringer blocks: a 144 mm pallet.
    add('pallet', boxAt(W, 0.022, D, 0, 0.133, 0, m))
    add('pallet', boxAt(W, 0.022, D, 0, 0.011, 0, m))
    for (const z of [-D / 2 + 0.05, 0, D / 2 - 0.05]) add('pallet', boxAt(W, 0.1, 0.1, 0, 0.072, z, m))
    // Floor tape around the location.
    const t = 0.05, fw = W + 0.2, fd = D + 0.2
    add('tape', boxAt(fw, 0.004, t, 0, 0.002, -fd / 2, m)); add('tape', boxAt(fw, 0.004, t, 0, 0.002, fd / 2, m))
    add('tape', boxAt(t, 0.004, fd, -fw / 2, 0.002, 0, m)); add('tape', boxAt(t, 0.004, fd, fw / 2, 0.002, 0, m))
    // Cases: layer by layer, up to the on-hand count and 1.4 m.
    const p = s.sku ?? byGroup('bulk')[0]
    const nx = Math.max(1, Math.floor(W / p.w)), nz = Math.max(1, Math.floor(D / p.d))
    const ny = Math.max(1, Math.floor(1.25 / p.h))
    const n = Math.min(s.qty, nx * nz * ny)
    for (let i = 0; i < n; i++) {
      const ix = i % nx, iz = Math.floor(i / nx) % nz, iy = Math.floor(i / (nx * nz))
      goods.push({ shape: 'box', color: p.color }, s.x - (nx - 1) * p.w / 2 + ix * p.w, 0.144 + p.h / 2 + iy * p.h, s.z - (nz - 1) * p.d / 2 + iz * p.d, p.w - 0.008, p.h - 0.004, p.d - 0.008, 0)
    }
    // Location label on the pallet front.
    const q = new THREE.Matrix4().makeTranslation(0, 0.075, D / 2 + 0.056)
    atlas.add(drawBinLabel(s.code), m.clone().multiply(q), 0.26, 0.26 / LabelAtlas.ASPECT)
  }
}

function desks(f: Fixture, seats: number, add: (k: string, g: THREE.BufferGeometry) => void) {
  const alongZ = f.z1 - f.z0 >= f.x1 - f.x0
  const len = (alongZ ? f.z1 - f.z0 : f.x1 - f.x0) - 0.4
  const cx = (f.x0 + f.x1) / 2, cz = (f.z0 + f.z1) / 2
  // Local x along the desk; the seated side is local -z (towards the wall), screens face them.
  const m = rackMatrix(cx, 0, cz, alongZ ? Math.PI / 2 : 0)
  const D = 0.7
  add('desk', boxAt(len, 0.04, D, 0, 0.74, 0, m))
  for (const x of [-len / 2 + 0.05, len / 2 - 0.05]) add('deskLeg', boxAt(0.05, 0.72, D - 0.1, x, 0.36, 0, m))
  add('desk', boxAt(len, 0.4, 0.02, 0, 0.5, D / 2 - 0.01, m))
  for (let i = 0; i < seats; i++) {
    const x = -len / 2 + (i + 0.5) * (len / seats)
    add('dark', boxAt(0.2, 0.02, 0.15, x, 0.77, 0.12, m))
    add('dark', boxAt(0.04, 0.3, 0.04, x, 0.92, 0.14, m))
    add('dark', boxAt(0.56, 0.34, 0.03, x, 1.2, 0.12, m))
    add('screen', boxAt(0.52, 0.3, 0.005, x, 1.2, 0.103, m))
    add('dark', boxAt(0.45, 0.02, 0.16, x, 0.77, -0.12, m))          // keyboard
    // Chair on the seated side.
    add('dark', boxAt(0.46, 0.08, 0.46, x, 0.46, -D / 2 - 0.35, m))
    add('dark', boxAt(0.46, 0.5, 0.06, x, 0.78, -D / 2 - 0.58, m))
    add('deskLeg', boxAt(0.05, 0.42, 0.05, x, 0.21, -D / 2 - 0.35, m))
  }
}

function packing(f: Fixture, add: (k: string, g: THREE.BufferGeometry) => void) {
  const alongZ = f.z1 - f.z0 >= f.x1 - f.x0
  const len = (alongZ ? f.z1 - f.z0 : f.x1 - f.x0) - 0.3
  const cx = (f.x0 + f.x1) / 2, cz = (f.z0 + f.z1) / 2
  // Packers stand on local +z (away from the pigeon holes).
  const m = rackMatrix(cx, 0, cz, alongZ ? Math.PI / 2 : 0)
  const D = Math.min(0.8, (alongZ ? f.x1 - f.x0 : f.z1 - f.z0) - 0.1)
  add('white', boxAt(len, 0.04, D, 0, 0.9, 0, m))
  add('grey', boxAt(len, 0.03, D - 0.1, 0, 0.25, 0, m))
  for (let x = -len / 2 + 0.05; x <= len / 2; x += 1.6) add('deskLeg', boxAt(0.05, 0.88, D - 0.1, x, 0.44, 0, m))
  const stations = Math.max(1, Math.floor(len / 2.2))
  for (let i = 0; i < stations; i++) {
    const x = -len / 2 + (i + 0.5) * (len / stations)
    add('grey', boxAt(0.3, 0.06, 0.3, x - 0.5, 0.95, 0.05, m))          // weighing scale
    add('dark', boxAt(0.2, 0.15, 0.22, x + 0.45, 0.995, -0.15, m))      // label printer
    add('dark', boxAt(0.16, 0.12, 0.08, x + 0.1, 0.98, -0.22, m))       // tape dispenser
    for (let b = 0; b < 4; b++) add('kraft', boxAt(0.3, 0.02, 0.18, x - 0.05, 0.93 + b * 0.02, -0.2, m))  // flat bags
    add('kraft', boxAt(0.4, 0.3, 0.4, x, 0.1 + 0.15, 0, m))            // bag stock under the table
  }
}

function station(f: Fixture, add: (k: string, g: THREE.BufferGeometry) => void, atlas: LabelAtlas) {
  const cx = (f.x0 + f.x1) / 2, cz = (f.z0 + f.z1) / 2
  const w = f.x1 - f.x0 - 0.15, d = f.z1 - f.z0 - 0.15
  add('grey', boxAt(w, 1.1, d, cx, 0.55, cz))
  const q = new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(f.x1 - 0.07, 0.8, cz)
  atlas.add(drawSign(f.id, '#555'), q, Math.min(0.5, d), Math.min(0.5, d) / LabelAtlas.ASPECT)
}
