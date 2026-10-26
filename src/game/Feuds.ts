import { GANGS, type GangId } from '../npc/Gangs'
import type { Prisoner } from '../npc/Prisoner'
import type { Game } from './Game'

/**
 * The firms fight each other, not just you. Each pair of rivals builds bad
 * blood day by day; when it boils over, both sides go at it in the yard at
 * exercise, and every officer comes running. You can stir it up (tell a
 * boss the other lot are planning something) or broker a truce (vouchers,
 * and both firms think better of you).
 */
export const FEUDS: [GangId, GangId][] = [
  ['firm', 'crows'],
  ['lions', 'northern'],
]

export interface Feud {
  /** 0 calm .. 1 boiling over. */
  tension: number
  /** A truce holds until this minute. */
  truceUntil: number
  /** Minute of the day the brawl starts, today, at exercise; -1 none. */
  brawlAt: number
  /** The firm that came off best last time. */
  lastWinner: GangId | null
}

export class Feuds {
  readonly feuds: Feud[] = FEUDS.map(() => ({ tension: 0.2, truceUntil: -1, brawlAt: -1, lastWinner: null }))

  constructor(private readonly game: Game) {}

  /** The feud between a firm and its rival. */
  of(gang: GangId): Feud {
    return this.feuds[FEUDS.findIndex(([a, b]) => a === gang || b === gang)]
  }

  /** Unlock: bad blood builds, and boils over at exercise. */
  newDay(): void {
    const g = this.game
    this.feuds.forEach((f, i) => {
      if (f.truceUntil > g.clock.minutes) return
      f.tension = Math.min(1, f.tension + 0.12 + g.rng() * 0.18)
      if (f.tension >= 1 && f.brawlAt < 0) {
        f.brawlAt = 12 * 60 + 45 + Math.floor(g.rng() * 90)
        const [a, b] = FEUDS[i]
        g.toast(`Bad blood between ${GANGS[a].name} and ${GANGS[b].name}. It will go off in the yard today.`, 'neutral')
      }
    })
  }

  /** Every frame: a brawl due now, at exercise. */
  update(): void {
    const g = this.game
    if (g.clock.period !== 'yard') return
    const m = g.clock.minuteOfDay
    this.feuds.forEach((f, i) => {
      if (f.brawlAt >= 0 && m >= f.brawlAt) {
        f.brawlAt = -1
        f.tension = 0.1
        this.brawl(i)
      }
    })
  }

  /** Both firms go at each other: everyone in their colours, in the yard. */
  private brawl(i: number): void {
    const g = this.game
    const [a, b] = FEUDS[i]
    // Four a side if they can muster them, all round one spot in the yard:
    // whoever is already near, and the rest come running.
    const at = g.grid.randomTileIn('yard', g.rng)
    const cx0 = (at.tx + 0.5) * 2
    const cz0 = (at.ty + 0.5) * 2
    const muster = (gang: GangId) => {
      const all = g.prisoners.filter((p) => p.gang === gang && !p.leader && p.ko <= 0 && p.cuffed <= 0)
      const crew = all.slice(0, 4)
      for (const p of crew) {
        if (Math.hypot(p.x - cx0, p.z - cz0) < 8) continue
        for (let tries = 0; tries < 12; tries++) {
          const nx = cx0 + (g.rng() * 2 - 1) * 5
          const nz = cz0 + (g.rng() * 2 - 1) * 5
          if (g.grid.zone(Math.floor(nx / 2), Math.floor(nz / 2)) !== 'yard') continue
          p.body.x = nx
          p.body.z = nz
          break
        }
      }
      return crew
    }
    const side: Prisoner[] = muster(a)
    const other: Prisoner[] = muster(b)
    if (!side.length || !other.length) return
    for (const [k, p] of side.entries()) {
      p.fighting = true
      p.fightTarget = other[k % other.length]
    }
    for (const [k, p] of other.entries()) {
      p.fighting = true
      p.fightTarget = side[k % side.length]
    }
    // The officers drop everything.
    const cx = [...side, ...other].reduce((t, p) => t + p.x, 0) / (side.length + other.length)
    const cz = [...side, ...other].reduce((t, p) => t + p.z, 0) / (side.length + other.length)
    g.riot = { active: true, night: false, block: null, x: cx, z: cz, timer: 60, byPlayer: false }
    g.emit({ x: cx, z: cz, radius: 40, kind: 'alarm' })
    const winner = side.length >= other.length ? a : b
    this.feuds[i].lastWinner = winner
    // The firm that comes off best is cocky, and cheaper to hire.
    g.memory.gangs[winner].favours++
    g.toast(`${GANGS[a].name} and ${GANGS[b].name} go at it in the yard! Every officer in the place is running that way.`, 'good')
  }

  /** Tell a boss their rivals are planning something. */
  stir(gang: GangId): string {
    const g = this.game
    const f = this.of(gang)
    const rival = GANGS[gang].rival
    f.tension = 1
    f.truceUntil = -1
    const now = g.clock.minuteOfDay
    f.brawlAt = g.clock.period === 'yard' ? now + 10 : 12 * 60 + 45 + Math.floor(g.rng() * 60)
    // Word gets round, sometimes.
    if (g.rng() < 0.3) {
      g.memory.annoy(rival, 0.2)
      g.toast(`${GANGS[rival].name} heard who started it.`, 'bad')
    }
    return `Are they now. ARE THEY NOW. Right. Yard, ${g.clock.period === 'yard' ? 'now' : 'next exercise'}. Tell nobody.`
  }

  /** Pay for peace between a firm and its rival. */
  truce(gang: GangId): void {
    const g = this.game
    const f = this.of(gang)
    f.tension = 0
    f.brawlAt = -1
    f.truceUntil = g.clock.minutes + 3 * 1440
    g.memory.annoy(gang, -0.1)
    g.memory.annoy(GANGS[gang].rival, -0.1)
  }

  toSave() {
    return this.feuds.map((f) => ({ ...f }))
  }

  fromSave(s: Feud[] | undefined): void {
    if (!s) return
    s.forEach((f, i) => this.feuds[i] && Object.assign(this.feuds[i], f))
  }
}
