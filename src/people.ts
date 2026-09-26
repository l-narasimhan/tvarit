// The shift on the floor. Each person runs a plan of steps ("walk to", "do for n seconds"), refilled by their
// role when it runs out. There are no packers in a darkstore: pickers pick into a bag, seal it at the table and
// drop it in a pigeon hole; riders come in and collect straight from the pigeon hole; the store manager works the front
// desk and walks the floor; the ASM is visiting on an audit round.
//
// This is behaviour, not yet orders: M3 ties these walks to actual orders, stock and the pendency TV.

import * as THREE from 'three'
import type { Slot, Store } from './model'
import { NavGrid, type P2 } from './nav'
import { Figure, makeScooter, nameTag, type Pose, type Role } from './scene/figure'

type Step =
  | { kind: 'go'; to: P2; status: string; path?: P2[]; i?: number }
  | { kind: 'do'; secs: number; pose: Pose; status: string; yaw?: number; at?: P2 }

export interface Person {
  id: string
  name: string
  role: Role
  shift: string
  fig: Figure
  tag: THREE.Sprite
  status: string
  done: number
  doneLabel: string
  x: number
  z: number
  yaw: number
}

const NAMES: Record<Role, string[]> = {
  sm: ['Rajesh Kumar'],
  asm: ['Meera Iyer'],
  picker: ['Ravi', 'Sunita', 'Imran', 'Deepak', 'Kavya', 'Manoj', 'Pooja', 'Arjun', 'Farhan', 'Neha'],
  rider: ['Ajay', 'Sandeep', 'Rahul', 'Kiran', 'Salman', 'Gopal', 'Naveen', 'Tariq'],
}
const SPEED: Record<Role, number> = { sm: 1.1, asm: 1.0, picker: 1.3, rider: 1.2 }
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const pickOne = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]
const yawTo = (dx: number, dz: number) => Math.atan2(dx, dz)

class Agent implements Person {
  id: string
  tag: THREE.Sprite
  fig: Figure
  status = ''
  done = 0
  doneLabel = ''
  x = 0
  z = 0
  yaw = 0
  plan: Step[] = []
  pose: Pose = 'stand'
  constructor(public role: Role, public name: string, public shift: string, seed: number, private refill: (a: Agent) => void) {
    this.id = `${role}-${seed}`
    this.fig = new Figure(role, seed)
    this.tag = nameTag(name, role)
    this.fig.root.add(this.tag)
    this.fig.root.userData.person = this
  }

  place(x: number, z: number, yaw: number) { this.x = x; this.z = z; this.yaw = yaw; this.sync() }

  update(dt: number, nav: NavGrid) {
    if (!this.plan.length) this.refill(this)
    const s = this.plan[0]
    if (!s) return
    this.status = s.status
    if (s.kind === 'go') {
      s.path ??= nav.path([this.x, this.z], s.to) ?? [s.to]
      s.i ??= 0
      const target = s.path[s.i]
      const dx = target[0] - this.x, dz = target[1] - this.z, d = Math.hypot(dx, dz)
      const step = SPEED[this.role] * dt
      if (d <= step) {
        this.x = target[0]; this.z = target[1]
        if (++s.i >= s.path.length) this.plan.shift()
      } else {
        this.x += (dx / d) * step; this.z += (dz / d) * step
        this.turn(yawTo(dx, dz), dt)
      }
      this.pose = 'walk'
    } else {
      if (s.at) { this.x = s.at[0]; this.z = s.at[1]; s.at = undefined }
      if (s.yaw != null) this.turn(s.yaw, dt)
      this.pose = s.pose
      s.secs -= dt
      if (s.secs <= 0) this.plan.shift()
    }
    this.fig.pose(this.pose, dt, SPEED[this.role])
    this.sync()
  }

  private turn(to: number, dt: number) {
    let d = to - this.yaw
    d = Math.atan2(Math.sin(d), Math.cos(d))
    this.yaw += d * Math.min(1, dt * 8)
  }

  private sync() {
    this.fig.root.position.set(this.x, 0, this.z)
    this.fig.root.rotation.y = this.yaw
  }
}

export class People {
  readonly group = new THREE.Group()
  readonly list: Agent[] = []
  private nav: NavGrid
  private order = 48300

  constructor(private store: Store, counts = { picker: 8, rider: 6 }) {
    this.group.name = 'people'
    this.nav = new NavGrid(store)
    const bins = store.slots.filter(s => s.kind === 'bin' && s.qty > 0 && s.sku)
    const byZone = (z: string) => bins.filter(b => b.zone === z)
    const zoneBins = { ambient: byZone('ambient'), chiller: byZone('chiller'), hv: byZone('hv') }
    const ph = store.slots.filter(s => s.kind === 'ph')
    const pack = store.fixtures.find(f => f.kind === 'packing')
    const desk = store.fixtures.find(f => f.kind === 'desk')
    const ent = store.fixtures.find(f => f.kind === 'entrance')
    const pig = store.pigeon
    // Pigeon-hole faces: pickers load from the packing-table side, riders collect from the other.
    const tableSide = pig && pack ? Math.sign((pack.x0 + pack.x1) / 2 - pig.cx) || 1 : 1
    const loadX = pig ? (pack ? pack.x1 + 0.35 : pig.cx + tableSide * (pig.depth / 2 + 0.4)) : store.W / 2
    const collectX = pig ? pig.cx - tableSide * (pig.depth / 2 + 0.4) : store.W / 2
    const faceLoad = tableSide > 0 ? -Math.PI / 2 : Math.PI / 2, faceCollect = -faceLoad

    // Where a person stands to work a slot: just in front of its face.
    const front = (s: Slot, gap = 0.55): P2 => [s.x + Math.sin(s.ry) * (s.d / 2 + gap), s.z + Math.cos(s.ry) * (s.d / 2 + gap)]
    const facing = (s: Slot) => yawTo(-Math.sin(s.ry), -Math.cos(s.ry))

    // ---- Pickers ----
    const picker = (a: Agent) => {
      const id = `#${this.order++}`
      const n = 2 + Math.floor(Math.random() * 3)
      for (let k = 0; k < n; k++) {
        const r = Math.random()
        const s = pickOne(r < 0.7 ? zoneBins.ambient : r < 0.95 ? zoneBins.chiller : zoneBins.hv)
        a.plan.push({ kind: 'go', to: front(s), status: `Order ${id} · walking to ${s.code}` })
        a.plan.push({ kind: 'do', secs: rnd(2.5, 4), pose: s.y > 1.4 ? 'reach' : 'scan', yaw: facing(s), status: `Order ${id} · picking ${s.sku!.name} from ${s.code}` })
      }
      if (pig && ph.length) {
        const slot = pickOne(ph)
        // Bag and seal at the packing table, then post the bag into its pigeon hole across the table.
        a.plan.push({ kind: 'go', to: [loadX, slot.z], status: `Order ${id} · to the packing table` })
        a.plan.push({ kind: 'do', secs: rnd(4, 7), pose: 'pack', yaw: faceLoad, status: `Order ${id} · bagging & sealing` })
        a.plan.push({ kind: 'do', secs: rnd(1.5, 2.5), pose: 'reach', yaw: faceLoad, status: `Order ${id} · dropping at ${slot.code}` })
      }
      a.done++
    }
    this.spawn('picker', counts.picker, '07:00–15:00', picker, (a, i) => {
      const s = pickOne(zoneBins.ambient)
      const [x, z] = this.nav.nearestFree(...front(s)) ?? [store.W / 2, store.D / 2]
      a.place(x, z, facing(s)); a.doneLabel = 'orders picked'; a.done = 20 + i * 3
    })

    // ---- Riders: scooters parked nose-out in the bay ----
    const bays: P2[] = []
    if (ent) {
      const cz = (ent.z0 + ent.z1) / 2, z0 = cz - 6
      for (let z = z0 + 1.0; z < cz + 5.6; z += 1.0) bays.push([-7.7, z])
    }
    const pickBays = [1, 2, 4, 5, 7, 9, 3, 8].filter(i => i < bays.length)
    const rider = (a: Agent) => {
      const bay = (a as any).bay as P2
      const seat: P2 = [bay[0] + 0.3, bay[1]]
      if (Math.random() < 0.35) {
        const id = `#${this.order++}`
        const slot = pickOne(ph.length ? ph : [{ z: store.D / 2, code: 'PH' } as Slot])
        a.plan.push({ kind: 'go', to: [collectX, slot.z], status: `Going in to collect ${id} from ${slot.code}` })
        a.plan.push({ kind: 'do', secs: rnd(1.5, 2.5), pose: 'scan', yaw: faceCollect, status: `Scanning ${slot.code} · ${id}` })
        a.plan.push({ kind: 'do', secs: rnd(1.5, 2.5), pose: 'reach', yaw: faceCollect, status: `Taking ${id} from ${slot.code}` })
        a.plan.push({ kind: 'go', to: [bay[0] + 0.3, bay[1] + 0.55], status: `Back to scooter with ${id}` })
        a.plan.push({ kind: 'do', secs: rnd(2, 4), pose: 'ride', yaw: -Math.PI / 2, at: seat, status: `Leaving with ${id}` })
        a.done++
      } else {
        a.plan.push({ kind: 'do', secs: rnd(15, 40), pose: Math.random() < 0.5 ? 'ride' : 'phone', yaw: -Math.PI / 2, at: Math.random() < 0.5 ? seat : [bay[0] + 0.3, bay[1] + 0.55], status: 'In rider bay · waiting for an order' })
      }
    }
    this.spawn('rider', Math.min(counts.rider, pickBays.length), '11:00–23:00', rider, (a, i) => {
      const bay = bays[pickBays[i]]
      ;(a as any).bay = bay
      const sc = makeScooter(i)
      sc.position.set(bay[0], 0, bay[1]); sc.rotation.y = -Math.PI / 2
      this.group.add(sc)
      a.place(bay[0] + 0.3, bay[1], -Math.PI / 2); a.doneLabel = 'trips today'; a.done = 6 + i * 2
    })

    // ---- Store manager: front desk, with floor walks ----
    let chair: P2 = [1.1, 3]
    // The first seat at the desk, as fixtures.ts lays the chairs out.
    if (desk) chair = [(desk.x0 + desk.x1) / 2 - 0.7, (desk.z0 + desk.z1) / 2 + (desk.z1 - desk.z0 - 0.4) / 4]
    const sm = (a: Agent) => {
      a.plan.push({ kind: 'go', to: chair, status: 'Back to front desk' })
      a.plan.push({ kind: 'do', secs: rnd(35, 70), pose: 'sit', yaw: Math.PI / 2, at: chair, status: 'At front desk · watching pendency & WMS' })
      const stops: [P2, string][] = [[[loadX, pig ? pig.cz : store.D / 2], 'Checking bagging at the table'], [[collectX, pig ? pig.cz : store.D / 2], 'Checking pigeon holes & dispatch'], [[store.W * 0.5, store.D * 0.3], 'Floor walk · aisle check']]
      const [to, what] = pickOne(stops)
      a.plan.push({ kind: 'go', to, status: `Floor walk · heading to ${what.split(' · ').pop()!.toLowerCase()}` })
      a.plan.push({ kind: 'do', secs: rnd(6, 10), pose: 'stand', status: what })
      a.done++
    }
    this.spawn('sm', 1, '09:00–21:00', sm, a => { a.place(chair[0], chair[1], Math.PI / 2); a.doneLabel = 'floor walks' })

    // ---- ASM: visiting, on an audit round ----
    const doors = store.doors.filter(d => d.style !== 'front')
    const audit: [P2, string][] = [
      ...doors.map(d => [[d.axis === 'z' ? d.at - 0.8 : (d.a + d.b) / 2, d.axis === 'z' ? (d.a + d.b) / 2 : d.at + 0.8] as P2, d.style === 'cage' ? 'HV cage · stock count' : 'Chiller · temperature log'] as [P2, string]),
      ...store.slots.filter(s => s.kind === 'pallet').slice(0, 3).map(s => [[s.x, s.z + s.d / 2 + 0.6] as P2, `Bulk pallet ${s.code} · FIFO check`] as [P2, string]),
      [[collectX, pig ? pig.cz : store.D / 2], 'Pigeon holes · dispatch SLA review'],
      [[store.W * 0.6, store.D * 0.28], 'Aisle audit · planogram & stock-outs'],
    ]
    const asm = (a: Agent) => {
      const [to, what] = pickOne(audit)
      a.plan.push({ kind: 'go', to, status: `Visiting · walking to ${what.split(' · ')[0]}` })
      a.plan.push({ kind: 'do', secs: rnd(7, 12), pose: 'stand', status: `Visiting · ${what}` })
      a.done++
    }
    this.spawn('asm', 1, 'Visit 14:00–17:00', asm, a => {
      const p = ent ? [1.5, (ent.z0 + ent.z1) / 2] as P2 : [store.W / 2, 1] as P2
      a.place(p[0], p[1], Math.PI / 2); a.doneLabel = 'checks done'
    })
  }

  private spawn(role: Role, n: number, shift: string, refill: (a: Agent) => void, init: (a: Agent, i: number) => void) {
    for (let i = 0; i < n; i++) {
      const a = new Agent(role, NAMES[role][i % NAMES[role].length], shift, this.list.length * 7 + i, refill)
      init(a, i)
      this.list.push(a)
      this.group.add(a.fig.root)
    }
  }

  update(dt: number) { for (const a of this.list) a.update(dt, this.nav) }

  get hitMeshes() { return this.list.map(a => a.fig.hit) }
  byHit(o: THREE.Object3D): Person | null {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p.userData.person) return p.userData.person
    return null
  }
  setTags(on: boolean) { for (const a of this.list) a.tag.visible = on }
}
