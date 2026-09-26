// Chiller sound, synthesised — no audio files. Two layers:
//   hum:  the compressor / condensing unit, 50 Hz mains fundamental plus harmonics, slowly breathing;
//   air:  evaporator fan airflow, brown noise through a low-pass, louder under a unit.
// Browsers only allow audio after a user gesture, so the graph is built on the first click or key press.

export class ChillerAudio {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private hum!: GainNode
  private air!: GainNode
  muted = false

  constructor() {
    const start = () => this.init()
    addEventListener('pointerdown', start, { once: true })
    addEventListener('keydown', start, { once: true })
  }

  private init() {
    if (this.ctx) return
    const ctx = (this.ctx = new AudioContext())
    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(ctx.destination)

    this.hum = ctx.createGain()
    this.hum.gain.value = 0.5
    this.hum.connect(this.master)
    for (const [f, g] of [[50, 0.35], [100, 0.22], [150, 0.06], [200, 0.03]] as const) {
      const o = ctx.createOscillator()
      o.frequency.value = f
      const og = ctx.createGain()
      og.gain.value = g
      o.connect(og).connect(this.hum)
      o.start()
    }
    // Slow beat in the hum, as a compressor under load has.
    const lfo = ctx.createOscillator(), lg = ctx.createGain()
    lfo.frequency.value = 0.35; lg.gain.value = 0.12
    lfo.connect(lg).connect(this.hum.gain)
    lfo.start()

    // Brown noise, 3 s loop.
    const len = ctx.sampleRate * 3
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5 }
    const noise = ctx.createBufferSource()
    noise.buffer = buf; noise.loop = true
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'; lp.frequency.value = 700
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'; hp.frequency.value = 90
    this.air = ctx.createGain()
    this.air.gain.value = 0.4
    noise.connect(lp).connect(hp).connect(this.air).connect(this.master)
    noise.start()
  }

  /** room: 0 outside … 1 inside the chiller; fan: 0 … 1 by nearness to an evaporator. */
  set(room: number, fan: number) {
    if (!this.ctx) return
    if (this.ctx.state === 'suspended') this.ctx.resume()
    const t = this.ctx.currentTime
    this.master.gain.setTargetAtTime(this.muted ? 0 : room * 0.5, t, 0.25)
    this.air.gain.setTargetAtTime(0.25 + fan * 0.9, t, 0.3)
  }
}
