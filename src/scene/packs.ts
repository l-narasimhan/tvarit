// Retail packs: a real shape per pack type and printed pack art per SKU, drawn on a canvas — brand name in a
// logo badge, variant, net quantity, brand colours and a small category motif. Brand names and colours only;
// no reproduced logo artwork.
//
// Every shape is a unit (1 × 1 × 1, centred) so instances scale it to the SKU's real w × h × d.
// UV conventions: flat packs show the art on their +z face (the pick face); round packs wrap the art so its
// centre faces +z, with cap / lid / can-end bands at the top of the texture.

import * as THREE from 'three'
import type { Product, Shape } from '../catalog'

const ROUND = new Set<Shape>(['bottle', 'jar', 'can', 'tub'])
export const isRound = (s: Shape) => ROUND.has(s)

// ---- Geometry ------------------------------------------------------------------------------------------------

const geoCache = new Map<string, THREE.BufferGeometry>()

export function packGeometry(shape: Shape | 'plain' | 'plainRound'): THREE.BufferGeometry {
  if (geoCache.has(shape)) return geoCache.get(shape)!
  let g: THREE.BufferGeometry
  if (shape === 'plain') g = new THREE.BoxGeometry(1, 1, 1)
  else if (shape === 'plainRound') g = new THREE.CylinderGeometry(0.5, 0.5, 1, 14)
  else if (ROUND.has(shape)) g = lathe(shape)
  else if (shape === 'pouch' || shape === 'bag') g = pillow(shape === 'pouch' ? 0.75 : 0.4)
  else if (shape === 'tray') g = flatBox(true)
  else g = flatBox(false)
  geoCache.set(shape, g)
  return g
}

/** A carton: art on the front; sides, top and back take the brand-colour strip at the art's left edge. */
function flatBox(tray: boolean) {
  const g = new THREE.BoxGeometry(1, 1, 1)
  const uv = g.attributes.uv as THREE.BufferAttribute
  // Face order: +x, -x, +y, -y, +z, -z; 4 vertices each.
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k
      const u = uv.getX(i), v = uv.getY(i)
      if (f === 4) uv.setXY(i, u, tray ? 0.5 + v * 0.5 : v)            // front: the art
      else if (tray && f === 2) uv.setXY(i, u, v * 0.5)                  // tray top: the eggs
      else uv.setXY(i, 0.005 + u * 0.03, 0.3 + v * 0.3)                  // elsewhere: brand strip
    }
  }
  return g
}

/** A pillow pack: bulges in the middle, crimped flat at the top and bottom seals. */
function pillow(bulge: number) {
  const g = new THREE.BoxGeometry(1, 1, 1, 4, 10, 1)
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const t = Math.abs(y) * 2                                   // 0 centre … 1 seal
    const seal = t > 0.86 ? 0.12 : 1
    const fill = Math.pow(Math.cos((t * Math.PI) / 2), 0.55)
    const across = 1 - Math.pow(Math.abs(x) * 2, 3) * 0.5      // thinner towards the side seams
    p.setZ(i, z * Math.max(0.08, (1 - bulge + bulge * fill) * across) * seal)
    p.setX(i, x * (1 - 0.05 * (1 - fill)))
  }
  g.computeVertexNormals()
  const uv = g.attributes.uv as THREE.BufferAttribute
  // Only the front and back faces carry art; the rest are brand colour.
  const n = g.attributes.normal as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) {
    const front = Math.abs(n.getZ(i)) > 0.3
    if (!front) uv.setXY(i, 0.005 + uv.getX(i) * 0.03, 0.3 + uv.getY(i) * 0.3)
  }
  return g
}

const PROFILE: Record<string, [number, number][]> = {
  bottle: [[0, -0.5], [0.44, -0.5], [0.5, -0.46], [0.5, 0.12], [0.44, 0.24], [0.24, 0.34], [0.19, 0.38], [0.2, 0.41], [0.2, 0.5], [0, 0.5]],
  jar: [[0, -0.5], [0.47, -0.5], [0.5, -0.46], [0.5, 0.28], [0.45, 0.33], [0.48, 0.35], [0.48, 0.5], [0, 0.5]],
  can: [[0, -0.5], [0.43, -0.5], [0.5, -0.45], [0.5, 0.43], [0.44, 0.5], [0, 0.5]],
  tub: [[0, -0.5], [0.42, -0.5], [0.5, 0.34], [0.52, 0.38], [0.52, 0.5], [0, 0.5]],
}

function lathe(shape: Shape) {
  const pts = PROFILE[shape].map(([r, y]) => new THREE.Vector2(r, y))
  const g = new THREE.LatheGeometry(pts, 20, -Math.PI / 2)
  // Lathe v is point index; the art wants height.
  const p = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setY(i, p.getY(i) + 0.5)
  g.computeVertexNormals()
  return g
}

// ---- Art -----------------------------------------------------------------------------------------------------

const BRANDS = ['Mother Dairy', 'Head & Shoulders', 'Paper Boat', 'Red Bull', 'India Gate', 'Good Knight', 'Harvest Gold',
  'Clinic Plus', 'Tata Sampann', 'Tata Tea', 'Tata Salt', 'Farm Eggs', 'Modern', 'Sunfeast', 'Dark Fantasy', "Lay's",
  'Coca-Cola', 'Thums Up', 'Nestlé', 'Amul', 'Surf Excel', 'Scotch-Brite', 'Fortune', 'Kissan']

export function splitName(name: string) {
  const clean = name.replace(/\s*\((case|bag|tin)\)$/i, '')
  const size = clean.match(/(\d[\d.,]*\s*(×|x)?\s*\d*[\d.,]*\s*(kg|g|ml|L|pcs|pads|pulls|ct|pages|Finger)\b.*|\d+-pack.*|\d+\s*pcs.*)$/i)?.[0] ?? ''
  let rest = size ? clean.slice(0, clean.length - size.length).trim() : clean
  const brand = BRANDS.find(b => rest.startsWith(b)) ?? rest.split(' ')[0]
  const variant = rest.slice(brand.length).trim()
  return { brand, variant, size: size.trim() }
}

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`
const lum = (c: number) => ((c >> 16) & 255) * 0.299 + ((c >> 8) & 255) * 0.587 + (c & 255) * 0.114
const shade = (c: number, k: number) => {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))))
  return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255)
}

function fit(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, size: number, weight = 800, font = 'system-ui, sans-serif') {
  let s = size
  do { ctx.font = `${weight} ${s}px ${font}`; s -= 2 } while (ctx.measureText(text).width > maxW && s > 8)
  ctx.fillText(text, x, y)
}

/** Draws the front panel of a pack into (0,0,w,h). */
function panel(ctx: CanvasRenderingContext2D, p: Product, w: number, h: number) {
  const { brand, variant, size } = splitName(p.name)
  const base = p.color
  const dark = lum(base) > 150
  const ink = dark ? '#161616' : '#ffffff'
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, hex(shade(base, 0.22))); g.addColorStop(0.6, hex(base)); g.addColorStop(1, hex(shade(base, -0.25)))
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)

  // Category motif in the lower half.
  motif(ctx, p, w, h, base)

  // Logo badge: an ellipse in a contrasting colour carrying the brand.
  const badge = dark ? shade(base, -0.55) : 0xffffff
  const bw = w * 0.82, bh = h * 0.2, by = h * 0.2
  ctx.fillStyle = hex(badge)
  ctx.beginPath(); ctx.ellipse(w / 2, by, bw / 2, bh / 2, 0, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = hex(shade(base, -0.35)); ctx.lineWidth = Math.max(2, w * 0.012); ctx.stroke()
  ctx.fillStyle = dark ? '#ffffff' : hex(lum(base) < 60 ? 0xc8102e : shade(base, -0.2))
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  fit(ctx, brand, w / 2, by + 2, bw * 0.84, bh * 0.62, 900, 'Georgia, "Times New Roman", serif')

  ctx.fillStyle = ink
  if (variant) {
    const words = variant.split(' ')
    const lines = variant.length > 16 && words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [variant]
    lines.forEach((l, i) => fit(ctx, l, w / 2, h * 0.43 + i * h * 0.1, w * 0.88, h * 0.09, 800))
  }
  if (size) {
    ctx.font = `800 ${Math.round(h * 0.07)}px system-ui, sans-serif`
    const tw = ctx.measureText(size).width + w * 0.08
    ctx.fillStyle = dark ? '#161616' : '#ffffff'
    ctx.beginPath(); ctx.roundRect(w - tw - w * 0.05, h * 0.84, tw, h * 0.1, h * 0.05); ctx.fill()
    ctx.fillStyle = dark ? '#ffffff' : hex(shade(base, -0.3))
    ctx.fillText(size, w - tw / 2 - w * 0.05, h * 0.892)
  }
  // Veg mark on food (green square-dot), as Indian food packs carry.
  if (['staples', 'snacks', 'breakfast', 'dairy', 'bakery', 'beverages'].includes(p.group) && !/Egg/.test(p.name)) {
    const s = h * 0.07, x = w * 0.06, y = h * 0.855
    ctx.fillStyle = '#fff'; ctx.fillRect(x, y, s, s)
    ctx.strokeStyle = '#128a2e'; ctx.lineWidth = s * 0.12; ctx.strokeRect(x, y, s, s)
    ctx.fillStyle = '#128a2e'; ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.25, 0, Math.PI * 2); ctx.fill()
  }
}

function motif(ctx: CanvasRenderingContext2D, p: Product, w: number, h: number, base: number) {
  const cy = h * 0.68
  ctx.save()
  ctx.globalAlpha = 0.9
  if (p.group === 'snacks' && p.shape === 'pouch') {
    // A pile of chips.
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = i % 2 ? '#f6c945' : '#e9a93a'
      ctx.beginPath(); ctx.ellipse(w * (0.28 + (i % 4) * 0.15), cy + (i > 3 ? h * 0.05 : 0), w * 0.11, h * 0.045, (i - 3) * 0.35, 0, Math.PI * 2); ctx.fill()
    }
  } else if (p.group === 'dairy') {
    // Milk splash wave.
    ctx.fillStyle = '#ffffff'
    ctx.beginPath(); ctx.moveTo(0, cy)
    for (let x = 0; x <= w; x += w / 8) ctx.quadraticCurveTo(x + w / 16, cy - h * 0.06, x + w / 8, cy)
    ctx.lineTo(w, h * 0.8); ctx.lineTo(0, h * 0.8); ctx.fill()
  } else if (p.group === 'beverages') {
    ctx.fillStyle = hex(shade(base, 0.45))
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(w * (0.2 + i * 0.13), cy + Math.sin(i) * h * 0.04, w * 0.035, 0, Math.PI * 2); ctx.fill() }
  } else if (p.group === 'staples' || p.group === 'breakfast') {
    // Wheat / grain sprig.
    ctx.strokeStyle = '#f3d27a'; ctx.fillStyle = '#f3d27a'; ctx.lineWidth = w * 0.012
    ctx.beginPath(); ctx.moveTo(w * 0.5, cy + h * 0.1); ctx.lineTo(w * 0.5, cy - h * 0.08); ctx.stroke()
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(w * 0.5 + s * w * 0.04, cy - h * 0.06 + i * h * 0.04, w * 0.03, h * 0.016, s * 0.6, 0, Math.PI * 2); ctx.fill()
    }
  } else if (p.group === 'personal' || p.group === 'household' || p.group === 'baby') {
    // Freshness leaf and sparkle.
    ctx.fillStyle = '#ffffff'
    ctx.beginPath(); ctx.ellipse(w * 0.5, cy, w * 0.14, h * 0.05, -0.5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = hex(shade(base, 0.5))
    ctx.beginPath(); ctx.ellipse(w * 0.5, cy, w * 0.11, h * 0.03, -0.5, 0, Math.PI * 2); ctx.fill()
  } else {
    ctx.fillStyle = hex(shade(base, 0.35))
    ctx.beginPath(); ctx.arc(w * 0.5, cy, Math.min(w, h) * 0.1, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return c
}

export function packTexture(p: Product): THREE.Texture {
  let c: HTMLCanvasElement
  if (p.group === 'bulk' && p.shape === 'box') {
    // Corrugated shipping case: kraft with a one-colour print.
    c = canvas(256, 256)
    const x = c.getContext('2d')!
    x.fillStyle = '#b98b57'; x.fillRect(0, 0, 256, 256)
    x.fillStyle = '#a77a48'; x.fillRect(0, 118, 256, 20)                     // tape
    x.fillStyle = hex(p.color); x.textAlign = 'center'; x.textBaseline = 'middle'
    const { brand, variant, size } = splitName(p.name)
    fit(x, brand.toUpperCase(), 128, 60, 220, 48, 900)
    x.fillStyle = '#3b2a17'
    fit(x, `${variant} ${size}`.trim(), 128, 180, 230, 26, 700)
    x.strokeStyle = '#3b2a17'; x.lineWidth = 3
    x.beginPath(); x.moveTo(206, 236); x.lineTo(206, 212); x.moveTo(196, 222); x.lineTo(206, 212); x.lineTo(216, 222); x.stroke()  // this way up
  } else if (isRound(p.shape)) {
    // 512 × 256 wrap: two copies of the panel around the pack, bands for cap / lid / can end.
    c = canvas(512, 256)
    const x = c.getContext('2d')!
    const band = { bottle: [0.1, 0.62], jar: [0.1, 0.8], can: [0.05, 0.93], tub: [0.06, 0.82] }[p.shape as 'bottle']
    const body = p.shape === 'bottle' ? shade(p.color, -0.15) : p.shape === 'tub' ? 0xf3f3f0 : p.shape === 'can' ? 0xc9ced2 : shade(p.color, -0.3)
    x.fillStyle = hex(body); x.fillRect(0, 0, 512, 256)
    const top = 256 * (1 - band[1]), hgt = 256 * (band[1] - band[0])
    for (const ox of [0, 256]) {
      x.save(); x.translate(ox, top)
      const sub = canvas(256, 256), sx = sub.getContext('2d')!
      panel(sx, p, 256, 256)
      x.drawImage(sub, 0, 0, 256, hgt)
      x.restore()
    }
    // Cap / lid / can end at the top.
    const capFrac = { bottle: 0.09, jar: 0.16, can: 0.06, tub: 0.13 }[p.shape as 'bottle']
    x.fillStyle = p.shape === 'can' ? '#d4d8dc' : hex(p.shape === 'bottle' ? shade(p.color, -0.45) : p.shape === 'jar' ? shade(p.color, -0.5) : p.color)
    x.fillRect(0, 0, 512, 256 * capFrac)
  } else if (p.shape === 'tray') {
    c = canvas(256, 512)
    const x = c.getContext('2d')!
    panel(x, p, 256, 256)
    // Top half of the texture (v 0–0.5 → canvas lower half): a dozen eggs in their cups.
    x.fillStyle = '#cbbfa8'; x.fillRect(0, 256, 256, 256)
    for (let r = 0; r < 2; r++) for (let k = 0; k < 6; k++) {
      x.fillStyle = '#f1e3c8'
      x.beginPath(); x.ellipse(22 + k * 42, 320 + r * 128, 18, 44, 0, 0, Math.PI * 2); x.fill()
    }
  } else {
    c = canvas(256, 256)
    panel(c.getContext('2d')!, p, 256, 256)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

export function packMaterial(p: Product): THREE.MeshStandardMaterial {
  const rough = p.shape === 'pouch' ? 0.32 : p.shape === 'bottle' ? 0.22 : p.shape === 'can' ? 0.3 : p.shape === 'bag' ? 0.7 : 0.55
  return new THREE.MeshStandardMaterial({ map: packTexture(p), roughness: rough, metalness: p.shape === 'can' ? 0.45 : 0.02 })
}
