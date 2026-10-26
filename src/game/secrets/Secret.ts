import type { Body } from '../../render/Crowd'
import type { Game } from '../Game'

/**
 * A secret mission: something that only happens in about one sentence in
 * ten, and each one only ever once in a browser (see rollSecret). The Game
 * holds at most one, and asks it for prompts, for where the Governor and the
 * visiting guest should be, and for days that must stay quiet.
 */
export type SecretId = 'play' | 'bakeoff' | 'celebrity' | 'royal' | 'greylady'
export const SECRET_IDS: SecretId[] = ['play', 'bakeoff', 'celebrity', 'royal', 'greylady']

export type Add = (key: string, label: string, run: () => void) => void
export type Near = (x: number, z: number, r: number) => boolean
export interface Spot {
  x: number
  z: number
  yaw: number
  pose: Body['pose']
}
export interface Option {
  label: string
  enabled: boolean
  run: () => void
}

export interface Secret {
  readonly id: SecretId
  /** The HUD card and Notebook line, or null before it starts or once it is over. */
  readonly status: { title: string; text: string } | null
  newDay(): void
  update(delta: number): void
  prompts(add: Add, near: Near): void
  /** Days that must not have a lockdown, drill or shakedown. */
  isQuietDay(day: number): boolean
  /** Where the Governor is wanted right now, if anywhere special. */
  governorSpot?(): (Spot & { lines?: string[] }) | null
  /** Handles talking to the Governor; true if it did. */
  talkGovernor?(): boolean
  talkChaplain?(): boolean
  /** The visiting guest: how they look, and where they are now (null: not here). */
  guestLook?(): { name: string; look: Partial<Body> }
  guestSpot?(): Spot | null
  talkGuest?(): void
  /** Extra things to do in the library. */
  libraryOptions?(): Option[]
  /** Somewhere you are allowed to be right now, because of this. */
  allows?(zone: string): boolean
  toSave(): Record<string, unknown>
  fromSave(s: Record<string, unknown> | undefined): void
}

/**
 * The common shape: a notice at lunch on the first day, then a few days
 * counted from it. Subclasses fill in tick(), morning() and the rest.
 */
export abstract class SecretBase implements Secret {
  abstract readonly id: SecretId
  announced = false
  startDay = 0
  stage = 'notice'
  private said = new Set<string>()

  constructor(protected readonly game: Game) {}

  abstract get status(): { title: string; text: string } | null
  protected abstract announce(): void
  protected abstract tick(delta: number): void
  protected morning(): void {}
  abstract prompts(add: Add, near: Near): void
  isQuietDay(_day: number): boolean {
    return false
  }

  /** Days since the notice went up. */
  get dayN(): number {
    return this.game.clock.day - this.startDay
  }

  get m(): number {
    return this.game.clock.minuteOfDay
  }

  get over(): boolean {
    return this.stage === 'done' || this.stage === 'failed'
  }

  /** "day 4", counted from the notice. */
  day(n: number): string {
    return `day ${this.startDay + n}`
  }

  update(delta: number): void {
    const g = this.game
    if (!this.announced) {
      if (this.m >= 11 * 60 + 30 && !g.clock.locked) {
        this.announced = true
        this.startDay = g.clock.day
        this.announce()
      }
      return
    }
    if (!this.over) this.tick(delta)
  }

  newDay(): void {
    if (!this.announced) return
    this.said.clear()
    if (!this.over) this.morning()
  }

  protected fail(text: string): void {
    this.stage = 'failed'
    this.game.toast(text, 'bad')
  }

  protected once(key: string, text: string, tone: 'good' | 'bad' | 'neutral' = 'neutral'): void {
    if (this.said.has(key)) return
    this.said.add(key)
    this.game.toast(text, tone)
  }

  /** The guest says something, in a bubble. */
  protected guestSays(text: string): void {
    this.game.guest.speech = text
    this.game.guest.speechTimer = 3.5
  }

  protected talk(line: string, options: Option[] = []): void {
    this.game.ui.talk(this.game.guest.name, line, options)
  }

  toSave(): Record<string, unknown> {
    return { announced: this.announced, startDay: this.startDay, stage: this.stage, ...this.extra() }
  }

  protected extra(): Record<string, unknown> {
    return {}
  }

  fromSave(s: Record<string, unknown> | undefined): void {
    if (!s) return
    this.announced = (s.announced as boolean) ?? false
    this.startDay = (s.startDay as number) ?? 0
    this.stage = (s.stage as string) ?? 'notice'
    this.restore(s)
  }

  protected restore(_s: Record<string, unknown>): void {}
}

export const tile = (tx: number, ty: number) => ({ x: (tx + 0.5) * 2, z: (ty + 0.5) * 2 })
