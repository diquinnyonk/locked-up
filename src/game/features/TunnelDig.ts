import type { Game } from '../Game'
import { TUNNEL_LENGTH, TUNNEL_TRUST, TUNNEL_MILESTONES, pick2 } from './shared'

/**
 * The tunnel under the loose tile by your bunk: digging, rubble, being heard.
 */
export class TunnelDig {
  constructor(private readonly game: Game) {}

  tunnelPrompts(add: (key: string, label: string, run: () => void) => void): void {
    const p = this.game.player
    const spot = this.game.tunnelSpot
    if (!this.game.clock.locked || p.inVent || Math.hypot(p.body.x - spot.x, p.body.z - spot.z) > 1.3) return
    if (this.game.memory.tunnelBlocked) {
      add('E', 'The loose tile (solid concrete under it now)', () => this.game.toast('They poured concrete under every cell floor. This way is closed for good.', 'bad'))
      return
    }
    const t = this.game.tunnel
    if (t.metres >= TUNNEL_LENGTH) add('E', 'Crawl out through the tunnel', () => this.game.finish(true, 'tunnel'))
    else if (this.game.digging) add('E', `Digging: ${t.metres.toFixed(1)} of ${TUNNEL_LENGTH} metres (step away to stop)`, () => this.stopDigging('You slide the tile back over the hole.'))
    else {
      const tool = this.game.digTool
      add('E', tool ? `Dig under the loose tile (${tool.name}): ${t.metres.toFixed(1)} of ${TUNNEL_LENGTH} metres` : 'A loose floor tile: you need something to dig with', () => this.startDigging())
    }
  }

  startDigging(): void {
    const p = this.game.player
    const tool = this.game.digTool
    if (!tool) {
      this.game.toast('Under the loose tile is soft old clay. A spoon would do it, slowly. A screwdriver, less slowly.', 'neutral')
      return
    }
    const mate = this.game.cellmate
    if (mate && mate.ko <= 0 && mate.trust < TUNNEL_TRUST) {
      mate.say(pick2(this.game.rng, ["Not in my cell you don't. Not for free.", 'You dig a hole, I go down with you. Make it worth my while.']), 3)
      this.game.toast(`${mate.name} will grass on a tunnel unless they trust you. Greggs vouchers help.`, 'bad')
      return
    }
    if (p.inventory.full) {
      this.game.toast('Your pockets are full. Rubble has to go somewhere: get rid of it in the yard first.', 'bad')
      return
    }
    this.game.digging = { x: p.body.x, z: p.body.z, noise: 1, heard: 0, warned: 0 }
    this.game.toast(this.game.tunnel.metres === 0 ? 'You prise up the loose tile by your bunk and start on the clay underneath.' : `You lift the tile. ${this.game.tunnel.metres.toFixed(1)} metres so far.`, 'neutral')
  }

  stopDigging(why: string): void {
    this.game.digging = null
    if (why) this.game.toast(why, 'neutral')
  }

  updateTunnel(delta: number): void {
    const p = this.game.player
    const spot = this.game.tunnelSpot
    const d = this.game.digging
    this.game.dynamic.setTunnelHole(spot.x, spot.z, !!d && this.game.tunnel.metres > 0.05)
    if (!d) return
    if (!this.game.clock.locked || p.zone !== p.cell || p.inVent || Math.hypot(p.body.x - d.x, p.body.z - d.z) > 0.7) {
      this.stopDigging('You slide the tile back over the hole.')
      return
    }
    const tool = this.game.digTool
    if (!tool) return this.stopDigging('Nothing left to dig with.')
    p.body.pose = 'search'
    const before = Math.floor(this.game.tunnel.metres)
    this.game.tunnel.metres = Math.min(TUNNEL_LENGTH, this.game.tunnel.metres + delta * tool.rate)
    const after = Math.floor(this.game.tunnel.metres)
    if (after > before) {
      p.inventory.add('rubble')
      const milestone = TUNNEL_MILESTONES[after]
      if (milestone) this.game.toast(milestone, 'good')
      if (this.game.tunnel.metres >= TUNNEL_LENGTH) return this.stopDigging('')
      if (p.inventory.full) return this.stopDigging('Your pockets are bulging with rubble. Shake it out in the yard tomorrow.')
    }
    // Scraping carries. An officer near your door for long enough hears it.
    d.noise -= delta
    if (d.noise <= 0) {
      d.noise = 3
      this.game.emit({ x: p.body.x, z: p.body.z, radius: 4, kind: 'clank' })
    }
    // Night officers pass about ten metres off; one who stops long enough to
    // listen hears it. You get footsteps first, once each time one comes.
    const near = this.game.guards.filter((g) => g.ko <= 0 && Math.hypot(g.x - p.body.x, g.z - p.body.z) < 11.5)
    const close = this.game.guards.some((g) => g.ko <= 0 && Math.hypot(g.x - p.body.x, g.z - p.body.z) < 16)
    if (close && d.warned <= 0) {
      d.warned = 1
      this.game.toast(this.game.mateLookout ? `${this.game.cellmate!.name} coughs. Footsteps on the landing: step away from the hole until they pass.` : 'Footsteps on the landing. Step away from the hole until they pass.', 'bad')
    } else if (!close) d.warned = 0
    if (near.length) d.heard += delta
    else d.heard = Math.max(0, d.heard - delta * 0.5)
    // A cellmate on side covers the scraping with a coughing fit.
    if (d.heard > (this.game.mateLookout ? 6 : 4)) {
      const g = near[0]
      g.say(pick2(this.game.rng, ['What is that scraping? ...Right. Lights on. Stand AWAY from that floor.', "Are you DIGGING? In MY landing? With a SPOON?"]), 3)
      this.game.methodHint = 'tunnel'
      p.attempt = 'tunnel'
      this.game.digging = null
      this.game.caught(g)
    }
  }

  /** A search finds the hole under the loose tile. */
  tunnelFound(): void {
    if (this.game.tunnel.metres <= 0) return
    this.game.tunnel.metres = 0
    this.game.memory.used.tunnel++
    this.game.toast('They found the hole under the loose tile, and filled it with concrete. Back to the start.', 'bad')
  }

  scatterRubble(): void {
    const inv = this.game.player.inventory
    const n = inv.count('rubble')
    for (let i = 0; i < n; i++) inv.remove('rubble')
    this.game.dodgyTimer = 2
    const seen = this.game.guards.find((g) => g.ko <= 0 && g.canSeePlayer() && g.distanceTo(this.game.player.body.x, this.game.player.body.z) < 7)
    if (seen) {
      seen.suspicion = Math.max(seen.suspicion, 0.6)
      seen.wary = Math.min(1, seen.wary + 0.15)
      this.game.toast(`You shake ${n} lot${n === 1 ? '' : 's'} of rubble out of your trouser legs. ${seen.name} is looking at the little piles round your feet.`, 'bad')
    } else this.game.toast(`You shake ${n} lot${n === 1 ? '' : 's'} of rubble out of your trouser legs and scuff it into the tarmac.`, 'good')
  }
}
