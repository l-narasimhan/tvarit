// The view of the simulation's workers: one figure per picker and rider, a scooter per rider, and a bag in every
// occupied pigeon hole. Reads the engine every frame; never changes it.

import * as THREE from 'three'
import type { Slot } from '../model'
import type { Person } from '../people'
import type { Act, Sim, Worker } from '../sim/engine'
import { Figure, makeScooter, nameTag, type Pose } from './figure'

const POSE: Record<Act, Pose> = { idle: 'stand', walk: 'walk', scan: 'scan', reach: 'reach', pack: 'pack', ride: 'ride', phone: 'phone', away: 'stand' }

/** A worker as the inspector and picking see a person. */
class Member implements Person {
  readonly fig: Figure
  readonly tag: THREE.Sprite
  readonly scooter: THREE.Object3D | null
  private lastCarry = -1
  private lastBag = false
  constructor(readonly w: Worker, seed: number) {
    this.fig = new Figure(w.role, seed)
    this.tag = nameTag(w.name, w.role)
    this.fig.root.add(this.tag)
    this.fig.root.userData.person = this
    this.scooter = w.scooter ? makeScooter(seed) : null
  }
  get id() { return this.w.id }
  get name() { return this.w.name }
  get role() { return this.w.role }
  get shift() { return this.w.role === 'picker' ? '17:00–01:00' : '16:00–00:00' }
  get status() { return this.w.status }
  get done() { return this.w.done }
  get doneLabel() { return this.w.role === 'picker' ? 'orders picked this run' : 'trips this run' }
  get x() { return this.w.x }
  get z() { return this.w.z }
  get yaw() { return this.w.yaw }
  get busy() { return this.w.order?.id ?? null }

  sync(dt: number, speed: number) {
    const w = this.w
    this.fig.root.visible = w.visible
    this.fig.root.position.set(w.x, 0, w.z)
    this.fig.root.rotation.y = w.yaw
    this.fig.pose(POSE[w.act], dt * Math.min(speed, 4), w.role === 'rider' ? 1.25 : 1.3)
    if (w.carry.length !== this.lastCarry) { this.lastCarry = w.carry.length; this.fig.setCrate(w.carry) }
    if (w.bag !== this.lastBag) { this.lastBag = w.bag; this.fig.setBag(w.bag) }
    if (this.scooter && w.scooter) {
      this.scooter.visible = w.scooter.visible
      this.scooter.position.set(w.scooter.x, 0, w.scooter.z)
      this.scooter.rotation.y = w.scooter.yaw
    }
  }
}

export class Crew {
  readonly group = new THREE.Group()
  readonly members: Member[]
  private bags = new Map<string, THREE.Mesh>()
  private bagGeo = new THREE.BoxGeometry(1, 1, 1)
  private bagMat = new THREE.MeshStandardMaterial({ color: 0xc09562, roughness: 0.85 })

  constructor(private sim: Sim) {
    this.group.name = 'crew'
    this.members = sim.workers.map((w, i) => new Member(w, 3 + i * 5))
    for (const m of this.members) {
      this.group.add(m.fig.root)
      if (m.scooter) this.group.add(m.scooter)
    }
    sim.onPH = s => this.setBag(s)
    for (const o of sim.open) if (o.ph) this.setBag(o.ph)
  }

  /** A sealed order bag sits in a pigeon hole for as long as the slot is taken. */
  private setBag(s: Slot) {
    const has = this.bags.get(s.code)
    const occupied = s.qty > 0 && this.sim.open.some(o => o.ph === s && (o.stage === 'ready' || o.stage === 'collecting'))
    if (occupied && !has) {
      const h = Math.min(0.28, s.h - 0.05)
      const b = new THREE.Mesh(this.bagGeo, this.bagMat)
      b.scale.set(0.24, h, 0.16)
      b.position.set(s.x, s.y - s.h / 2 + h / 2, s.z)
      b.rotation.y = s.ry
      b.castShadow = true
      this.bags.set(s.code, b)
      this.group.add(b)
    } else if (!occupied && has) {
      this.group.remove(has)
      this.bags.delete(s.code)
    }
  }

  sync(dt: number, speed: number) { for (const m of this.members) m.sync(dt, speed) }
  setTags(on: boolean) { for (const m of this.members) m.tag.visible = on }
  get hitMeshes() { return this.members.map(m => m.fig.hit) }
  byWorker(w: Worker) { return this.members.find(m => m.w === w) ?? null }
}
