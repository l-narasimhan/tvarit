// Chiller evaporators: ceiling-hung unit coolers along the chiller's back wall, fans turning, cold air falling
// from them in a slow mist. Placed from the layout: one unit every ~3.5 m along each chiller zone's top edge.

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Store } from '../model'
import { boxAt, canvasTexture, merged } from './util'

export interface Coolers {
  group: THREE.Group
  /** Unit centres, world metres — the sound gets louder under them. */
  units: THREE.Vector3[]
  update(dt: number): void
}

const W = 1.1, H = 0.36, D = 0.55, Y = 2.6, FAN_R = 0.14
const MIST = 160

export function buildCoolers(store: Store): Coolers {
  const group = new THREE.Group()
  group.name = 'coolers'
  const units: THREE.Vector3[] = []
  const coldWalls = store.walls.filter(w => w.style === 'cold' && w.z1 - w.z0 > w.x1 - w.x0)

  for (const z of store.zones.filter(z => z.kind === 'chiller')) {
    const n = Math.max(1, Math.floor((z.x1 - z.x0) / 3.5))
    for (let i = 0; i < n; i++) {
      const x = z.x0 + ((i + 0.5) / n) * (z.x1 - z.x0)
      // Keep clear of partitions that run down from this wall.
      if (coldWalls.some(w => Math.abs((w.x0 + w.x1) / 2 - x) < W / 2 + 0.2 && w.z0 < z.z0 + 1)) continue
      units.push(new THREE.Vector3(x, Y, z.z0 + D / 2 + 0.02))
    }
  }

  const body: THREE.BufferGeometry[] = [], dark: THREE.BufferGeometry[] = [], pipe: THREE.BufferGeometry[] = []
  const fans: THREE.Mesh[] = []
  const bladeGeo = fanBlades()
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide })
  for (const u of units) {
    body.push(boxAt(W, H, D, u.x, u.y, u.z))
    // Fan face with two shrouds, a drip tray below, the refrigerant lines back to the wall.
    for (const dx of [-0.26, 0.26]) {
      const ring = new THREE.TorusGeometry(FAN_R + 0.01, 0.012, 6, 24)
      ring.translate(u.x + dx, u.y, u.z + D / 2 + 0.01)
      dark.push(ring)
      const disc = new THREE.CircleGeometry(FAN_R, 24)
      disc.translate(u.x + dx, u.y, u.z + D / 2 + 0.002)
      dark.push(disc)
      const f = new THREE.Mesh(bladeGeo, bladeMat)
      f.position.set(u.x + dx, u.y, u.z + D / 2 + 0.012)
      fans.push(f)
      group.add(f)
    }
    dark.push(boxAt(W + 0.04, 0.03, D + 0.04, u.x, u.y - H / 2 - 0.02, u.z))
    pipe.push(boxAt(0.03, 0.03, 0.3, u.x - W / 2 + 0.1, u.y + 0.05, u.z - D / 2 - 0.1))
    pipe.push(boxAt(0.03, 0.03, 0.3, u.x - W / 2 + 0.16, u.y + 0.05, u.z - D / 2 - 0.1))
  }
  group.add(merged(body, new THREE.MeshStandardMaterial({ color: 0xeef1f3, roughness: 0.35, metalness: 0.3 })))
  group.add(merged(dark, new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide }), false))
  group.add(merged(pipe, new THREE.MeshStandardMaterial({ color: 0xb87333, roughness: 0.35, metalness: 0.9 }), false))

  // Cold mist: each particle leaves a fan, drifts out and sinks, fading, then starts again.
  const count = units.length * MIST
  const pos = new Float32Array(count * 3)
  const life = new Float32Array(count), vel = new Float32Array(count * 3)
  const alpha = new Float32Array(count)
  const reset = (i: number, age: number) => {
    const u = units[Math.floor(i / MIST)]
    const dx = (Math.random() < 0.5 ? -0.26 : 0.26) + (Math.random() - 0.5) * 0.2
    pos.set([u.x + dx, u.y + (Math.random() - 0.5) * 0.2, u.z + D / 2 + 0.03], i * 3)
    vel.set([(Math.random() - 0.5) * 0.12, -0.05 - Math.random() * 0.1, 0.35 + Math.random() * 0.25], i * 3)
    life[i] = age
  }
  for (let i = 0; i < count; i++) reset(i, Math.random() * 3)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1))
  const puff = canvasTexture(64, 64, ctx => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64)
  })
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { map: { value: puff }, scale: { value: 420 } },
    vertexShader: `attribute float alpha; varying float vA; uniform float scale;
      void main() { vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = scale * 0.22 / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; varying float vA;
      void main() { vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(0.88, 0.95, 1.0, t.a * vA * 0.22); }`,
  })
  const mist = new THREE.Points(geo, mat)
  mist.frustumCulled = false
  if (count) group.add(mist)

  const LIFE = 3
  return {
    group, units,
    update(dt) {
      for (const f of fans) f.rotation.z -= dt * 22
      for (let i = 0; i < count; i++) {
        life[i] += dt
        if (life[i] > LIFE) reset(i, 0)
        const k = i * 3
        vel[k + 1] -= dt * 0.12                       // cold air sinks
        pos[k] += vel[k] * dt; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += vel[k + 2] * dt
        const t = life[i] / LIFE
        alpha[i] = Math.min(1, t * 6) * (1 - t)
      }
      geo.attributes.position.needsUpdate = true
      geo.attributes.alpha.needsUpdate = true
    },
  }
}

function fanBlades() {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.quadraticCurveTo(0.05, 0.06, 0.02, FAN_R - 0.01)
  shape.quadraticCurveTo(-0.03, 0.08, 0, 0)
  const geos: THREE.BufferGeometry[] = []
  for (let b = 0; b < 5; b++) {
    const g = new THREE.ShapeGeometry(shape)
    g.rotateZ((b / 5) * Math.PI * 2)
    geos.push(g)
  }
  geos.push(new THREE.CircleGeometry(0.03, 12))
  return mergeGeometries(geos, false)!
}
