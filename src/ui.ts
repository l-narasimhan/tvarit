// Panels: store summary, search, view buttons, and the inspector for a clicked bin / pigeon hole / pallet.

import { code128B } from './barcode'
import type { Slot, Store } from './model'
import type { Person } from './people'
import { clock, fmt, type SOrder, type Sim, type Stage } from './sim/engine'
import { ROLE_COLOR, ROLE_NAME, type Role } from './scene/figure'

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T

export function barcodeSvg(text: string, h = 56): string {
  const widths = code128B(text)
  const quiet = 10
  let x = quiet, bars = ''
  widths.forEach((w, i) => { if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${w}" height="${h}"/>`; x += w })
  return `<svg viewBox="0 0 ${x + quiet} ${h}" preserveAspectRatio="none" class="bc">${bars}</svg>`
}

const ZONE_NAME = { ambient: 'Ambient', chiller: 'Chiller 2–8 °C', hv: 'High value' } as const
const KIND_NAME = { bin: 'Shelf bin', ph: 'Pigeon hole', pallet: 'Floor pallet' } as const

export function renderSummary(store: Store) {
  const bins = store.slots.filter(s => s.kind === 'bin')
  const units = bins.reduce((a, s) => a + s.qty, 0)
  const skus = new Set(bins.filter(s => s.qty > 0).map(s => s.sku?.sku)).size
  const empty = bins.filter(s => s.qty === 0).length
  const count = (z: string) => store.racks.filter(r => r.zone === z).length
  const sqft = Math.round(store.W * store.D * 10.764)
  $('#summary').innerHTML = `
    <div class="store">${store.name}</div>
    <div class="sub">${store.W.toFixed(1)} × ${store.D.toFixed(1)} m · ${sqft.toLocaleString()} sq ft</div>
    <div class="grid">
      <div><b>${store.racks.length}</b><span>racks</span></div>
      <div><b>${bins.length.toLocaleString()}</b><span>bins</span></div>
      <div><b>${skus}</b><span>SKUs live</span></div>
      <div><b>${units.toLocaleString()}</b><span>units</span></div>
    </div>
    <div class="zones">
      <span class="z ambient">Ambient ${count('ambient')}</span>
      <span class="z chiller">Chiller ${count('chiller')}</span>
      <span class="z hv">HV ${count('hv')}</span>
    </div>
    <div class="sub">${store.slots.filter(s => s.kind === 'ph').length} pigeon holes · ${store.slots.filter(s => s.kind === 'pallet').length} pallets · ${empty} empty bins</div>
    ${store.warnings.length ? `<div class="warn">${store.warnings.map(w => `⚠ ${w}`).join('<br>')}</div>` : ''}`
}

export function renderInspector(s: Slot | null, store: Store) {
  const el = $('#inspector')
  if (!s) { el.hidden = true; return }
  el.hidden = false
  const rack = store.racks.find(r => r.id === s.owner)
  const p = s.sku
  const fill = Math.min(1, s.qty / s.cap)
  const where = s.kind === 'bin'
    ? `<div class="kv"><span>Rack</span><b>${s.owner}</b></div>
       <div class="kv"><span>Level</span><b>${s.level} <small>(A = bottom)</small></b></div>
       <div class="kv"><span>Position</span><b>${s.pos} of ${rack?.perLevel ?? '?'}</b></div>
       <div class="kv"><span>Faces</span><b>${rack?.face ?? ''}</b></div>`
    : s.kind === 'ph'
      ? `<div class="kv"><span>Row</span><b>${s.level}</b></div><div class="kv"><span>Column</span><b>${s.pos}</b></div>`
      : `<div class="kv"><span>Location</span><b>Floor</b></div>`
  const stock = s.kind === 'ph'
    ? `<div class="kv"><span>Status</span><b>${s.qty ? `${s.qty} order bag${s.qty > 1 ? 's' : ''} waiting` : 'Empty'}</b></div>`
    : p
      ? `<div class="prod"><i style="background:#${p.color.toString(16).padStart(6, '0')}"></i><div><b>${p.name}</b><small>${p.sku} · ₹${p.mrp} MRP · ${p.group}</small></div></div>
         <div class="kv"><span>On hand</span><b>${s.qty} ${s.kind === 'pallet' ? 'cases' : 'units'}${s.qty === 0 ? ' — <em>stock-out</em>' : ''}</b></div>
         <div class="bar"><i style="width:${fill * 100}%"></i></div>`
      : ''
  el.innerHTML = `
    <button class="x" aria-label="Close">×</button>
    <div class="kind">${KIND_NAME[s.kind]} · <span class="z ${s.zone}">${ZONE_NAME[s.zone]}</span></div>
    <div class="code">${s.code}</div>
    ${barcodeSvg(s.code)}
    ${where}
    ${stock}
    ${rack?.inferred ? '<div class="warn">Rack code partly hidden in the source sheet; inferred from position.</div>' : ''}`
  el.querySelector('.x')!.addEventListener('click', () => el.dispatchEvent(new CustomEvent('close')))
}

export function findSlot(store: Store, q: string): Slot | null {
  const t = q.trim().toUpperCase()
  if (!t) return null
  return store.slots.find(s => s.code === t)
    ?? store.slots.find(s => s.code.startsWith(t))
    ?? store.slots.find(s => s.sku?.name.toUpperCase().includes(t) && s.qty > 0)
    ?? null
}

export function renderStaff(list: Person[]) {
  const n = (r: Role) => list.filter(p => p.role === r).length
  const roles: Role[] = ['sm', 'asm', 'picker', 'rider']
  document.querySelector<HTMLElement>('#staff')!.innerHTML = `<div class="sub">On the floor</div><div class="roster">${roles
    .map(r => `<span><i style="background:${ROLE_COLOR[r]}"></i>${ROLE_NAME[r].replace('Area Sales Manager', 'ASM')} <b>${n(r)}</b></span>`).join('')}</div>`
}

export function renderPerson(p: Person | null) {
  const el = $('#inspector')
  if (!p) { el.hidden = true; return }
  el.hidden = false
  el.innerHTML = `
    <button class="x" aria-label="Close">×</button>
    <div class="kind"><span class="z" style="background:${ROLE_COLOR[p.role]}">${ROLE_NAME[p.role]}</span></div>
    <div class="code" style="font-family:system-ui">${p.name}</div>
    <div class="kv"><span>Shift</span><b>${p.shift}</b></div>
    <div class="kv"><span>Now</span><b class="now">${p.status || 'Idle'}</b></div>
    ${p.doneLabel ? `<div class="kv"><span>${p.doneLabel[0].toUpperCase() + p.doneLabel.slice(1)}</span><b>${p.done}</b></div>` : ''}
    <div class="warn" style="color:var(--mute)">Behaviour preview — tasks tie to real orders and stock in M3.</div>`
  el.querySelector('.x')!.addEventListener('click', () => el.dispatchEvent(new CustomEvent('close')))
}

const STEPS: [Stage[], string][] = [
  [['queued'], 'Placed'], [['picking'], 'Picking'], [['bagging'], 'Bagging'], [['ready'], 'In pigeon hole'],
  [['collecting'], 'Rider scanning'], [['out'], 'Dispatched'],
]
const ICON = { order: '🧾', pick: '📦', bag: '🛍', ph: '🗄', rider: '🛵', done: '✅' } as const

export function renderOrder(o: SOrder | null, sim: Sim | null, waiting = false) {
  const el = $('#order')
  if (!o && !waiting) { el.hidden = true; return }
  el.hidden = false
  const body = el.querySelector('.body') as HTMLElement
  if (!o || !sim) { body.innerHTML = '<div class="who">Waiting for the next order to arrive…</div>'; return }
  const idx = STEPS.findIndex(s => s[0].includes(o.stage))
  const age = sim.age(o)
  const late = age > sim.cfg.sla
  const lines = o.lines.map(l => `<tr class="${l.picked ? 'ok' : ''}"><td>${l.picked ? '✓' : '○'}</td><td class="mono">${l.slot.code}</td>
    <td>${l.slot.sku!.name}</td><td class="r">${l.qty}</td><td class="r mono">${l.picked ? `${l.before}→${l.slot.qty}` : l.slot.qty}</td></tr>`).join('')
  body.innerHTML = `
    <div class="ohead"><b class="mono">${o.id}</b><span class="clock ${late ? 'late' : ''}">${o.stage === 'out' ? 'O2D ' : ''}${fmt(age)} <small>/ ${fmt(sim.cfg.sla)}</small></span></div>
    <div class="steps">${STEPS.map((s, i) => `<span class="${i < idx ? 'done' : i === idx ? 'now' : ''}">${s[1]}</span>`).join('')}</div>
    <div class="who">${o.picker ? `Picker <b>${o.picker.name}</b>` : 'Waiting for a free picker'}${o.rider ? ` · Rider <b>${o.rider.name}</b>` : ''}${o.ph ? ` · <span class="mono">${o.ph.code}</span>` : ''}</div>
    <table class="lines">${lines}</table>
    <ol class="log">${o.events.map(e => `<li><span class="mono">${clock(e.t)}</span> ${ICON[e.kind]} ${e.text}</li>`).reverse().join('')}</ol>`
}

export function renderKpis(sim: Sim) {
  const d = sim.done
  const hr = sim.recent(3600)
  const ib = sim.inbound()
  const inbound = ib.total && (ib.lorry || ib.staged || ib.moving || ib.onLorry)
    ? `<div class="inb"><b>Inbound</b> ${ib.lorry ? `lorry ${ib.lorry.id} ${ib.lorry.state}` : ''} · ${ib.onLorry} on lorry · ${ib.unloaded} to check · ${ib.received} checked · ${ib.moving} being put away · ${ib.done}/${ib.total} done · ${ib.onInbound} pickers on inbound</div>`
    : ib.total ? `<div class="inb"><b>Inbound</b> ${ib.done}/${ib.total} cases put away · last at ${clock(sim.lastPutaway)}</div>` : ''
  $('#kpis').innerHTML = `<div class="sub">Since the run started · last hour</div>
    <div class="grid kp">
      <div><b>${d.length}</b><span>dispatched · ${hr.length}/h</span></div>
      <div><b class="${sim.o2d(hr) > sim.cfg.sla ? 'bad' : 'good'}">${fmt(sim.o2d(hr))}</b><span>avg O2D, last hour</span></div>
      <div><b class="${sim.slaHit(hr) < 0.8 ? 'bad' : 'good'}">${Math.round(sim.slaHit(hr) * 100)}%</b><span>≤ ${fmt(sim.cfg.sla)}, last hour</span></div>
      <div><b>${sim.open.length}</b><span>open now</span></div>
    </div>${inbound}`
}
