import type { Clock } from './Clock'
import { type BlockId, type Door, type Grid } from '../world/Grid'
import { allowedZones } from './Clock'
import type { Guard } from '../npc/Guard'

/**
 * Who opens what.
 *
 * Cell doors stand open through the day and are locked at lights out. Room
 * doors (showers, laundry, games, healthcare) the same. Gates are always shut
 * and locked; an officer opens one for themselves, and by day a gate officer
 * opens a gate for prisoners whose regime takes them through it. Secure doors
 * and the perimeter gate open for officers and keys only.
 *
 * Doors that an officer opens in a hurry during a riot are left swinging for
 * a few seconds afterwards. That is the gap a riot buys you.
 */
export class Doors {
  /** Seconds a door is left open behind an officer during a disturbance. */
  private readonly swinging = new Map<Door, number>()
  /** Seconds left on each hand holding a door. A hold outlives the frame it
   *  was asked for, because behaviour trees only tick a few times a second. */
  private readonly holds = new Map<Door, number>()

  constructor(private readonly grid: Grid, private readonly clock: Clock, private readonly guards: () => Guard[]) {}

  beginFrame(): void {
    for (const d of this.grid.doors) d.held = (this.holds.get(d) ?? 0) > 0
  }

  /** Is an officer close enough to work this gate? */
  private staffed(door: Door): boolean {
    const x = (door.tx + 0.5) * 2
    const z = (door.ty + 0.5) * 2
    for (const g of this.guards()) if (g.ko <= 0 && !g.busy && Math.hypot(g.x - x, g.z - z) < 16) return true
    return false
  }

  /**
   * `from` is the zone the requester is standing in: a gate officer lets you
   * through toward somewhere the regime allows, whichever side you are on.
   */
  request(door: Door, who: 'guard' | 'prisoner' | 'player', block: string | undefined, riot: boolean, from = ''): boolean {
    if (who === 'guard') {
      this.hold(door)
      if (riot) this.swinging.set(door, 6)
      return true
    }
    if (this.isOpenByRegime(door)) return true
    if (door.kind === 'gate' && !this.clock.locked && block) {
      const allowed = allowedZones(this.clock.period, block as BlockId)
      const [a, b] = door.zones
      const towards = from === b ? a : b
      if (allowed.has(towards) && this.staffed(door)) {
        this.hold(door)
        return true
      }
    }
    return false
  }

  /** Doors open simply because of the time of day. */
  isOpenByRegime(door: Door): boolean {
    const locked = this.clock.locked
    if (door.kind === 'cell') return !locked
    if (door.kind === 'room') return !locked
    return false
  }

  /** Force a door open for this frame (a key, a jammed lock, a guard holding it). */
  hold(door: Door, seconds = 0.4): void {
    door.held = true
    this.holds.set(door, Math.max(this.holds.get(door) ?? 0, seconds))
  }

  update(delta: number): void {
    for (const [door, t] of this.holds) {
      if (t <= delta) this.holds.delete(door)
      else this.holds.set(door, t - delta)
    }
    for (const [door, t] of this.swinging) {
      if (t <= 0) this.swinging.delete(door)
      else {
        this.swinging.set(door, t - delta)
        door.held = true
      }
    }
    for (const door of this.grid.doors) {
      const want = door.held || this.isOpenByRegime(door) ? 1 : 0
      const rate = door.kind === 'gate' || door.kind === 'perimeter' ? 2.2 : 3.2
      door.openness += Math.sign(want - door.openness) * Math.min(Math.abs(want - door.openness), delta * rate)
    }
  }
}
