// Scenario runs: knobs a person sets → an engine config → a full simulated day → the numbers to compare.
// Pure (no DOM), so it runs in a Web Worker and in Node alike.

import type { BinRow } from '../intake/bins'
import type { SheetLayout } from '../layout/schema'
import { buildStore } from '../model'
import { NavGrid } from '../nav'
import { DEFAULTS, Sim, type HourStat, type SimConfig } from '../sim/engine'

/** The knobs on the lab screen, in the units people think in. */
export interface Knobs {
  pickersDay: number        // 06:00–22:00
  pickersNight: number      // 22:00–06:00
  ridersMax: number         // cap on riders on shift
  riderHeadroom: number     // % more riders than trips need
  demandScale: number
  lorryTimes: string        // "01:00, 02:00, 03:00"
  casesPerLorry: number
  inboundMaxPickers: number
  grnCheckers: number
  inboundQueueMax: number
  pickLine: number          // seconds per line
  pickUnit: number          // seconds per unit
  bag: number               // seconds to bag and seal
  tripMin: number           // minutes
  tripMax: number
}

export const BASE: Knobs = {
  pickersDay: DEFAULTS.pickers, pickersNight: DEFAULTS.pickers, ridersMax: DEFAULTS.riders, riderHeadroom: DEFAULTS.riderHeadroom * 100,
  demandScale: 1, lorryTimes: '01:00, 02:00, 03:00', casesPerLorry: DEFAULTS.casesPerLorry,
  inboundMaxPickers: DEFAULTS.inboundMaxPickers, grnCheckers: DEFAULTS.grnCheckers, inboundQueueMax: DEFAULTS.inboundQueueMax,
  pickLine: DEFAULTS.pickBase, pickUnit: DEFAULTS.pickPerUnit, bag: DEFAULTS.bagBase, tripMin: DEFAULTS.tripMin / 60, tripMax: DEFAULTS.tripMax / 60,
}

export function toConfig(k: Knobs): Partial<SimConfig> {
  const times = k.lorryTimes.split(/[,\s]+/).filter(Boolean).map(t => {
    const [h, m = '0'] = t.split(':')
    return Number(h) * 3600 + Number(m) * 60
  }).filter(Number.isFinite)
  return {
    pickers: Math.max(k.pickersDay, k.pickersNight),
    pickerRoster: Array.from({ length: 24 }, (_, h) => (h >= 6 && h < 22 ? k.pickersDay : k.pickersNight)),
    riders: k.ridersMax, riderHeadroom: k.riderHeadroom / 100, demandScale: k.demandScale,
    inboundTimes: times, casesPerLorry: k.casesPerLorry,
    inboundMaxPickers: k.inboundMaxPickers, grnCheckers: k.grnCheckers, inboundQueueMax: k.inboundQueueMax,
    pickBase: k.pickLine, pickPerUnit: k.pickUnit, bagBase: k.bag, tripMin: k.tripMin * 60, tripMax: Math.max(k.tripMin, k.tripMax) * 60,
  }
}

export interface Kpi {
  orders: number
  o2d: number
  p90: number
  sla: number               // share within the target
  worstHour: number
  worstO2D: number
  maxOpen: number
  pickerUtil: number
  riderUtil: number
  inboundDone: number       // seconds after midnight the last case went on a shelf (0 = no inbound)
  inboundCases: number
  stockouts: number
}
export interface DayResult { seed: number; kpi: Kpi; hours: HourStat[] }

export function runDay(layout: SheetLayout, bins: BinRow[] | null, cfg: Partial<SimConfig>, seed: number): DayResult {
  const store = buildStore(layout, bins ?? undefined)
  const sim = new Sim(store, new NavGrid(store), { ...cfg, seed }, 0)
  sim.advance(86400)
  const hours = sim.hours.slice(0, 24)
  const d = sim.done
  const o2ds = d.map(o => o.tOut! - o.t0).sort((a, b) => a - b)
  let worstHour = 0, worstO2D = 0
  hours.forEach((h, i) => { const a = h.orders >= 10 ? h.o2d / h.orders : 0; if (a > worstO2D) { worstO2D = a; worstHour = i } })
  const sum = (f: (h: HourStat) => number) => hours.reduce((a, h) => a + f(h), 0)
  return {
    seed, hours,
    kpi: {
      orders: d.length,
      o2d: o2ds.length ? o2ds.reduce((a, b) => a + b, 0) / o2ds.length : 0,
      p90: o2ds.length ? o2ds[Math.floor(o2ds.length * 0.9)] : 0,
      sla: d.length ? sim.slaHit(d) : 1,
      worstHour, worstO2D,
      maxOpen: Math.max(0, ...hours.map(h => h.maxOpen)),
      pickerUtil: sum(h => h.pickerBusy) / Math.max(1, sum(h => h.pickerOn)),
      riderUtil: sum(h => h.riderBusy) / Math.max(1, sum(h => h.riderOn)),
      inboundDone: sim.cases.length ? sim.lastPutaway : 0,
      inboundCases: sim.cases.length,
      stockouts: sim.stockouts,
    },
  }
}
