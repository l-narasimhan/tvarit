// Where people can stand and walk. One source of obstacles (racks, fridges, walls, desks, pallets) serves the
// first-person walk's collision and the staff's path-finding, so the two never disagree.

import type { Rect, Store } from './model'

export function solids(s: Store): Rect[] {
  const out: Rect[] = []
  for (const r of s.racks) {
    const front = r.zone === 'chiller' ? 0.08 : r.zone === 'hv' ? 0.04 : 0
    const across = r.face === 'N' || r.face === 'S'
    const hl = r.len / 2 + 0.03, hd = r.depth / 2
    const [fx, fz] = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[r.face]
    const hx = across ? hl : hd, hz = across ? hd : hl
    out.push({
      x0: r.cx - hx + Math.min(0, fx * front), x1: r.cx + hx + Math.max(0, fx * front),
      z0: r.cz - hz + Math.min(0, fz * front), z1: r.cz + hz + Math.max(0, fz * front),
    })
  }
  out.push(...s.walls)
  for (const f of s.fixtures) if (f.kind !== 'entrance') out.push(f)
  for (const p of s.slots) if (p.kind === 'pallet') out.push({ x0: p.x - p.w / 2 - 0.05, x1: p.x + p.w / 2 + 0.05, z0: p.z - p.d / 2 - 0.05, z1: p.z + p.d / 2 + 0.05 })
  return out
}

export type P2 = [number, number]

/** A 0.2 m occupancy grid over the store plus the forecourt, with A* and string-pulling. */
export class NavGrid {
  readonly cell = 0.2
  readonly x0 = -10
  readonly z0 = 0
  readonly nx: number
  readonly nz: number
  private block: Uint8Array

  constructor(store: Store, radius = 0.25) {
    this.nx = Math.ceil((store.W - this.x0) / this.cell)
    this.nz = Math.ceil((store.D - this.z0) / this.cell)
    this.block = new Uint8Array(this.nx * this.nz)
    for (const r of solids(store)) {
      const i0 = Math.max(0, Math.floor((r.x0 - radius - this.x0) / this.cell))
      const i1 = Math.min(this.nx - 1, Math.floor((r.x1 + radius - this.x0) / this.cell))
      const j0 = Math.max(0, Math.floor((r.z0 - radius - this.z0) / this.cell))
      const j1 = Math.min(this.nz - 1, Math.floor((r.z1 + radius - this.z0) / this.cell))
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.block[j * this.nx + i] = 1
    }
  }

  private idx(x: number, z: number): [number, number] {
    return [Math.floor((x - this.x0) / this.cell), Math.floor((z - this.z0) / this.cell)]
  }
  private centre(i: number, j: number): P2 { return [this.x0 + (i + 0.5) * this.cell, this.z0 + (j + 0.5) * this.cell] }
  free(i: number, j: number) { return i >= 0 && j >= 0 && i < this.nx && j < this.nz && !this.block[j * this.nx + i] }
  walkable(x: number, z: number) { const [i, j] = this.idx(x, z); return this.free(i, j) }

  /** The free cell nearest to (x, z), searching outward ring by ring. */
  nearestFree(x: number, z: number): P2 | null {
    const [ci, cj] = this.idx(x, z)
    for (let r = 0; r < 25; r++) {
      let best: P2 | null = null, bd = Infinity
      for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || !this.free(i, j)) continue
        const c = this.centre(i, j), d = Math.hypot(c[0] - x, c[1] - z)
        if (d < bd) { bd = d; best = c }
      }
      if (best) return best
    }
    return null
  }

  path(from: P2, to: P2): P2[] | null {
    const a = this.nearestFree(...from), b = this.nearestFree(...to)
    if (!a || !b) return null
    const [si, sj] = this.idx(...a), [gi, gj] = this.idx(...b)
    const N = this.nx * this.nz, start = sj * this.nx + si, goal = gj * this.nx + gi
    const g = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N)
    const heap = new MinHeap()
    const h = (k: number) => { const dx = Math.abs((k % this.nx) - gi), dz = Math.abs(Math.floor(k / this.nx) - gj); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz) }
    g[start] = 0; heap.push(start, h(start))
    const D8: [number, number, number][] = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]]
    while (heap.size) {
      const k = heap.pop()
      if (k === goal) break
      if (closed[k]) continue
      closed[k] = 1
      const i = k % this.nx, j = Math.floor(k / this.nx)
      for (const [di, dj, c] of D8) {
        const ni = i + di, nj = j + dj
        if (!this.free(ni, nj)) continue
        if (di && dj && (!this.free(i + di, j) || !this.free(i, j + dj))) continue   // no corner cutting
        const nk = nj * this.nx + ni, ng = g[k] + c
        if (ng < g[nk]) { g[nk] = ng; came[nk] = k; heap.push(nk, ng + h(nk)) }
      }
    }
    if (came[goal] === -1 && goal !== start) return null
    const cells: P2[] = []
    for (let k = goal; k !== -1; k = came[k]) cells.push(this.centre(k % this.nx, Math.floor(k / this.nx)))
    cells.reverse()
    return this.smooth(cells)
  }

  /** String-pulling: keep a waypoint only where the straight line to the next one would clip an obstacle. */
  private smooth(p: P2[]): P2[] {
    if (p.length < 3) return p
    const out: P2[] = [p[0]]
    let a = 0
    for (let b = 2; b < p.length; b++) {
      if (!this.clear(p[a], p[b])) { out.push(p[b - 1]); a = b - 1 }
    }
    out.push(p[p.length - 1])
    return out
  }

  private clear(a: P2, b: P2) {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (this.cell * 0.5))
    for (let s = 1; s < n; s++) {
      const t = s / n
      if (!this.walkable(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return false
    }
    return true
  }
}

class MinHeap {
  private k: number[] = []
  private p: number[] = []
  get size() { return this.k.length }
  push(key: number, pri: number) {
    const k = this.k, p = this.p
    k.push(key); p.push(pri)
    let i = k.length - 1
    while (i > 0) {
      const u = (i - 1) >> 1
      if (p[u] <= p[i]) break
      ;[k[u], k[i]] = [k[i], k[u]]; [p[u], p[i]] = [p[i], p[u]]
      i = u
    }
  }
  pop(): number {
    const k = this.k, p = this.p
    const top = k[0]
    const lk = k.pop()!, lp = p.pop()!
    if (k.length) {
      k[0] = lk; p[0] = lp
      let i = 0
      for (;;) {
        const l = 2 * i + 1, r = l + 1
        let m = i
        if (l < k.length && p[l] < p[m]) m = l
        if (r < k.length && p[r] < p[m]) m = r
        if (m === i) break
        ;[k[m], k[i]] = [k[i], k[m]]; [p[m], p[i]] = [p[i], p[m]]
        i = m
      }
    }
    return top
  }
}
