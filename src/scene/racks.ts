// Shelving. Ambient: grey slotted-angle uprights, light shelves, perforated back panel. Chiller: stainless wire
// shelving. HV: black lockable cabinets with glass doors. Every shelf has a label lip carrying one barcode per bin.

import * as THREE from 'three'
import type { Rack, Store, Zone } from '../model'
import { drawBinLabel, drawSign, LabelAtlas } from './labels'
import { boxAt, merged, rackMatrix } from './util'

const LABEL_H = 0.042
const LABEL_W = LABEL_H * LabelAtlas.ASPECT
const FRIDGE_CANOPY = 0.22

const std = (color: number, roughness = 0.5, metalness = 0.3) => new THREE.MeshStandardMaterial({ color, roughness, metalness })

export const ZONE_SIGN: Record<Zone, string> = { ambient: '#2b5da8', chiller: '#1a8fb3', hv: '#8a1c1c' }

export function buildRacks(store: Store, atlas: LabelAtlas): THREE.Object3D {
  const mats = {
    post: { ambient: std(0x3c4148, 0.5, 0.6), chiller: std(0xc9ced2, 0.3, 0.85), hv: std(0x1d1d1f, 0.4, 0.5) },
    shelf: { ambient: std(0xd6d9dc, 0.6, 0.2), chiller: std(0xdfe3e6, 0.3, 0.8), hv: std(0x2a2a2d, 0.5, 0.3) },
    back: { ambient: std(0xe8e9ea, 0.8, 0.0), chiller: std(0xcfd6db, 0.4, 0.6), hv: std(0x151517, 0.6, 0.2) },
    lip: std(0xf4f4f4, 0.6, 0.1),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xd8f0ff, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0, depthWrite: false }),
  }
  const parts: Record<string, THREE.BufferGeometry[]> = {}
  const add = (key: string, g: THREE.BufferGeometry) => (parts[key] ??= []).push(g)

  for (const r of store.racks) {
    const m = rackMatrix(r.cx, 0, r.cz, r.ry)
    shelving(r, m, add)
    labels(r, m, atlas)
  }

  const g = new THREE.Group()
  g.name = 'racks'
  for (const z of ['ambient', 'chiller', 'hv'] as Zone[]) {
    g.add(merged(parts[`post-${z}`] ?? [], mats.post[z]))
    g.add(merged(parts[`shelf-${z}`] ?? [], mats.shelf[z]))
    g.add(merged(parts[`back-${z}`] ?? [], mats.back[z]))
  }
  g.add(merged(parts.lip ?? [], mats.lip, false))
  g.add(merged(parts.glass ?? [], mats.glass, false))
  g.add(merged(parts.fridge ?? [], std(0xf2f4f6, 0.35, 0.2)))
  g.add(merged(parts.frame ?? [], std(0x2b2e33, 0.4, 0.6), false))
  g.add(merged(parts.lamp ?? [], new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe8f4ff, emissiveIntensity: 2.5 }), false))
  return g
}

function shelving(r: Rack, m: THREE.Matrix4, add: (k: string, g: THREE.BufferGeometry) => void) {
  const { len: L, depth: D, height: H, zone: z } = r
  const post = 0.035
  // Uprights at each end and every ~1 m between.
  const bays = Math.max(1, Math.round(L / 1.0))
  for (let b = 0; b <= bays; b++) {
    const x = -L / 2 + post / 2 + (b / bays) * (L - post)
    add(`post-${z}`, boxAt(post, H, post, x, H / 2, D / 2 - post / 2, m))
    add(`post-${z}`, boxAt(post, H, post, x, H / 2, -D / 2 + post / 2, m))
  }
  // Shelves, each with a front label lip.
  for (const y of r.shelfY) {
    add(`shelf-${z}`, boxAt(L, 0.02, D, 0, y - 0.01, 0, m))
    add('lip', boxAt(L, LABEL_H + 0.006, 0.012, 0, y - 0.005 - LABEL_H / 2 + 0.01, D / 2 + 0.004, m))
  }
  add(`shelf-${z}`, boxAt(L, 0.025, D, 0, H - 0.0125, 0, m))
  add(`back-${z}`, boxAt(L, H, 0.012, 0, H / 2, -D / 2 + 0.006, m))
  if (z === 'hv') {
    // Cabinet sides and a glass front: stock is behind lock.
    add(`back-${z}`, boxAt(0.02, H, D, -L / 2 + 0.01, H / 2, 0, m))
    add(`back-${z}`, boxAt(0.02, H, D, L / 2 - 0.01, H / 2, 0, m))
    add('glass', boxAt(L - 0.04, H - 0.1, 0.008, 0, H / 2, D / 2 + 0.03, m))
  }
  if (z === 'chiller') fridge(r, m, add)
}

/** Upright glass-door refrigerator (visi-cooler) around chiller shelving: insulated body, lit canopy, doors. */
function fridge(r: Rack, m: THREE.Matrix4, add: (k: string, g: THREE.BufferGeometry) => void) {
  const { len: L, depth: D, height: H } = r
  const front = D / 2 + 0.035
  add('fridge', boxAt(0.04, H, D + 0.05, -L / 2 - 0.005, H / 2, 0.025, m))
  add('fridge', boxAt(0.04, H, D + 0.05, L / 2 + 0.005, H / 2, 0.025, m))
  add('fridge', boxAt(L + 0.05, FRIDGE_CANOPY, D + 0.08, 0, H + FRIDGE_CANOPY / 2, 0.04, m))
  add('frame', boxAt(L + 0.05, 0.1, 0.012, 0, 0.05, front, m))                       // compressor grille
  add('lamp', boxAt(L - 0.08, 0.02, 0.03, 0, H - 0.04, D / 2 - 0.02, m))              // interior LED strip
  // Doors: one per ~0.7 m, framed, each with a handle on its opening edge.
  const n = Math.max(1, Math.round(L / 0.7)), dw = L / n
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + (i + 0.5) * dw
    add('glass', boxAt(dw - 0.05, H - 0.16, 0.01, x, H / 2 + 0.03, front, m))
    add('frame', boxAt(0.02, 0.4, 0.025, x + dw / 2 - 0.07, 1.05, front + 0.03, m))
  }
  for (let i = 0; i <= n; i++) add('frame', boxAt(0.035, H - 0.1, 0.03, -L / 2 + i * dw, H / 2 + 0.05, front, m))
  add('frame', boxAt(L, 0.035, 0.03, 0, 0.11, front, m))
  add('frame', boxAt(L, 0.035, 0.03, 0, H - 0.01, front, m))
}

function labels(r: Rack, m: THREE.Matrix4, atlas: LabelAtlas) {
  const bw = r.len / r.perLevel
  const q = new THREE.Matrix4()
  r.shelfY.forEach((y, k) => {
    for (let j = 0; j < r.perLevel; j++) {
      const code = `${r.id}-${'ABCDEFGH'[k]}${j + 1}`
      const lx = -r.len / 2 + (j + 0.5) * bw
      q.makeTranslation(lx, y - 0.005 - LABEL_H / 2 + 0.01, r.depth / 2 + 0.0115)
      atlas.add(drawBinLabel(code), m.clone().multiply(q), Math.min(LABEL_W, bw - 0.02), LABEL_H)
    }
  })
  // Rack header: the module code, big, above the pick face. Fridges carry it on their canopy.
  const sw = Math.min(0.62, r.len - 0.05)
  if (r.zone === 'chiller') {
    const sh = Math.min(sw / LabelAtlas.ASPECT, FRIDGE_CANOPY - 0.04)
    q.makeTranslation(0, r.height + FRIDGE_CANOPY / 2, r.depth / 2 + 0.082)
    atlas.add(drawSign(r.id, ZONE_SIGN[r.zone]), m.clone().multiply(q), sh * LabelAtlas.ASPECT, sh)
    return
  }
  q.makeTranslation(0, r.height + 0.1, r.depth / 2 - 0.018)
  atlas.add(drawSign(r.id, ZONE_SIGN[r.zone]), m.clone().multiply(q), sw, sw / LabelAtlas.ASPECT)
  // And on the back, so the code reads from either aisle.
  q.makeRotationY(Math.PI).setPosition(0, r.height + 0.1, r.depth / 2 - 0.033)
  atlas.add(drawSign(r.id, ZONE_SIGN[r.zone]), m.clone().multiply(q), sw, sw / LabelAtlas.ASPECT)
}

/** The header board the signs hang on. */
export function rackHeaders(store: Store): THREE.Object3D {
  const geos: THREE.BufferGeometry[] = []
  for (const r of store.racks.filter(r => r.zone !== 'chiller')) {
    const m = rackMatrix(r.cx, 0, r.cz, r.ry)
    const sw = Math.min(0.62, r.len - 0.05)
    geos.push(boxAt(sw + 0.02, sw / LabelAtlas.ASPECT + 0.02, 0.012, 0, r.height + 0.1, r.depth / 2 - 0.025, m))
    geos.push(boxAt(0.02, 0.1, 0.02, 0, r.height + 0.02, r.depth / 2 - 0.025, m))
  }
  return merged(geos, std(0x222222, 0.6, 0.3), false)
}
