// Every bin label is a real Code 128 symbol with its location code printed above it. Thousands of labels share a
// few atlas pages; each label is a quad in one merged mesh per page, so they cost a handful of draw calls.

import * as THREE from 'three'
import { drawBarcode } from '../barcode'

const PAGE = 2048, CW = 176, CH = 48
const COLS = Math.floor(PAGE / CW), ROWS = Math.floor(PAGE / CH)

interface Page { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; pos: number[]; uv: number[]; used: number }

export type Draw = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void

export function drawBinLabel(code: string, bg = '#ffffff'): Draw {
  return (ctx, x, y, w, h) => {
    ctx.fillStyle = bg; ctx.fillRect(x, y, w, h)
    ctx.fillStyle = '#111'; ctx.font = 'bold 14px ui-monospace, Menlo, monospace'
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(code, x + w / 2, y + 2)
    drawBarcode(ctx, code, x + 2, y + 18, w - 4, h - 21)
  }
}

export function drawSign(text: string, bg: string, fg = '#fff'): Draw {
  return (ctx, x, y, w, h) => {
    ctx.fillStyle = bg; ctx.fillRect(x, y, w, h)
    ctx.fillStyle = fg; ctx.font = 'bold 34px system-ui, sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(text, x + w / 2, y + h / 2 + 2, w - 8)
  }
}

export class LabelAtlas {
  private pages: Page[] = []
  /** Label aspect (w / h), so quads match the texture. */
  static readonly ASPECT = CW / CH

  private page(): Page {
    const last = this.pages[this.pages.length - 1]
    if (last && last.used < COLS * ROWS) return last
    const c = document.createElement('canvas')
    c.width = c.height = PAGE
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    const p: Page = { ctx: c.getContext('2d')!, tex, pos: [], uv: [], used: 0 }
    this.pages.push(p)
    return p
  }

  /** Adds one label quad. `m` places a quad lying in local XY (facing +z), centred on the origin, w × h metres. */
  add(draw: Draw, m: THREE.Matrix4, w: number, h: number) {
    const p = this.page()
    const i = p.used++
    const px = (i % COLS) * CW, py = Math.floor(i / COLS) * CH
    draw(p.ctx, px, py, CW, CH)
    const u0 = (px + 1) / PAGE, u1 = (px + CW - 1) / PAGE
    const v1 = 1 - (py + 1) / PAGE, v0 = 1 - (py + CH - 1) / PAGE
    const corners: [number, number, number, number][] = [
      [-w / 2, -h / 2, u0, v0], [w / 2, -h / 2, u1, v0], [w / 2, h / 2, u1, v1],
      [-w / 2, -h / 2, u0, v0], [w / 2, h / 2, u1, v1], [-w / 2, h / 2, u0, v1],
    ]
    const v = new THREE.Vector3()
    for (const [x, y, u, vv] of corners) {
      v.set(x, y, 0).applyMatrix4(m)
      p.pos.push(v.x, v.y, v.z)
      p.uv.push(u, vv)
    }
  }

  meshes(): THREE.Mesh[] {
    return this.pages.map(p => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3))
      g.setAttribute('uv', new THREE.Float32BufferAttribute(p.uv, 2))
      g.computeBoundingSphere()
      p.tex.needsUpdate = true
      return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: p.tex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }))
    })
  }

  get count() { return this.pages.reduce((a, p) => a + p.used, 0) }
}
