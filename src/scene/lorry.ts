// The inbound lorry: a light commercial truck with a box body, cab forward (local +z), tail doors that swing
// open at the dock, and the load inside — one carton per case still on board. Also the GRN staging stacks.

import * as THREE from 'three'
import type { Lorry, Sim } from '../sim/engine'
import { boxAt, canvasTexture, merged } from './util'

const std = (color: number, roughness = 0.5, metalness = 0.2) => new THREE.MeshStandardMaterial({ color, roughness, metalness })
const LOAD = { cols: 3, rows: 3, deep: 10 }

class LorryView {
  readonly root = new THREE.Group()
  private doors: THREE.Group[] = []
  private load: THREE.InstancedMesh
  private shown = -1

  constructor() {
    const white = std(0xf1f3f5, 0.35, 0.3), dark = std(0x1f2328, 0.6, 0.3), glass = std(0x1b2a3a, 0.1, 0.6), tyre = std(0x111111, 0.9, 0)
    // Box body: floor at 0.8 m, 3.6 m long, tail at local z = -2.7.
    const side = canvasTexture(512, 256, ctx => {
      ctx.fillStyle = '#e8edf2'; ctx.fillRect(0, 0, 512, 256)
      ctx.fillStyle = '#0f766e'; ctx.fillRect(0, 190, 512, 26)
      ctx.fillStyle = '#0f172a'; ctx.font = '900 64px system-ui, sans-serif'; ctx.textBaseline = 'middle'
      ctx.fillText('TVARIT', 36, 100)
      ctx.fillStyle = '#0f766e'; ctx.font = '700 30px system-ui, sans-serif'
      ctx.fillText('inbound supply · ambient & chilled', 38, 150)
    })
    const bodyMat = [std(0xe8edf2, 0.4, 0.2), std(0xe8edf2, 0.4, 0.2), std(0xe8edf2), std(0x9aa3ab), std(0xe8edf2), std(0xe8edf2)]
    bodyMat[0] = new THREE.MeshStandardMaterial({ map: side, roughness: 0.4 })
    bodyMat[1] = new THREE.MeshStandardMaterial({ map: side, roughness: 0.4 })
    // Hollow box: walls and roof only, so the load shows when the doors are open.
    const shell = new THREE.Group()
    for (const [w, h, d, x, y, z, mi] of [
      [0.04, 2.0, 3.6, -0.93, 1.8, -0.9, 1], [0.04, 2.0, 3.6, 0.93, 1.8, -0.9, 0],
      [1.9, 0.04, 3.6, 0, 2.8, -0.9, 2], [1.9, 0.06, 3.6, 0, 0.8, -0.9, 3], [1.9, 2.0, 0.04, 0, 1.8, 0.88, 4],
    ] as const) {
      const g = new THREE.BoxGeometry(w, h, d)
      const mesh = new THREE.Mesh(g, bodyMat[mi])
      mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true
      shell.add(mesh)
    }
    this.root.add(shell)
    // Cab, bumper, chassis, wheels, lamps.
    this.root.add(merged([
      boxAt(1.9, 1.35, 1.5, 0, 1.25, 1.75), boxAt(1.9, 0.5, 1.5, 0, 0.55, 1.75),
    ], white))
    this.root.add(merged([boxAt(1.7, 0.55, 0.02, 0, 1.55, 2.51), boxAt(0.02, 0.5, 0.9, 0.96, 1.55, 1.7), boxAt(0.02, 0.5, 0.9, -0.96, 1.55, 1.7)], glass, false))
    this.root.add(merged([
      boxAt(1.95, 0.2, 0.12, 0, 0.4, 2.55), boxAt(1.2, 0.18, 5.2, 0, 0.55, -0.1), boxAt(1.9, 0.12, 0.1, 0, 0.55, -2.72),
    ], dark))
    for (const z of [1.6, -1.8]) for (const x of [-0.85, 0.85]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.26, 18), tyre)
      w.rotation.z = Math.PI / 2; w.position.set(x, 0.38, z); w.castShadow = true
      this.root.add(w)
    }
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 1.2 })
    const tail = new THREE.MeshStandardMaterial({ color: 0xb91c1c, emissive: 0x7f1d1d, emissiveIntensity: 0.8 })
    for (const x of [-0.7, 0.7]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.04), lampMat); l.position.set(x, 0.8, 2.52); this.root.add(l)
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.04), tail); t.position.set(x * 1.2, 0.95, -2.74); this.root.add(t)
    }
    // Tail doors, hinged at the body's rear corners.
    for (const s of [-1, 1]) {
      const hinge = new THREE.Group()
      hinge.position.set(s * 0.95, 1.8, -2.7)
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.98, 0.04), std(0xdfe4e9, 0.4, 0.2))
      door.position.x = -s * 0.475
      door.castShadow = true
      hinge.add(door)
      this.doors.push(hinge)
      this.root.add(hinge)
    }
    // The load: cartons in rows from the cab back.
    const n = LOAD.cols * LOAD.rows * LOAD.deep
    this.load = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.52, 0.32), std(0xb98b57, 0.85, 0), n)
    const m = new THREE.Matrix4()
    for (let i = 0; i < n; i++) {
      const c = i % LOAD.cols, r = Math.floor(i / LOAD.cols) % LOAD.rows, d = Math.floor(i / (LOAD.cols * LOAD.rows))
      m.makeTranslation(-0.6 + c * 0.6, 1.1 + r * 0.56, 0.65 - d * 0.34)
      this.load.setMatrixAt(i, m)
    }
    this.load.castShadow = true
    this.root.add(this.load)
  }

  sync(l: Lorry) {
    this.root.visible = l.state !== 'gone'
    this.root.position.set(l.x, 0, l.z)
    this.root.rotation.y = l.yaw
    const open = l.state === 'docked' ? 1 : 0
    this.doors.forEach((h, i) => { const target = (i ? -1 : 1) * open * 1.9; h.rotation.y += (target - h.rotation.y) * 0.1 })
    // Cartons still on board, emptied from the tail end first.
    const on = l.cases.filter(c => c.state === 'lorry').length
    const total = LOAD.cols * LOAD.rows * LOAD.deep
    const shown = Math.min(total, Math.round((on / Math.max(1, l.cases.length)) * Math.min(total, l.cases.length)))
    if (shown !== this.shown) { this.load.count = shown; this.shown = shown }
  }
}

export class Inbound {
  readonly group = new THREE.Group()
  private views = new Map<Lorry, LorryView>()
  private staged: THREE.InstancedMesh
  private m = new THREE.Matrix4()
  private color = new THREE.Color()

  constructor(private sim: Sim) {
    this.group.name = 'inbound'
    this.staged = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.3, 0.34), std(0xffffff, 0.85, 0), Math.max(1, sim.spots.length * 5))
    this.staged.castShadow = true
    this.staged.count = 0
    this.group.add(this.staged)
  }

  sync() {
    for (const l of this.sim.lorries) {
      let v = this.views.get(l)
      if (!v) { v = new LorryView(); this.views.set(l, v); this.group.add(v.root) }
      v.sync(l)
      if (l.state === 'gone') { this.group.remove(v.root); this.views.delete(l) }
    }
    // Cases on the GRN floor, stacked per spot; the carton takes the product's colour band.
    const stack = this.sim.spots.map(() => 0)
    let n = 0
    for (const c of this.sim.cases) {
      if (!(c.state === 'unloaded' || c.state === 'checking' || c.state === 'received') || c.spot < 0) continue
      const [x, z] = this.sim.spots[c.spot]
      this.m.makeTranslation(x, 0.15 + stack[c.spot]++ * 0.31, z)
      this.staged.setMatrixAt(n, this.m)
      // Unchecked cases plain kraft; checked (received) ones take a green tint, ready for putaway.
      this.staged.setColorAt(n, this.color.set(c.state === 'received' ? 0x9fc79a : 0xb98b57))
      n++
    }
    this.staged.count = n
    this.staged.instanceMatrix.needsUpdate = true
    if (this.staged.instanceColor) this.staged.instanceColor.needsUpdate = true
  }
}
