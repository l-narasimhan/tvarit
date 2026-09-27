// The darkstore simulation engine. Pure TypeScript: no rendering, no DOM, no wall clock. It owns time, runs in
// fixed 0.2 s steps, and draws every random number from one seeded stream, so the same config and seed always
// produce the same day — which is what makes two scenarios comparable. The 3D view only reads it.
//
// The floor it runs on is the store model: real bins, real walking paths (NavGrid), real pigeon holes, the real
// rider bay. Flow, per Store 01 practice: an order arrives → the longest-idle picker takes it → walks the lines
// in nearest-first order, scanning each bin → bags and seals at the packing table → drops the bag in a free
// pigeon hole → the longest-waiting rider walks in, scans the pigeon hole, takes it (that is dispatch) → rides
// out for the delivery trip and comes back to the bay. There are no packers.

import type { Slot, Store } from '../model'
import { NavGrid, type P2 } from '../nav'
import { rng } from '../rng'

// ---- Config --------------------------------------------------------------------------------------------------

export interface SimConfig {
  seed: number
  /** Orders per hour, hour 0 … 23. */
  demand: number[]
  /** Demand multiplier, for peak-day scenarios. */
  demandScale: number
  pickers: number
  riders: number
  /** Order-to-dispatch target, seconds. */
  sla: number
  /** Mean lines per order. */
  linesMean: number
  walk: number            // picker walking speed, m/s
  riderWalk: number
  pickBase: number        // seconds per line: locate, scan bin
  pickPerUnit: number     // seconds per unit: pick, scan item, into crate
  hvGate: number          // seconds to unlock and enter the HV cage
  bagBase: number         // seconds to bag, seal and label
  bagPerUnit: number
  drop: number            // seconds to post the bag into the pigeon hole
  riderScan: number       // seconds for a rider to scan the pigeon hole and take the bag
  tripMin: number         // delivery round trip, seconds
  tripMax: number
  /** Lorry arrival times, seconds after midnight. */
  inboundTimes: number[]
  casesPerLorry: number
  caseUnits: number       // units per case (capped by the bin's free space)
  unloadPick: number      // seconds to take a case off the tail
  unloadCarry: number     // cases carried per unloading trip
  grnScan: number         // seconds to scan a case in at GRN
  putBase: number         // seconds per bin at putaway: locate, scan bin
  putPerUnit: number      // seconds per unit placed
  putawayBatch: number    // cases a picker carries per putaway trip
  /** Most pickers on inbound work at once; the rest stay free for orders. */
  inboundMaxPickers: number
  /** Pickers only take inbound work when this many orders or fewer are waiting for a picker. */
  inboundQueueMax: number
}

/** A non-heavy darkstore: 60–80 orders an hour in the day, a trickle overnight, 2-minute O2D target. */
export const DEFAULTS: SimConfig = {
  seed: 1,
  demand: [18, 12, 8, 6, 6, 8, 20, 40, 60, 62, 58, 60, 66, 64, 60, 58, 62, 70, 76, 80, 80, 72, 50, 30],
  demandScale: 1,
  pickers: 8,
  riders: 28,
  sla: 120,
  linesMean: 4,
  walk: 1.3,
  riderWalk: 1.25,
  pickBase: 4,
  pickPerUnit: 1.5,
  hvGate: 8,
  bagBase: 7,
  bagPerUnit: 0.6,
  drop: 3,
  riderScan: 4,
  tripMin: 15 * 60,
  tripMax: 25 * 60,
  inboundTimes: [1 * 3600, 2 * 3600, 3 * 3600],
  casesPerLorry: 90,
  caseUnits: 12,
  unloadPick: 3,
  unloadCarry: 2,
  grnScan: 5,
  putBase: 5,
  putPerUnit: 0.4,
  putawayBatch: 3,
  inboundMaxPickers: 6,
  inboundQueueMax: 0,
}

// ---- Model ---------------------------------------------------------------------------------------------------

export type Stage = 'queued' | 'picking' | 'bagging' | 'ready' | 'collecting' | 'out'
export type Act = 'idle' | 'walk' | 'scan' | 'reach' | 'pack' | 'ride' | 'phone' | 'away'

export type CaseState = 'lorry' | 'unloading' | 'staged' | 'putaway' | 'done'
export interface Case { id: number; slot: Slot; units: number; color: number; state: CaseState; spot: number; lorry: Lorry }
export interface Lorry {
  id: string
  tArrive: number
  state: 'arriving' | 'docked' | 'leaving' | 'gone'
  x: number
  z: number
  yaw: number
  route: { to: P2; reverse: boolean; speed: number }[]
  cases: Case[]
  tDocked?: number
  tLeft?: number
}
export interface OLine { slot: Slot; qty: number; before: number; picked: boolean }
export interface OEvent { t: number; kind: 'order' | 'pick' | 'bag' | 'ph' | 'rider' | 'done'; text: string }

export interface SOrder {
  id: string
  t0: number
  lines: OLine[]
  units: number
  stage: Stage
  picker: Worker | null
  rider: Worker | null
  ph: Slot | null
  tAssign?: number
  tReady?: number
  tOut?: number
  events: OEvent[]
}

type Step =
  | { kind: 'go'; to: P2; status: string; path?: P2[]; i?: number }
  | { kind: 'do'; secs: number; act: Act; status: string; yaw?: number; at?: P2 }
  | { kind: 'call'; fn: () => void }
  | { kind: 'drive'; to: P2; speed: number; status: string }

export interface Worker {
  id: string
  role: 'picker' | 'rider'
  name: string
  x: number
  z: number
  yaw: number
  act: Act
  status: string
  order: SOrder | null
  plan: Step[]
  /** Colours of the units in the picking crate. */
  carry: number[]
  bag: boolean
  /** Colours of inbound cases being carried. */
  cases: number[]
  task: 'unload' | 'putaway' | null
  /** Walking back to the table with nothing to do: can be interrupted by work. */
  homing: boolean
  visible: boolean
  idleSince: number
  busyTime: number
  done: number
  home: P2
  bay: P2 | null
  scooter: { x: number; z: number; yaw: number; visible: boolean } | null
}

const PICKERS = ['Ravi', 'Sunita', 'Imran', 'Deepak', 'Kavya', 'Manoj', 'Pooja', 'Arjun', 'Farhan', 'Neha', 'Sameer', 'Divya']
const RIDERS = ['Ajay', 'Sandeep', 'Rahul', 'Kiran', 'Salman', 'Gopal', 'Naveen', 'Tariq', 'Vinod', 'Mahesh', 'Irfan', 'Sunil',
  'Prakash', 'Asif', 'Raju', 'Karthik', 'Dinesh', 'Yusuf', 'Harish', 'Babu', 'Sachin', 'Anil', 'Rohit', 'Feroz', 'Mukesh',
  'Sagar', 'Pradeep', 'Wasim', 'Lokesh', 'Venkat', 'Shiva', 'Manish', 'Javed']

const yawTo = (dx: number, dz: number) => Math.atan2(dx, dz)
export const STEP = 0.2

// ---- Engine --------------------------------------------------------------------------------------------------

export class Sim {
  t: number
  readonly cfg: SimConfig
  readonly workers: Worker[] = []
  /** Open orders, oldest first. */
  open: SOrder[] = []
  /** Dispatched orders. */
  done: SOrder[] = []
  stockouts = 0
  /** Seconds the pigeon-hole wall was full with a bag waiting to go in. */
  phFullWait = 0
  onPick: (s: Slot) => void = () => {}
  /** Inbound. */
  lorries: Lorry[] = []
  cases: Case[] = []
  /** GRN staging spots (floor positions) and how many cases each holds (stacked). */
  readonly spots: P2[] = []
  spotLoad: number[] = []
  private pendingIn = new Map<Slot, number>()
  private lorryDone = new Set<string>()
  private caseSeq = 1
  /** When the last case went onto a shelf. */
  lastPutaway = 0
  onPH: (s: Slot) => void = () => {}

  private rand: () => number
  private nextArrival: number
  private seq = 50001
  private paths = new Map<string, P2[]>()
  private weights: Record<string, { bins: Slot[]; cum: number[] }> = {}
  private ph: Slot[]
  private table: { loadX: number; collectX: number; faceLoad: number; faceCollect: number }

  constructor(readonly store: Store, readonly nav: NavGrid, cfg: Partial<SimConfig> = {}, startHour = 19) {
    this.cfg = { ...DEFAULTS, ...cfg }
    this.rand = rng(this.cfg.seed * 7919 + 17)
    this.t = startHour * 3600
    this.nextArrival = this.t + this.gap()
    this.ph = store.slots.filter(s => s.kind === 'ph')
    // Rows at waist height fill first.
    const rowPref = 'BCADE'
    this.ph.sort((a, b) => rowPref.indexOf(a.level) - rowPref.indexOf(b.level) || a.z - b.z)

    const pig = store.pigeon, pack = store.fixtures.find(f => f.kind === 'packing')
    const side = pig && pack ? Math.sign((pack.x0 + pack.x1) / 2 - pig.cx) || 1 : 1
    const loadX = pig ? (pack ? (side > 0 ? pack.x1 + 0.35 : pack.x0 - 0.35) : pig.cx + side * (pig.depth / 2 + 0.4)) : store.W / 2
    const collectX = pig ? pig.cx - side * (pig.depth / 2 + 0.4) : store.W / 2
    const faceLoad = side > 0 ? -Math.PI / 2 : Math.PI / 2
    this.table = { loadX, collectX, faceLoad, faceCollect: -faceLoad }

    // Popularity: within each zone, bins get a Zipf weight by a seeded rank — a few fast movers, a long tail.
    for (const zone of ['ambient', 'chiller', 'hv']) {
      const bins = store.slots.filter(s => s.kind === 'bin' && s.zone === zone && s.sku)
      for (let i = bins.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [bins[i], bins[j]] = [bins[j], bins[i]] }
      let c = 0
      const cum = bins.map((_, r) => (c += 1 / Math.pow(r + 1, 0.9)))
      this.weights[zone] = { bins, cum }
    }

    // GRN staging: a grid of floor spots in the inbound area, cases stacked up to four high.
    if (store.grn) {
      const g = store.grn, cols = 3, rows = 5
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
        this.spots.push([g.x0 + 0.6 + c * ((g.x1 - g.x0 - 1.2) / (cols - 1)), g.z0 + 0.6 + r * ((g.z1 - g.z0 - 1.2) / (rows - 1))])
      this.spotLoad = this.spots.map(() => 0)
    }

    // Pickers wait along the packing table; riders in the bay.
    const tz0 = pack ? pack.z0 + 0.5 : store.D / 2, tz1 = pack ? pack.z1 - 0.5 : store.D / 2
    for (let i = 0; i < this.cfg.pickers; i++) {
      const home: P2 = [loadX + 0.25, tz0 + ((i + 0.5) / this.cfg.pickers) * (tz1 - tz0)]
      this.workers.push(this.worker('picker', PICKERS[i % PICKERS.length], home, null))
    }
    const bays = store.riderBays
    for (let i = 0; i < this.cfg.riders; i++) {
      const bay = bays[i % Math.max(1, bays.length)] ?? [-6, store.D / 2]
      const w = this.worker('rider', RIDERS[i % RIDERS.length], [bay[0] + 0.3, bay[1]], bay)
      w.scooter = { x: bay[0], z: bay[1], yaw: -Math.PI / 2, visible: true }
      w.yaw = -Math.PI / 2
      w.act = i % 3 === 0 ? 'phone' : 'ride'
      if (w.act === 'phone') w.z += 0.55
      this.workers.push(w)
    }
  }

  private worker(role: Worker['role'], name: string, home: P2, bay: P2 | null): Worker {
    const n = this.workers.filter(w => w.role === role).length
    return {
      id: `${role}-${n}`, role, name, x: home[0], z: home[1], yaw: role === 'picker' ? this.table.faceLoad + Math.PI : 0,
      act: role === 'rider' ? 'ride' : 'idle', status: role === 'rider' ? 'In rider bay · waiting' : 'At the table · waiting for an order',
      order: null, plan: [], carry: [], bag: false, cases: [], task: null, homing: false, visible: true, idleSince: this.t, busyTime: 0, done: 0, home, bay, scooter: null,
    }
  }

  /** The number the next order will get. */
  get nextSeq() { return this.seq }

  // ---- Time ----
  get hour() { return Math.floor(this.t / 3600) % 24 }

  /** Runs `secs` of store time in fixed steps. */
  advance(secs: number) {
    const n = Math.round(secs / STEP)
    for (let i = 0; i < n; i++) this.step()
  }

  step() {
    this.t += STEP
    while (this.t >= this.nextArrival) { this.arrive(); this.nextArrival += this.gap() }
    this.inboundArrivals()
    this.dispatch()
    for (const w of this.workers) this.move(w)
    for (const l of this.lorries) this.drive(l)
  }

  private gap() {
    const rate = (this.cfg.demand[Math.floor(this.nextArrivalHour()) % 24] * this.cfg.demandScale) / 3600
    return -Math.log(1 - this.rand()) / Math.max(rate, 1e-4)
  }
  private nextArrivalHour() { return ((this.nextArrival ?? this.t) / 3600) }

  // ---- Orders ----
  private arrive() {
    const nLines = Math.min(10, 1 + this.poisson(this.cfg.linesMean - 1))
    const picks = new Set<Slot>()
    const lines: OLine[] = []
    const hv = this.rand() < 0.05
    for (let k = 0; k < nLines; k++) {
      const zone = hv && k === 0 ? 'hv' : this.rand() < 0.2 ? 'chiller' : 'ambient'
      const s = this.sample(zone, picks)
      if (!s) { this.stockouts++; continue }
      picks.add(s)
      const r = this.rand()
      const want = zone === 'hv' ? 1 : r < 0.7 ? 1 : r < 0.92 ? 2 : 3
      const qty = Math.min(want, s.qty)
      lines.push({ slot: s, qty, before: s.qty, picked: false })
    }
    if (!lines.length) return
    const o: SOrder = {
      id: `#${this.seq++}`, t0: this.t, lines, units: lines.reduce((a, l) => a + l.qty, 0),
      stage: 'queued', picker: null, rider: null, ph: null, events: [],
    }
    this.log(o, 'order', `Order placed · ${lines.length} line${lines.length > 1 ? 's' : ''}, ${o.units} unit${o.units > 1 ? 's' : ''}`)
    this.open.push(o)
  }

  private sample(zone: string, not: Set<Slot>): Slot | null {
    const w = this.weights[zone]
    if (!w?.bins.length) return null
    for (let tries = 0; tries < 12; tries++) {
      const r = this.rand() * w.cum[w.cum.length - 1]
      let lo = 0, hi = w.cum.length - 1
      while (lo < hi) { const mid = (lo + hi) >> 1; if (w.cum[mid] < r) lo = mid + 1; else hi = mid }
      const s = w.bins[lo]
      if (s.qty > 0 && !not.has(s)) return s
    }
    return null
  }

  private poisson(mean: number) {
    const L = Math.exp(-mean)
    let k = 0, p = 1
    do { k++; p *= this.rand() } while (p > L)
    return k - 1
  }

  private log(o: SOrder, kind: OEvent['kind'], text: string) { o.events.push({ t: this.t, kind, text }) }

  // ---- Dispatch: oldest order to the longest-idle picker; ready bags to the longest-waiting rider ----
  private dispatch() {
    const idle = (role: Worker['role']) => this.workers
      .filter(w => w.role === role && !w.order && !w.task && (!w.plan.length || w.homing))
      .sort((a, b) => a.idleSince - b.idleSince)
    for (const o of this.open) {
      if (o.stage !== 'queued') continue
      const p = idle('picker')[0]
      if (!p) break
      this.assignPick(o, p)
    }
    for (const o of this.open) {
      if (o.stage !== 'ready' || o.rider) continue
      const r = idle('rider')[0]
      if (!r) break
      this.assignRider(o, r)
    }
    this.dispatchInbound(idle('picker'))
    // Anyone with nothing to do walks back to the table, where orders start.
    for (const w of this.workers) {
      if (w.role !== 'picker' || w.order || w.task || w.plan.length) continue
      if (Math.hypot(w.x - w.home[0], w.z - w.home[1]) > 1.5) {
        w.homing = true
        w.plan.push({ kind: 'go', to: w.home, status: 'Back to the table' }, { kind: 'call', fn: () => { w.homing = false; w.status = 'At the table · waiting for an order' } })
      }
    }
  }

  // ---- Inbound: lorries, unload + GRN, putaway ----
  private inboundArrivals() {
    const day = Math.floor(this.t / 86400)
    this.cfg.inboundTimes.forEach((at, i) => {
      const key = `${day}-${i}`
      const t = day * 86400 + at
      if (this.t >= t && this.t < t + 60 && !this.lorryDone.has(key) && this.store.dock) {
        this.lorryDone.add(key)
        this.newLorry(i + 1)
      }
    })
  }

  private newLorry(n: number) {
    const d = this.store.dock!
    const l: Lorry = {
      id: `L${n}`, tArrive: this.t, state: 'arriving', x: -11, z: d.z - 30, yaw: 0, cases: [],
      route: [
        { to: [-11, d.z - 8], reverse: false, speed: 6 },
        { to: [d.x, d.z - 8], reverse: false, speed: 3 },
        { to: [d.x, d.z], reverse: true, speed: 1.2 },
      ],
    }
    // What the lorry brings: a case for each of the emptiest bins, as the replenishment order would.
    const need = this.store.slots
      .filter(s => s.kind === 'bin' && s.sku)
      .map(s => ({ s, free: s.cap - s.qty - (this.pendingIn.get(s) ?? 0) }))
      .filter(x => x.free >= Math.min(6, x.s.cap / 2))
      .sort((a, b) => (a.s.qty + (this.pendingIn.get(a.s) ?? 0)) / a.s.cap - (b.s.qty + (this.pendingIn.get(b.s) ?? 0)) / b.s.cap)
      .slice(0, this.cfg.casesPerLorry)
    for (const { s, free } of need) {
      const units = Math.min(this.cfg.caseUnits, free)
      this.pendingIn.set(s, (this.pendingIn.get(s) ?? 0) + units)
      l.cases.push({ id: this.caseSeq++, slot: s, units, color: s.sku!.color, state: 'lorry', spot: -1, lorry: l })
    }
    this.cases.push(...l.cases)
    this.lorries.push(l)
  }

  private drive(l: Lorry) {
    const leg = l.route[0]
    if (!leg) {
      if (l.state === 'arriving') { l.state = 'docked'; l.tDocked = this.t }
      else if (l.state === 'leaving') l.state = 'gone'
      else if (l.state === 'docked' && l.cases.every(c => c.state !== 'lorry' && c.state !== 'unloading')) {
        l.state = 'leaving'; l.tLeft = this.t
        l.route = [{ to: [l.x, l.z - 8], reverse: false, speed: 2 }, { to: [-11, l.z - 8], reverse: false, speed: 4 }, { to: [-11, l.z - 40], reverse: false, speed: 7 }]
      }
      return
    }
    const dx = leg.to[0] - l.x, dz = leg.to[1] - l.z, d = Math.hypot(dx, dz), step = leg.speed * STEP
    if (d <= step) { l.x = leg.to[0]; l.z = leg.to[1]; l.route.shift() }
    else {
      l.x += (dx / d) * step; l.z += (dz / d) * step
      l.yaw = leg.reverse ? yawTo(-dx, -dz) : yawTo(dx, dz)
    }
  }

  private dispatchInbound(idle: Worker[]) {
    if (!this.spots.length) return
    if (this.open.filter(o => o.stage === 'queued').length > this.cfg.inboundQueueMax) return
    let busy = this.workers.filter(w => w.task).length
    for (const w of idle) {
      if (busy >= this.cfg.inboundMaxPickers) break
      if (w.homing) { w.plan = []; w.homing = false }
      const dock = this.lorries.find(l => l.state === 'docked' && l.cases.some(c => c.state === 'lorry'))
      const spot = this.spotLoad.findIndex(n => n < 4)
      if (dock && spot >= 0) { this.assignUnload(w, dock, spot); busy++; continue }
      if (this.cases.some(c => c.state === 'staged')) { this.assignPutaway(w); busy++; continue }
      break
    }
  }

  private assignUnload(w: Worker, l: Lorry, spot: number) {
    const room = 4 - this.spotLoad[spot]
    const batch = l.cases.filter(c => c.state === 'lorry').slice(0, Math.min(room, this.cfg.unloadCarry))
    const d = this.store.dock!
    for (const c of batch) { c.state = 'unloading'; c.spot = spot }
    this.spotLoad[spot] += batch.length
    w.task = 'unload'
    const at = this.spots[spot]
    const n = batch.length
    w.plan.push(
      { kind: 'go', to: d.tail, status: `Inbound · to lorry ${l.id}` },
      { kind: 'do', secs: this.cfg.unloadPick * n, act: 'reach', yaw: Math.PI, status: `Inbound · unloading ${n} case${n > 1 ? 's' : ''} from lorry ${l.id}` },
      { kind: 'call', fn: () => { w.cases = batch.map(c => c.color) } },
      { kind: 'go', to: at, status: `Inbound · carrying ${n} case${n > 1 ? 's' : ''} to GRN` },
      { kind: 'do', secs: this.cfg.grnScan * n, act: 'scan', status: `GRN · scanning ${n} case${n > 1 ? 's' : ''} in` },
      { kind: 'call', fn: () => { w.cases = []; for (const c of batch) c.state = 'staged'; w.task = null; w.idleSince = this.t; w.done++ } },
    )
  }

  private assignPutaway(w: Worker) {
    const staged = this.cases.filter(c => c.state === 'staged')
    const first = staged[0]
    const rest = staged.slice(1).sort((a, b) =>
      Math.hypot(a.slot.x - first.slot.x, a.slot.z - first.slot.z) - Math.hypot(b.slot.x - first.slot.x, b.slot.z - first.slot.z))
    const batch = [first, ...rest.slice(0, this.cfg.putawayBatch - 1)]
    for (const c of batch) c.state = 'putaway'
    w.task = 'putaway'
    // Collect from the staging spots, then put away nearest-first.
    w.plan.push({ kind: 'go', to: this.spots[first.spot], status: `Putaway · collecting ${batch.length} case${batch.length > 1 ? 's' : ''} from GRN` })
    w.plan.push({ kind: 'do', secs: 2 + batch.length, act: 'reach', status: 'Putaway · loading cases' })
    w.plan.push({ kind: 'call', fn: () => { for (const c of batch) this.spotLoad[c.spot]--; w.cases = batch.map(c => c.color) } })
    const left = [...batch]
    let at: P2 = this.spots[first.spot]
    while (left.length) {
      let bi = 0, bd = Infinity
      left.forEach((c, i) => { const f = this.front(c.slot); const d = Math.hypot(f[0] - at[0], f[1] - at[1]); if (d < bd) { bd = d; bi = i } })
      const c = left.splice(bi, 1)[0]
      at = this.front(c.slot)
      w.plan.push({ kind: 'go', to: at, status: `Putaway · to ${c.slot.code}` })
      w.plan.push({ kind: 'do', secs: this.cfg.putBase + this.cfg.putPerUnit * c.units, act: c.slot.y > 1.4 ? 'reach' : 'scan', yaw: this.facing(c.slot), status: `Putaway · ${c.units} × ${c.slot.sku!.name} into ${c.slot.code}` })
      w.plan.push({ kind: 'call', fn: () => {
        c.slot.qty = Math.min(c.slot.cap, c.slot.qty + c.units)
        this.pendingIn.set(c.slot, Math.max(0, (this.pendingIn.get(c.slot) ?? 0) - c.units))
        c.state = 'done'
        this.lastPutaway = this.t
        w.cases = w.cases.slice(0, -1)
        this.onPick(c.slot)
      } })
    }
    w.plan.push({ kind: 'call', fn: () => { w.task = null; w.idleSince = this.t; w.done++ } })
  }

  private front(s: Slot, gap = 0.55): P2 {
    return [s.x + Math.sin(s.ry) * (s.d / 2 + gap), s.z + Math.cos(s.ry) * (s.d / 2 + gap)]
  }
  private facing(s: Slot) { return yawTo(-Math.sin(s.ry), -Math.cos(s.ry)) }

  private assignPick(o: SOrder, p: Worker) {
    if (p.homing) { p.plan = []; p.homing = false }
    o.stage = 'picking'; o.picker = p; o.tAssign = this.t
    p.order = o
    this.log(o, 'order', `Assigned to ${p.name}`)
    // Nearest-first by straight-line distance from wherever the picker is.
    const left = [...o.lines], seq: OLine[] = []
    let at: P2 = [p.x, p.z]
    while (left.length) {
      let bi = 0, bd = Infinity
      left.forEach((l, i) => { const f = this.front(l.slot); const d = Math.hypot(f[0] - at[0], f[1] - at[1]); if (d < bd) { bd = d; bi = i } })
      const l = left.splice(bi, 1)[0]
      seq.push(l); at = this.front(l.slot)
    }
    o.lines = seq
    const c = this.cfg
    let hvDone = false
    p.plan.push({ kind: 'call', fn: () => this.log(o, 'pick', `${p.name} starts the pick walk`) })
    seq.forEach((l, i) => {
      const s = l.slot
      p.plan.push({ kind: 'go', to: this.front(s), status: `Order ${o.id} · line ${i + 1}/${seq.length} · to ${s.code}` })
      if (s.zone === 'hv' && !hvDone) {
        hvDone = true
        p.plan.push({ kind: 'do', secs: c.hvGate, act: 'scan', yaw: this.facing(s), status: `Order ${o.id} · unlocking the HV cage` })
      }
      p.plan.push({ kind: 'do', secs: c.pickBase + c.pickPerUnit * l.qty, act: s.y > 1.4 ? 'reach' : 'scan', yaw: this.facing(s), status: `Order ${o.id} · picking ${l.qty} × ${s.sku!.name} at ${s.code}` })
      p.plan.push({ kind: 'call', fn: () => {
        l.before = s.qty
        s.qty = Math.max(0, s.qty - l.qty)
        l.picked = true
        for (let k = 0; k < l.qty; k++) p.carry.push(s.sku!.color)
        this.onPick(s)
        this.log(o, 'pick', `Picked ${l.qty} × ${s.sku!.name} from ${s.code} · stock ${l.before} → ${s.qty}`)
      } })
    })
    p.plan.push({ kind: 'call', fn: () => this.toTable(o, p) })
  }

  /** Reserve the free pigeon hole nearest the picker, walk to the table in front of it, bag, drop. */
  private toTable(o: SOrder, p: Worker) {
    const free = this.ph.filter(s => s.qty === 0)
    if (!free.length) {
      p.plan.unshift({ kind: 'do', secs: 3, act: 'idle', status: `Order ${o.id} · pigeon holes full, waiting` }, { kind: 'call', fn: () => this.toTable(o, p) })
      this.phFullWait += 3
      return
    }
    // Prefer waist-height rows, then the nearest along the wall.
    const ph = free.slice(0, 40).sort((a, b) => Math.abs(a.z - p.z) - Math.abs(b.z - p.z))[0]
    ph.qty = 1                                                         // reserved
    o.ph = ph
    const { loadX, faceLoad } = this.table
    const c = this.cfg
    p.plan.unshift(
      { kind: 'go', to: [loadX, ph.z], status: `Order ${o.id} · to the packing table` },
      { kind: 'call', fn: () => { o.stage = 'bagging'; this.log(o, 'bag', 'At the table · bagging & sealing') } },
      { kind: 'do', secs: c.bagBase + c.bagPerUnit * o.units, act: 'pack', yaw: faceLoad, status: `Order ${o.id} · bagging & sealing` },
      { kind: 'call', fn: () => { p.carry = []; p.bag = true } },
      { kind: 'do', secs: c.drop, act: 'reach', yaw: faceLoad, status: `Order ${o.id} · dropping in ${ph.code}` },
      { kind: 'call', fn: () => {
        p.bag = false
        o.stage = 'ready'; o.tReady = this.t
        this.onPH(ph)
        this.log(o, 'ph', `In ${ph.code} · waiting for a rider`)
        p.order = null; p.done++; p.idleSince = this.t
        p.status = 'At the table · waiting for an order'
      } },
    )
  }

  private assignRider(o: SOrder, r: Worker) {
    const ph = o.ph!, bay = r.bay!
    const { collectX, faceCollect } = this.table
    o.rider = r; r.order = o
    this.log(o, 'rider', `Rider ${r.name} assigned`)
    const seat: P2 = [bay[0] + 0.3, bay[1]], stand: P2 = [bay[0] + 0.3, bay[1] + 0.55]
    const exit: P2 = [-11, bay[1]], road: P2 = [-11, bay[1] + 22]
    const trip = this.cfg.tripMin + this.rand() * (this.cfg.tripMax - this.cfg.tripMin)
    r.plan.push(
      { kind: 'go', to: [collectX, ph.z], status: `Order ${o.id} · going in to ${ph.code}` },
      { kind: 'call', fn: () => { o.stage = 'collecting' } },
      { kind: 'do', secs: this.cfg.riderScan, act: 'scan', yaw: faceCollect, status: `Order ${o.id} · scanning ${ph.code}` },
      { kind: 'call', fn: () => {
        ph.qty = 0
        this.onPH(ph)
        r.bag = true
        o.stage = 'out'; o.tOut = this.t
        this.open = this.open.filter(x => x !== o)
        this.done.push(o)
        const o2d = o.tOut - o.t0
        this.log(o, 'done', `Collected from ${ph.code} · dispatched · O2D ${fmt(o2d)} ${o2d <= this.cfg.sla ? '✓' : '✗'} (target ${fmt(this.cfg.sla)})`)
      } },
      { kind: 'go', to: stand, status: `Order ${o.id} · back to the scooter` },
      { kind: 'call', fn: () => { r.bag = false } },
      { kind: 'do', secs: 2, act: 'ride', yaw: -Math.PI / 2, at: seat, status: `Order ${o.id} · starting up` },
      { kind: 'drive', to: exit, speed: 3, status: `Order ${o.id} · pulling out` },
      { kind: 'drive', to: road, speed: 8, status: `Order ${o.id} · out for delivery` },
      { kind: 'call', fn: () => { r.visible = false; r.scooter!.visible = false } },
      { kind: 'do', secs: trip, act: 'away', status: `Out for delivery · ${o.id}` },
      { kind: 'call', fn: () => { r.visible = true; r.scooter!.visible = true; this.log(o, 'rider', `${r.name} back from delivery`) } },
      { kind: 'drive', to: exit, speed: 8, status: 'Returning to the store' },
      { kind: 'drive', to: [bay[0], bay[1]], speed: 3, status: 'Parking in the rider bay' },
      { kind: 'call', fn: () => {
        r.scooter!.yaw = -Math.PI / 2
        r.order = null; r.done++; r.idleSince = this.t
        r.act = 'ride'; r.x = seat[0]; r.z = seat[1]; r.yaw = -Math.PI / 2
        r.status = 'In rider bay · waiting'
      } },
    )
  }

  // ---- Movement ----
  private path(a: P2, b: P2): P2[] {
    const k = (p: P2) => `${Math.round(p[0] * 5)},${Math.round(p[1] * 5)}`
    const key = `${k(a)}>${k(b)}`
    let p = this.paths.get(key)
    if (!p) {
      p = this.nav.path(a, b) ?? [b]
      if (this.paths.size > 60000) this.paths.clear()
      this.paths.set(key, p)
    }
    return p
  }

  private move(w: Worker) {
    if (w.order || w.task) w.busyTime += STEP
    while (w.plan[0]?.kind === 'call') (w.plan.shift() as { fn: () => void }).fn()
    const s = w.plan[0]
    if (!s) { if (w.role === 'picker') w.act = 'idle'; return }
    w.status = s.status
    if (s.kind === 'go') {
      s.path ??= this.path([w.x, w.z], s.to)
      s.i ??= 0
      let budget = (w.role === 'rider' ? this.cfg.riderWalk : this.cfg.walk) * STEP
      while (budget > 0 && s.i < s.path.length) {
        const [tx, tz] = s.path[s.i]
        const dx = tx - w.x, dz = tz - w.z, d = Math.hypot(dx, dz)
        if (d <= budget) { w.x = tx; w.z = tz; budget -= d; s.i++ }
        else { w.x += (dx / d) * budget; w.z += (dz / d) * budget; w.yaw = yawTo(dx, dz); budget = 0 }
      }
      w.act = 'walk'
      if (s.i >= s.path.length) w.plan.shift()
    } else if (s.kind === 'drive') {
      const sc = w.scooter!
      const dx = s.to[0] - sc.x, dz = s.to[1] - sc.z, d = Math.hypot(dx, dz), step = s.speed * STEP
      if (d <= step) { sc.x = s.to[0]; sc.z = s.to[1]; w.plan.shift() }
      else { sc.x += (dx / d) * step; sc.z += (dz / d) * step; sc.yaw = yawTo(dx, dz) }
      w.yaw = sc.yaw
      w.x = sc.x - Math.sin(sc.yaw) * 0.3; w.z = sc.z - Math.cos(sc.yaw) * 0.3
      w.act = 'ride'
    } else {
      if (s.at) { w.x = s.at[0]; w.z = s.at[1]; s.at = undefined }
      if (s.yaw != null) w.yaw = s.yaw
      w.act = s.act
      s.secs -= STEP
      if (s.secs <= 0) w.plan.shift()
    }
  }

  // ---- Read-outs ----
  count(stages: Stage[]) { return this.open.filter(o => stages.includes(o.stage)).length }
  age(o: SOrder) { return (o.tOut ?? this.t) - o.t0 }
  /** Dispatched in the last `secs`. */
  recent(secs = 3600) { return this.done.filter(o => this.t - o.tOut! <= secs) }
  o2d(list: SOrder[]) { return list.length ? list.reduce((a, o) => a + (o.tOut! - o.t0), 0) / list.length : 0 }
  slaHit(list: SOrder[]) { return list.length ? list.filter(o => o.tOut! - o.t0 <= this.cfg.sla).length / list.length : 1 }
  ridersIn() { return this.workers.filter(w => w.role === 'rider' && !w.order).length }
  pickersBusy() { return this.workers.filter(w => w.role === 'picker' && (w.order || w.task)).length }
  inbound() {
    const n = (s: CaseState) => this.cases.filter(c => c.state === s).length
    return {
      lorry: this.lorries.find(l => l.state !== 'gone') ?? null,
      onLorry: n('lorry') + n('unloading'), staged: n('staged'), moving: n('putaway'), done: n('done'), total: this.cases.length,
      onInbound: this.workers.filter(w => w.task).length,
    }
  }
}

export const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
export const clock = (t: number) => {
  const d = ((t % 86400) + 86400) % 86400
  return `${String(Math.floor(d / 3600)).padStart(2, '0')}:${String(Math.floor(d / 60) % 60).padStart(2, '0')}:${String(Math.floor(d) % 60).padStart(2, '0')}`
}
