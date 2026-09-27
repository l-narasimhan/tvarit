// What the pendency TV shows, read live from the simulation engine. (Until M4 this was a stand-in generator;
// now every number is the floor's own.)

import { clock, fmt, type SOrder, type Sim, type Stage as SimStage } from './sim/engine'

export type Stage = 'queued' | 'picking' | 'ready'
export const STAGES: Stage[] = ['queued', 'picking', 'ready']
export const STAGE_NAME: Record<Stage, string> = { queued: 'To pick', picking: 'Picking & bagging', ready: 'In pigeon hole' }
const GROUP: Record<SimStage, Stage | null> = { queued: 'queued', picking: 'picking', bagging: 'picking', ready: 'ready', collecting: 'ready', out: null }

export interface TVOrder { id: string; items: number; stage: Stage; live: boolean; age: number }

export class Pendency {
  /** The order being traced on screen, pinned to the top of the TV list. */
  trace: SOrder | null = null
  constructor(readonly sim: Sim) {}

  get now() { return this.sim.t }
  get sla() { return this.sim.cfg.sla }
  get pickers() { return this.sim.cfg.pickers }
  get riders() { return this.sim.cfg.riders }
  get open() { return this.sim.open.length }
  count(s: Stage) { return this.sim.open.filter(o => GROUP[o.stage] === s).length }
  breaching() { return this.sim.open.filter(o => this.sim.age(o) > this.sla).length }
  atRisk() { return this.sim.open.filter(o => { const a = this.sim.age(o); return a > this.sla * 0.75 && a <= this.sla }).length }
  lastHour() { return this.sim.recent(3600) }
  avgO2D() { return this.sim.o2d(this.lastHour()) }
  slaHit() { return this.sim.slaHit(this.lastHour()) }
  pickersBusy() { return this.sim.pickersBusy() }
  ridersIn() { return this.sim.ridersIn() }
  ridersOnShift() { return this.sim.ridersOnShift() }

  /** The traced order first, then the oldest open orders. */
  oldest(n: number): TVOrder[] {
    const list = [...this.sim.open].sort((a, b) => Number(b === this.trace) - Number(a === this.trace) || a.t0 - b.t0)
    return list.slice(0, n).map(o => ({ id: o.id, items: o.units, stage: GROUP[o.stage] ?? 'ready', live: o === this.trace, age: this.sim.age(o) }))
  }
}

export const clockText = clock
export const mmss = fmt
