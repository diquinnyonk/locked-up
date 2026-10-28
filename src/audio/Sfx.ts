/**
 * Synthesised sound, no files: a two-tone alarm, metal clanks for the ducts
 * and doors, a thump for a punch, a buzzer for the gates. WebAudio only
 * starts after a user gesture, so `unlock` is called from the title screen.
 */
import { type Scene, Soundscape, type Volumes, readVolumes } from './Soundscape'

export type Sound = 'clank' | 'fight' | 'throw' | 'alarm' | 'shout' | 'buzz' | 'caught' | 'good' | 'bounce'

export class Sfx {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private siren: { osc: OscillatorNode; gain: GainNode } | null = null
  private last = new Map<Sound, number>()
  private soundscape: Soundscape | null = null
  private volumes: Volumes = readVolumes()

  unlock(): void {
    if (this.ctx) return
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    this.ctx = new Ctor()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.35 * this.volumes.effects
    this.master.connect(this.ctx.destination)
    this.soundscape = new Soundscape(this.ctx, this.ctx.destination, this.volumes)
  }

  /** Where you are and how it is going, for the ambience and the music. */
  scene(scene: Scene): void {
    this.soundscape?.update(scene)
  }

  setVolumes(v: Volumes): void {
    this.volumes = v
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(0.35 * v.effects, this.ctx.currentTime, 0.05)
    this.soundscape?.setVolumes(v)
  }

  play(sound: Sound, volume = 1): void {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    const now = ctx.currentTime
    // Rate-limit so a brawl is not a wall of noise.
    if ((this.last.get(sound) ?? -1) > now - 0.12) return
    this.last.set(sound, now)
    const gain = ctx.createGain()
    gain.connect(this.master)
    const env = (attack: number, decay: number, peak: number) => {
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(peak * volume, now + attack)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay)
    }
    switch (sound) {
      case 'clank': {
        for (const f of [420, 1130, 1870]) {
          const o = ctx.createOscillator()
          o.type = 'square'
          o.frequency.value = f * (0.9 + Math.random() * 0.2)
          o.connect(gain)
          o.start(now)
          o.stop(now + 0.25)
        }
        env(0.004, 0.22, 0.12)
        break
      }
      case 'fight': {
        const o = ctx.createOscillator()
        o.type = 'sine'
        o.frequency.setValueAtTime(140, now)
        o.frequency.exponentialRampToValueAtTime(50, now + 0.15)
        o.connect(gain)
        o.start(now)
        o.stop(now + 0.2)
        env(0.005, 0.16, 0.6)
        break
      }
      case 'throw': {
        const o = ctx.createOscillator()
        o.type = 'triangle'
        o.frequency.setValueAtTime(900, now)
        o.frequency.exponentialRampToValueAtTime(300, now + 0.2)
        o.connect(gain)
        o.start(now)
        o.stop(now + 0.25)
        env(0.005, 0.2, 0.25)
        break
      }
      case 'buzz': {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = 110
        o.connect(gain)
        o.start(now)
        o.stop(now + 0.45)
        env(0.01, 0.4, 0.18)
        break
      }
      case 'caught': {
        const o = ctx.createOscillator()
        o.type = 'square'
        o.frequency.setValueAtTime(330, now)
        o.frequency.setValueAtTime(220, now + 0.18)
        o.frequency.setValueAtTime(147, now + 0.36)
        o.connect(gain)
        o.start(now)
        o.stop(now + 0.7)
        env(0.01, 0.65, 0.25)
        break
      }
      case 'bounce': {
        // A basketball on tarmac: a short, low, rubbery thump.
        const o = ctx.createOscillator()
        o.type = 'sine'
        o.frequency.setValueAtTime(170, now)
        o.frequency.exponentialRampToValueAtTime(85, now + 0.09)
        o.connect(gain)
        o.start(now)
        o.stop(now + 0.14)
        env(0.004, 0.11, 0.9)
        break
      }
      case 'good': {
        const o = ctx.createOscillator()
        o.type = 'triangle'
        o.frequency.setValueAtTime(523, now)
        o.frequency.setValueAtTime(784, now + 0.09)
        o.connect(gain)
        o.start(now)
        o.stop(now + 0.3)
        env(0.01, 0.28, 0.25)
        break
      }
      default:
        break
    }
  }

  /** The prison alarm: a two-tone wail that runs while you are hunted. */
  setAlarm(on: boolean): void {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    if (on && !this.siren) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const lfo = ctx.createOscillator()
      const depth = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.value = 640
      lfo.frequency.value = 1.6
      lfo.type = 'square'
      depth.gain.value = 160
      lfo.connect(depth)
      depth.connect(osc.frequency)
      gain.gain.value = 0.05
      osc.connect(gain)
      gain.connect(this.master)
      osc.start()
      lfo.start()
      this.siren = { osc, gain }
    } else if (!on && this.siren) {
      const s = this.siren
      s.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2)
      s.osc.stop(ctx.currentTime + 1)
      this.siren = null
    }
  }
}
