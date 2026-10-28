import type { BufferGeometry } from 'three'
import { HEX } from '../art/palette'
import { ball, ring } from '../art/shapes'
import type { Guard } from '../npc/Guard'
import type { Placement, Thing } from '../world/Things'
import type { Prisoner } from '../npc/Prisoner'
import { TILE } from '../world/Grid'
import type { Game } from './Game'

/**
 * One basketball in the yard. Pick it up (E) and it bounces along beside
 * you; near the hoop, E takes a shot on a proper arc, and the further out
 * the worse your odds. R throws it at whoever is nearest: a prisoner takes
 * that personally, unless his back was turned, in which case he blames
 * whoever is standing closest to him. An officer just writes you up.
 * Left lying about, other prisoners take shots of their own.
 */

/** The rim, its backboard and the middle of the court (see Build.ts). */
const COURT = { x: 33.5 * TILE, z: 49.5 * TILE }
export const RIM = { x: COURT.x - 8.9, y: 3.1, z: COURT.z }
const RIM_R = 0.35
const BOARD = { x: COURT.x - 9.4 + 0.06, y0: 3.0, y1: 4.1, z0: COURT.z - 0.9, z1: COURT.z + 0.9 }
const R = 0.19
const G = 9.8
/** Furthest you can shoot from, and furthest you can throw at someone. */
const SHOT_RANGE = 12
const THROW_RANGE = 10

type Thrower = 'player' | Prisoner

export class Basketball implements Thing {
  readonly id = 'basketball'
  x = COURT.x + 2
  y = R
  z = COURT.z + 1.5
  vx = 0
  vy = 0
  vz = 0
  /** Who has it: you, a prisoner taking a shot, or nobody. */
  held: Thrower | null = null
  /** Out of the yard: back in the morning. */
  gone = false
  /** The last throw, for scoring and blame. */
  private flight: { by: Thrower; at: 'hoop' | Prisoner | Guard | null; scored: boolean; unseen?: boolean } | null = null
  private idle = 0
  private bounceCooldown = 0
  /** Baskets in a row, yours. */
  streak = 0
  baskets = 0
  spin = 0

  constructor(private readonly game: Game) {
    game.things.add(this)
  }

  /** Orange, with its black seams. */
  model(): BufferGeometry[] {
    return [
      ball(R, { x: 0, y: 0, z: 0 }, 0xe8742c),
      ring(R * 1.005, 0.012, { x: 0, y: 0, z: 0 }, HEX.ink, 0),
      ring(R * 1.005, 0.012, { x: 0, y: 0, z: 0 }, HEX.ink, Math.PI / 2),
      ring(R * 1.005, 0.012, { x: 0, y: 0, z: 0, ry: Math.PI / 2 }, HEX.ink, Math.PI / 2),
    ]
  }

  place(): Placement {
    return { x: this.x, y: this.y, z: this.z, rx: this.spin, ry: this.spin * 0.3, visible: !this.gone }
  }

  private get inYard(): boolean {
    return this.game.grid.zoneAtWorld(this.x, this.z) === 'yard'
  }

  /** Back on the court, at rest. */
  reset(): void {
    this.held = null
    this.flight = null
    this.gone = false
    this.x = COURT.x + 2
    this.z = COURT.z + 1.5
    this.y = R
    this.vx = this.vy = this.vz = 0
  }

  newDay(): void {
    if (this.gone || this.held) this.reset()
  }

  // ---- Throwing ----

  /** Launch from a point to land at a target after `t` seconds. */
  private launch(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }, t: number): void {
    this.x = from.x
    this.y = from.y
    this.z = from.z
    this.vx = (to.x - from.x) / t
    this.vz = (to.z - from.z) / t
    this.vy = (to.y - from.y) / t + 0.5 * G * t
    this.held = null
    this.idle = 0
  }

  private hands(by: Thrower): { x: number; y: number; z: number } {
    const b = by === 'player' ? this.game.player.body : by.body
    return { x: b.x + Math.sin(b.yaw) * 0.45, y: 1.6, z: b.z + Math.cos(b.yaw) * 0.45 }
  }

  /** A shot at the hoop; whether it is on target is decided at the release. */
  shoot(by: Thrower, skill = 1): void {
    const g = this.game
    const from = this.hands(by)
    const d = Math.hypot(RIM.x - from.x, RIM.z - from.z)
    const running = by === 'player' && g.player.running
    const chance = Math.max(0.12, Math.min(0.9, 0.95 - d * 0.065)) * skill * (running ? 0.55 : 1)
    const make = g.rng() < chance
    // A miss is aimed a little off, so it rattles off the rim or the board.
    const off = make ? 0 : 0.32 + g.rng() * 0.35
    const ang = g.rng() * Math.PI * 2
    const to = { x: RIM.x + Math.cos(ang) * off + (make ? 0.04 : 0), y: RIM.y + 0.05, z: RIM.z + Math.sin(ang) * off }
    this.launch(from, to, 0.65 + d * 0.06)
    this.flight = { by, at: 'hoop', scored: false }
    g.sounds.push({ sound: 'throw', volume: 0.4 })
  }

  /** Thrown at someone, hard and flat. */
  throwAt(by: Thrower, target: Prisoner | Guard): void {
    const g = this.game
    const from = this.hands(by)
    const d = Math.hypot(target.x - from.x, target.z - from.z)
    // Lead them: where they will be when it gets there.
    const t = 0.22 + d * 0.045
    const b = target.body
    this.launch(from, { x: b.x + Math.sin(b.yaw) * b.speed * t, y: 1.25, z: b.z + Math.cos(b.yaw) * b.speed * t }, t)
    // Whether they saw it coming is decided as you wind up: facing away, they did not.
    const tb = target.body
    const thrower = by === 'player' ? g.player.body : by.body
    const unseen = (thrower.x - tb.x) * Math.sin(tb.yaw) + (thrower.z - tb.z) * Math.cos(tb.yaw) < -0.5
    this.flight = { by, at: target, scored: false, unseen }
    g.sounds.push({ sound: 'throw', volume: 0.6 })
  }

  /** A lob straight ahead, when there is nothing to aim at. */
  lob(): void {
    const b = this.game.player.body
    const from = this.hands('player')
    this.launch(from, { x: b.x + Math.sin(b.yaw) * 7, y: R, z: b.z + Math.cos(b.yaw) * 7 }, 1.0)
    this.flight = { by: 'player', at: null, scored: false }
  }

  // ---- Every frame ----

  update(delta: number): void {
    const g = this.game
    const p = g.player
    this.bounceCooldown -= delta
    if (this.gone) return
    // In your hands: dribbled beside you as you walk.
    if (this.held === 'player') {
      if (p.zone !== 'yard' || p.inVent || p.inBasket || p.attempt || g.over) {
        this.reset()
        if (p.zone !== 'yard') g.toast('The ball stays in the yard. An officer takes it off you and bounces it back onto the court.', 'neutral')
        return
      }
      const b = p.body
      this.spin += delta * (2 + b.speed)
      this.x = b.x + Math.sin(b.yaw) * 0.45 + Math.cos(b.yaw) * 0.25
      this.z = b.z + Math.cos(b.yaw) * 0.45 - Math.sin(b.yaw) * 0.25
      const bounce = Math.abs(Math.sin(this.spin * 3))
      this.y = b.speed > 0.3 ? R + bounce * 0.75 : 0.95
      if (b.speed > 0.3 && bounce < 0.08 && this.bounceCooldown <= 0) {
        this.bounceCooldown = 0.25
        g.sounds.push({ sound: 'bounce', volume: 0.35 })
      }
      return
    }
    // A prisoner lining up a shot.
    if (this.held) {
      const pr = this.held
      if (pr.ko > 0 || pr.fighting) return this.drop()
      const h = this.hands(pr)
      this.x = h.x
      this.y = h.y - 0.4
      this.z = h.z
      this.idle += delta
      if (this.idle > 0.7) this.shoot(pr, 0.75)
      return
    }
    // In flight, or rolling: small steps so it cannot pass through the rim.
    const steps = Math.max(1, Math.ceil(delta / 0.008))
    const dt = delta / steps
    for (let i = 0; i < steps; i++) this.step(dt)
    // Lying about in the yard: somebody nearby fancies a shot.
    const resting = Math.abs(this.vx) + Math.abs(this.vz) + Math.abs(this.vy) < 0.3 && this.y <= R + 0.01
    if (resting) {
      this.idle += delta
      if (this.idle > 9 && g.clock.period === 'yard' && !g.clock.locked) {
        const near = g.prisoners
          .filter((pr) => pr.ko <= 0 && !pr.fighting && pr.cuffed <= 0 && pr.zone === 'yard' && pr.distanceTo(this.x, this.z) < 6)
          .sort((a, c) => a.distanceTo(this.x, this.z) - c.distanceTo(this.x, this.z))[0]
        if (near && Math.hypot(RIM.x - near.x, RIM.z - near.z) < SHOT_RANGE + 2) {
          this.held = near
          this.idle = 0
          near.say(pick(g, ['Watch this.', 'Nothing but net.', 'Old school.', 'From downtown!']), 1.5)
        } else this.idle = 4
      }
    }
  }

  private drop(): void {
    this.held = null
    this.vx = this.vz = 0
    this.vy = 1
  }

  private step(dt: number): void {
    const g = this.game
    const px = this.x
    const py = this.y
    // Gravity, walls and the floor: the same rules as everything else.
    const hit = g.collision.bounce(this, R, dt)
    if (hit.wall) this.thud(0.4)
    if (hit.floorImpact) this.thud(Math.min(1, hit.floorImpact / 8))
    this.spin += dt * Math.hypot(this.vx, this.vz) * 2
    // The backboard.
    if (px > BOARD.x && this.x <= BOARD.x && this.y > BOARD.y0 && this.y < BOARD.y1 && this.z > BOARD.z0 && this.z < BOARD.z1) {
      this.x = BOARD.x + 0.01
      this.vx = -this.vx * 0.55
      this.clank(0.5)
    }
    // Through the hoop: down through the ring, inside it.
    const dr = Math.hypot(this.x - RIM.x, this.z - RIM.z)
    if (py > RIM.y && this.y <= RIM.y && dr < RIM_R - R * 0.5 && this.flight && !this.flight.scored) {
      this.flight.scored = true
      this.scored(this.flight.by)
      // The net takes the pace off it.
      this.vx *= 0.08
      this.vz *= 0.08
      this.vy = Math.min(this.vy, -1)
    }
    // Off the rim.
    // The rim is a ring: what matters is how close the ball is to the ring itself.
    if (Math.hypot(dr - RIM_R, this.y - RIM.y) < R * 0.8 && this.bounceCooldown <= 0) {
      const nx = (this.x - RIM.x) / Math.max(0.01, dr)
      const nz = (this.z - RIM.z) / Math.max(0.01, dr)
      const out = dr > RIM_R ? 1 : -1
      this.vx = nx * out * (1.2 + Math.random() * 1.2)
      this.vz = nz * out * (1.2 + Math.random() * 1.2)
      this.vy = Math.abs(this.vy) * 0.5 + 1
      this.bounceCooldown = 0.15
      this.clank(0.6)
    }
    // People in the way, when it was thrown at someone.
    const f = this.flight
    if (f && f.at && f.at !== 'hoop' && this.y > 0.3 && this.y < 1.9) {
      const t = f.at
      // A little homing, so a thrown ball finds a moving target.
      const hx = t.x - this.x
      const hz = t.z - this.z
      const hd = Math.hypot(hx, hz)
      const sp = Math.hypot(this.vx, this.vz)
      if (hd > 0.01 && sp > 2) {
        const k = Math.min(1, dt * 6)
        this.vx += ((hx / hd) * sp - this.vx) * k
        this.vz += ((hz / hd) * sp - this.vz) * k
      }
      if (hd < 0.7) {
        this.hitSomeone(f.by, t, !!f.unseen)
        this.flight = null
        this.vx *= -0.3
        this.vz *= -0.3
        this.vy = 1.5
      }
    }
    // On the ground.
    if (this.y <= R + 0.001) {
      if (this.vy === 0 && this.flight && this.flight.at === null) this.flight = null
      // Over the wall and gone.
      if (!this.inYard && !this.held) {
        this.gone = true
        g.toast('The ball sails over the fence. Somebody will find another one tomorrow.', 'neutral')
      }
    }
  }

  private thud(volume: number): void {
    if (this.bounceCooldown > 0) return
    this.bounceCooldown = 0.08
    if (this.near(18)) this.game.sounds.push({ sound: 'bounce', volume })
  }

  private clank(volume: number): void {
    if (this.near(22)) this.game.sounds.push({ sound: 'clank', volume })
  }

  private near(r: number): boolean {
    const b = this.game.player.body
    return Math.hypot(b.x - this.x, b.z - this.z) < r
  }

  /** Swish. */
  private scored(by: Thrower): void {
    const g = this.game
    if (by === 'player') {
      this.baskets++
      this.streak++
      g.sounds.push({ sound: 'good', volume: 0.7 })
      g.toast(this.streak >= 3 ? `${this.streak} in a row! The yard is chanting your name. Well, "BANDIT".` : pick(g, ['Swish! Nothing but net.', 'In off the backboard. Counts.', 'Two points. Somebody whistles.']), 'good')
      g.achieve('baller')
      // The yard likes a show: a little goodwill from whoever saw it.
      for (const pr of g.prisoners) {
        if (pr.zone === 'yard' && pr.distanceTo(g.player.body.x, g.player.body.z) < 14 && pr.ko <= 0) {
          pr.trust = Math.min(1, pr.trust + 0.03)
          if (g.rng() < 0.25) pr.say(pick(g, ['Get in!', "He's on fire!", 'Lucky.', 'Do it again, then.']), 1.6)
        }
      }
    } else {
      const shooter = by
      shooter.say(pick(g, ['Yes! YES!', 'Told you.', "And that's the game."]), 1.6)
    }
  }

  /** It hit someone. Prisoners fight; officers write you up. */
  private hitSomeone(by: Thrower, t: Prisoner | Guard, unseen: boolean): void {
    const g = this.game
    g.sounds.push({ sound: 'fight', volume: 0.5 })
    if (g.guards.includes(t as Guard)) {
      const officer = t as Guard
      if (by !== 'player') return officer.say('Right, who threw that?', 1.8)
      officer.suspicion = Math.max(officer.suspicion, 0.8)
      g.warn(officer, pick(g, ['Throw that at me again and you will be eating it in segregation.', 'Was that a BALL? At an OFFICER?']))
      return
    }
    const pr = t as Prisoner
    if (by !== 'player') return
    // Back turned: he never saw who did it, and blames whoever is nearest.
    const scapegoat = !unseen
      ? null
      : g.prisoners
          .filter((o) => o !== pr && o.ko <= 0 && o.cuffed <= 0 && o.distanceTo(pr.x, pr.z) < 6)
          .sort((a, c) => a.distanceTo(pr.x, pr.z) - c.distanceTo(pr.x, pr.z))[0]
    if (scapegoat) {
      pr.say(pick(g, [`${scapegoat.name}! You're dead!`, 'Who threw that? Was it YOU?', 'Right. RIGHT.']), 2.2)
      pr.fighting = true
      pr.fightTarget = scapegoat
      scapegoat.fighting = true
      scapegoat.fightTarget = pr
      scapegoat.say("It wasn't me!", 1.6)
      g.lastFightByPlayer = 20
      g.toast(`${pr.name} spins round and blames ${scapegoat.name}. They go at it.`, 'good')
      return
    }
    pr.say(pick(g, ['You want some?', 'Oi! OI!', 'Right, you.']), 1.8)
    pr.hit(1, 'player')
    g.toast(`${pr.name} saw who threw that. He is coming for you.`, 'bad')
  }

  // ---- Prompts ----

  prompts(add: (key: string, label: string, run: () => void) => void, near: (x: number, z: number, r: number) => boolean): void {
    const g = this.game
    const p = g.player
    if (p.zone !== 'yard' || g.clock.locked || this.gone) return
    const b = p.body
    if (this.held === 'player') {
      const d = Math.hypot(RIM.x - b.x, RIM.z - b.z)
      if (d < SHOT_RANGE) add('E', `Shoot at the hoop (${Math.round(d)} m)`, () => this.shoot('player'))
      else add('E', 'Lob the ball', () => this.lob())
      const target = this.nearestTarget()
      if (target) add('R', `Throw the ball at ${target.name}`, () => this.throwAt('player', target))
      return
    }
    if (!this.held && this.y < 1.2 && near(this.x, this.z, 1.6)) {
      add('E', 'Pick up the basketball', () => {
        this.held = 'player'
        this.flight = null
        this.vx = this.vy = this.vz = 0
        if (this.baskets === 0) g.toast('Basketball. E to shoot when you are near the hoop, R to throw it at someone.', 'neutral')
      })
    }
  }

  /** Whoever you are facing, near enough to hit. */
  private nearestTarget(): Prisoner | Guard | null {
    const g = this.game
    const b = g.player.body
    const fx = Math.sin(b.yaw)
    const fz = Math.cos(b.yaw)
    let best: Prisoner | Guard | null = null
    let bestScore = Infinity
    for (const a of [...g.prisoners, ...g.guards] as (Prisoner | Guard)[]) {
      if (a.ko > 0 || !a.body.visible) continue
      const dx = a.x - b.x
      const dz = a.z - b.z
      const d = Math.hypot(dx, dz)
      if (d < 1 || d > THROW_RANGE) continue
      const facing = (dx * fx + dz * fz) / d
      if (facing < 0.3) continue
      const score = d * (2 - facing)
      if (score < bestScore) (bestScore = score), (best = a)
    }
    return best
  }
}

function pick<T>(g: Game, list: T[]): T {
  return list[Math.floor(g.rng() * list.length)]
}
