// Order pendency, as the store TV shows it. Until the order sim (M3/M4) exists this is a small stand-in: orders
// arrive at a q-commerce rate and move through the real stages with realistic stage times, so every number on
// the screen agrees with every other. Marked "simulated" on screen.

export type Stage = 'queued' | 'picking' | 'ready' | 'out'
export const STAGES: Stage[] = ['queued', 'picking', 'ready']
export const STAGE_NAME: Record<Stage, string> = { queued: 'To pick', picking: 'Picking & bagging', ready: 'In pigeon hole', out: 'Dispatched' }

export interface Order { id: string; born: number; items: number; stage: Stage; until: number; done?: number }

/** Promise to the customer is 10 min door-to-door; the store's share is dispatch within 8 min of order. */
export const SLA = 8 * 60

export class Pendency {
  orders: Order[] = []
  dispatched: Order[] = []
  private t = 0
  private next = 1
  private seq = 48213

  constructor(public pickers = 8, public riders = 6) {
    // Warm up so the screen opens mid-shift, not empty.
    for (let i = 0; i < 900; i++) this.tick(1)
  }

  get now() { return this.t }

  tick(dt: number) {
    this.t += dt
    // Arrivals: ~1 order / 25 s, with evening-peak bursts.
    this.next -= dt
    while (this.next <= 0) {
      const peak = 1 + 0.8 * Math.max(0, Math.sin(this.t / 240))
      this.next += (-Math.log(1 - Math.random()) * 25) / peak
      const items = 1 + Math.floor(-Math.log(1 - Math.random()) * 5)
      this.orders.push({ id: `#${this.seq++}`, born: this.t, items, stage: 'queued', until: this.t + 20 + Math.random() * 60 })
    }
    const busy = (s: Stage) => this.orders.filter(o => o.stage === s).length
    for (const o of this.orders) {
      if (this.t < o.until) continue
      // Pickers pick, bag and drop in the pigeon hole; a rider then collects from the pigeon hole.
      if (o.stage === 'queued' && busy('picking') < this.pickers) { o.stage = 'picking'; o.until = this.t + 60 + o.items * (14 + Math.random() * 10) }
      else if (o.stage === 'picking') { o.stage = 'ready'; o.until = this.t + 20 + Math.random() * 150 }
      else if (o.stage === 'ready') { o.stage = 'out'; o.done = this.t }
    }
    for (const o of this.orders.filter(o => o.stage === 'out')) this.dispatched.push(o)
    this.orders = this.orders.filter(o => o.stage !== 'out')
    this.dispatched = this.dispatched.filter(o => this.t - o.done! < 3600)
  }

  count(s: Stage) { return this.orders.filter(o => o.stage === s).length }
  age(o: Order) { return this.t - o.born }
  breaching() { return this.orders.filter(o => this.age(o) > SLA).length }
  atRisk() { return this.orders.filter(o => this.age(o) > SLA * 0.75 && this.age(o) <= SLA).length }
  oldest(n: number) { return [...this.orders].sort((a, b) => a.born - b.born).slice(0, n) }
  /** Mean order-to-dispatch over the last hour, seconds. */
  avgO2D() {
    const d = this.dispatched
    return d.length ? d.reduce((a, o) => a + (o.done! - o.born), 0) / d.length : 0
  }
  slaHit() {
    const d = this.dispatched
    return d.length ? d.filter(o => o.done! - o.born <= SLA).length / d.length : 1
  }
}

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
