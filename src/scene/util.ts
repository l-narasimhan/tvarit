import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/** A box of w × h × d whose centre is at local (x, y, z), then carried by `m` into the world. */
export function boxAt(w: number, h: number, d: number, x: number, y: number, z: number, m?: THREE.Matrix4) {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(x, y, z)
  if (m) g.applyMatrix4(m)
  return g
}

/** Merges a list into one mesh; returns an empty group when there is nothing to draw. */
export function merged(geos: THREE.BufferGeometry[], mat: THREE.Material, shadows = true): THREE.Object3D {
  if (!geos.length) return new THREE.Group()
  const parts = geos.map(g => (g.index ? g.toNonIndexed() : g))
  const g = mergeGeometries(parts, false)!
  geos.forEach(x => x.dispose())
  const mesh = new THREE.Mesh(g, mat)
  mesh.castShadow = shadows; mesh.receiveShadow = shadows
  return mesh
}

export const rackMatrix = (cx: number, y: number, cz: number, ry: number) =>
  new THREE.Matrix4().makeRotationY(ry).setPosition(cx, y, cz)

export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** Text painted flat on the floor, `size` metres tall, centred on (x, z). */
export function floorText(text: string, x: number, z: number, size: number, color = '#ffffff', rot = 0, opacity = 0.9) {
  const font = 'bold 96px system-ui, sans-serif'
  const probe = document.createElement('canvas').getContext('2d')!
  probe.font = font
  const tw = Math.ceil(probe.measureText(text).width) + 24
  const tex = canvasTexture(tw, 120, ctx => {
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(text, tw / 2, 64)
  })
  const w = size * (tw / 120)
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, size),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false }))
  mesh.rotation.set(-Math.PI / 2, 0, rot)
  mesh.position.set(x, 0.015, z)
  return mesh
}
