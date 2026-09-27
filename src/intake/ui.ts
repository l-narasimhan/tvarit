// The store picker in the header, and the "New darkstore" form: name, layout PDF, bin master → preview (2D plan
// plus what was read and what is wrong) → save and open. Everything is read in the browser.

import { buildStore, type Store } from '../model'
import { parseBinRows, readTable, type BinRow, type BinZone } from './bins'
import { extractDrawing, layoutFromDrawing, type LayoutParse } from './pdf'
import { BUILTIN, BUILTIN_LABEL, deleteStore, getStore, listSaved, saveStore, type StoreRecord } from './registry'

const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

export async function mountStorePicker(current: string) {
  const sel = $<HTMLSelectElement>('#storesel')
  const saved = (await listSaved()).sort((a, b) => a.name.localeCompare(b.name))
  sel.innerHTML = `
    ${saved.length ? `<optgroup label="Your darkstores">${saved.map(s => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join('')}</optgroup>` : ''}
    <optgroup label="Built in">${BUILTIN.map(s => `<option value="${s.name}">${BUILTIN_LABEL[s.name]}</option>`).join('')}</optgroup>
    <option value="__new">＋ New darkstore…</option>`
  sel.value = current
  sel.addEventListener('change', () => {
    if (sel.value === '__new') { sel.value = current; openForm(); return }
    open(sel.value)
  })
  const del = $<HTMLButtonElement>('#storedel')
  del.hidden = !saved.some(s => s.name === current)
  del.addEventListener('click', async () => {
    if (!confirm(`Delete darkstore "${current}" from this browser? This cannot be undone.`)) return
    await deleteStore(current)
    open('generic_darkstore')
  })
}

function open(name: string) {
  const q = new URLSearchParams(location.search)
  q.delete('nsdemo')
  q.set('store', name)
  location.search = q.toString()
}

// ---- The form ------------------------------------------------------------------------------------------------

let pdfjsP: Promise<typeof import('pdfjs-dist')> | null = null
async function pdfjs() {
  pdfjsP ??= (async () => {
    const lib = await import('pdfjs-dist')
    const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
    lib.GlobalWorkerOptions.workerSrc = worker
    return lib
  })()
  return pdfjsP
}

let ready: StoreRecord | null = null

function openForm() {
  const m = $('#newstore')
  m.hidden = false
  ready = null
  $('#ns-report').innerHTML = ''
  $<HTMLButtonElement>('#ns-save').disabled = true
  const ctx = $<HTMLCanvasElement>('#ns-plan').getContext('2d')!
  ctx.clearRect(0, 0, 9999, 9999)
}

export function mountForm() {
  $('#ns-cancel').addEventListener('click', () => ($('#newstore').hidden = true))
  $('#ns-preview').addEventListener('click', () => preview().catch(e => report([], [`Could not read the files: ${e?.message ?? e}`], null)))
  $('#ns-save').addEventListener('click', async () => {
    if (!ready) return
    await saveStore(ready)
    open(ready.name)
  })
  for (const id of ['#ns-name', '#ns-pdf', '#ns-bins', '#ns-width']) $(id).addEventListener('input', () => { ready = null; $<HTMLButtonElement>('#ns-save').disabled = true })
}

async function preview() {
  const name = $<HTMLInputElement>('#ns-name').value.trim()
  const pdf = $<HTMLInputElement>('#ns-pdf').files?.[0]
  const binF = $<HTMLInputElement>('#ns-bins').files?.[0]
  const width = Number($<HTMLInputElement>('#ns-width').value) || undefined
  const errs: string[] = []
  if (!/^[A-Za-z0-9_-]{3,48}$/.test(name)) errs.push('Name: 3–48 letters, digits, _ or - (e.g. rka_101_wh_hl_01)')
  else if (BUILTIN.some(b => b.name === name) || (await getStore(name))) errs.push(`A darkstore named "${name}" already exists — pick another name, or delete that one first`)
  if (!pdf) errs.push('Choose the layout PDF')
  if (!binF) errs.push('Choose the bin master (CSV or Excel)')
  if (errs.length) return report(errs, [], null)
  report([], ['Reading…'], null)

  const bp = parseBinRows(await readTable(binF!))
  const zones = new Map<string, BinZone>()
  for (const b of bp.bins) if (b.zone && !zones.has(b.rack)) zones.set(b.rack, b.zone)
  for (const b of bp.bins) if (!zones.has(b.rack)) zones.set(b.rack, 'ambient')
  const drawing = await extractDrawing(await pdf!.arrayBuffer(), await pdfjs())
  const lp = layoutFromDrawing(drawing, { name, rackZones: zones, storeWidth: width })
  const fatal = [...(bp.bins.length ? [] : bp.issues), ...(lp.found.racks ? [] : lp.issues)]
  if (fatal.length) return report(fatal, [], null)

  const store = buildStore(lp.layout, bp.bins)
  draw(store)
  ready = { name, created: new Date().toISOString(), layout: lp.layout, bins: bp.bins, files: { layout: pdf!.name, bins: binF!.name } }
  report([], [...bp.issues, ...lp.issues, ...store.warnings], { store, lp, bins: bp.bins })
  $<HTMLButtonElement>('#ns-save').disabled = false
}

function report(errors: string[], warnings: string[], ok: { store: Store; lp: LayoutParse; bins: BinRow[] } | null) {
  const el = $('#ns-report')
  const z = (k: string) => ok?.store.racks.filter(r => r.zone === k).length ?? 0
  el.innerHTML = `
    ${errors.map(e => `<div class="err">✗ ${esc(e)}</div>`).join('')}
    ${ok ? `<div class="okline">✓ ${ok.store.racks.length} racks (${z('ambient')} ambient · ${z('chiller')} chiller · ${z('hv')} HV) · ${ok.bins.length.toLocaleString()} bins · ${ok.lp.found.pallets} pallets · ${ok.lp.found.walls} walls · ${ok.lp.found.doors} doors</div>
      <div class="okline">✓ ${ok.store.W.toFixed(1)} × ${ok.store.D.toFixed(1)} m · ${Math.round(ok.store.W * ok.store.D * 10.764).toLocaleString()} sq ft${ok.lp.found.stations.length ? ` · other stations: ${ok.lp.found.stations.map(esc).join(', ')}` : ''}</div>` : ''}
    ${warnings.map(w => `<div class="warn">⚠ ${esc(w)}</div>`).join('')}`
}

/** A quick top-down plan of what was read. */
function draw(s: Store) {
  const cv = $<HTMLCanvasElement>('#ns-plan')
  const ctx = cv.getContext('2d')!
  const k = Math.min(cv.width / (s.W + 2), cv.height / (s.D + 2))
  const X = (x: number) => (x + 1) * k, Y = (z: number) => (z + 1) * k
  ctx.fillStyle = '#10151c'; ctx.fillRect(0, 0, cv.width, cv.height)
  ctx.fillStyle = '#1b2430'; ctx.fillRect(X(0), Y(0), s.W * k, s.D * k)
  const rect = (r: { x0: number; z0: number; x1: number; z1: number }, c: string) => { ctx.fillStyle = c; ctx.fillRect(X(r.x0), Y(r.z0), (r.x1 - r.x0) * k, (r.z1 - r.z0) * k) }
  for (const z of s.zones) rect(z, z.kind === 'chiller' ? '#123a4d' : '#3d2a10')
  const FIX: Record<string, string> = { desk: '#2e7d32', wms: '#2e7d32', dropzone: '#d4b800', packing: '#b9824f', station: '#777', entrance: '#4a90d9' }
  for (const f of s.fixtures) rect(f, FIX[f.kind])
  for (const r of s.racks) rect(r.foot, r.zone === 'chiller' ? '#38bdf8' : r.zone === 'hv' ? '#ef4444' : '#e2b04a')
  for (const p of s.slots.filter(x => x.kind === 'pallet')) rect({ x0: p.x - p.w / 2, x1: p.x + p.w / 2, z0: p.z - p.d / 2, z1: p.z + p.d / 2 }, '#c4a484')
  for (const w of s.walls) rect(w, '#b57ba6')
  ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = 3
  for (const d of s.doors) { ctx.beginPath(); if (d.axis === 'x') { ctx.moveTo(X(d.a), Y(d.at)); ctx.lineTo(X(d.b), Y(d.at)) } else { ctx.moveTo(X(d.at), Y(d.a)); ctx.lineTo(X(d.at), Y(d.b)) } ctx.stroke() }
}

/** Check hook (?nsdemo=1): fills the form with the sample files and previews, as a person would. */
export async function demoImport() {
  const file = async (url: string, name: string, type: string) => new File([await (await fetch(url)).blob()], name, { type })
  const put = (id: string, f: File) => { const dt = new DataTransfer(); dt.items.add(f); $<HTMLInputElement>(id).files = dt.files }
  openForm()
  $<HTMLInputElement>('#ns-name').value = 'rka_101_wh_hl_01'
  put('#ns-pdf', await file('/samples/generic_darkstore_layout.pdf', 'generic_darkstore_layout.pdf', 'application/pdf'))
  put('#ns-bins', await file('/samples/generic_darkstore_bins.csv', 'generic_darkstore_bins.csv', 'text/csv'))
  await preview().catch(e => report([], [`Could not read the files: ${e?.message ?? e}`], null))
  if (new URLSearchParams(location.search).get('nsdemo') === 'save' && ready) { await saveStore(ready); open(ready.name) }
}
