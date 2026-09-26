// Product on the shelf: every unit in stock that fits in view is one instance, filled front row first, the way
// a picker sees a bin. A bin with 3 units shows 3 packs; an empty bin shows bare shelf. One instanced mesh per
// SKU, carrying that SKU's pack shape and printed art.

import * as THREE from 'three'
import type { Product, Shape } from '../catalog'
import type { Slot } from '../model'
import { isRound, packGeometry, packMaterial } from './packs'

type Plain = { shape: Shape; color: number }
interface Batch { geo: THREE.BufferGeometry; mat: THREE.Material; list: THREE.Matrix4[] }

export class Goods {
  private batches = new Map<string, Batch>()
  private q = new THREE.Quaternion()
  private up = new THREE.Vector3(0, 1, 0)

  push(p: Product | Plain, x: number, y: number, z: number, w: number, h: number, d: number, ry: number) {
    const key = 'sku' in p ? p.sku : `plain-${p.shape}-${p.color}`
    let b = this.batches.get(key)
    if (!b) {
      b = 'sku' in p
        ? { geo: packGeometry(p.shape), mat: packMaterial(p), list: [] }
        : { geo: packGeometry(isRound(p.shape) ? 'plainRound' : p.shape === 'bag' ? 'bag' : 'plain'), mat: new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.8 }), list: [] }
      this.batches.set(key, b)
    }
    this.q.setFromAxisAngle(this.up, ry)
    b.list.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(w, h, d)))
  }

  /** Fills a shelf bin with its on-hand quantity. */
  stockBin(s: Slot) {
    const p = s.sku
    if (!p || s.qty <= 0) return
    const floor = s.y - s.h / 2
    // Shrink oversize packs to fit the bin; real planograms would not slot them here, but the layout decides.
    const k = Math.min(1, (s.w - 0.02) / p.w, (s.h - 0.03) / p.h, (s.d - 0.02) / p.d)
    const pw = p.w * k, ph = p.h * k, pd = p.d * k
    const gap = 0.006
    const nx = Math.max(1, Math.min(8, Math.floor((s.w - 0.02) / (pw + gap))))
    const nz = Math.max(1, Math.min(4, Math.floor((s.d - 0.02) / (pd + gap))))
    // Flat cartons stack; bottles, jars, pouches stand one high.
    const stack = p.shape === 'box' || p.shape === 'tray'
    const ny = stack ? Math.max(1, Math.min(4, Math.floor((s.h - 0.03) / (ph + 0.002)))) : 1
    const show = Math.min(s.qty, nx * ny * nz)
    const c = Math.cos(s.ry), sn = Math.sin(s.ry)
    const x0 = -(nx - 1) / 2 * (pw + gap)
    for (let i = 0; i < show; i++) {
      const ix = i % nx, iy = Math.floor(i / nx) % ny, iz = Math.floor(i / (nx * ny))
      const lx = x0 + ix * (pw + gap)
      const lz = s.d / 2 - 0.01 - pd / 2 - iz * (pd + gap)
      this.push(p, s.x + lx * c + lz * sn, floor + ph / 2 + iy * (ph + 0.002), s.z - lx * sn + lz * c, pw, ph, pd, s.ry)
    }
  }

  meshes(): THREE.Object3D[] {
    return [...this.batches.values()].map(b => {
      const mesh = new THREE.InstancedMesh(b.geo, b.mat, b.list.length)
      b.list.forEach((m, i) => mesh.setMatrixAt(i, m))
      mesh.castShadow = true; mesh.receiveShadow = true
      mesh.computeBoundingSphere()
      return mesh
    })
  }

  get count() { let n = 0; for (const b of this.batches.values()) n += b.list.length; return n }
}
