import type { Clock } from '../game/Clock'
import type { Inventory } from '../game/Items'
import type { Body } from '../render/Crowd'
import type { Door, Grid, Grate } from '../world/Grid'
import type { Fixtures } from '../world/Build'
import type { Method, PrisonMemory } from './Memory'
import type { Guard } from './Guard'
import type { Prisoner } from './Prisoner'

/**
 * The shared blackboard. Every behaviour tree reads the world through this,
 * and the player, the doors and the alarms all live on it.
 */
export interface Noise {
  x: number
  z: number
  radius: number
  age: number
  kind: 'clank' | 'fight' | 'shout' | 'throw' | 'alarm'
}

export interface PlayerView {
  name: string
  body: Body
  inventory: Inventory
  inVent: boolean
  sneaking: boolean
  running: boolean
  health: number
  /** 0 fine, 1 out of bounds, 2 escaping. Recomputed each frame. */
  illegal: 0 | 1 | 2
  /** An escape attempt is under way, and how it started. */
  attempt: Method | null
  /** Visibly doing something dodgy: crafting, holding a weapon, at a grate. */
  dodgy: number
  /** Frothing from chewed soap: convinces healthcare for a while. */
  frothing: number
  zone: string
  cell: string
  block: string
  /** Under escort, so not illegal wherever the officer takes you. */
  escortedBy: Guard | null
  /** Wearing a disguise, and whether someone has seen through it. */
  disguise: 'guard' | 'visitor' | null
  disguiseBlown: boolean
  /** Curled up in a laundry basket. */
  inBasket: boolean
}

export interface Riot {
  active: boolean
  x: number
  z: number
  /** Night riots are on a landing, prisoners banging their doors. */
  night: boolean
  block: string | null
  timer: number
  /** The player kicked it off. */
  byPlayer: boolean
}

export interface SickCall {
  cell: string
  responders: Guard[]
  stage: 'called' | 'atDoor' | 'escorting' | 'treating' | 'returning'
  timer: number
}

/** An officer called into your cell to look at something. */
export interface Lure {
  cell: string
  guard: Guard
  stage: 'called' | 'inside'
  timer: number
}

export interface World {
  grid: Grid
  clock: Clock
  memory: PrisonMemory
  rng: () => number
  player: PlayerView
  guards: Guard[]
  prisoners: Prisoner[]
  noises: Noise[]
  riot: Riot
  sickCall: SickCall | null
  lure: Lure | null
  alarm: { active: boolean; timer: number; x: number; z: number }
  /** Cells the night officer still has to try. */
  lockChecks: Door[]
  grates: Grate[]
  fixtures: Fixtures
  /** Hard mode: no sight guide, sharper officers. */
  hard: boolean
  requestDoor(door: Door, who: 'guard' | 'prisoner' | 'player', block?: string, from?: string): boolean
  caught(by: Guard): void
  warn(by: Guard, text: string): void
  say(body: Body, text: string, seconds?: number): void
  toast(text: string, tone?: 'good' | 'bad' | 'neutral'): void
  emit(noise: Omit<Noise, 'age'>): void
  hurtPlayer(amount: number, by: Prisoner | Guard): void
  patDown(by: Guard): void
  toothpasteFound(by: Guard, door: Door): void
}
