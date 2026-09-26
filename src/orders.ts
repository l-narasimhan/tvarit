// Tracing one live order through the simulation: its pick route on the floor, its bins flashing until picked,
// and who the camera should follow. Reads the engine; never changes it.

import * as THREE from 'three'
import type { P2 } from './nav'
import type { SOrder, Sim, Worker } from './sim/engine'

export class Trace {
  readonly group = new THREE.Group()
  order: SOrder | null = null
  /** Trace the next order to arrive, when none was waiting to be picked. */
  private waitFrom = -1
  private marks: THREE.LineSegments[] = []
  private route: THREE.Line | null = null
  private routeFor: Worker | null = null
  private edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1))

  constructor(private sim: Sim) { this.group.name = 'trace' }

  /** Picks the newest order not yet picked, or waits for the next one to arrive. */
  start() {
    this.clear()
    const q = [...this.sim.open].reverse().find(o => o.stage === 'queued')
    if (q) this.set(q)
    else this.waitFrom = this.sim.nextSeq
  }

  private set(o: SOrder) {
    this.order = o
    this.waitFrom = -1
    for (const l of o.lines) {
      const m = new THREE.LineSegments(this.edges, new THREE.LineBasicMaterial({ color: 0xff8a00, depthTest: false, transparent: true }))
      m.position.set(l.slot.x, l.slot.y, l.slot.z); m.rotation.y = l.slot.ry
      m.scale.set(l.slot.w * 1.06, l.slot.h * 1.06, l.slot.d * 1.06)
      m.renderOrder = 9
      this.marks.push(m)
      this.group.add(m)
    }
  }

  get waiting() { return this.waitFrom >= 0 }

  /** Who is working the order now. */
  get actor(): Worker | null {
    const o = this.order
    if (!o) return null
    if (o.stage === 'picking' || o.stage === 'bagging') return o.picker
    if (o.rider && o.rider.visible) return o.rider
    if (o.stage === 'ready') return o.picker
    return null
  }

  update(t: number) {
    if (this.waiting) {
      // The first order numbered from when we started waiting, whatever stage it has reached.
      const n = (o: SOrder) => Number(o.id.slice(1))
      const o = this.sim.open.find(x => n(x) >= this.waitFrom) ?? this.sim.done.find(x => n(x) >= this.waitFrom)
      if (o) this.set(o)
      return
    }
    const o = this.order
    if (!o) return
    const k = 0.6 + 0.4 * Math.sin(t * 6)
    o.lines.forEach((l, i) => {
      const m = this.marks[i].material as THREE.LineBasicMaterial
      m.color.set(l.picked ? 0x22c55e : 0xff8a00)
      m.opacity = l.picked ? 0.9 : k
    })
    // The route appears once a picker has the order, and goes when the bag is in the pigeon hole.
    if (o.picker && o.stage === 'picking' && this.routeFor !== o.picker) this.drawRoute(o, o.picker)
    if (o.stage !== 'picking' && o.stage !== 'bagging' && this.route) { this.group.remove(this.route); this.route = null }
    if (o.stage === 'out' && this.marks.length) { for (const m of this.marks) this.group.remove(m); this.marks = [] }
  }

  private drawRoute(o: SOrder, p: Worker) {
    this.routeFor = p
    const pts: THREE.Vector3[] = []
    let at: P2 = [p.x, p.z]
    const front = (s: SOrder['lines'][number]['slot']): P2 => [s.x + Math.sin(s.ry) * (s.d / 2 + 0.55), s.z + Math.cos(s.ry) * (s.d / 2 + 0.55)]
    const stops: P2[] = [...o.lines.filter(l => !l.picked).map(l => front(l.slot)), p.home]
    for (const s of stops) {
      for (const q of this.sim.nav.path(at, s) ?? [at, s]) pts.push(new THREE.Vector3(q[0], 0.04, q[1]))
      at = s
    }
    if (this.route) this.group.remove(this.route)
    this.route = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineDashedMaterial({ color: 0xff8a00, dashSize: 0.35, gapSize: 0.2, depthTest: false, transparent: true }))
    this.route.computeLineDistances()
    this.route.renderOrder = 9
    this.group.add(this.route)
  }

  clear() {
    for (const m of this.marks) this.group.remove(m)
    this.marks = []
    if (this.route) this.group.remove(this.route)
    this.route = null
    this.routeFor = null
    this.order = null
    this.waitFrom = -1
  }
}
