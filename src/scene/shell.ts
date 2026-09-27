// The building: floor, zone floors, walls, doors, the rider bay outside, and floor lettering.

import * as THREE from 'three'
import type { Door, Store, Wall } from '../model'
import { boxAt, canvasTexture, floorText, merged } from './util'

const std = (color: number, roughness = 0.6, metalness = 0.1) => new THREE.MeshStandardMaterial({ color, roughness, metalness })

export function buildShell(store: Store): { floor: THREE.Object3D; walls: THREE.Group } {
  const floor = new THREE.Group()
  floor.name = 'floor'
  const { W, D } = store

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W + 60, D + 50), std(0x3a3b3d, 0.95))
  ground.rotation.x = -Math.PI / 2
  ground.position.set(W / 2 - 6, -0.02, D / 2)
  ground.receiveShadow = true
  floor.add(ground)

  const slab = new THREE.Mesh(new THREE.PlaneGeometry(W, D), std(0xc3c6c9, 0.55, 0.05))
  slab.rotation.x = -Math.PI / 2
  slab.position.set(W / 2, 0, D / 2)
  slab.receiveShadow = true
  floor.add(slab)

  const tint = (x0: number, z0: number, x1: number, z1: number, color: number, y = 0.004) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), std(color, 0.5, 0.05))
    m.rotation.x = -Math.PI / 2
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2)
    m.receiveShadow = true
    floor.add(m)
  }
  for (const z of store.zones) tint(z.x0, z.z0, z.x1, z.z1, z.kind === 'chiller' ? 0xa9cfe3 : 0xe6d7a6)
  for (const f of store.fixtures) {
    if (f.kind === 'dropzone') tint(f.x0, f.z0, f.x1, f.z1, 0xf2d64b)
    if (f.kind === 'packing') tint(f.x0, f.z0, f.x1 + 1.2, f.z1, 0xe9d2b0)
    if (f.kind === 'wms' || f.kind === 'desk') tint(f.x0 - 1.3, f.z0, f.x1, f.z1, 0xc9dcc4)
  }

  // Floor lettering.
  for (const z of store.zones) {
    const cx = (z.x0 + z.x1) / 2, cz = (z.z0 + z.z1) / 2
    floor.add(floorText(z.label, cx, z.kind === 'chiller' ? cz + 0.2 : z.z0 + 0.6, 0.55, z.kind === 'chiller' ? '#0e4f6b' : '#6b4a00'))
  }
  for (const f of store.fixtures) {
    const cx = (f.x0 + f.x1) / 2, cz = (f.z0 + f.z1) / 2
    const vert = f.z1 - f.z0 > f.x1 - f.x0
    if (f.kind === 'packing') floor.add(floorText('PACKING', f.x1 + 0.6, cz, 0.45, '#6b4a1e', Math.PI / 2))
    if (f.kind === 'wms') floor.add(floorText('WMS · SITTING AREA', f.x0 - 0.65, cz, 0.4, '#2e5a2a', Math.PI / 2))
    if (f.kind === 'desk') floor.add(floorText('FRONT DESK · STORE MANAGER', f.x0 - 0.65, cz, 0.36, '#2e5a2a', Math.PI / 2))
    if (f.kind === 'entrance') floor.add(floorText('ENTRANCE', -1.2, cz, 0.5, '#f2f2f2', Math.PI / 2))
    if (f.kind === 'dropzone' && vert) floor.add(floorText('DROP ZONE', cx, f.z0 - 0.4, 0.3, '#5a4a00'))
  }

  // Inbound: the GRN staging area inside the entrance, and the lorry dock outside it.
  if (store.grn) {
    const g = store.grn
    const edge: THREE.BufferGeometry[] = []
    const t = 0.06, w = g.x1 - g.x0, d = g.z1 - g.z0
    edge.push(boxAt(w, 0.004, t, (g.x0 + g.x1) / 2, 0.006, g.z0), boxAt(w, 0.004, t, (g.x0 + g.x1) / 2, 0.006, g.z1))
    edge.push(boxAt(t, 0.004, d, g.x0, 0.006, (g.z0 + g.z1) / 2), boxAt(t, 0.004, d, g.x1, 0.006, (g.z0 + g.z1) / 2))
    floor.add(merged(edge, std(0x14b8a6, 0.6), false))
    tint(g.x0, g.z0, g.x1, g.z1, 0xcfe9e4, 0.003)
    floor.add(floorText('INBOUND · GRN', (g.x0 + g.x1) / 2, g.z0 + 0.35, 0.34, '#0f766e'))
  }
  if (store.dock) {
    const k = store.dock
    const lines: THREE.BufferGeometry[] = []
    for (const dx of [-1.25, 1.25]) lines.push(boxAt(0.1, 0.004, 6.2, k.x + dx, 0.0, k.z))
    lines.push(boxAt(2.6, 0.004, 0.1, k.x, 0.0, k.tail[1] + 0.1))
    floor.add(merged(lines, std(0xf2c200, 0.7), false))
    floor.add(floorText('LORRY DOCK', k.x, k.z - 1.2, 0.45, '#f2c200', Math.PI))
  }

  // Rider bay: outside the entrance, marked bays for the bikes.
  const ent = store.fixtures.find(f => f.kind === 'entrance')
  if (ent) {
    const cz = (ent.z0 + ent.z1) / 2
    const x0 = -9.8, x1 = -2.5, z0 = cz - 6.3, z1 = cz + 6.3
    tint(x0, z0, x1, z1, 0x4a4c50, -0.01)
    const lines: THREE.BufferGeometry[] = []
    // One 1 m bay line between scooters, per column of bays.
    for (const bx of [...new Set(store.riderBays.map(b => b[0]))]) {
      for (let z = cz - 6; z <= cz + 6.01; z += 1.0) lines.push(boxAt(1.8, 0.004, 0.06, bx + 0.1, 0.0, z))
    }
    floor.add(merged(lines, std(0xf2f2f2, 0.7), false))
    floor.add(floorText('RIDER BAY', x1 - 0.6, cz, 0.6, '#f2c200', Math.PI / 2))
    // Walkway from the bay to the door.
    const walk: THREE.BufferGeometry[] = []
    for (let x = x1 + 0.2; x < -0.4; x += 0.5) walk.push(boxAt(0.3, 0.004, ent.z1 - ent.z0 - 0.6, x, 0, cz))
    floor.add(merged(walk, std(0xf2f2f2, 0.7), false))
  }

  // ---- Walls ---------------------------------------------------------------------------------------------
  const walls = new THREE.Group()
  walls.name = 'walls'
  const plain: THREE.BufferGeometry[] = [], cold: THREE.BufferGeometry[] = [], posts: THREE.BufferGeometry[] = []
  for (const w of store.walls) {
    const g = boxAt(w.x1 - w.x0, w.height, w.z1 - w.z0, (w.x0 + w.x1) / 2, w.height / 2, (w.z0 + w.z1) / 2)
    if (w.style === 'cage') { walls.add(cageMesh(w)); cagePosts(w, posts) }
    else (w.style === 'cold' ? cold : plain).push(g)
  }
  walls.add(merged(plain, std(0xd8dbde, 0.8, 0.05)))
  walls.add(merged(cold, std(0xf4f6f7, 0.35, 0.15)))
  for (const d of store.doors) door(d, walls, posts)
  walls.add(merged(posts, std(0x2d3035, 0.5, 0.6)))
  return { floor, walls }
}

let meshTex: THREE.Texture | null = null
function cageMesh(w: Wall): THREE.Object3D {
  meshTex ??= canvasTexture(16, 16, ctx => {
    ctx.clearRect(0, 0, 16, 16)
    ctx.fillStyle = '#2d3035'
    ctx.fillRect(0, 0, 16, 2); ctx.fillRect(0, 0, 2, 16)
  })
  const horiz = w.x1 - w.x0 >= w.z1 - w.z0
  const len = horiz ? w.x1 - w.x0 : w.z1 - w.z0
  const t = meshTex.clone()
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(len / 0.06, w.height / 0.06)
  t.needsUpdate = true
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len, w.height),
    new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.4 }))
  m.position.set((w.x0 + w.x1) / 2, w.height / 2, (w.z0 + w.z1) / 2)
  if (!horiz) m.rotation.y = Math.PI / 2
  return m
}

function cagePosts(w: Wall, out: THREE.BufferGeometry[]) {
  const horiz = w.x1 - w.x0 >= w.z1 - w.z0
  const len = horiz ? w.x1 - w.x0 : w.z1 - w.z0
  const n = Math.max(1, Math.round(len / 1.2))
  const cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2
  for (let i = 0; i <= n; i++) {
    const t = -len / 2 + (i / n) * len
    out.push(boxAt(0.05, w.height, 0.05, horiz ? cx + t : cx, w.height / 2, horiz ? cz : cz + t))
  }
  out.push(horiz ? boxAt(len, 0.05, 0.05, cx, w.height, cz) : boxAt(0.05, 0.05, len, cx, w.height, cz))
}

function door(d: Door, walls: THREE.Group, posts: THREE.BufferGeometry[]) {
  const len = d.b - d.a, mid = (d.a + d.b) / 2
  const at = (along: number, y: number, w: number, h: number, t: number) =>
    d.axis === 'x' ? boxAt(w, h, t, along, y, d.at) : boxAt(t, h, w, d.at, y, along)
  const top = d.style === 'front' ? 3.2 : d.style === 'cage' ? 2.4 : 2.8
  const clear = d.style === 'front' ? 2.5 : 2.2
  // Jambs and lintel.
  posts.push(at(d.a + 0.04, clear / 2, 0.08, clear, 0.22), at(d.b - 0.04, clear / 2, 0.08, clear, 0.22))
  const lintel = at(mid, (clear + top) / 2, len, top - clear, 0.2)
  if (d.style === 'cage') posts.push(lintel)
  else walls.add(merged([lintel], new THREE.MeshStandardMaterial({ color: d.style === 'cold' ? 0xf4f6f7 : 0xd8dbde, roughness: 0.6 })))

  if (d.style === 'cold') {
    // PVC strip curtain: overlapping translucent strips.
    const strips: THREE.BufferGeometry[] = []
    for (let s = d.a + 0.12; s < d.b - 0.08; s += 0.18) strips.push(at(s, clear / 2 + 0.05, 0.2, clear - 0.1, 0.006))
    walls.add(merged(strips, new THREE.MeshPhysicalMaterial({ color: 0xcfe8f5, transparent: true, opacity: 0.35, roughness: 0.15, depthWrite: false }), false))
  } else if (d.style === 'front') {
    // Glass sliding doors, drawn open.
    const glass = [at(d.a + len * 0.12, clear / 2, len * 0.22, clear - 0.05, 0.03), at(d.b - len * 0.12, clear / 2, len * 0.22, clear - 0.05, 0.03)]
    walls.add(merged(glass, new THREE.MeshPhysicalMaterial({ color: 0xbfe3f2, transparent: true, opacity: 0.3, roughness: 0.05, depthWrite: false }), false))
  } else if (d.style === 'cage') {
    // A locked mesh gate.
    const gate = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.16, clear - 0.1),
      new THREE.MeshStandardMaterial({ color: 0x2d3035, transparent: true, opacity: 0.35, side: THREE.DoubleSide, metalness: 0.6 }))
    gate.position.set(d.axis === 'x' ? mid : d.at, clear / 2, d.axis === 'x' ? d.at : mid)
    if (d.axis === 'z') gate.rotation.y = Math.PI / 2
    walls.add(gate)
  }
}
