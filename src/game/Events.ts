import type { Guard } from '../npc/Guard'
import { TILE } from '../world/Grid'
import type { Game } from './Game'

/**
 * Something different every day. Each morning at unlock the prison picks
 * what kind of day it is going to be, and the toast and the Notebook say so:
 *
 *   quiet ........ nothing out of the ordinary
 *   shakedown .... officers spin every cell on your wing at some point
 *   lockdown ..... a fight somewhere, and everyone is locked up for hours
 *   inspection ... HM Inspector visits: no pat-downs, but sharper eyes
 *   intake ....... new arrivals: two officers are stuck in reception all morning
 *   greggs ....... a Greggs delivery to the canteen at lunch
 *   fireDrill .... the alarm goes and everyone is herded into the yard
 *   family ....... your nan comes on a visiting afternoon, with vouchers
 *
 * Day one is always quiet; the same kind of day never comes twice running.
 */
export type DayEvent = 'quiet' | 'shakedown' | 'lockdown' | 'inspection' | 'intake' | 'greggs' | 'fireDrill' | 'family' | 'panto'

/** The day's weather. Snow only in December. */
export type Weather = 'clear' | 'rain' | 'fog' | 'snow'

export const WEATHER_INFO: Record<Weather, string> = {
  clear: '',
  rain: 'Rain all day: it covers your footsteps outside, and officers in the yard see less.',
  fog: 'Thick fog on the moor: outside, officers can barely see half as far.',
  snow: 'Snow: footsteps are muffled outside, and the yard is white.',
}

/** How far an officer outdoors sees, and how far your steps carry outdoors, in this weather. */
export function weatherSight(w: Weather): number {
  return w === 'fog' ? 0.55 : w === 'rain' ? 0.8 : w === 'snow' ? 0.9 : 1
}
export function weatherSteps(w: Weather): number {
  return w === 'rain' ? 0.5 : w === 'snow' ? 0.7 : 1
}

export const EVENT_INFO: Record<DayEvent, { title: string; blurb: string }> = {
  quiet: { title: 'A quiet day', blurb: 'Nothing out of the ordinary. Yet.' },
  shakedown: { title: 'Shakedown', blurb: 'Officers will spin every cell on your wing today. Keep your pockets clean and your stash small.' },
  lockdown: { title: 'Trouble brewing', blurb: 'The landings are tense. If it kicks off, the whole prison gets locked down for the afternoon.' },
  inspection: { title: 'Inspection day', blurb: 'HM Inspector of Prisons is visiting. Officers are on their best behaviour: no pat-downs, but every one of them is watching.' },
  intake: { title: 'New intake', blurb: 'A van of new arrivals. Two officers are stuck in reception in the loading bay until lunch, so the landings are short-staffed.' },
  greggs: { title: 'Greggs delivery', blurb: 'A Greggs van is coming to the canteen at lunch. Get there early.' },
  fireDrill: { title: 'Fire drill', blurb: 'The fire alarm is being tested today. When it goes, everyone is herded into the yard for half an hour, and nobody is quite sure who is where.' },
  family: { title: 'Your nan is visiting', blurb: 'Your nan is coming at visiting time (14:30 to 15:45). Sit with her in the visiting hall.' },
  panto: { title: 'Panto night', blurb: "The Christmas panto is on in the chapel from 18:00 to 20:00. Six officers have tickets, so the landings will be thin." },
}

/** Visitors come on Tuesdays, Thursdays and at the weekend. */
export const VISITING_DAYS = [1, 3, 5, 6]

export function isVisitingDay(weekday: number): boolean {
  return VISITING_DAYS.includes(weekday)
}

export class Events {
  today: DayEvent = 'quiet'
  weather: Weather = 'clear'
  /** Minute of the day the timed part happens, where there is one. */
  at = -1
  /** The timed part has happened. */
  fired = false
  /** A lockdown's second stage: doors locked until this minute. */
  private lockedUntil = -1
  /** Nan has been sat with today. */
  nanSeen = false

  constructor(private readonly game: Game) {}

  /** Unlock: what kind of day is it? */
  newDay(): void {
    const g = this.game
    const day = g.clock.day
    const last = this.today
    this.fired = false
    this.nanSeen = false
    this.lockedUntil = -1
    for (const gu of g.guards) gu.reception = gu.panto = false
    // The weather first: clear most days, and snow instead of rain at Christmas.
    const wr = g.rng()
    this.weather = day <= 1 ? 'clear' : wr < 0.55 ? 'clear' : wr < 0.8 ? (g.season === 'christmas' ? 'snow' : 'rain') : 'fog'
    if (this.weather !== 'clear') g.toast(WEATHER_INFO[this.weather], 'neutral')
    if (day <= 1) {
      this.today = 'quiet'
      return
    }
    // Saturdays in December: the panto.
    if (g.season === 'christmas' && g.clock.weekday === 5) {
      this.today = 'panto'
      this.at = -1
      g.toast(`${EVENT_INFO.panto.title}. ${EVENT_INFO.panto.blurb}`, 'good')
      return
    }
    const options: [DayEvent, number][] = [
      ['quiet', 2],
      ['shakedown', 2],
      ['lockdown', 1.5],
      ['inspection', 1],
      ['intake', 1.5],
      ['greggs', 1],
      ['fireDrill', 1.5],
    ]
    if (isVisitingDay(g.clock.weekday)) options.push(['family', 2])
    const pool = options.filter(([e]) => e !== last || e === 'quiet')
    const total = pool.reduce((s, [, w]) => s + w, 0)
    let r = g.rng() * total
    this.today = pool.find(([, w]) => (r -= w) < 0)?.[0] ?? 'quiet'
    const between = (a: number, b: number) => Math.round(a + g.rng() * (b - a))
    this.at = this.today === 'shakedown' ? between(10 * 60, 16 * 60) : this.today === 'lockdown' ? between(12 * 60 + 40, 14 * 60) : this.today === 'fireDrill' ? between(9 * 60, 16 * 60) : -1
    if (this.today === 'intake') {
      // The landing officers of two wings that are not yours.
      const away = g.guards.filter((gu) => gu.duty === 'landing' && gu.block !== g.player.block).slice(0, 2)
      for (const gu of away) gu.reception = true
    }
    if (this.today !== 'quiet') g.toast(`${EVENT_INFO[this.today].title}. ${EVENT_INFO[this.today].blurb}`, 'neutral')
  }

  /** Every frame: the timed parts of the day. */
  update(): void {
    const g = this.game
    const m = g.clock.minuteOfDay
    if (g.clock.locked && !g.clock.override) return
    if (this.today === 'intake' && m >= 11 * 60 + 30) for (const gu of g.guards) gu.reception = false
    // Panto night: six officers in the chapel from six till eight.
    if (this.today === 'panto') {
      const on = m >= 18 * 60 && m < 20 * 60
      const watching = g.guards.filter((gu) => gu.duty !== 'landing' || gu.block !== g.player.block).slice(0, 6)
      for (const gu of g.guards) gu.panto = on && watching.includes(gu)
      if (on && !this.fired) {
        this.fired = true
        g.toast("Oh no it isn't! The panto has started in the chapel, and six officers are in the front row.", 'good')
      }
    }
    if (this.today === 'greggs' && !this.fired && m >= 11 * 60 + 30 && m < 12 * 60 + 30) {
      this.fired = true
      const s = SERVERY
      for (let i = 0; i < 4; i++) g.dynamic.spawnItem('sausageRoll', s.x - 1.5 + i, s.z - 1.2, 'hub')
      for (let i = 0; i < 2; i++) g.dynamic.spawnItem('voucher', s.x - 0.5 + i, s.z - 1.8, 'hub')
      g.toast('The Greggs van is here! Sausage rolls and vouchers on the canteen counter, first come first served.', 'good')
    }
    if (this.at < 0 || this.fired || m < this.at) return
    if (this.today === 'shakedown') this.shakedown()
    else if (this.today === 'lockdown') this.lockdown()
    else if (this.today === 'fireDrill') this.fireDrill()
  }

  /** The second stage of a lockdown, and unlocking after it. */
  tick(): void {
    const g = this.game
    if (this.lockedUntil < 0) return
    // Straight from "back to your cell" to doors locked, with no gap between
    // for the timetable to slip back into.
    const o = g.clock.override
    if (g.clock.minutes < this.lockedUntil && (!o || (o.period === 'bangUp' && g.clock.minutes >= o.until))) {
      g.clock.override = { period: 'lightsOut', label: 'Lockdown: everyone behind their doors', until: this.lockedUntil, then: 'Lockdown lifted' }
    }
    if (g.clock.minutes >= this.lockedUntil) {
      this.lockedUntil = -1
      g.clock.override = null
      for (const d of g.grid.doors) if (d.kind === 'cell') d.locked = false
      g.lockChecks.length = 0
      g.toast('The lockdown is lifted. Doors open, and the day carries on as if nothing happened.', 'neutral')
    }
  }

  private shakedown(): void {
    const g = this.game
    this.fired = true
    const p = g.player
    g.toast(`Shakedown! Officers are spinning every cell on ${p.block} wing.`, 'bad')
    g.sounds.push({ sound: 'alarm', volume: 0.4 })
    if (g.stash.length && g.rng() < 0.5 + g.memory.totalFailures * 0.05) {
      const lost = g.stash.length
      g.stash.length = 0
      g.toast(`They found the loose brick in your cell. ${lost} item${lost === 1 ? '' : 's'} gone.`, 'bad')
    } else if (g.stash.length) g.toast('They tapped every brick in your cell and missed the loose one. Close.', 'good')
    if (g.tunnel.metres > 0) {
      if (g.rng() < g.memory.tunnelFindChance) g.tunnelFound()
      else g.toast('An officer stamps round your cell floor, steps right on the loose tile, and moves on.', 'good')
    }
    // Out on your landing: a pat-down too.
    if (p.zone === `block${p.block}` || p.zone === p.cell) {
      const g2 = nearest(g.guards.filter((gu) => gu.ko <= 0 && !gu.chasing), p.body.x, p.body.z)
      if (g2) g2.searchTarget = true
    }
  }

  private lockdown(): void {
    const g = this.game
    this.fired = true
    g.toast('A fight in the showers, and somebody has been cut. Lockdown! Everyone back to their cells now.', 'bad')
    g.sounds.push({ sound: 'alarm', volume: 0.8 })
    g.clock.override = { period: 'bangUp', label: 'Lockdown: back to your cell', until: g.clock.minutes + 20, then: 'Doors locked' }
    this.lockedUntil = g.clock.minutes + 20 + 150
  }

  private fireDrill(): void {
    const g = this.game
    this.fired = true
    g.toast('The fire alarm! Everyone out to the yard. Officers are counting heads, badly.', 'neutral')
    g.sounds.push({ sound: 'alarm', volume: 1 })
    g.clock.override = { period: 'yard', label: 'Fire drill: everyone in the yard', until: g.clock.minutes + 30 }
  }

  /** In the visiting hall at visiting time, on the day she comes. */
  get nanHere(): boolean {
    return this.today === 'family' && !this.nanSeen && this.game.visitingTime
  }

  sitWithNan(): void {
    const g = this.game
    this.nanSeen = true
    let given = 0
    for (let i = 0; i < 3; i++) if (g.player.inventory.add('voucher')) given++
    for (let i = given; i < 3; i++) g.dynamic.spawnItem('voucher', g.player.body.x + 0.5, g.player.body.z + 0.4 * i, g.player.zone)
    g.toast(`Your nan squeezes your hand, tells you you look thin, and slips you three Greggs vouchers under the table. "Don't tell your mother."`, 'good')
  }

  toSave() {
    return { today: this.today, weather: this.weather, at: this.at, fired: this.fired, lockedUntil: this.lockedUntil, nanSeen: this.nanSeen, reception: this.game.guards.flatMap((gu, i) => (gu.reception ? [i] : [])) }
  }

  fromSave(s: Partial<ReturnType<Events['toSave']>> | undefined): void {
    if (!s) return
    this.today = s.today ?? 'quiet'
    this.weather = s.weather ?? 'clear'
    this.at = s.at ?? -1
    this.fired = s.fired ?? false
    this.lockedUntil = s.lockedUntil ?? -1
    this.nanSeen = s.nanSeen ?? false
    for (const i of s.reception ?? []) if (this.game.guards[i]) this.game.guards[i].reception = true
  }
}

function nearest(guards: Guard[], x: number, z: number): Guard | undefined {
  return guards.sort((a, b) => a.distanceTo(x, z) - b.distanceTo(x, z))[0]
}

/** In front of the canteen counter, where the Greggs delivery goes. */
const SERVERY = { x: 40 * TILE, z: 29 * TILE }

/** Where the officers watching the panto sit, in the chapel. */
export const PANTO = { x: 15.5 * TILE, z: 44.5 * TILE }

/** Where the officers stuck on reception stand, in the loading bay. */
export const RECEPTION = { x: 61.5 * TILE, z: 55.5 * TILE }
