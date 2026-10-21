import { type Body } from '../render/Crowd'
import { type Door, TILE, Tile, worldToTile } from '../world/Grid'
import { findPath, moveCircle } from '../world/Nav'
import type { Status } from './BehaviourTree'
import type { World } from './World'

/**
 * Shared legs for every NPC: path planning, path following, doors, bumping
 * past people, and turning to look at things. The behaviour trees only ever
 * say where to go; this decides how.
 */
export const RADIUS = 0.36

export abstract class Agent {
  thought = ''
  /** Wing this person belongs to: A to D. */
  block = ''
  readonly body: Body
  path: { tx: number; ty: number }[] = []
  private goalKey = -1
  private repath = 0
  private stuck = 0
  /** Waiting at a door that has not opened yet. */
  waitingAt: Door | null = null
  /** Unconscious (punched out) for this many seconds. */
  ko = 0
  /** Behaviour tree ticks are staggered across frames. */
  tickTimer: number
  speech = ''
  speechTimer = 0
  /** Where this agent wants to face when standing still. */
  lookYaw: number | null = null

  constructor(body: Body, protected readonly world: World) {
    this.body = body
    this.tickTimer = world.rng() * 0.2
  }

  get x(): number {
    return this.body.x
  }
  get z(): number {
    return this.body.z
  }
  get tile(): { tx: number; ty: number } {
    return worldToTile(this.body.x, this.body.z)
  }
  get zone(): string {
    return this.world.grid.zoneAtWorld(this.body.x, this.body.z)
  }

  abstract canUse(door: Door): boolean
  abstract readonly role: 'guard' | 'prisoner'

  distanceTo(x: number, z: number): number {
    return Math.hypot(this.body.x - x, this.body.z - z)
  }

  say(text: string, seconds = 2.6): void {
    this.speech = text
    this.speechTimer = seconds
  }

  /**
   * Walks toward a tile. Plans once per goal, re-plans now and then (doors
   * change state; people get in the way). 'success' on arrival.
   */
  goTo(tx: number, ty: number, speed: number, arriveWithin = 0.6, exact = false): Status {
    // A tile under a washing machine or a table is never a place to stand:
    // head for the nearest clear tile beside it instead. (`exact` is a trip
    // to a point, a seat or a bed, which keeps its tile.)
    const grid = this.world.grid
    if (!exact && grid.underProp(tx, ty)) {
      let best: { tx: number; ty: number } | null = null
      let bd = Infinity
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = tx + dx
          const ny = ty + dy
          if (!grid.passable(nx, ny) || grid.underProp(nx, ny) || grid.zone(nx, ny) !== grid.zone(tx, ty)) continue
          const d = dx * dx + dy * dy
          if (d < bd) {
            bd = d
            best = { tx: nx, ty: ny }
          }
        }
      }
      if (best) {
        tx = best.tx
        ty = best.ty
      }
    }
    if (!exact) this.heading = null
    const key = ty * 1000 + tx
    const tc = { x: (tx + 0.5) * TILE, z: (ty + 0.5) * TILE }
    if (this.distanceTo(tc.x, tc.z) < arriveWithin) {
      this.path.length = 0
      this.wantSpeed = 0
      return 'success'
    }
    if (key !== this.goalKey || this.path.length === 0 || this.repath <= 0) {
      const p = findPath(this.world.grid, this.tile, { tx, ty }, (d) => this.canUse(d))
      this.goalKey = key
      this.repath = 2.5 + this.world.rng()
      if (!p) {
        this.path.length = 0
        this.wantSpeed = 0
        return 'failure'
      }
      this.path = p
    }
    this.wantSpeed = speed
    return 'running'
  }

  goToWorld(x: number, z: number, speed: number, arriveWithin = 0.6): Status {
    // A spot that landed inside a machine or a table moves to just outside
    // it; seats and beds keep their spot.
    const spot = { x, z }
    this.world.grid.pushOutOfProps(spot, RADIUS + 0.02, spot)
    x = spot.x
    z = spot.z
    const t = worldToTile(x, z)
    this.heading = { x, z }
    if (this.distanceTo(x, z) < arriveWithin) {
      this.wantSpeed = 0
      this.path.length = 0
      return 'success'
    }
    // Same tile: walk straight at the point.
    if (t.tx === this.tile.tx && t.ty === this.tile.ty) {
      this.path = [t]
      this.direct = { x, z }
      this.wantSpeed = speed
      return 'running'
    }
    this.direct = null
    const st = this.goTo(t.tx, t.ty, speed, arriveWithin, true)
    this.heading = { x, z }
    return st
  }

  stop(): void {
    this.path.length = 0
    this.wantSpeed = 0
    this.direct = null
  }

  face(x: number, z: number): void {
    this.lookYaw = Math.atan2(x - this.body.x, z - this.body.z)
  }

  protected wantSpeed = 0
  private direct: { x: number; z: number } | null = null
  /** Where this body is going (or sitting): furniture holding it lets it in. */
  private heading: { x: number; z: number } | null = null

  /** Frame update: follow the path, open doors, avoid others. */
  move(delta: number, others: Agent[]): void {
    this.repath -= delta
    if (this.speechTimer > 0) this.speechTimer -= delta
    if (this.ko > 0) {
      this.ko -= delta
      this.body.speed = 0
      return
    }
    // Asleep on a bunk: nothing turns or shoves a sleeping body.
    if (this.body.pose === 'sleep') {
      this.body.speed = 0
      return
    }

    let vx = 0
    let vz = 0
    this.waitingAt = null
    if (this.path.length > 0 && this.wantSpeed > 0) {
      const next = this.path[0]
      const door = this.world.grid.doorAtTile(next.tx, next.ty)
      const target = this.direct && this.path.length === 1 ? this.direct : { x: (next.tx + 0.5) * TILE, z: (next.ty + 0.5) * TILE }
      if (door && door.openness < 0.75) {
        // Ask for it; stand back until it opens.
        const allowed = this.world.requestDoor(door, this.role, this.block, this.zone)
        this.waitingAt = door
        if (!allowed) {
          this.stuck += delta
          if (this.stuck > 4) {
            this.stuck = 0
            this.path.length = 0
          }
        }
      } else {
        if (door) this.world.requestDoor(door, this.role, this.block, this.zone)
        const dx = target.x - this.body.x
        const dz = target.z - this.body.z
        const d = Math.hypot(dx, dz)
        if (d < 0.25) {
          this.path.shift()
          if (this.path.length === 0) this.direct = null
        } else {
          vx = (dx / d) * this.wantSpeed
          vz = (dz / d) * this.wantSpeed
        }
        // Keep holding the door we just came through until we are clear.
        const here = this.world.grid.doorAtTile(this.tile.tx, this.tile.ty)
        if (here) this.world.requestDoor(here, this.role, this.block, this.zone)
      }
    }

    // Separation: a gentle push from anyone standing on top of us.
    for (const o of others) {
      if (o === this || !o.body.visible || o.ko > 0) continue
      const dx = this.body.x - o.body.x
      const dz = this.body.z - o.body.z
      const d2 = dx * dx + dz * dz
      if (d2 < 0.55 && d2 > 1e-6) {
        const d = Math.sqrt(d2)
        const push = (0.75 - d) * 2.2
        vx += (dx / d) * push
        vz += (dz / d) * push
      }
    }

    const speed = Math.hypot(vx, vz)
    const grid = this.world.grid
    moveCircle(this.body, vx * delta, vz * delta, RADIUS, (tx, ty) => {
      const t = grid.tile(tx, ty)
      if (t === Tile.Floor || t === Tile.Outside) return false
      if (t === Tile.Door) return (grid.doorAtTile(tx, ty)?.openness ?? 0) < 0.6
      return true
    })
    grid.pushOutOfProps(this.body, RADIUS, this.heading)

    this.body.speed += (Math.min(speed, this.wantSpeed + 0.5) - this.body.speed) * Math.min(1, delta * 8)
    let yaw = this.lookYaw
    if (speed > 0.3 && this.wantSpeed > 0) yaw = Math.atan2(vx, vz)
    if (yaw != null) {
      let d = yaw - this.body.yaw
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      this.body.yaw += d * Math.min(1, delta * 8)
    }
    if (speed > 0.3) this.lookYaw = null
  }
}
