import type { Game } from '../Game'
import { Guard } from '../../npc/Guard'
import { TILE, tileCentre } from '../../world/Grid'

/**
 * Riots, the noises people hear, and the alarm.
 */
export class Disorder {
  constructor(private readonly game: Game) {}

  updateRiot(delta: number): void {
    this.game.lastFightByPlayer = Math.max(0, this.game.lastFightByPlayer - delta)
    if (this.game.riot.active && this.game.riot.night) {
      this.game.riot.timer -= delta
      if (this.game.riot.timer <= 0) {
        this.game.riot.active = false
        this.game.toast('The landing is quiet again. Officers count heads.', 'neutral')
      }
      return
    }
    const fighters = this.game.prisoners.filter((p) => p.fighting && p.ko <= 0)
    if (!this.game.riot.active) {
      if (fighters.length >= 3) {
        const cx = fighters.reduce((s, f) => s + f.x, 0) / fighters.length
        const cz = fighters.reduce((s, f) => s + f.z, 0) / fighters.length
        const close = fighters.filter((f) => Math.hypot(f.x - cx, f.z - cz) < 14)
        if (close.length >= 3) {
          this.game.riot = { active: true, night: false, block: null, x: cx, z: cz, timer: 60, byPlayer: this.game.lastFightByPlayer > 0 }
          this.game.riotQuiet = 0
          this.game.toast(this.game.riot.byPlayer ? 'It has gone off! Officers are running in from everywhere. Doors are being left open...' : 'A fight has broken out.', this.game.riot.byPlayer ? 'good' : 'neutral')
          if (this.game.riot.byPlayer) this.game.methodHint = 'riot'
          this.game.emit({ x: cx, z: cz, radius: 40, kind: 'alarm' })
        }
      }
      return
    }
    this.game.riot.timer -= delta
    if (fighters.length) {
      this.game.riot.x += (fighters[0].x - this.game.riot.x) * delta * 0.5
      this.game.riot.z += (fighters[0].z - this.game.riot.z) * delta * 0.5
    }
    this.game.riotQuiet = fighters.length < 2 ? this.game.riotQuiet + delta : 0
    if (this.game.riotQuiet > 5 || this.game.riot.timer <= 0) {
      this.game.riot.active = false
      for (const f of fighters) f.subdue()
      this.game.toast('The disturbance is over.', 'neutral')
      if (this.game.riot.byPlayer && this.game.methodHint === 'riot' && !this.game.player.attempt) this.game.methodHint = null
    }
  }

  updateNoises(delta: number): void {
    for (let i = this.game.noises.length - 1; i >= 0; i--) {
      const n = this.game.noises[i]
      if (n.age === 0) {
        // Fresh noise: the nearest free officer in earshot comes to look.
        if (n.kind === 'clank' || n.kind === 'throw') {
          let best: Guard | null = null
          let bd = Infinity
          for (const g of this.game.guards) {
            if (g.ko > 0 || g.chasing || g.busy || this.game.sickCall?.responders.includes(g)) continue
            // The nosy hear it from much further off.
            const d = Math.hypot(g.x - n.x, g.z - n.z) / (g.trait === 'nosy' ? 1.6 : 1)
            if (d < n.radius && d < bd) {
              bd = d
              best = g
            }
          }
          if (best && !best.investigate) {
            // In the ducts, the sound comes out of the nearest grille.
            if (this.game.player.inVent && n.kind === 'clank') {
              let gr = this.game.grid.grates[0]
              let gd = Infinity
              for (const g of this.game.grid.grates) {
                const d = Math.hypot((g.tx + 0.5) * TILE - n.x, (g.ty + 0.5) * TILE - n.z)
                if (d < gd) {
                  gd = d
                  gr = g
                }
              }
              const c = tileCentre(gr.tx, gr.ty)
              best.investigate = { x: c.x, z: c.z, t: 6 + this.game.memory.ventListening * 10 }
              best.say('What was that? ...In the vents?', 2)
            } else {
              best.investigate = { x: n.x, z: n.z, t: 4 }
              best.say(n.kind === 'throw' ? 'Who threw that?' : 'Hello?', 1.5)
            }
          }
        }
      }
      n.age += delta
      if (n.age > 0.2) this.game.noises.splice(i, 1)
    }
  }

  updateAlarm(delta: number): void {
    if (!this.game.alarm.active) return
    this.game.alarm.timer -= delta
    // Officers nearby join the hunt.
    for (const g of this.game.guards) {
      if (g.chasing || g.ko > 0) continue
      if (Math.hypot(g.x - this.game.alarm.x, g.z - this.game.alarm.z) < 30 && !g.investigate) g.investigate = { x: this.game.alarm.x, z: this.game.alarm.z, t: 6 }
    }
    if (this.game.alarm.timer <= 0 || !this.game.guards.some((g) => g.chasing)) {
      if (this.game.alarm.timer <= 0) this.game.alarm.active = false
    }
  }
}
