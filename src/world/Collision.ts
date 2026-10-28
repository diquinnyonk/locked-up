import { PERIMETER_H, WALL_H } from './Build'
import { DOOR_STAND, DOOR_WALK, type Grid, TILE, Tile } from './Grid'
import { moveCircle } from './Nav'

/**
 * Collision for everything that moves: people walking, people bumping into
 * each other, and things flying about (the basketball). One set of rules, so
 * a door that lets the player through lets an officer through, and a wall a
 * prisoner cannot walk through is a wall the ball bounces off.
 */

export { DOOR_STAND, DOOR_WALK }
/** How close two upright people can stand, centre to centre. */
export const PERSONAL_SPACE = 0.68
const GRAVITY = 9.8

/** Someone in the crowd: how readily they give way (0 never, 1 fully), and how. */
export interface Separable {
  x: number
  z: number
  give: number
  move(dx: number, dz: number): void
}

/** A flying thing: position and velocity, in metres and metres a second. */
export interface Projectile {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
}

export interface BounceResult {
  /** Speed it hit the floor at, if it bounced this step (0 if not). */
  floorImpact: number
  /** It hit a wall this step. */
  wall: boolean
  /** On the floor and barely moving. */
  resting: boolean
}

export class Collision {
  constructor(private readonly grid: Grid) {}

  /** Walls stop a walker, and so do doors not yet open enough to get through. */
  blocksWalker(tx: number, ty: number): boolean {
    const t = this.grid.tile(tx, ty)
    if (t === Tile.Floor || t === Tile.Outside) return false
    if (t === Tile.Door) return (this.grid.doorAtTile(tx, ty)?.openness ?? 0) < DOOR_WALK
    return true
  }

  /** Is there something solid at this point in the air: a wall below its top, or a shut door? */
  solidAt(x: number, y: number, z: number): boolean {
    const tx = Math.floor(x / TILE)
    const ty = Math.floor(z / TILE)
    const t = this.grid.tile(tx, ty)
    if (t === Tile.Floor || t === Tile.Outside) return false
    if (t === Tile.Door) return y < WALL_H && (this.grid.doorAtTile(tx, ty)?.openness ?? 0) < DOOR_WALK
    if (t === Tile.Perimeter) return y < PERIMETER_H
    return y < WALL_H + 0.8
  }

  /**
   * A step of walking: slide along walls and shut doors, then out of any
   * furniture. `heading` is where they are going: a bench or bed that holds
   * that point lets them in, so people can sit and lie down.
   */
  walk(pos: { x: number; z: number }, dx: number, dz: number, radius: number, heading?: { x: number; z: number } | null): void {
    moveCircle(pos, dx, dz, radius, (tx, ty) => this.blocksWalker(tx, ty))
    this.grid.pushOutOfProps(pos, radius, heading)
  }

  /**
   * Keeps upright people from standing inside one another: every pair closer
   * than `PERSONAL_SPACE` is pushed apart, the push shared by how readily
   * each gives way. Two who never give way (both seated, say) stay put.
   */
  separate(crowd: Separable[], min = PERSONAL_SPACE): void {
    for (let i = 0; i < crowd.length; i++) {
      const A = crowd[i]
      for (let j = i + 1; j < crowd.length; j++) {
        const B = crowd[j]
        const w = A.give + B.give
        if (w === 0) continue
        let dx = B.x - A.x
        let dz = B.z - A.z
        if (Math.abs(dx) > min || Math.abs(dz) > min) continue
        let d = Math.hypot(dx, dz)
        if (d >= min) continue
        const overlap = min - d
        if (d < 1e-4) {
          // Exactly on top of each other: part them along a fixed axis.
          dx = 1
          dz = 0
          d = 1
        }
        const nx = dx / d
        const nz = dz / d
        if (A.give) A.move(-nx * overlap * (A.give / w), -nz * overlap * (A.give / w))
        if (B.give) B.move(nx * overlap * (B.give / w), nz * overlap * (B.give / w))
      }
    }
  }

  /**
   * One small step of a ball in flight: gravity, walls (by their height),
   * the floor. Walls and floor take the bounce out of it by `wall` and
   * `floor`; rolling on the floor it slows by `friction` a second.
   */
  bounce(p: Projectile, radius: number, dt: number, opts: { floor?: number; wall?: number; friction?: number } = {}): BounceResult {
    const floorK = opts.floor ?? 0.62
    const wallK = opts.wall ?? 0.5
    const friction = opts.friction ?? 1.6
    const out: BounceResult = { floorImpact: 0, wall: false, resting: false }
    p.vy -= GRAVITY * dt
    // Across, one axis at a time, so it slides off a corner the right way.
    const nx = p.x + p.vx * dt
    if (this.solidAt(nx, p.y, p.z)) {
      p.vx = -p.vx * wallK
      out.wall = true
    } else p.x = nx
    const nz = p.z + p.vz * dt
    if (this.solidAt(p.x, p.y, nz)) {
      p.vz = -p.vz * wallK
      out.wall = true
    } else p.z = nz
    p.y += p.vy * dt
    // The floor.
    if (p.y < radius) {
      p.y = radius
      if (p.vy < -0.8) {
        out.floorImpact = -p.vy
        p.vy = -p.vy * floorK
        p.vx *= 0.86
        p.vz *= 0.86
      } else {
        p.vy = 0
        const k = Math.max(0, 1 - friction * dt)
        p.vx *= k
        p.vz *= k
      }
    }
    out.resting = p.y <= radius + 0.001 && p.vy === 0 && Math.hypot(p.vx, p.vz) < 0.15
    return out
  }
}
