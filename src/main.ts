import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { STORE01 } from './layout/store01'
import { buildStore, type Slot, type Store } from './model'
import { buildFixtures } from './scene/fixtures'
import { Goods } from './scene/goods'
import { LabelAtlas } from './scene/labels'
import { buildRacks, rackHeaders } from './scene/racks'
import { buildShell } from './scene/shell'
import { findSlot, renderInspector, renderKpis, renderPerson, renderStaff, renderSummary } from './ui'
import { People, type Person } from './people'
import { Trace } from './orders'
import { renderOrder } from './ui'
import { NavGrid } from './nav'
import { Sim, STEP, clock as simClock } from './sim/engine'
import { Crew } from './scene/crew'
import { Inbound } from './scene/lorry'
import { Walk } from './walk'
import { ChillerAudio } from './audio'
import { Pendency } from './pendency'
import { buildCoolers, type Coolers } from './scene/coolers'
import { buildTV, type TV } from './scene/tv'
import './style.css'
import type { BinRow } from './intake/bins'
import { getStore, lastStore, rememberStore } from './intake/registry'
import { demoImport, mountForm, mountStorePicker } from './intake/ui'
import { BASE, toConfig, type Knobs } from './lab/run'
import { mountLab, mountLabHover, openLab } from './lab/ui'

// ---- Renderer, camera, lights ----------------------------------------------------------------------------
const canvas = document.querySelector<HTMLCanvasElement>('#c')!
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05

const scene = new THREE.Scene()
scene.background = new THREE.Color(0xdfe6ec)
const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 400)
const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.maxPolarAngle = Math.PI / 2 - 0.03
controls.minDistance = 0.4
const walk = new Walk(camera, canvas)

scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f95, 1.4))
const sun = new THREE.DirectionalLight(0xffffff, 1.6)
scene.add(sun, sun.target)

// ---- Store -----------------------------------------------------------------------------------------------
let store!: Store
const world = new THREE.Group()
scene.add(world)
let walls: THREE.Group
let labelMeshes: THREE.Object3D[] = []
let hits: THREE.InstancedMesh
let coolers: Coolers
let people: People
let pendency: Pendency
let sim: Sim
let crew: Crew
let trace: Trace
let simAcc = 0
let inbound: Inbound
let goodsAll: Goods
let speed = 1
let follow = true
let tv: TV
const audio = new ChillerAudio()
const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
  new THREE.LineBasicMaterial({ color: 0xffb000, depthTest: false, transparent: true }))
highlight.renderOrder = 10
highlight.visible = false
scene.add(highlight)

function load(layout = STORE01, bins?: BinRow[]) {
  world.clear()
  store = buildStore(layout, bins)
  const atlas = new LabelAtlas()
  // The engine starts half an hour before the chosen hour and runs that warm-up headless, so the store opens
  // mid-shift: orders flowing, riders out, stock already moved.
  const qs0 = new URLSearchParams(location.search)
  const startHour = Number(qs0.get('hour') ?? 19)
  const scn = qs0.get('scn')
  if (scn) {
    // Replaying a lab run: the same settings and day, run from midnight up to the chosen hour.
    const k: Knobs = { ...BASE, ...JSON.parse(atob(scn)) }
    sim = new Sim(store, new NavGrid(store), { ...toConfig(k), seed: Number(qs0.get('seed') ?? 1) }, 0)
    sim.advance(startHour * 3600)
    const el = document.querySelector<HTMLElement>('#replay')!
    el.hidden = false
    el.innerHTML = `Replay · scenario ${qs0.get('scnname') ?? ''} · day ${qs0.get('seed') ?? 1} · from ${String(startHour).padStart(2, '0')}:00<a href="?store=${encodeURIComponent(qs0.get('store') ?? '')}">✕ exit</a>`
  } else {
    sim = new Sim(store, new NavGrid(store), { seed: Number(qs0.get('seed') ?? 1) }, startHour - 0.5)
    sim.advance(1800)
  }
  const goods = new Goods()
  for (const s of store.slots) if (s.kind === 'bin') goods.stockBin(s)
  sim.onPick = s => goods.setBinQty(s)
  goodsAll = goods
  const shell = buildShell(store)
  walls = shell.walls
  world.add(shell.floor, walls, buildRacks(store, atlas), rackHeaders(store), buildFixtures(store, atlas, goods))
  goods.meshes().forEach(m => world.add(m))
  coolers = buildCoolers(store)
  pendency = new Pendency(sim)
  tv = buildTV(store, pendency)
  people = new People(store, { picker: 0, rider: 0 })        // store manager and ASM; the engine runs the rest
  crew = new Crew(sim)
  trace = new Trace(sim)
  inbound = new Inbound(sim)
  world.add(coolers.group, tv.group, people.group, crew.group, trace.group, inbound.group)
  renderStaff([...people.list, ...crew.members])
  labelMeshes = atlas.meshes()
  labelMeshes.forEach(m => world.add(m))

  // One invisible box per slot, for picking.
  hits = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ visible: false }), store.slots.length)
  store.slots.forEach((s, i) => hits.setMatrixAt(i, slotMatrix(s)))
  hits.computeBoundingSphere()
  world.add(hits)

  const { W, D } = store
  sun.position.set(W * 0.3, 30, -D * 0.4)
  sun.target.position.set(W / 2, 0, D / 2)
  const sc = sun.shadow.camera
  sc.left = -W * 0.75; sc.right = W * 0.75; sc.top = D * 1.1; sc.bottom = -D * 1.1; sc.far = 90
  sun.castShadow = true
  sun.shadow.mapSize.set(4096, 4096)
  sun.shadow.bias = -0.0004
  sc.updateProjectionMatrix()

  walk.setStore(store)
  renderSummary(store)
  ;(window as any).__stats = { labels: atlas.count, goods: goods.count, slots: store.slots.length, racks: store.racks.length }
}

function slotMatrix(s: Slot, grow = 1) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(s.x, s.y, s.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.ry),
    new THREE.Vector3(s.w * grow, s.h * grow, s.d * grow))
}

// ---- Views -------------------------------------------------------------------------------------------------
const tween = { t: 1, from: [new THREE.Vector3(), new THREE.Vector3()], to: [new THREE.Vector3(), new THREE.Vector3()] }
function fly(pos: THREE.Vector3, target: THREE.Vector3, instant = false) {
  if (instant) { camera.position.copy(pos); controls.target.copy(target); tween.t = 1; return }
  tween.from = [camera.position.clone(), controls.target.clone()]
  tween.to = [pos, target]
  tween.t = 0
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
function view(name: string, instant = false) {
  if (walk.active) setWalk(false)
  const { W, D } = store
  const zone = (k: string) => store.zones.find(z => z.kind === k)
  if (name === 'top') return fly(V(W / 2, 46, D / 2 + 0.01), V(W / 2, 0, D / 2), instant)
  if (name === 'chiller' || name === 'hv') {
    const z = zone(name)
    if (!z) return
    const cx = (z.x0 + z.x1) / 2, cz = (z.z0 + z.z1) / 2
    // HV: stand inside the cage at its gate end and look down the row of cabinets.
    if (name === 'hv') return fly(V(z.x0 + 0.6, 2.3, z.z0 + 0.5), V(cx + 1.5, 0.9, z.z1 - 0.4), instant)
    return fly(V(cx + 2, 9, z.z0 - 4), V(cx, 0.5, cz), instant)
  }
  if (name === 'ph' && store.pigeon) {
    const p = store.pigeon
    return fly(V(p.cx + 4.5, 2.6, p.cz - 3), V(p.cx, 1, p.cz), instant)
  }
  if (name === 'tv') {
    // Step back from the screen, slightly off-axis, until the next step would enter a wall or a rack —
    // however far that is in this store (a fixed offset put the camera inside the generic store's chiller).
    const p = tv.pos.clone()
    const dir = tv.normal.clone().add(V(0, 0, 0.22)).normalize()
    const blockers = [...store.walls, ...store.racks.map(r => r.foot)]
    const hit = (x: number, z: number) => blockers.some(b => x > b.x0 - 0.35 && x < b.x1 + 0.35 && z > b.z0 - 0.35 && z < b.z1 + 0.35)
    // Start at the screen itself, so even a wall under a metre away cannot trap the camera behind it.
    let s = 0.4
    while (s < 6.2 && !hit(p.x + dir.x * (s + 0.1), p.z + dir.z * (s + 0.1))) s += 0.1
    s = Math.max(0.6, s)
    const eye = V(p.x + dir.x * s, 1.75, p.z + dir.z * s)
    return fly(eye, p.clone().add(V(0, -0.2, 0)), instant)
  }
  if (name === 'aisle') return fly(V(W * 0.2, 1.7, D * 0.26), V(W * 0.32, 1.1, D * 0.26), instant)
  return fly(V(W * 0.5 + 6, 26, D + 16), V(W / 2, 0, D / 2 - 1), instant)
}

function focus(s: Slot, instant = false) {
  select(s)
  if (walk.active) return walk.faceSlot(s)
  const n = V(Math.sin(s.ry), 0, Math.cos(s.ry))
  const dist = s.kind === 'pallet' ? 2.4 : 1.5
  const target = V(s.x, s.y, s.z)
  fly(target.clone().addScaledVector(n, dist).add(V(0, s.kind === 'pallet' ? 1.6 : 0.35, 0)), target, instant)
}

const ring = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.44, 32), new THREE.MeshBasicMaterial({ color: 0xffb000, depthTest: false, transparent: true }))
ring.rotation.x = -Math.PI / 2
ring.renderOrder = 10
ring.visible = false
scene.add(ring)
let person: Person | null = null
let personAt = 0
function selectPerson(p: Person | null) {
  person = p
  ring.visible = !!p
  highlight.visible = false
  renderPerson(p)
}

let selected: Slot | null = null
function select(s: Slot | null) {
  selected = s
  person = null; ring.visible = false
  highlight.visible = !!s
  if (s) slotMatrix(s, 1.04).decompose(highlight.position, highlight.quaternion, highlight.scale)
  renderInspector(s, store)
}

// ---- Picking -----------------------------------------------------------------------------------------------
const ray = new THREE.Raycaster()
const ndc = new THREE.Vector2()
const tip = document.querySelector<HTMLDivElement>('#tip')!
/** A person under the pointer, if one is nearer than any slot. */
function pickPerson(e: MouseEvent | null): Person | null {
  pick(e)
  const hp = ray.intersectObjects([...people.hitMeshes, ...crew.hitMeshes], false)[0]
  if (!hp) return null
  const hs = ray.intersectObject(hits, false)[0]
  return !hs || hp.distance < hs.distance ? people.byHit(hp.object) : null
}
function pick(e: MouseEvent | null): Slot | null {
  const r = canvas.getBoundingClientRect()
  if (!e || walk.locked) ndc.set(0, 0)
  else ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
  ray.setFromCamera(ndc, camera)
  const hit = ray.intersectObject(hits, false)[0]
  return hit?.instanceId != null ? store.slots[hit.instanceId] : null
}
let down = { x: 0, y: 0 }
canvas.addEventListener('pointerdown', e => (down = { x: e.clientX, y: e.clientY }))
canvas.addEventListener('pointerup', e => {
  if (walk.active && !walk.locked) {
    // First click takes the mouse for looking; a drag without lock also looks.
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) <= 4) walk.lock()
    return
  }
  if (!walk.locked && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return
  const p = pickPerson(e)
  if (p) selectPerson(p)
  else select(pick(e))
})
canvas.addEventListener('dblclick', e => { const s = pick(e); if (s) focus(s) })
canvas.addEventListener('pointermove', e => {
  if (e.buttons || walk.active) { tip.hidden = true; return }
  const who = pickPerson(e)
  if (who) {
    tip.hidden = false
    tip.textContent = `${who.name} · ${who.status || 'Idle'}`
    tip.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`
    return
  }
  const s = pick(e)
  tip.hidden = !s
  if (s) {
    tip.textContent = s.sku && s.kind !== 'ph' ? `${s.code} · ${s.sku.name} · ${s.qty}` : s.code
    tip.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`
  }
})
document.querySelector('#inspector')!.addEventListener('close', () => { select(null); selectPerson(null) })

// ---- Controls ----------------------------------------------------------------------------------------------
const search = document.querySelector<HTMLInputElement>('#search')!
const miss = document.querySelector<HTMLDivElement>('#miss')!
search.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return
  const s = findSlot(store, search.value)
  miss.hidden = !!s
  if (s) focus(s)
})
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b => b.addEventListener('click', () => view(b.dataset.view!)))
const wallBtn = document.querySelector<HTMLButtonElement>('#walls')!
wallBtn.addEventListener('click', () => {
  const low = walls.scale.y === 1
  walls.scale.y = low ? 0.12 : 1
  wallBtn.classList.toggle('on', !low)
})
const labelBtn = document.querySelector<HTMLButtonElement>('#labels')!
labelBtn.addEventListener('click', () => {
  const on = !labelMeshes[0]?.visible
  labelMeshes.forEach(m => (m.visible = on))
  labelBtn.classList.toggle('on', on)
})

// ---- Walk mode -------------------------------------------------------------------------------------------
const walkBtn = document.querySelector<HTMLButtonElement>('#walk')!
const hud = document.querySelector<HTMLDivElement>('#hud')!
const aim = document.querySelector<HTMLDivElement>('#aim')!
function setWalk(on: boolean, at?: [number, number, number]) {
  walkBtn.classList.toggle('on', on)
  document.body.classList.toggle('walking', on)
  hud.hidden = !on
  if (on) {
    controls.enabled = false
    tween.t = 1
    const ent = store.fixtures.find(f => f.kind === 'entrance')
    const [x, z, yaw] = at ?? [ent ? 0.6 : store.W / 2, ent ? (ent.z0 + ent.z1) / 2 : store.D / 2, -Math.PI / 2]
    walk.enter(x, z, yaw)
  } else {
    walk.exit()
    controls.enabled = true
    view('overview')
  }
  resize()
}
walkBtn.addEventListener('click', () => { walkBtn.blur(); setWalk(!walk.active) })
addEventListener('keydown', e => {
  if (e.code === 'KeyV' && (e.target as HTMLElement).tagName !== 'INPUT') setWalk(!walk.active)
})
document.addEventListener('pointerlockchange', () => document.body.classList.toggle('locked', walk.locked))
let aimAt = 0
function updateAim(now: number) {
  if (now - aimAt < 100) return
  aimAt = now
  const who = pickPerson(null)
  if (who) { aim.hidden = false; aim.textContent = `${who.name} · ${who.status || 'Idle'}`; return }
  const s = pick(null)
  aim.textContent = s ? (s.sku && s.kind !== 'ph' ? `${s.code} · ${s.sku.name} · ${s.qty}` : s.code) : ''
  aim.hidden = !s
}

const tagBtn = document.querySelector<HTMLButtonElement>('#tags')!
tagBtn.addEventListener('click', () => {
  const on = !tagBtn.classList.contains('on')
  people.setTags(on); crew.setTags(on)
  tagBtn.classList.toggle('on', on)
})

// ---- Sim clock -------------------------------------------------------------------------------------------
const simClockEl = document.querySelector<HTMLElement>('#simclock')!

// ---- Jump to the night inbound ------------------------------------------------------------------------
/** Runs the engine headless up to five minutes before `hour`, then redraws everything that moved. */
function jumpTo(hour: number) {
  const target = hour * 3600 - 300
  const now = sim.t % 86400
  const ahead = (target - now + 86400) % 86400
  sim.advance(ahead)
  goodsAll.refreshAll()
  crew.resyncBags()
  trace.clear(); pendency.trace = null; renderOrder(null, null)
  simClockEl.textContent = simClock(sim.t)
  if (store.dock) fly(V(store.dock.x - 9, 9.5, store.dock.z - 7), V(store.dock.x + 3.5, 0.5, store.dock.z + 4.5))
}
document.querySelector('#jump')!.addEventListener('click', e => { (e.currentTarget as HTMLElement).blur(); jumpTo(1) })

// ---- Live order ------------------------------------------------------------------------------------------
const orderBtn = document.querySelector<HTMLButtonElement>('#neworder')!
const followBtn = document.querySelector<HTMLButtonElement>('#follow')!
let lastActor: { x: number; z: number } | null = null
orderBtn.addEventListener('click', () => {
  orderBtn.blur()
  trace.start()
  pendency.trace = trace.order
  renderOrder(trace.order, sim, trace.waiting)
  if (walk.active) setWalk(false)
  follow = true; followBtn.classList.add('on')
  lastActor = null
})
followBtn.addEventListener('click', () => { follow = !follow; followBtn.classList.toggle('on', follow); lastActor = null })
document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(b => b.addEventListener('click', () => {
  b.blur()
  speed = Number(b.dataset.speed)
  document.querySelectorAll('[data-speed]').forEach(x => x.classList.toggle('on', x === b))
}))
document.querySelector('#closeorder')!.addEventListener('click', () => {
  trace.clear(); pendency.trace = null
  renderOrder(null, null); follow = false; followBtn.classList.remove('on')
})
let orderUi = 0
/** Chase camera: keeps your orbit angle, moves with the person working the order. */
function followActor(dt: number) {
  const a = trace.actor
  if (!follow || !a || walk.active) return
  const target = V(a.x, 1.0, a.z)
  if (a !== lastActor) {
    lastActor = a
    fly(target.clone().add(V(4.5, 7, 6)), target)
    return
  }
  if (tween.t < 1) { tween.to[1].copy(target); return }
  const d = target.clone().sub(controls.target).multiplyScalar(Math.min(1, dt * 4))
  controls.target.add(d)
  camera.position.add(d)
}

// ---- Chiller ambience ----------------------------------------------------------------------------------------
const chip = document.querySelector<HTMLDivElement>('#chip')!
const soundBtn = document.querySelector<HTMLButtonElement>('#sound')!
soundBtn.addEventListener('click', () => {
  audio.muted = !audio.muted
  soundBtn.classList.toggle('on', !audio.muted)
  soundBtn.textContent = audio.muted ? '🔇 Sound' : '🔊 Sound'
})
function ambience(t: number) {
  const p = camera.position
  let room = 0
  if (p.y < 3.2) {
    for (const z of store.zones.filter(z => z.kind === 'chiller')) {
      const dx = Math.max(z.x0 - p.x, 0, p.x - z.x1), dz = Math.max(z.z0 - p.z, 0, p.z - z.z1)
      room = Math.max(room, 1 - Math.hypot(dx, dz) / 2.5)
    }
  }
  room = Math.max(0, room)
  let fan = 0
  for (const u of coolers.units) fan = Math.max(fan, 1 - p.distanceTo(u) / 3.5)
  audio.set(room, Math.max(0, fan))
  const inside = room >= 1
  chip.hidden = !inside
  if (inside) chip.textContent = `❄  Chiller  ${(3.7 + 0.3 * Math.sin(t / 40) + 0.05 * Math.sin(t * 1.7)).toFixed(1)} °C`
}

// ---- Loop --------------------------------------------------------------------------------------------------
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  // Panels sit below the header, however many rows it wraps to.
  const top = document.querySelector('header')!.getBoundingClientRect().bottom + 8
  for (const id of ['#left', '#inspector']) document.querySelector<HTMLElement>(id)!.style.top = `${top}px`
  // Centre the view in the space right of the left panel, on screens wide enough to have one beside it.
  const left = document.querySelector<HTMLElement>('#left')!
  const shift = w > 720 && !walk.active ? (left.offsetWidth + 12) / 2 : 0
  camera.setViewOffset(w, h, -shift, 0, w, h)
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)

const clock = new THREE.Clock()
renderer.setAnimationLoop(() => {
  if (!sim) return                       // the store is still loading
  const dt = clock.getDelta()
  if (tween.t < 1) {
    tween.t = Math.min(1, tween.t + dt / 0.8)
    const k = tween.t < 0.5 ? 2 * tween.t * tween.t : 1 - (-2 * tween.t + 2) ** 2 / 2
    camera.position.lerpVectors(tween.from[0], tween.to[0], k)
    controls.target.lerpVectors(tween.from[1], tween.to[1], k)
  }
  coolers.update(Math.min(dt, 0.1))
  // The engine runs in fixed steps; the frame only decides how many.
  simAcc += Math.min(dt, 0.1) * speed
  let n = 0
  while (simAcc >= STEP && n++ < 400) { sim.step(); simAcc -= STEP }
  if (n >= 400) simAcc = 0
  people.update(Math.min(dt, 0.1) * Math.min(speed, 4))
  crew.sync(Math.min(dt, 0.1), speed)
  inbound.sync()
  trace.update(clock.elapsedTime)
  pendency.trace = trace.order
  followActor(dt)
  if ((orderUi += dt) > 0.5) {
    orderUi = 0
    if (trace.order || trace.waiting) renderOrder(trace.order, sim, trace.waiting)
    renderKpis(sim)
    simClockEl.textContent = simClock(sim.t)
  }
  if (person) {
    ring.position.set(person.x, 0.02, person.z)
    if ((personAt += dt) > 0.5) { personAt = 0; renderPerson(person) }
  }
  tv.update(dt)
  ambience(clock.elapsedTime)
  if (walk.active) { walk.update(Math.min(dt, 0.1)); updateAim(performance.now()) }
  else controls.update()
  renderer.render(scene, camera)
})

// Which darkstore: ?store=…, else the last one opened in this browser, else the generic one.
const bootQs = new URLSearchParams(location.search)
const record = (await getStore(bootQs.get('store') ?? lastStore())) ?? (await getStore('generic_darkstore'))!
rememberStore(record.name)
load(record.layout, record.bins ?? undefined)
await mountStorePicker(record.name)
mountForm()
mountLab(record)
mountLabHover()
if (bootQs.get('lab')) openLab()
if (bootQs.get('lab') === 'run') {
  // Check hook: B = the "More riders" preset, 3 days each, run.
  document.querySelector<HTMLButtonElement>('#lab-presets [data-p="4"]')!.click()
  document.querySelector<HTMLInputElement>('#lab-seeds')!.value = '3'
  document.querySelector<HTMLButtonElement>('#lab-run')!.click()
}
if (bootQs.get('nsdemo')) demoImport()
resize()
// URL hooks for screenshot checks: ?view=top | chiller | hv | ph | aisle, ?find=A5-06-C3, ?walls=low
const qs = new URLSearchParams(location.search)
const found = qs.get('find') ? findSlot(store, qs.get('find')!) : null
if (found) focus(found, true)
else view(qs.get('view') ?? 'overview', true)
if (qs.get('walls') === 'low') wallBtn.click()
// ?walk=x,z,yawDeg[,pitchDeg] drops you in first person there.
const w = qs.get('walk')?.split(',').map(Number)
if (w) { setWalk(true, [w[0], w[1], (w[2] * Math.PI) / 180]); if (w[3]) walk.place(w[0], w[1], (w[2] * Math.PI) / 180, (w[3] * Math.PI) / 180) }
// ?who=picker|rider|sm|asm selects the first of that role and frames them (after they have moved a little).
const who = qs.get('who')
if (who) setTimeout(() => {
  const p = [...people.list, ...crew.members].find(a => a.role === who)
  if (!p) return
  selectPerson(p)
  const f = V(Math.sin(p.yaw), 0, Math.cos(p.yaw))
  fly(V(p.x, 2.9, p.z).addScaledVector(f, -2.2), V(p.x, 1.0, p.z), true)
}, 3000)

// ?order=1 starts an order on load; ?speed=N runs the floor N× (for screenshot checks).
const sp = qs.get('speed')
if (sp) { speed = Number(sp); document.querySelectorAll<HTMLElement>('[data-speed]').forEach(x => x.classList.toggle('on', x.dataset.speed === sp)) }
if (qs.get('order')) setTimeout(() => orderBtn.click(), 500)
// ?skip=S fast-forwards S simulated seconds after the order starts, without rendering (for checks).
const skip = Number(qs.get('skip') ?? 0)
if (skip) setTimeout(() => {
  sim.advance(skip)
  crew.sync(0.1, 1)
  renderOrder(trace.order, sim, trace.waiting)
  renderKpis(sim)
  lastActor = null
}, 900)

// ?night=1 jumps to 00:55 on load; with ?skip=S, then runs S more seconds (checks).
if (qs.get('night')) jumpTo(1)
