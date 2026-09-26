import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { STORE01 } from './layout/store01'
import { buildStore, type Slot, type Store } from './model'
import { buildFixtures } from './scene/fixtures'
import { Goods } from './scene/goods'
import { LabelAtlas } from './scene/labels'
import { buildRacks, rackHeaders } from './scene/racks'
import { buildShell } from './scene/shell'
import { findSlot, renderInspector, renderSummary } from './ui'
import './style.css'

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
const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
  new THREE.LineBasicMaterial({ color: 0xffb000, depthTest: false, transparent: true }))
highlight.renderOrder = 10
highlight.visible = false
scene.add(highlight)

function load(layout = STORE01) {
  world.clear()
  store = buildStore(layout)
  const atlas = new LabelAtlas()
  const goods = new Goods()
  for (const s of store.slots) if (s.kind === 'bin') goods.stockBin(s)
  const shell = buildShell(store)
  walls = shell.walls
  world.add(shell.floor, walls, buildRacks(store, atlas), rackHeaders(store), buildFixtures(store, atlas, goods))
  goods.meshes().forEach(m => world.add(m))
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
  if (name === 'aisle') return fly(V(W * 0.2, 1.7, D * 0.26), V(W * 0.32, 1.1, D * 0.26), instant)
  return fly(V(W * 0.5 + 6, 26, D + 16), V(W / 2, 0, D / 2 - 1), instant)
}

function focus(s: Slot, instant = false) {
  select(s)
  const n = V(Math.sin(s.ry), 0, Math.cos(s.ry))
  const dist = s.kind === 'pallet' ? 3.2 : 1.5
  const target = V(s.x, s.y, s.z)
  fly(target.clone().addScaledVector(n, dist).add(V(0, 0.35, 0)), target, instant)
}

let selected: Slot | null = null
function select(s: Slot | null) {
  selected = s
  highlight.visible = !!s
  if (s) slotMatrix(s, 1.04).decompose(highlight.position, highlight.quaternion, highlight.scale)
  renderInspector(s, store)
}

// ---- Picking -----------------------------------------------------------------------------------------------
const ray = new THREE.Raycaster()
const ndc = new THREE.Vector2()
const tip = document.querySelector<HTMLDivElement>('#tip')!
function pick(e: MouseEvent): Slot | null {
  const r = canvas.getBoundingClientRect()
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
  ray.setFromCamera(ndc, camera)
  const hit = ray.intersectObject(hits, false)[0]
  return hit?.instanceId != null ? store.slots[hit.instanceId] : null
}
let down = { x: 0, y: 0 }
canvas.addEventListener('pointerdown', e => (down = { x: e.clientX, y: e.clientY }))
canvas.addEventListener('pointerup', e => {
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return
  select(pick(e))
})
canvas.addEventListener('dblclick', e => { const s = pick(e); if (s) focus(s) })
canvas.addEventListener('pointermove', e => {
  if (e.buttons) { tip.hidden = true; return }
  const s = pick(e)
  tip.hidden = !s
  if (s) {
    tip.textContent = s.sku && s.kind !== 'ph' ? `${s.code} · ${s.sku.name} · ${s.qty}` : s.code
    tip.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`
  }
})
document.querySelector('#inspector')!.addEventListener('close', () => select(null))

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

// ---- Loop --------------------------------------------------------------------------------------------------
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  // Centre the view in the space right of the left panel, on screens wide enough to have one beside it.
  const left = document.querySelector<HTMLElement>('#left')!
  const shift = w > 720 ? (left.offsetWidth + 12) / 2 : 0
  camera.setViewOffset(w, h, -shift, 0, w, h)
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)

const clock = new THREE.Clock()
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta()
  if (tween.t < 1) {
    tween.t = Math.min(1, tween.t + dt / 0.8)
    const k = tween.t < 0.5 ? 2 * tween.t * tween.t : 1 - (-2 * tween.t + 2) ** 2 / 2
    camera.position.lerpVectors(tween.from[0], tween.to[0], k)
    controls.target.lerpVectors(tween.from[1], tween.to[1], k)
  }
  controls.update()
  renderer.render(scene, camera)
})

load()
resize()
// URL hooks for screenshot checks: ?view=top | chiller | hv | ph | aisle, ?find=A5-06-C3, ?walls=low
const qs = new URLSearchParams(location.search)
const found = qs.get('find') ? findSlot(store, qs.get('find')!) : null
if (found) focus(found, true)
else view(qs.get('view') ?? 'overview', true)
if (qs.get('walls') === 'low') wallBtn.click()
