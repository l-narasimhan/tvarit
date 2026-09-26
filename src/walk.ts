// First-person walk: eye height 1.65 m, W/S or arrows up/down to move, arrows left/right to turn, A/D to
// sidestep, Shift to hurry, mouse to look (pointer lock, or drag when
// the browser will not lock). Collides with shelving, fridges, walls, desks and pallets; doors are open.

import * as THREE from 'three'
import type { Rect, Slot, Store } from './model'
import { solids } from './nav'

const EYE = 1.65, RADIUS = 0.22, WALK = 1.4, RUN = 3.0, TURN = 1.9

export class Walk {
  active = false
  private yaw = 0
  private pitch = 0
  private keys = new Set<string>()
  private solids: Rect[] = []
  private bounds: Rect = { x0: 0, z0: 0, x1: 0, z1: 0 }
  private drag: { x: number; y: number } | null = null

  constructor(private camera: THREE.PerspectiveCamera, private canvas: HTMLCanvasElement) {
    addEventListener('keydown', e => {
      if (!this.active || (e.target as HTMLElement).tagName === 'INPUT') return
      this.keys.add(e.code)
      if (e.code.startsWith('Arrow')) e.preventDefault()
    })
    addEventListener('keyup', e => this.keys.delete(e.code))
    addEventListener('blur', () => this.keys.clear())
    document.addEventListener('mousemove', e => {
      if (!this.active) return
      if (document.pointerLockElement === canvas) this.look(e.movementX, e.movementY)
      else if (this.drag) { this.look(e.clientX - this.drag.x, e.clientY - this.drag.y); this.drag = { x: e.clientX, y: e.clientY } }
    })
    canvas.addEventListener('mousedown', e => { if (this.active) this.drag = { x: e.clientX, y: e.clientY } })
    addEventListener('mouseup', () => (this.drag = null))
  }

  get locked() { return document.pointerLockElement === this.canvas }

  lock() { if (this.active && !this.locked) this.canvas.requestPointerLock?.() }

  setStore(s: Store) {
    this.solids = solids(s)
    this.bounds = { x0: -10, z0: -0.2, x1: s.W, z1: s.D }
  }

  enter(x: number, z: number, yaw: number) {
    this.active = true
    this.place(x, z, yaw, 0)
  }

  exit() {
    this.active = false
    this.keys.clear()
    if (this.locked) document.exitPointerLock()
  }

  place(x: number, z: number, yaw: number, pitch = 0) {
    this.yaw = yaw; this.pitch = pitch
    this.camera.position.set(x, EYE, z)
    this.apply()
  }

  /** Step back from a slot to arm's length, facing it. */
  faceSlot(s: Slot) {
    const nx = Math.sin(s.ry), nz = Math.cos(s.ry)
    const x = s.x + nx * 0.9, z = s.z + nz * 0.9
    const yaw = Math.atan2(nx, nz)
    const pitch = Math.atan2(s.y - EYE, 0.9)
    this.place(x, z, yaw, pitch)
  }

  update(dt: number) {
    const f = (k: string) => (this.keys.has(k) ? 1 : 0)
    const hurry = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')
    // Arrow left / right (and Q / E) turn on the spot; A / D step sideways.
    const turn = f('ArrowLeft') + f('KeyQ') - f('ArrowRight') - f('KeyE')
    if (turn) {
      this.yaw += turn * (hurry ? TURN * 1.8 : TURN) * dt
      this.pitch *= Math.max(0, 1 - 4 * dt)         // ease the gaze back to level while turning
      this.apply()
    }
    const fwd = f('KeyW') + f('ArrowUp') - f('KeyS') - f('ArrowDown')
    const side = f('KeyD') - f('KeyA')
    if (!fwd && !side) return
    const speed = (hurry ? RUN : WALK) * dt
    const len = Math.hypot(fwd, side)
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw)
    const dx = ((-sy * fwd + cy * side) / len) * speed
    const dz = ((-cy * fwd - sy * side) / len) * speed
    const p = this.camera.position
    // Axis by axis, so you slide along a shelf instead of sticking to it.
    if (!this.hit(p.x + dx, p.z)) p.x += dx
    if (!this.hit(p.x, p.z + dz)) p.z += dz
  }

  private hit(x: number, z: number) {
    const b = this.bounds
    if (x < b.x0 + RADIUS || x > b.x1 - RADIUS || z < b.z0 - 12 || z > b.z1 + 12) return true
    return this.solids.some(r => x + RADIUS > r.x0 && x - RADIUS < r.x1 && z + RADIUS > r.z0 && z - RADIUS < r.z1)
  }

  private look(dx: number, dy: number) {
    this.yaw -= dx * 0.0025
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0025, -1.4, 1.4)
    this.apply()
  }

  private apply() {
    this.camera.rotation.order = 'YXZ'
    this.camera.rotation.set(this.pitch, this.yaw, 0)
  }
}
