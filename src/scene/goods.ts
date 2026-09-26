// Product on the shelf: every unit in stock that fits in view is one instance, filled front row first, the way
// a picker sees a bin. A bin with 3 units shows 3 packs; an empty bin shows bare shelf.

import * as THREE from 'three'
import type { Product } from '../catalog'
import type { Slot } from '../model'

const ROUND = new Set(['bottle', 'jar', 'can', 'tub'])

export class Goods {
  private box: { m: THREE.Matrix4; c: THREE.Color }[] = []
  private cyl: { m: THREE.Matrix4; c: THREE.Color }[] = []
  private q = new THREE.Quaternion()
  private up = new THREE.Vector3(0, 1, 0)

  push(p: Product | { shape: string; color: number }, x: number, y: number, z: number, w: number, h: number, d: number, ry: number) {
    this.q.setFromAxisAngle(this.up, ry)
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(w, h, d))
    const c = new THREE.Color(p.color)
    ;(ROUND.has(p.shape) ? this.cyl : this.box).push({ m, c })
  }

  /** Fills a shelf bin with its on-hand quantity. */
  stockBin(s: Slot) {
    const p = s.sku
    if (!p || s.qty <= 0) return
    const floor = s.y - s.h / 2
    // Shrink oversize packs to fit the bin; real planograms would not slot them here, but the layout decides.
    const k = Math.min(1, (s.w - 0.02) / p.w, (s.h - 0.03) / p.h, (s.d - 0.02) / p.d)
    const pw = p.w * k, ph = p.h * k, pd = p.d * k
    const nx = Math.max(1, Math.min(8, Math.floor((s.w - 0.02) / (pw + 0.006))))
    const nz = Math.max(1, Math.min(4, Math.floor((s.d - 0.02) / (pd + 0.006))))
    const ny = ROUND.has(p.shape) ? 1 : Math.max(1, Math.min(4, Math.floor((s.h - 0.03) / (ph + 0.002))))
    const show = Math.min(s.qty, nx * ny * nz)
    const c = Math.cos(s.ry), sn = Math.sin(s.ry)
    const x0 = -(nx - 1) / 2 * (pw + 0.006)
    for (let i = 0; i < show; i++) {
      const ix = i % nx, iy = Math.floor(i / nx) % ny, iz = Math.floor(i / (nx * ny))
      const lx = x0 + ix * (pw + 0.006)
      const lz = s.d / 2 - 0.01 - pd / 2 - iz * (pd + 0.006)
      this.push(p, s.x + lx * c + lz * sn, floor + ph / 2 + iy * (ph + 0.002), s.z - lx * sn + lz * c, pw, ph, pd, s.ry)
    }
  }

  meshes(): THREE.Object3D[] {
    const make = (geo: THREE.BufferGeometry, list: { m: THREE.Matrix4; c: THREE.Color }[]) => {
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 }), Math.max(1, list.length))
      list.forEach((it, i) => { mesh.setMatrixAt(i, it.m); mesh.setColorAt(i, it.c) })
      mesh.count = list.length
      mesh.castShadow = true; mesh.receiveShadow = true
      return mesh
    }
    const box = new THREE.BoxGeometry(1, 1, 1)
    const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 12)
    return [make(box, this.box), make(cyl, this.cyl)]
  }

  get count() { return this.box.length + this.cyl.length }
}
