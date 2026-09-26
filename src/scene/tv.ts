// The pendency TV: a 55" screen on the wall behind the pigeon holes, facing the packing table — where a
// darkstore hangs it so pickers, riders and the manager all see the queue. Redrawn once a second.

import * as THREE from 'three'
import type { Store } from '../model'
import { mmss, Pendency, SLA, STAGE_NAME, STAGES, type Stage } from '../pendency'
import { boxAt, merged } from './util'

const PX_W = 1280, PX_H = 720
const SCREEN_W = 1.22, SCREEN_H = 0.69          // 55" 16:9 active area

export interface TV { group: THREE.Group; pos: THREE.Vector3; normal: THREE.Vector3; update(dt: number): void }

const COLOR: Record<Stage, string> = { queued: '#3b82f6', picking: '#f59e0b', ready: '#22c55e', out: '#64748b' }

export function buildTV(store: Store, feed: Pendency): TV {
  // West wall, level with the pigeon holes, facing into the store.
  const pz = store.pigeon ? store.pigeon.cz : store.D / 2
  const pos = new THREE.Vector3(0.06, 2.55, pz)
  const normal = new THREE.Vector3(1, 0, 0)

  const canvas = document.createElement('canvas')
  canvas.width = PX_W; canvas.height = PX_H
  const ctx = canvas.getContext('2d')!
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8

  const group = new THREE.Group()
  group.name = 'tv'
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }))
  screen.position.copy(pos).addScaledVector(normal, 0.031)
  screen.rotation.y = Math.PI / 2
  group.add(screen)
  const m = new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(pos)
  group.add(merged([
    boxAt(SCREEN_W + 0.03, SCREEN_H + 0.03, 0.05, 0, 0, 0, m),       // bezel
    boxAt(0.3, 0.2, 0.04, 0, 0, -0.04, m),                             // wall mount
  ], new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.4, metalness: 0.5 })))
  // A soft glow on the wall around it.
  const glow = new THREE.PointLight(0x9cc4ff, 0.6, 3)
  glow.position.copy(pos).addScaledVector(normal, 0.4)
  group.add(glow)

  const clock0 = 19 * 3600 + 42 * 60
  const draw = () => {
    const f = feed
    ctx.fillStyle = '#0b1220'; ctx.fillRect(0, 0, PX_W, PX_H)
    // Header.
    ctx.fillStyle = '#111a2e'; ctx.fillRect(0, 0, PX_W, 70)
    txt(`${store.name.toUpperCase()} · ORDER PENDENCY`, 28, 35, 34, '#e2e8f0', 'left', 800)
    const c = clock0 + f.now
    const hh = Math.floor(c / 3600) % 24, mm = Math.floor(c / 60) % 60, ss = Math.floor(c) % 60
    txt(`${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`, PX_W - 28, 35, 34, '#94a3b8', 'right', 600)

    // Stage tiles.
    const open = f.orders.length
    const tiles: [string, number, string][] = [['OPEN', open, '#e2e8f0'], ...STAGES.map(s => [STAGE_NAME[s].toUpperCase(), f.count(s), COLOR[s]] as [string, number, string])]
    const tw = (PX_W - 40 - (tiles.length - 1) * 16) / tiles.length
    tiles.forEach(([label, n, col], i) => {
      const x = 20 + i * (tw + 16)
      ctx.fillStyle = '#131d33'; round(x, 88, tw, 160, 14)
      ctx.fillStyle = col; ctx.fillRect(x, 88, tw, 6)
      txt(String(n), x + tw / 2, 170, 88, col, 'center', 800)
      txt(label, x + tw / 2, 225, 22, '#94a3b8', 'center', 700)
    })

    // KPIs.
    const br = f.breaching(), risk = f.atRisk()
    const kpis: [string, string, string][] = [
      ['BREACHING  > 8 min', String(br), br ? '#ef4444' : '#22c55e'],
      ['AT RISK  6–8 min', String(risk), risk ? '#f59e0b' : '#22c55e'],
      ['AVG ORDER → DISPATCH', mmss(f.avgO2D()), f.avgO2D() > SLA ? '#ef4444' : '#e2e8f0'],
      ['SLA MET · LAST HOUR', `${Math.round(f.slaHit() * 100)}%`, f.slaHit() < 0.9 ? '#f59e0b' : '#22c55e'],
    ]
    kpis.forEach(([label, v, col], i) => {
      const x = 20 + (i % 2) * 308, y = 272 + Math.floor(i / 2) * 170
      ctx.fillStyle = br && i === 0 && Math.floor(f.now) % 2 ? '#3a1414' : '#131d33'
      round(x, y, 292, 154, 14)
      txt(v, x + 146, y + 70, 70, col, 'center', 800)
      txt(label, x + 146, y + 128, 19, '#94a3b8', 'center', 700)
    })
    txt(`Dispatched last hour: ${f.dispatched.length}  ·  Pickers ${f.count('picking')}/${f.pickers} busy  ·  ${f.riders} riders on shift`,
      20 + 300, 632, 19, '#94a3b8', 'center', 600)

    // Oldest open orders.
    const x0 = 650, w = PX_W - x0 - 20
    ctx.fillStyle = '#131d33'; round(x0, 272, w, 390, 14)
    txt('OLDEST OPEN ORDERS', x0 + 22, 300, 21, '#94a3b8', 'left', 800)
    const cols = [x0 + 22, x0 + 170, x0 + 250, x0 + w - 22]
    ;['ORDER', 'ITEMS', 'STAGE', 'AGE'].forEach((h, i) => txt(h, cols[i], 336, 16, '#64748b', i === 3 ? 'right' : 'left', 700))
    f.oldest(6).forEach((o, i) => {
      const y = 380 + i * 46
      const a = f.age(o)
      const ac = a > SLA ? '#ef4444' : a > SLA * 0.75 ? '#f59e0b' : '#e2e8f0'
      if (a > SLA) { ctx.fillStyle = 'rgba(239,68,68,0.12)'; ctx.fillRect(x0 + 8, y - 20, w - 16, 40) }
      txt(o.id, cols[0], y, 26, '#e2e8f0', 'left', 700)
      txt(String(o.items), cols[1], y, 26, '#e2e8f0', 'left', 600)
      ctx.fillStyle = COLOR[o.stage]; ctx.beginPath(); ctx.arc(cols[2] + 8, y, 7, 0, Math.PI * 2); ctx.fill()
      txt(STAGE_NAME[o.stage], cols[2] + 24, y, 24, '#e2e8f0', 'left', 600)
      txt(mmss(a), cols[3], y, 28, ac, 'right', 800)
    })

    txt('Simulated feed — live orders arrive with the order sim milestone', PX_W / 2, 698, 15, '#475569', 'center', 500)
    tex.needsUpdate = true
  }
  const txt = (s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign, weight: number) => {
    ctx.font = `${weight} ${size}px system-ui, -apple-system, sans-serif`
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'
    ctx.fillText(s, x, y)
  }
  const round = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill()
  }

  draw()
  let acc = 0
  return {
    group, pos, normal,
    update(dt) {
      acc += dt
      if (acc < 1) return
      feed.tick(acc)
      acc = 0
      draw()
    },
  }
}
