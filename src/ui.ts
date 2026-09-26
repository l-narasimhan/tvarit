// Panels: store summary, search, view buttons, and the inspector for a clicked bin / pigeon hole / pallet.

import { code128B } from './barcode'
import type { Slot, Store } from './model'

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
