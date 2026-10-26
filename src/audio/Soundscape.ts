/**
 * The sound of the place, synthesised like everything else: no files.
 *
 * Ambience is a few looping beds, crossfaded by where you are: a building
 * hum indoors, chatter in the busy rooms by day, wind in the yard, tin in
 * the vents. Every few seconds something happens off in the distance: a door
 * slams, keys jangle, somebody coughs, a bird.
 *
 * Music is generated a bar at a time, slow and quiet, with the mood of the
 * moment: a wistful round of chords by day, sparse low ones at night, a low
 * pulse under it when an officer is getting suspicious, and nothing at all
 * in a chase, where the alarm does the talking.
 */
export interface Scene {
  zone: string
  night: boolean
  vent: boolean
  /** 0..1: how close an officer is to noticing you. */
  tension: number
  chase: boolean
  /** Before the sentence starts: the title and the story. */
  title: boolean
  weather?: string
}

export interface Volumes {
  music: number
  ambience: number
  effects: number
}

const VOLUME_KEY = 'locked-up.audio'
const BUSY_ROOMS = new Set(['hub', 'games', 'library', 'gym', 'visits', 'chapel', 'laundry', 'showers'])

export function readVolumes(): Volumes {
  try {
    const v = JSON.parse(localStorage.getItem(VOLUME_KEY) ?? 'null') as Volumes | null
    if (v && typeof v.music === 'number') return v
  } catch {
    // Defaults below.
  }
  return { music: 0.6, ambience: 0.7, effects: 1 }
}

export function writeVolumes(v: Volumes): void {
  try {
    localStorage.setItem(VOLUME_KEY, JSON.stringify(v))
  } catch {
    // Kept for this visit only.
  }
}

type Bed = 'hum' | 'murmur' | 'wind' | 'vent' | 'rain'
type Mood = 'day' | 'night' | 'tense' | 'silent'

/** D minor, mostly: chords as semitones above D3. */
const PROGRESSIONS: Record<Exclude<Mood, 'silent'>, number[][]> = {
  day: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]],
  night: [[0, 3, 7], [-5, -2, 3], [-4, 0, 3], [-5, -2, 3]],
  tense: [[0, 3, 7], [1, 5, 8], [0, 3, 7], [-1, 2, 5]],
}
const D3 = 146.83

export class Soundscape {
  private readonly music: GainNode
  private readonly ambience: GainNode
  private readonly beds = new Map<Bed, GainNode>()
  private readonly noise: AudioBuffer
  private readonly brown: AudioBuffer
  private readonly space: DelayNode
  private nextBar = 0
  private bar = 0
  private nextEvent = 3
  private mood: Mood = 'day'
  private scene: Scene = { zone: '', night: false, vent: false, tension: 0, chase: false, title: true }

  constructor(private readonly ctx: AudioContext, out: AudioNode, volumes: Volumes) {
    this.music = ctx.createGain()
    this.ambience = ctx.createGain()
    this.music.connect(out)
    this.ambience.connect(out)
    this.setVolumes(volumes)

    // A little room for the music to sit in: a soft feedback delay.
    this.space = ctx.createDelay(1)
    this.space.delayTime.value = 0.42
    const feedback = ctx.createGain()
    feedback.gain.value = 0.32
    const tone = ctx.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.value = 1400
    this.space.connect(tone)
    tone.connect(feedback)
    feedback.connect(this.space)
    tone.connect(this.music)

    // Noise to make everything else from.
    const len = ctx.sampleRate * 3
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate)
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate)
    const w = this.noise.getChannelData(0)
    const b = this.brown.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
      w[i] = Math.random() * 2 - 1
      last = (last + 0.02 * w[i]) / 1.02
      b[i] = last * 3.5
    }

    this.makeBed('hum', this.brown, 'lowpass', 190, 0.7, 0.22)
    this.makeBed('murmur', this.noise, 'bandpass', 650, 0.8, 0.3, 2.7)
    this.makeBed('wind', this.noise, 'bandpass', 380, 0.6, 0.32, 0.09)
    this.makeBed('vent', this.brown, 'bandpass', 520, 4, 0.9)
    this.makeBed('rain', this.noise, 'highpass', 2400, 0.5, 0.22, 0.3)
    // Mains hum under the building bed.
    const mains = ctx.createOscillator()
    mains.frequency.value = 50
    const mg = ctx.createGain()
    mg.gain.value = 0.012
    mains.connect(mg)
    mg.connect(this.beds.get('hum')!)
    mains.start()
  }

  private makeBed(name: Bed, buffer: AudioBuffer, type: BiquadFilterType, freq: number, q: number, level: number, wobble = 0): void {
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = freq
    filter.Q.value = q
    const inner = ctx.createGain()
    inner.gain.value = level
    const gain = ctx.createGain()
    gain.gain.value = 0
    src.connect(filter)
    filter.connect(inner)
    inner.connect(gain)
    gain.connect(this.ambience)
    // Chatter rises and falls; wind gusts.
    if (wobble) {
      const lfo = ctx.createOscillator()
      lfo.frequency.value = wobble
      const depth = ctx.createGain()
      depth.gain.value = level * 0.6
      lfo.connect(depth)
      depth.connect(inner.gain)
      lfo.start()
    }
    src.start(0, Math.random() * 2)
    this.beds.set(name, gain)
  }

  setVolumes(v: Volumes): void {
    const t = this.ctx.currentTime
    this.music.gain.setTargetAtTime(v.music * 1.6, t, 0.1)
    this.ambience.gain.setTargetAtTime(v.ambience * 0.55, t, 0.1)
  }

  /** Every frame: where you are and how it is going. */
  update(scene: Scene): void {
    this.scene = scene
    const ctx = this.ctx
    const t = ctx.currentTime
    const outdoors = scene.zone === 'yard' || scene.zone === 'outside'
    const busy = BUSY_ROOMS.has(scene.zone) && !scene.night
    const level: Record<Bed, number> = {
      hum: scene.title ? 0.25 : scene.vent ? 0.2 : outdoors ? 0.15 : scene.night ? 0.6 : 1,
      murmur: busy && !scene.vent ? 1 : 0,
      // A gale howls outside and moans through the building.
      wind: scene.weather === 'wind' && !scene.title ? (outdoors ? 2.4 : 0.5) : outdoors || scene.title ? (scene.night ? 0.7 : 1) : 0,
      vent: scene.vent ? 1 : 0,
      // On the roof indoors, on everything outside.
      rain: scene.weather === 'rain' && !scene.title ? (outdoors ? 1 : scene.vent ? 0.6 : 0.3) : 0,
    }
    for (const [name, g] of this.beds) g.gain.setTargetAtTime(level[name], t, 0.8)

    // Music: the mood of the moment, a bar at a time.
    this.mood = scene.chase ? 'silent' : scene.tension > 0.35 ? 'tense' : scene.night ? 'night' : 'day'
    if (this.nextBar < t) this.nextBar = t + 0.1
    while (this.nextBar < t + 0.6) {
      this.playBar(this.nextBar)
      this.nextBar += this.mood === 'tense' ? 3.2 : 4.4
      this.bar++
    }

    // Something off in the distance.
    if (t > this.nextEvent) {
      this.nextEvent = t + 6 + Math.random() * 10
      if (!scene.title) this.distant(outdoors)
    }
  }

  private playBar(at: number): void {
    if (this.mood === 'silent') return
    const ctx = this.ctx
    const prog = PROGRESSIONS[this.mood]
    const chord = prog[this.bar % prog.length]
    const night = this.mood === 'night'
    // Night skips every other bar: room to breathe.
    if (night && this.bar % 2 === 1) return
    const dur = this.mood === 'tense' ? 3.0 : 4.2
    for (const [i, semis] of chord.entries()) {
      const o = ctx.createOscillator()
      o.type = i === 0 ? 'sine' : 'triangle'
      o.frequency.value = D3 * Math.pow(2, (semis + (night ? -12 : 0)) / 12)
      const g = ctx.createGain()
      const peak = 0.05 / (i + 1.5)
      g.gain.setValueAtTime(0.0001, at)
      g.gain.exponentialRampToValueAtTime(peak, at + 1.1)
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
      o.connect(g)
      g.connect(this.music)
      g.connect(this.space)
      o.start(at)
      o.stop(at + dur + 0.1)
    }
    // A melody note now and then, on top.
    if (this.mood === 'day' && Math.random() < 0.6) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      const top = chord[Math.floor(Math.random() * chord.length)] + 12
      o.frequency.value = D3 * Math.pow(2, top / 12)
      const g = ctx.createGain()
      const start = at + 1 + Math.random() * 2
      g.gain.setValueAtTime(0.0001, start)
      g.gain.exponentialRampToValueAtTime(0.025, start + 0.08)
      g.gain.exponentialRampToValueAtTime(0.0001, start + 1.6)
      o.connect(g)
      g.connect(this.music)
      g.connect(this.space)
      o.start(start)
      o.stop(start + 1.7)
    }
    // Tense: a low pulse, like a heartbeat with somewhere to be.
    if (this.mood === 'tense') {
      for (let k = 0; k < 6; k++) {
        const o = ctx.createOscillator()
        o.type = 'sine'
        o.frequency.value = D3 / 2
        const g = ctx.createGain()
        const s = at + k * 0.5
        g.gain.setValueAtTime(0.0001, s)
        g.gain.exponentialRampToValueAtTime(0.09, s + 0.02)
        g.gain.exponentialRampToValueAtTime(0.0001, s + 0.32)
        o.connect(g)
        g.connect(this.music)
        o.start(s)
        o.stop(s + 0.35)
      }
    }
  }

  /** One sound from somewhere else in the prison. */
  private distant(outdoors: boolean): void {
    const ctx = this.ctx
    const t = ctx.currentTime
    const night = this.scene.night
    const pick = Math.random()
    const out = ctx.createGain()
    out.connect(this.ambience)
    if (outdoors && !night && pick < 0.6) {
      // A bird on the wall.
      for (let k = 0; k < 2 + Math.floor(Math.random() * 3); k++) {
        const o = ctx.createOscillator()
        o.type = 'sine'
        const s = t + k * 0.14
        o.frequency.setValueAtTime(2600 + Math.random() * 900, s)
        o.frequency.exponentialRampToValueAtTime(3800 + Math.random() * 600, s + 0.08)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.0001, s)
        g.gain.exponentialRampToValueAtTime(0.03, s + 0.02)
        g.gain.exponentialRampToValueAtTime(0.0001, s + 0.1)
        o.connect(g)
        g.connect(out)
        o.start(s)
        o.stop(s + 0.12)
      }
      return
    }
    if (pick < (night ? 0.35 : 0.5)) {
      // A door slams somewhere down the landing, and echoes.
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 700
      lp.connect(out)
      for (const [f, d] of [[95, 0], [180, 0], [95, 0.32]] as const) {
        const o = ctx.createOscillator()
        o.type = 'square'
        o.frequency.value = f
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.0001, t + d)
        g.gain.exponentialRampToValueAtTime(d ? 0.04 : 0.12, t + d + 0.01)
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.5)
        o.connect(g)
        g.connect(lp)
        o.start(t + d)
        o.stop(t + d + 0.55)
      }
      return
    }
    if (pick < (night ? 0.75 : 0.8)) {
      // Keys on a chain, or a cough at night.
      const src = ctx.createBufferSource()
      src.buffer = this.noise
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = night ? 900 : 5200
      bp.Q.value = night ? 1.5 : 6
      const g = ctx.createGain()
      const bursts = night ? 2 : 5
      g.gain.setValueAtTime(0.0001, t)
      for (let k = 0; k < bursts; k++) {
        const s = t + k * (night ? 0.28 : 0.09)
        g.gain.exponentialRampToValueAtTime(night ? 0.2 : 0.07, s + 0.01)
        g.gain.exponentialRampToValueAtTime(0.0001, s + (night ? 0.18 : 0.06))
      }
      src.connect(bp)
      bp.connect(g)
      g.connect(out)
      src.start(t, Math.random() * 2, 1.5)
      return
    }
    // A shout down a corridor: a filtered swell.
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(500, t)
    bp.frequency.linearRampToValueAtTime(800, t + 0.4)
    bp.Q.value = 5
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(night ? 0.05 : 0.09, t + 0.12)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7)
    src.connect(bp)
    bp.connect(g)
    g.connect(out)
    src.start(t, Math.random() * 2, 0.8)
  }
}
