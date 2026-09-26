// One order, end to end, on the real floor: real lines from bins with stock, the nearest free picker walking the
// shortest route, stock leaving the shelf at each scan, bagging at the table, a real pigeon hole, the nearest
// waiting rider collecting from it and riding off. Every step is logged against the store clock, and the order
// sits pinned on the pendency TV while it runs.

import * as THREE from 'three'
import type { Slot, Store } from './model'
import type { P2 } from './nav'
import { clockText, mmss, SLA, type Order as TVOrder, type Pendency } from './pendency'
import type { People, Person, Step } from './people'
import type { Goods } from './scene/goods'

export interface Line { slot: Slot; qty: number; before: number; picked: boolean }
export interface Event { t: number; text: string; kind: 'order' | 'pick' | 'bag' | 'ph' | 'rider' | 'done' }

export type Phase = 'assigned' | 'picking' | 'bagging' | 'in PH' | 'rider coming' | 'collected' | 'dispatched' | 'delivered'

export interface OrderRec {
  id: string
  lines: Line[]
  born: number
  phase: Phase
  events: Event[]
  picker: Person | null
  rider: Person | null
  ph: Slot | null
  o2d: number | null
  /** Who the camera should follow right now. */
  actor: Person | null
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const pickOne = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]

export class OrderRun {
  readonly group = new THREE.Group()
  current: OrderRec | null = null
  private tv: TVOrder | null = null
  private marks: THREE.LineSegments[] = []
  private route: THREE.Line | null = null
  private phBag: THREE.Mesh | null = null
  onChange: (o: OrderRec) => void = () => {}

  constructor(private store: Store, private people: People, private goods: Goods, private feed: Pendency) {
    this.group.name = 'order'
  }

  private log(o: OrderRec, kind: Event['kind'], text: string) {
    o.events.push({ t: this.feed.now, text, kind })
    this.onChange(o)
  }

  start(): OrderRec | null {
    if (this.current && this.current.phase !== 'delivered') return this.current
    this.clear()
    const lines = this.makeLines()
    const ph = this.store.slots.find(s => s.kind === 'ph' && s.qty === 0 && s.level === 'B')
      ?? this.store.slots.find(s => s.kind === 'ph' && s.qty === 0)
    if (!lines.length || !ph) return null
    const id = this.feed.nextId
    const units = lines.reduce((a, l) => a + l.qty, 0)
    const o: OrderRec = { id, lines, born: this.feed.now, phase: 'assigned', events: [], picker: null, rider: null, ph, o2d: null, actor: null }
    this.current = o
    this.tv = this.feed.addLive(id, units)
    ph.qty = 1                                   // reserved
    this.log(o, 'order', `Order placed · ${lines.length} lines, ${units} units`)

    // Nearest free picker to the first line.
    const picker = this.people.nearest('picker', lines[0].slot.x, lines[0].slot.z)
    if (!picker) return null
    o.picker = picker
    o.actor = picker
    this.sequence(o, picker)
    this.log(o, 'order', `Assigned to picker ${picker.name}`)
    this.draw(o, picker)
    this.people.assign(picker, id, this.pickPlan(o, picker))
    return o
  }

  /** 3–5 lines: mostly ambient, one chiller, sometimes one HV; prefer bins where the pick will visibly empty the face. */
  private makeLines(): Line[] {
    const bins = this.store.slots.filter(s => s.kind === 'bin' && s.sku && s.qty >= 2)
    const small = bins.filter(s => s.qty <= 10)
    const from = (z: string) => {
      const pool = (Math.random() < 0.75 ? small : bins).filter(s => s.zone === z)
      return pool.length ? pickOne(pool) : pickOne(bins.filter(s => s.zone === z))
    }
    const picks: Slot[] = [from('chiller')]
    if (Math.random() < 0.35) picks.push(from('hv'))
    const n = 3 + Math.floor(Math.random() * 3)
    while (picks.length < n) {
      const s = from('ambient')
      if (!picks.includes(s)) picks.push(s)
    }
    return picks.filter(Boolean).map(slot => {
      const qty = Math.min(slot.qty, slot.zone === 'hv' ? 1 : 1 + Math.floor(Math.random() * 3))
      return { slot, qty, before: slot.qty, picked: false }
    })
  }

  private front(s: Slot, gap = 0.55): P2 {
    return [s.x + Math.sin(s.ry) * (s.d / 2 + gap), s.z + Math.cos(s.ry) * (s.d / 2 + gap)]
  }

  private pathLen(a: P2, b: P2) {
    const p = this.people.grid.path(a, b)
    if (!p) return Infinity
    let d = 0
    for (let i = 1; i < p.length; i++) d += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])
    return d
  }

  /** Nearest-neighbour pick sequence by walking distance, ending at the table. */
  private sequence(o: OrderRec, picker: Person) {
    const left = [...o.lines]
    const seq: Line[] = []
    let at: P2 = [picker.x, picker.z]
    while (left.length) {
      let bi = 0, bd = Infinity
      left.forEach((l, i) => { const d = this.pathLen(at, this.front(l.slot)); if (d < bd) { bd = d; bi = i } })
      const l = left.splice(bi, 1)[0]
      seq.push(l)
      at = this.front(l.slot)
    }
    o.lines = seq
  }

  private pickPlan(o: OrderRec, picker: Person): Step[] {
    const { loadX, faceLoad } = this.people.spots
    const ph = o.ph!
    const plan: Step[] = [{ kind: 'call', fn: () => { o.phase = 'picking'; this.feed.setStage(this.tv!, 'picking'); this.log(o, 'pick', `${picker.name} starts the pick walk`) } }]
    const crate: number[] = []
    o.lines.forEach((l, i) => {
      const s = l.slot
      plan.push({ kind: 'go', to: this.front(s), status: `Order ${o.id} · line ${i + 1}/${o.lines.length} · walking to ${s.code}` })
      plan.push({ kind: 'do', secs: rnd(1.6, 2.4), pose: s.y > 1.4 ? 'reach' : 'scan', yaw: Math.atan2(-Math.sin(s.ry), -Math.cos(s.ry)), status: `Order ${o.id} · scanning ${s.code}` })
      plan.push({ kind: 'call', fn: () => {
        s.qty -= l.qty
        l.picked = true
        this.goods.setBinQty(s)
        for (let k = 0; k < l.qty; k++) crate.push(s.sku!.color)
        picker.fig.setCrate(crate)
        this.marks[i].material = new THREE.LineBasicMaterial({ color: 0x22c55e, depthTest: false })
        this.log(o, 'pick', `Picked ${l.qty} × ${s.sku!.name} from ${s.code} · stock ${l.before} → ${s.qty}`)
      } })
    })
    plan.push({ kind: 'go', to: [loadX, ph.z], status: `Order ${o.id} · to the packing table` })
    plan.push({ kind: 'call', fn: () => { o.phase = 'bagging'; this.log(o, 'bag', 'At the packing table · bagging & sealing') } })
    plan.push({ kind: 'do', secs: rnd(5, 8), pose: 'pack', yaw: faceLoad, status: `Order ${o.id} · bagging & sealing` })
    plan.push({ kind: 'call', fn: () => { picker.fig.setCrate([]); picker.fig.setBag(true); this.log(o, 'bag', `Bag sealed & labelled ${o.id}`) } })
    plan.push({ kind: 'do', secs: rnd(1.5, 2.2), pose: 'reach', yaw: faceLoad, status: `Order ${o.id} · dropping at ${ph.code}` })
    plan.push({ kind: 'call', fn: () => {
      picker.fig.setBag(false)
      this.showBag(ph)
      o.phase = 'in PH'
      this.feed.setStage(this.tv!, 'ready')
      this.log(o, 'ph', `Dropped in ${ph.code} · waiting for a rider`)
      if (this.route) { this.group.remove(this.route); this.route = null }
      ;(picker as { busy: string | null }).busy = null
      picker.done++
      this.callRider(o)
    } })
    return plan
  }

  private callRider(o: OrderRec) {
    const ph = o.ph!
    const { collectX, faceCollect } = this.people.spots
    const rider = this.people.nearest('rider', collectX, ph.z)
    if (!rider) { this.log(o, 'rider', 'No rider free — waiting'); return }
    o.rider = rider
    o.actor = rider
    o.phase = 'rider coming'
    this.log(o, 'rider', `Rider ${rider.name} assigned`)
    const r = rider as Person & { bay: P2 | null; scooter: THREE.Object3D | null }
    const bay = r.bay ?? [rider.x, rider.z]
    const seat: P2 = [bay[0] + 0.3, bay[1]]
    this.people.assign(rider, o.id, [
      { kind: 'go', to: [collectX, ph.z], status: `Order ${o.id} · going in to ${ph.code}` },
      { kind: 'do', secs: rnd(1.4, 2), pose: 'scan', yaw: faceCollect, status: `Order ${o.id} · scanning ${ph.code}` },
      { kind: 'call', fn: () => this.log(o, 'rider', `${rider.name} scanned ${ph.code}`) },
      { kind: 'do', secs: rnd(1.2, 1.8), pose: 'reach', yaw: faceCollect, status: `Order ${o.id} · taking the bag` },
      { kind: 'call', fn: () => {
        this.hideBag(ph)
        rider.fig.setBag(true)
        o.phase = 'collected'
        this.log(o, 'rider', `Collected from ${ph.code}`)
      } },
      { kind: 'go', to: [bay[0] + 0.3, bay[1] + 0.55], status: `Order ${o.id} · back to the scooter` },
      { kind: 'call', fn: () => rider.fig.setBag(false) },                       // into the delivery bag
      { kind: 'do', secs: 1.5, pose: 'ride', yaw: -Math.PI / 2, at: seat, status: `Order ${o.id} · starting up` },
      { kind: 'call', fn: () => {
        o.phase = 'dispatched'
        o.o2d = this.feed.now - o.born
        this.feed.setStage(this.tv!, 'out')
        this.log(o, 'done', `Dispatched · order-to-dispatch ${mmss(o.o2d)} ${o.o2d <= SLA ? '✓ within' : '✗ over'} the ${SLA / 60}-min target`)
        this.clearMarks()
      } },
      { kind: 'drive', to: [bay[0] - 4, bay[1]], speed: 3, status: `Order ${o.id} · pulling out` },
      { kind: 'drive', to: [bay[0] - 4, bay[1] + 14], speed: 7, status: `Order ${o.id} · out for delivery` },
      { kind: 'call', fn: () => { rider.fig.root.visible = false; if (r.scooter) r.scooter.visible = false; o.actor = null; o.phase = 'delivered'; this.onChange(o) } },
      { kind: 'do', secs: 45, pose: 'stand', status: `Out for delivery · ${o.id}` },
      { kind: 'call', fn: () => {
        if (r.scooter) { r.scooter.position.set(bay[0], 0, bay[1]); r.scooter.rotation.y = -Math.PI / 2; r.scooter.visible = true }
        rider.fig.root.visible = true
        ;(rider as { busy: string | null }).busy = null
        rider.done++
      } },
      { kind: 'do', secs: 1, pose: 'ride', yaw: -Math.PI / 2, at: seat, status: 'Back in the rider bay' },
    ])
  }

  // ---- Floor marks: route and target bins ----------------------------------------------------------------
  private draw(o: OrderRec, picker: Person) {
    const pts: THREE.Vector3[] = []
    let at: P2 = [picker.x, picker.z]
    const stops: P2[] = [...o.lines.map(l => this.front(l.slot)), [this.people.spots.loadX, o.ph!.z]]
    for (const s of stops) {
      const p = this.people.grid.path(at, s) ?? [at, s]
      for (const q of p) pts.push(new THREE.Vector3(q[0], 0.04, q[1]))
      at = s
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts)
    this.route = new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0xff8a00, dashSize: 0.35, gapSize: 0.2, depthTest: false, transparent: true }))
    this.route.computeLineDistances()
    this.route.renderOrder = 9
    this.group.add(this.route)
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1))
    for (const l of o.lines) {
      const s = l.slot
      const m = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xff8a00, depthTest: false }))
      m.position.set(s.x, s.y, s.z); m.rotation.y = s.ry; m.scale.set(s.w * 1.06, s.h * 1.06, s.d * 1.06)
      m.renderOrder = 9
      this.marks.push(m)
      this.group.add(m)
    }
  }

  private clearMarks() {
    for (const m of this.marks) this.group.remove(m)
    this.marks = []
    if (this.route) { this.group.remove(this.route); this.route = null }
  }

  private showBag(ph: Slot) {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.24, Math.min(0.28, ph.h - 0.05), 0.16), new THREE.MeshStandardMaterial({ color: 0xc09562, roughness: 0.85 }))
    bag.position.set(ph.x, ph.y - ph.h / 2 + Math.min(0.28, ph.h - 0.05) / 2, ph.z)
    bag.rotation.y = ph.ry
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.06), new THREE.MeshBasicMaterial({ color: 0xffb000 }))
    tag.position.set(0, 0.05, 0.081)
    bag.add(tag)
    this.phBag = bag
    this.group.add(bag)
  }

  private hideBag(ph: Slot) {
    if (this.phBag) this.group.remove(this.phBag)
    this.phBag = null
    ph.qty = 0
  }

  /** Blinks the pick-list bins so they read from across the store. */
  update(t: number) {
    const k = 0.6 + 0.4 * Math.sin(t * 6)
    for (const m of this.marks) (m.material as THREE.LineBasicMaterial).opacity = k
    for (const m of this.marks) (m.material as THREE.LineBasicMaterial).transparent = true
  }

  clear() {
    this.clearMarks()
    if (this.phBag) this.group.remove(this.phBag)
    this.phBag = null
    this.current = null
  }
}

export const eventClock = clockText
