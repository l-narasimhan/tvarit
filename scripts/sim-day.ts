// Headless: run a full store day and print the hour-by-hour result. Same seed → same day.
//   npx tsx scripts/sim-day.ts [seed] [pickers] [riders]
import { STORE01 } from '../src/layout/store01'
import { buildStore } from '../src/model'
import { NavGrid } from '../src/nav'
import { Sim, fmt } from '../src/sim/engine'

export function runDay(seed: number, pickers: number, riders: number) {
  const store = buildStore(STORE01)
  const sim = new Sim(store, new NavGrid(store), { seed, pickers, riders }, 0)
  const rows: string[] = []
  let digest = 0
  for (let h = 0; h < 24; h++) {
    const before = sim.done.length
    let peak = 0
    for (let m = 0; m < 60; m++) { sim.advance(60); peak = Math.max(peak, sim.open.length) }
    const hour = sim.done.slice(before)
    const util = sim.workers.filter(w => w.role === 'picker').reduce((a, w) => a + w.busyTime, 0) / (pickers * (h + 1) * 3600)
    rows.push(`${String(h).padStart(2, '0')}:00  ${String(hour.length).padStart(3)} orders  O2D ${fmt(sim.o2d(hour))}  ≤2min ${String(Math.round(sim.slaHit(hour) * 100)).padStart(3)}%  peak open ${String(peak).padStart(2)}  picker util(cum) ${Math.round(util * 100)}%`)
    for (const o of hour) digest = (digest * 31 + Math.round(o.tOut! * 10)) >>> 0
  }
  return { sim, rows, digest }
}

const [seed = 1, pickers = 8, riders = 28] = process.argv.slice(2).map(Number)
const t0 = performance.now()
const a = runDay(seed, pickers, riders)
const ms = performance.now() - t0
console.log(a.rows.join('\n'))
const all = a.sim.done
console.log(`\nDay: ${all.length} orders · O2D ${fmt(a.sim.o2d(all))} · ≤2min ${Math.round(a.sim.slaHit(all) * 100)}% · stock-outs ${a.sim.stockouts} · ran in ${(ms / 1000).toFixed(1)} s`)
const b = runDay(seed, pickers, riders)
console.log(`Deterministic: ${a.digest === b.digest ? 'yes' : 'NO'} (digest ${a.digest})`)
