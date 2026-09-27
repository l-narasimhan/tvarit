// The scenario lab: two columns of knobs (A = today, B = the change), a run over several seeds each, the
// numbers side by side, hour-by-hour charts, and a way into 3D for any run.

import type { StoreRecord } from '../intake/registry'
import { clock, fmt, type HourStat } from '../sim/engine'
import { BASE, toConfig, type DayResult, type Knobs } from './run'

const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T
const A = '#3987e5', B = '#d95926'          // validated categorical slots 1–2 (dark), see dataviz check

type Field = { k: keyof Knobs; label: string; unit?: string; step?: number; group: string; text?: boolean }
const FIELDS: Field[] = [
  { group: 'Staffing', k: 'pickersDay', label: 'Pickers, day (06–22)', step: 1 },
  { group: 'Staffing', k: 'pickersNight', label: 'Pickers, night (22–06)', step: 1 },
  { group: 'Staffing', k: 'ridersMax', label: 'Riders, most on shift', step: 1 },
  { group: 'Staffing', k: 'riderHeadroom', label: 'Rider headroom over demand', unit: '%', step: 5 },
  { group: 'Demand', k: 'demandScale', label: 'Orders × normal day', unit: '×', step: 0.1 },
  { group: 'Inbound', k: 'lorryTimes', label: 'Lorries at', text: true },
  { group: 'Inbound', k: 'casesPerLorry', label: 'Cases per lorry', step: 5 },
  { group: 'Inbound', k: 'inboundMaxPickers', label: 'Most pickers on inbound', step: 1 },
  { group: 'Inbound', k: 'grnCheckers', label: 'GRN checkers', step: 1 },
  { group: 'Inbound', k: 'inboundQueueMax', label: 'Inbound only if orders waiting ≤', step: 1 },
  { group: 'Work times', k: 'pickLine', label: 'Pick, per line', unit: 's', step: 0.5 },
  { group: 'Work times', k: 'pickUnit', label: 'Pick, per unit', unit: 's', step: 0.1 },
  { group: 'Work times', k: 'bag', label: 'Bag & seal', unit: 's', step: 0.5 },
  { group: 'Work times', k: 'tripMin', label: 'Rider round trip, from', unit: 'min', step: 1 },
  { group: 'Work times', k: 'tripMax', label: 'Rider round trip, to', unit: 'min', step: 1 },
]

const PRESETS: [string, Partial<Knobs> | ((k: Knobs) => Partial<Knobs>)][] = [
  ['Weekend 1.5×', { demandScale: 1.5 }],
  ['Festival 2×', { demandScale: 2 }],
  ['Lean night (4 pickers)', { pickersNight: 4 }],
  ['Fewer riders (−25%)', k => ({ ridersMax: Math.round(k.ridersMax * 0.75) })],
  ['More riders (+25%)', k => ({ ridersMax: Math.round(k.ridersMax * 1.25), riderHeadroom: k.riderHeadroom + 25 })],
  ['Faster picking (−20%)', k => ({ pickLine: +(k.pickLine * 0.8).toFixed(1), pickUnit: +(k.pickUnit * 0.8).toFixed(2), bag: +(k.bag * 0.8).toFixed(1) })],
]

let record: StoreRecord
let knobs: Record<'A' | 'B', Knobs> = { A: { ...BASE }, B: { ...BASE } }
let results: Record<'A' | 'B', DayResult[]> = { A: [], B: [] }
let ranKnobs: Record<'A' | 'B', Knobs> | null = null

export function mountLab(rec: StoreRecord) {
  record = rec
  try { const saved = JSON.parse(localStorage.getItem(`tvarit.lab.${rec.name}`) ?? 'null'); if (saved) knobs = { A: { ...BASE, ...saved.A }, B: { ...BASE, ...saved.B } } } catch { /* fresh */ }
  $('#labopen').addEventListener('click', e => { (e.currentTarget as HTMLElement).blur(); openLab() })
  $('#lab-close').addEventListener('click', () => ($('#lab').hidden = true))
  $('#lab-run').addEventListener('click', run)
  $('#lab-reset').addEventListener('click', () => { knobs.B = { ...knobs.A }; renderKnobs() })
  $('#lab-3d').addEventListener('click', openIn3D)
  $('#lab-presets').innerHTML = PRESETS.map(([n], i) => `<button data-p="${i}">${n}</button>`).join('')
  $('#lab-presets').addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('button[data-p]') as HTMLElement | null
    if (!b) return
    const p = PRESETS[Number(b.dataset.p)][1]
    Object.assign(knobs.B, typeof p === 'function' ? p(knobs.B) : p)
    renderKnobs()
  })
}

export function openLab() {
  $('#lab').hidden = false
  $('#lab-store').textContent = record.name
  renderKnobs()
  if (results.A.length) renderResults()
}

function renderKnobs() {
  let group = ''
  $('#lab-knobs').innerHTML = `<tr><th></th><th style="color:${A}">A · today</th><th style="color:${B}">B · the change</th></tr>` + FIELDS.map(f => {
    const head = f.group !== group ? `<tr class="grp"><td colspan="3">${(group = f.group)}</td></tr>` : ''
    const cell = (s: 'A' | 'B') => {
      const v = knobs[s][f.k]
      const diff = s === 'B' && String(v) !== String(knobs.A[f.k])
      return `<td class="${diff ? 'diff' : ''}"><input data-s="${s}" data-k="${f.k}" ${f.text ? 'type="text"' : `type="number" step="${f.step ?? 1}" min="0"`} value="${v}" />${f.unit ? `<span>${f.unit}</span>` : ''}</td>`
    }
    return `${head}<tr><td>${f.label}</td>${cell('A')}${cell('B')}</tr>`
  }).join('')
  $('#lab-knobs').querySelectorAll('input').forEach(inp => inp.addEventListener('change', () => {
    const s = inp.dataset.s as 'A' | 'B', k = inp.dataset.k as keyof Knobs
    ;(knobs[s] as unknown as Record<string, unknown>)[k] = inp.type === 'text' ? inp.value : Number(inp.value)
    save(); renderKnobs()
  }))
}

function save() { try { localStorage.setItem(`tvarit.lab.${record.name}`, JSON.stringify(knobs)) } catch { /* private window */ } }

// ---- Running ----
let workers: Worker[] = []
function run() {
  workers.forEach(w => w.terminate())
  const n = Math.max(1, Math.min(20, Number($<HTMLInputElement>('#lab-seeds').value) || 5))
  const seeds = Array.from({ length: n }, (_, i) => i + 1)
  results = { A: [], B: [] }
  ranKnobs = { A: { ...knobs.A }, B: { ...knobs.B } }
  const bar = $('#lab-progress'), btn = $<HTMLButtonElement>('#lab-run')
  btn.disabled = true
  let doneN = 0
  const t0 = performance.now()
  workers = (['A', 'B'] as const).map(s => {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = e => {
      if (e.data.result) {
        results[s].push(e.data.result)
        doneN++
        bar.style.setProperty('--p', `${(doneN / (2 * n)) * 100}%`)
        bar.dataset.text = `${doneN} of ${2 * n} days simulated`
      }
      if (e.data.done && results.A.length === n && results.B.length === n) {
        btn.disabled = false
        bar.dataset.text = `${2 * n} days in ${((performance.now() - t0) / 1000).toFixed(0)} s`
        renderResults()
      }
    }
    w.postMessage({ id: s, layout: record.layout, bins: record.bins, cfg: toConfig(knobs[s]), seeds })
    return w
  })
  bar.dataset.text = 'Starting…'
  bar.style.setProperty('--p', '0%')
}

// ---- Results ----
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)
type Row = { label: string; get: (r: DayResult) => number; fmt: (v: number) => string; better: 'lower' | 'higher' | null; note?: string }
const pct = (v: number) => `${Math.round(v * 100)}%`
const ROWS: Row[] = [
  { label: 'Orders dispatched / day', get: r => r.kpi.orders, fmt: v => Math.round(v).toLocaleString(), better: null },
  { label: 'Average O2D', get: r => r.kpi.o2d, fmt, better: 'lower' },
  { label: 'O2D, 90th percentile', get: r => r.kpi.p90, fmt, better: 'lower' },
  { label: 'Within the 2:00 target', get: r => r.kpi.sla, fmt: pct, better: 'higher' },
  { label: 'Worst hour, average O2D', get: r => r.kpi.worstO2D, fmt, better: 'lower' },
  { label: 'Most orders open at once', get: r => r.kpi.maxOpen, fmt: v => v.toFixed(0), better: 'lower' },
  { label: 'Pickers busy', get: r => r.kpi.pickerUtil, fmt: pct, better: null, note: 'share of on-shift time on orders or inbound' },
  { label: 'Riders busy', get: r => r.kpi.riderUtil, fmt: pct, better: null },
  { label: 'Putaway finished', get: r => r.kpi.inboundDone, fmt: v => (v ? clock(v).slice(0, 5) : '—'), better: 'lower' },
  { label: 'Stock-outs (lines not fillable)', get: r => r.kpi.stockouts, fmt: v => v.toFixed(0), better: 'lower' },
]

function renderResults() {
  const rA = results.A, rB = results.B
  const cell = (rs: DayResult[], row: Row) => {
    const v = rs.map(row.get), m = mean(v)
    const lo = Math.min(...v), hi = Math.max(...v)
    return `<td><b>${row.fmt(m)}</b>${rs.length > 1 && lo !== hi ? `<small>${row.fmt(lo)}–${row.fmt(hi)}</small>` : ''}</td>`
  }
  const change = (row: Row) => {
    const a = mean(rA.map(row.get)), b = mean(rB.map(row.get))
    if (!row.better || Math.abs(b - a) < Math.abs(a) * 0.02 + 1e-9) return '<td class="same">≈ same</td>'
    const good = row.better === 'lower' ? b < a : b > a
    return `<td class="${good ? 'good' : 'bad'}">${good ? '▲ better' : '▼ worse'}</td>`
  }
  const same = JSON.stringify(ranKnobs?.A) === JSON.stringify(ranKnobs?.B)
  $('#lab-kpis').innerHTML = `<tr><th></th><th><i style="background:${A}"></i>A · today</th><th><i style="background:${B}"></i>B · the change</th><th>B vs A</th></tr>` +
    ROWS.map(r => `<tr><td>${r.label}${r.note ? `<small>${r.note}</small>` : ''}</td>${cell(rA, r)}${cell(rB, r)}${change(r)}</tr>`).join('') +
    (same ? '<tr><td colspan="4" class="same">A and B are the same settings — change something in B to compare.</td></tr>' : '')
  $('#lab-seed').innerHTML = rA.map(r => `<option value="${r.seed}">day ${r.seed}</option>`).join('')

  const byHour = (rs: DayResult[], f: (h: HourStat[]) => number | null) =>
    Array.from({ length: 24 }, (_, i) => f(rs.map(r => r.hours[i] ?? blank())))
  const series = (rs: DayResult[]) => ({
    o2d: byHour(rs, hs => { const n = hs.reduce((a, h) => a + h.orders, 0); return n ? hs.reduce((a, h) => a + h.o2d, 0) / n : null }),
    sla: byHour(rs, hs => { const n = hs.reduce((a, h) => a + h.orders, 0); return n ? hs.reduce((a, h) => a + h.hit, 0) / n : null }),
    open: byHour(rs, hs => mean(hs.map(h => h.maxOpen))),
    pick: byHour(rs, hs => { const on = hs.reduce((a, h) => a + h.pickerOn, 0); return on ? hs.reduce((a, h) => a + h.pickerBusy, 0) / on : null }),
    ride: byHour(rs, hs => { const on = hs.reduce((a, h) => a + h.riderOn, 0); return on ? hs.reduce((a, h) => a + h.riderBusy, 0) / on : null }),
  })
  const sa = series(rA), sb = series(rB)
  $('#lab-charts').innerHTML = [
    chart('Average O2D by hour', sa.o2d, sb.o2d, { fmt, target: 120, targetLabel: 'target 2:00' }),
    chart('Orders within 2:00, by hour', sa.sla, sb.sla, { fmt: pct, max: 1 }),
    chart('Most orders open at once, by hour', sa.open, sb.open, { fmt: v => v.toFixed(0) }),
    chart('Pickers busy, by hour', sa.pick, sb.pick, { fmt: pct, max: 1 }),
    chart('Riders busy, by hour', sa.ride, sb.ride, { fmt: pct, max: 1 }),
  ].join('')
  if (new URLSearchParams(location.search).get('labscroll')) $('#lab').scrollTop = 99999
}
const blank = (): HourStat => ({ orders: 0, o2d: 0, hit: 0, arrived: 0, maxOpen: 0, pickerOn: 0, pickerBusy: 0, riderOn: 0, riderBusy: 0 })

/** A two-series line chart over the 24 hours, one y-axis, hover per hour. */
function chart(title: string, a: (number | null)[], b: (number | null)[], o: { fmt: (v: number) => string; max?: number; target?: number; targetLabel?: string }) {
  const W = 470, H = 200, L = 44, R = 34, T = 12, Bm = 26
  const vals = [...a, ...b, o.target ?? 0].filter((v): v is number => v != null)
  const peak = Math.max(...vals, 1e-6)
  const top = o.max ?? (o.target != null ? Math.ceil((peak * 1.05) / 60) * 60 : niceMax(peak))
  const x = (i: number) => L + (i / 23) * (W - L - R), y = (v: number) => T + (1 - v / top) * (H - T - Bm)
  const path = (s: (number | null)[]) => s.map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).reduce((acc, p, i, arr) => acc + (p ? `${arr[i - 1] ? 'L' : 'M'}${p}` : ''), '')
  // Time axes tick on whole minutes; the rest in quarters.
  const ticks = o.target != null ? Array.from({ length: top / 60 + 1 }, (_, i) => i * 60).filter((_, i, a) => a.length <= 6 || i % 2 === 0) : [0, 0.25, 0.5, 0.75, 1].map(f => f * top)
  const end = (s: (number | null)[], c: string, t: string, dy: number) => { let i = 23; while (i > 0 && s[i] == null) i--; return s[i] == null ? '' : `<text x="${x(i) + 5}" y="${y(s[i]!) + dy}" class="dl" fill="currentColor"><tspan fill="${c}">●</tspan> ${t}</text>` }
  const lastA = a.slice().reverse().find(v => v != null) ?? 0, lastB = b.slice().reverse().find(v => v != null) ?? 0
  const hover = Array.from({ length: 24 }, (_, i) => `<rect x="${x(i) - (W - L - R) / 46}" y="${T}" width="${(W - L - R) / 23}" height="${H - T - Bm}" data-h="${i}" data-a="${a[i] == null ? '—' : o.fmt(a[i]!)}" data-b="${b[i] == null ? '—' : o.fmt(b[i]!)}"/>`).join('')
  return `<figure class="lchart"><figcaption>${title}<span><i style="background:${A}"></i>A <i style="background:${B}"></i>B</span></figcaption>
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">
    ${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${L - 6}" y="${y(t) + 4}" class="ax" text-anchor="end">${o.fmt(t)}</text>`).join('')}
    ${[0, 6, 12, 18, 23].map(h => `<text x="${x(h)}" y="${H - 8}" class="ax" text-anchor="middle">${String(h).padStart(2, '0')}:00</text>`).join('')}
    ${o.target != null ? `<line x1="${L}" x2="${W - R}" y1="${y(o.target)}" y2="${y(o.target)}" class="target"/><text x="${W - R}" y="${y(o.target) - 4}" class="ax" text-anchor="end">${o.targetLabel}</text>` : ''}
    <path d="${path(a)}" stroke="${A}" class="ln"/><path d="${path(b)}" stroke="${B}" class="ln"/>
    ${end(a, A, 'A', lastA >= lastB ? -4 : 10)}${end(b, B, 'B', lastB > lastA ? -4 : 10)}
    <line class="xh" x1="0" x2="0" y1="${T}" y2="${H - Bm}"/>
    <g class="hit">${hover}</g>
  </svg></figure>`
}
function niceMax(v: number) { const p = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v * 1.05) return m * p; return 10 * p }

/** Hover: one tooltip for every chart, crosshair on the chart under the pointer. */
export function mountLabHover() {
  const tip = $('#lab-tip')
  $('#lab-charts').addEventListener('mousemove', e => {
    const r = (e.target as Element).closest('rect[data-h]') as SVGRectElement | null
    const svg = (e.target as Element).closest('svg')
    document.querySelectorAll<SVGLineElement>('#lab-charts .xh').forEach(l => (l.style.opacity = '0'))
    if (!r || !svg) { tip.hidden = true; return }
    const xh = svg.querySelector<SVGLineElement>('.xh')!
    const cx = Number(r.getAttribute('x')) + Number(r.getAttribute('width')) / 2
    xh.setAttribute('x1', String(cx)); xh.setAttribute('x2', String(cx)); xh.style.opacity = '1'
    tip.hidden = false
    tip.innerHTML = `<b>${String(r.dataset.h).padStart(2, '0')}:00–${String(Number(r.dataset.h) + 1).padStart(2, '0')}:00</b><div><i style="background:${A}"></i>A ${r.dataset.a}</div><div><i style="background:${B}"></i>B ${r.dataset.b}</div>`
    tip.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`
  })
  $('#lab-charts').addEventListener('mouseleave', () => { tip.hidden = true })
}

function openIn3D() {
  const s = $<HTMLSelectElement>('#lab-which').value as 'A' | 'B'
  const seed = Number($<HTMLSelectElement>('#lab-seed').value) || 1
  const hour = Number($<HTMLSelectElement>('#lab-hour').value)
  const k = (ranKnobs ?? knobs)[s]
  const q = new URLSearchParams(location.search)
  q.set('scn', btoa(JSON.stringify(k))); q.set('scnname', s); q.set('seed', String(seed)); q.set('hour', String(hour))
  location.search = q.toString()
}
