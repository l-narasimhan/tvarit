// Low-poly people with real joints (hips, knees, shoulders) so they can walk, sit, reach and scan. Forward is
// local +z. Each role is recognisable at a glance: picker in hi-vis with scanner and crate,
// store manager in shirt and lanyard, ASM in blazer with clipboard, rider in helmet with delivery bag.

import * as THREE from 'three'

export type Role = 'sm' | 'asm' | 'picker' | 'rider'
export type Pose = 'stand' | 'walk' | 'scan' | 'pack' | 'sit' | 'ride' | 'phone' | 'reach' | 'carry' | 'check' | 'talk'

export const ROLE_NAME: Record<Role, string> = { sm: 'Store Manager', asm: 'Area Sales Manager', picker: 'Picker', rider: 'Rider' }
export const ROLE_COLOR: Record<Role, string> = { sm: '#0f766e', asm: '#1e3a8a', picker: '#ea580c', rider: '#dc2626' }

const SKIN = [0x8d5524, 0xa0673a, 0xc68642, 0x7a4a26, 0xb07a4f, 0x9c6b43]
const HAIR = [0x1a1410, 0x221a14, 0x2b2118, 0x111111]

const mats = new Map<number, THREE.MeshStandardMaterial>()
const mat = (c: number, rough = 0.7, metal = 0.05) => {
  const k = c * 7 + Math.round(rough * 10)
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal }))
  return mats.get(k)!
}
const G = {
  thigh: new THREE.CapsuleGeometry(0.068, 0.34, 4, 10).translate(0, -0.23, 0),
  shin: new THREE.CapsuleGeometry(0.055, 0.33, 4, 10).translate(0, -0.21, 0),
  foot: new THREE.BoxGeometry(0.1, 0.06, 0.24).translate(0, -0.43, 0.04),
  upper: new THREE.CapsuleGeometry(0.048, 0.22, 4, 10).translate(0, -0.14, 0),
  fore: new THREE.CapsuleGeometry(0.043, 0.21, 4, 10).translate(0, -0.13, 0),
  hand: new THREE.SphereGeometry(0.046, 10, 8).translate(0, -0.29, 0),
  torso: new THREE.CapsuleGeometry(0.15, 0.3, 6, 14).scale(1.2, 1, 0.72),
  pelvis: new THREE.BoxGeometry(0.32, 0.14, 0.2),
  neck: new THREE.CylinderGeometry(0.045, 0.05, 0.1, 10),
  head: new THREE.SphereGeometry(0.105, 16, 12),
  hair: new THREE.SphereGeometry(0.112, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
  helmet: new THREE.SphereGeometry(0.14, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62),
  visor: new THREE.SphereGeometry(0.143, 16, 8, -Math.PI * 0.35, Math.PI * 0.7, Math.PI * 0.3, Math.PI * 0.22),
}

export class Figure {
  readonly root = new THREE.Group()
  readonly hit: THREE.Mesh
  private body = new THREE.Group()
  private hipL = new THREE.Group(); private hipR = new THREE.Group()
  private kneeL = new THREE.Group(); private kneeR = new THREE.Group()
  private shL = new THREE.Group(); private shR = new THREE.Group()
  private elL = new THREE.Group(); private elR = new THREE.Group()
  private phase = Math.random() * 10
  private crate: THREE.Group | null = null
  private crateItems = new THREE.Group()
  private bag: THREE.Mesh
  private held = new THREE.Group()
  private heldN = 0

  constructor(readonly role: Role, seed: number) {
    const skin = mat(SKIN[seed % SKIN.length], 0.6)
    const style = {
      sm: { top: 0xf1f5f9, legs: 0x1f2937 }, asm: { top: 0x1e3a8a, legs: 0x4b5563 },
      picker: { top: 0xf97316, legs: 0x1f2937 },
      rider: { top: 0xdc2626, legs: 0x111827 },
    }[role]
    const top = mat(style.top, 0.8), legs = mat(style.legs, 0.85), shoe = mat(0x141414, 0.6)
    const m = (g: THREE.BufferGeometry, mt: THREE.Material, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(g, mt); o.position.set(x, y, z); o.castShadow = true; return o
    }
    const s = 0.94 + (seed % 5) * 0.025
    this.root.scale.setScalar(s)
    this.root.add(this.body)

    // Legs: hip -> knee -> foot.
    for (const [hip, knee, x] of [[this.hipL, this.kneeL, -0.09], [this.hipR, this.kneeR, 0.09]] as const) {
      hip.position.set(x, 0.92, 0)
      hip.add(m(G.thigh, legs))
      knee.position.y = -0.46
      knee.add(m(G.shin, legs), m(G.foot, shoe))
      hip.add(knee)
      this.body.add(hip)
    }
    this.body.add(m(G.pelvis, legs, 0, 0.96, 0), m(G.torso, top, 0, 1.2, 0), m(G.neck, skin, 0, 1.52, 0), m(G.head, skin, 0, 1.64, 0))
    for (const [sh, el, x] of [[this.shL, this.elL, -0.225], [this.shR, this.elR, 0.225]] as const) {
      sh.position.set(x, 1.44, 0)
      el.position.y = -0.28
      el.add(m(G.fore, top), m(G.hand, skin))
      sh.add(m(G.upper, top), el)
      this.body.add(sh)
    }
    if (role === 'rider') {
      this.body.add(m(G.helmet, mat(seed % 2 ? 0xf8fafc : 0x111827, 0.3, 0.2), 0, 1.66, 0))
      this.body.add(m(G.visor, mat(0x0f172a, 0.1, 0.6), 0, 1.66, 0))
    } else this.body.add(m(G.hair, mat(HAIR[seed % HAIR.length], 0.9), 0, 1.655, -0.005))

    const box = (w: number, h: number, d: number, c: number, x: number, y: number, z: number, parent: THREE.Object3D = this.body, rough = 0.6) =>
      parent.add(m(new THREE.BoxGeometry(w, h, d), mat(c, rough), x, y, z))
    if (role === 'picker') {
      box(0.37, 0.03, 0.235, 0xe5e7eb, 0, 1.1, 0, this.body, 0.2)             // reflective bands
      box(0.37, 0.03, 0.235, 0xe5e7eb, 0, 1.3, 0, this.body, 0.2)
      box(0.05, 0.03, 0.15, 0x111827, 0, -0.31, 0.05, this.elR)                // handheld scanner
      box(0.03, 0.012, 0.012, 0xef4444, 0, -0.31, 0.13, this.elR)
      const crate = new THREE.Group()                                           // picking crate
      crate.position.set(-0.05, -0.34, 0.05)
      box(0.34, 0.02, 0.26, 0x0e7490, 0, -0.1, 0, crate)
      for (const [w, d, x, z] of [[0.34, 0.015, 0, 0.13], [0.34, 0.015, 0, -0.13], [0.015, 0.26, 0.17, 0], [0.015, 0.26, -0.17, 0]] as const)
        box(w, 0.2, d, 0x0e7490, x, 0, z, crate)
      crate.add(this.crateItems)
      this.crate = crate
      this.elL.add(crate)
    }
    if (role === 'sm') {
      box(0.012, 0.22, 0.012, 0x0f766e, 0, 1.33, 0.113)                         // lanyard
      box(0.07, 0.1, 0.01, 0x0f766e, 0, 1.2, 0.118)                             // ID card
    }
    if (role === 'asm') {
      box(0.1, 0.18, 0.01, 0xf8fafc, 0, 1.36, 0.108)                            // shirt V under blazer
      box(0.22, 0.3, 0.015, 0x8b5e34, 0.02, -0.25, 0.1, this.elL)              // clipboard
      box(0.19, 0.25, 0.004, 0xffffff, 0.02, -0.25, 0.11, this.elL)
    }
    if (role === 'rider') {
      box(0.38, 0.44, 0.26, 0x1f2937, 0, 1.2, -0.25, this.body, 0.8)            // insulated delivery bag
      box(0.385, 0.04, 0.265, 0xd1d5db, 0, 1.3, -0.25, this.body, 0.2)
    }

    // A sealed kraft order bag, carried in the right hand when there is one.
    this.bag = m(new THREE.BoxGeometry(0.24, 0.3, 0.14), mat(0xc09562, 0.85), 0, -0.44, 0.04)
    this.bag.visible = false
    this.elR.add(this.bag)
    // Inbound cases, held in front against the chest.
    this.held.position.set(0, 0.98, 0.3)
    this.body.add(this.held)

    this.hit = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.8, 0.55), new THREE.MeshBasicMaterial({ visible: false }))
    this.hit.position.y = 0.9
    this.root.add(this.hit)
  }

  /** What is in the picking crate: one small pack per unit, in the SKU's colour. */
  setCrate(colors: number[]) {
    if (!this.crate) return
    this.crateItems.clear()
    colors.slice(0, 12).forEach((c, i) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.1, 0.06), mat(c, 0.5))
      o.position.set(-0.12 + (i % 4) * 0.08, -0.03 + Math.floor(i / 8) * 0.1, -0.07 + (Math.floor(i / 4) % 2) * 0.12)
      this.crateItems.add(o)
    })
  }

  setBag(on: boolean) { this.bag.visible = on }

  /** Cartons carried in both arms, stacked. */
  setCases(colors: number[]) {
    if (colors.length === this.heldN) return
    this.heldN = colors.length
    this.held.clear()
    colors.slice(0, 3).forEach((c, i) => {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.26, 0.3), mat(0xb98b57, 0.85))
      box.position.y = i * 0.27
      box.castShadow = true
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.405, 0.05, 0.305), mat(c, 0.6))
      box.add(band)
      this.held.add(box)
    })
    if (this.crate) this.crate.visible = colors.length === 0
  }

  /** Drives the joints for this frame. `speed` is metres per second when walking. */
  pose(p: Pose, dt: number, speed = 1.2) {
    this.phase += dt * (p === 'walk' ? speed * 5.2 : 2)
    const t = this.phase
    let hl = 0, hr = 0, kl = 0, kr = 0, al = 0.05, ar = 0.05, alz = 0.06, arz = -0.06, y = 0
    let el = -0.15, er = -0.15
    if (p === 'walk') {
      const s = Math.sin(t)
      hl = 0.42 * s; hr = -0.42 * s
      kl = Math.max(0, -Math.sin(t - 0.9)) * 0.75; kr = Math.max(0, Math.sin(t - 0.9)) * 0.75
      al = -0.35 * s; ar = 0.35 * s
      el = -0.25 - Math.max(0, s) * 0.3; er = -0.25 - Math.max(0, -s) * 0.3
      y = Math.abs(Math.cos(t)) * 0.025 - 0.015
    } else if (p === 'carry') {
      const s = Math.sin(t)
      hl = 0.36 * s; hr = -0.36 * s
      kl = Math.max(0, -Math.sin(t - 0.9)) * 0.65; kr = Math.max(0, Math.sin(t - 0.9)) * 0.65
      al = ar = -0.75; el = er = -0.75; alz = 0.28; arz = -0.28
      y = Math.abs(Math.cos(t)) * 0.02 - 0.015
    } else if (p === 'sit') {
      hl = hr = -1.5; kl = kr = 1.5; y = -0.43; al = ar = -0.35; el = er = -1.1
    } else if (p === 'ride') {
      hl = hr = -1.2; kl = kr = 1.05; y = -0.08; al = ar = -0.7; el = er = -0.5; alz = 0.2; arz = -0.2
    } else if (p === 'scan') {
      ar = -0.75; er = -0.85 + Math.sin(t * 2) * 0.05; al = -0.35; el = -0.9; y = Math.sin(t) * 0.004
    } else if (p === 'reach') {
      ar = -1.5 + Math.sin(t * 1.5) * 0.15; er = -0.2; al = -0.6; el = -0.7
    } else if (p === 'pack') {
      al = -0.55 + Math.sin(t * 3) * 0.2; ar = -0.55 + Math.sin(t * 3 + 1.8) * 0.2
      el = -0.95 + Math.sin(t * 3 + 0.6) * 0.2; er = -0.95 + Math.sin(t * 3 + 2.4) * 0.2; alz = 0.15; arz = -0.15
    } else if (p === 'check') {
      // Looking down at the handheld held at the chest.
      ar = -0.45; er = -1.45 + Math.sin(t * 0.7) * 0.05; arz = -0.1; al = -0.2; el = -0.5
      y = Math.sin(t) * 0.004
    } else if (p === 'talk') {
      // Weight on one leg, a hand gesturing now and then.
      hl = 0.06; kl = 0.12
      const g = Math.max(0, Math.sin(t * 0.9))
      ar = -0.25 - g * 0.5; er = -0.5 - g * 0.6 + Math.sin(t * 3) * 0.08 * g; al = -0.15; el = -0.4
      y = Math.sin(t) * 0.004
    } else if (p === 'phone') {
      ar = -0.35; arz = -0.45; er = -2.35; y = Math.sin(t) * 0.004
    } else {
      y = Math.sin(t) * 0.004
    }
    this.hipL.rotation.x = hl; this.hipR.rotation.x = hr
    this.kneeL.rotation.x = kl; this.kneeR.rotation.x = kr
    this.shL.rotation.set(al, 0, alz); this.shR.rotation.set(ar, 0, arz)
    this.elL.rotation.x = el; this.elR.rotation.x = er
    this.body.position.y = y
  }
}

/** A delivery scooter, nose along local +z. */
export function makeScooter(seed: number): THREE.Group {
  const g = new THREE.Group()
  const paint = mat([0x9ca3af, 0x111827, 0xf8fafc, 0xb91c1c, 0x1d4ed8, 0x065f46][seed % 6], 0.35, 0.4)
  const dark = mat(0x1f2937, 0.6), tyre = mat(0x111111, 0.9), chrome = mat(0xd1d5db, 0.25, 0.9)
  const add = (geo: THREE.BufferGeometry, mt: THREE.Material, x: number, y: number, z: number, rx = 0, rz = 0) => {
    const o = new THREE.Mesh(geo, mt); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); o.castShadow = true; g.add(o)
  }
  for (const z of [0.62, -0.55]) {
    add(new THREE.TorusGeometry(0.17, 0.055, 8, 20), tyre, 0, 0.22, z, 0, 0)
    g.children[g.children.length - 1].rotation.y = Math.PI / 2
    add(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 12), chrome, 0, 0.22, z, 0, Math.PI / 2)
  }
  add(new THREE.BoxGeometry(0.28, 0.08, 0.8), dark, 0, 0.3, 0.05)                         // floorboard
  add(new THREE.BoxGeometry(0.42, 0.36, 0.72), paint, 0, 0.52, -0.33)                      // rear body
  add(new THREE.BoxGeometry(0.3, 0.09, 0.56), dark, 0, 0.75, -0.3)                         // seat
  add(new THREE.BoxGeometry(0.36, 0.62, 0.08), paint, 0, 0.62, 0.46, -0.25)                // leg shield
  add(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 8), chrome, 0, 0.86, 0.56, -0.25)    // steering column
  add(new THREE.CylinderGeometry(0.018, 0.018, 0.62, 8), dark, 0, 1.12, 0.62, 0, Math.PI / 2)  // handlebar
  add(new THREE.BoxGeometry(0.2, 0.12, 0.08), paint, 0, 1.08, 0.66)                        // headlamp cowl
  const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.045, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 1.5 }))
  lamp.position.set(0, 1.08, 0.701); g.add(lamp)
  add(new THREE.BoxGeometry(0.2, 0.06, 0.03), mat(0xb91c1c, 0.3), 0, 0.62, -0.7)          // tail light
  return g
}

/** Floating name tag: role colour, name, role. */
export function nameTag(name: string, role: Role): THREE.Sprite {
  const c = document.createElement('canvas')
  c.width = 320; c.height = 84
  const ctx = c.getContext('2d')!
  ctx.fillStyle = 'rgba(15,23,42,0.88)'
  ctx.beginPath(); ctx.roundRect(2, 2, 316, 80, 16); ctx.fill()
  ctx.fillStyle = ROLE_COLOR[role]
  ctx.beginPath(); ctx.roundRect(2, 2, 14, 80, [16, 0, 0, 16]); ctx.fill()
  ctx.fillStyle = '#f8fafc'; ctx.font = '700 32px system-ui, sans-serif'; ctx.textBaseline = 'middle'
  ctx.fillText(name, 30, 30)
  ctx.fillStyle = '#94a3b8'; ctx.font = '600 22px system-ui, sans-serif'
  ctx.fillText(ROLE_NAME[role], 30, 62)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true }))
  s.scale.set(0.72, 0.19, 1)
  s.position.y = 2.05
  return s
}
