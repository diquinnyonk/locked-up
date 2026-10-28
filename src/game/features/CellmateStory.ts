import type { Game } from '../Game'
import { Prisoner } from '../../npc/Prisoner'
import { ITEMS } from '../Items'
import { mulberry32 } from './shared'

/**
 * Your cellmate's story: whether they are a grass, paying them off, the gift and
 * the tip-offs, and what became of them at the end.
 */
export class CellmateStory {
  constructor(private readonly game: Game) {}

  /** Some cellmates are grasses: the prison decides when it is built. */
  get cellmateGrass(): boolean {
    return mulberry32(this.game.seed * 13 + 5)() < 0.4
  }

  /** Lights out: a grass with something to tell decides whether to. */
  mateNight(): void {
    const p = this.game.player
    const hiding = this.game.stash.length > 0 || this.game.tunnel.metres > 0 || p.inventory.items.some((i) => ITEMS[i.id].contraband)
    if (this.game.mateTalking && hiding && this.game.rng() < 0.5) this.game.mate.tipOff = true
  }

  /** Unlock: officers come straight to your cell, and a friend slips you a note. */
  mateMorning(): void {
    const m = this.game.cellmate
    if (!m) return
    if (this.game.mate.tipOff) {
      this.game.mate.tipOff = false
      this.game.mate.tipOffs++
      this.game.toast('Two officers come straight to your cell at unlock. Somebody tipped them off.', 'bad')
      if (this.game.stash.length && this.game.rng() < 0.6) {
        this.game.stash.length = 0
        this.game.toast('They go straight to the loose brick. Your stash is gone.', 'bad')
      }
      if (this.game.tunnel.metres > 0 && this.game.rng() < 0.6) this.game.tunnelDig.tunnelFound()
      const g = this.game.guards.filter((gg) => gg.ko <= 0 && gg.block === this.game.player.block).sort((a, b) => a.distanceTo(this.game.player.body.x, this.game.player.body.z) - b.distanceTo(this.game.player.body.x, this.game.player.body.z))[0]
      if (g) g.searchTarget = true
    }
    if (this.cellmateGrass && !this.game.mate.warned && (this.game.clock.day >= 3 || this.game.mate.tipOffs > 0)) {
      this.game.mate.warned = true
      this.game.toast(`A note pushed under your door: "${m.name} is a grass. Watch your stash. A friend."`, 'bad')
    }
  }

  mateOptions(m: Prisoner): { label: string; enabled: boolean; run: () => void }[] {
    const inv = this.game.player.inventory
    const out: { label: string; enabled: boolean; run: () => void }[] = []
    if (this.game.mate.warned && !this.game.mate.paidOff) {
      out.push({
        label: '"Have you been grassing on me?"',
        enabled: true,
        run: () => {
          if (m.trust >= 0.6) {
            this.game.mate.paidOff = true
            this.game.ui.talk(m.name, 'Used to. They squeezed me: extra visits, a telly maybe. Not any more. You have been good to me.', [])
            return
          }
          this.game.ui.talk(m.name, 'Alright, alright. They squeeze me: extra visits, a telly maybe. Make it worth my while and my memory goes very bad.', [
            {
              label: 'Pay for their silence (2 Greggs vouchers)',
              enabled: inv.count('voucher') >= 2,
              run: () => {
                inv.remove('voucher')
                inv.remove('voucher')
                this.game.mate.paidOff = true
                m.trust = Math.max(m.trust, 0.65)
                this.game.ui.talk(m.name, "Saw nothing. Heard nothing. Can't even remember your name. What's your name?", [])
              },
            },
          ])
        },
      })
    }
    if (!this.cellmateGrass && !this.game.mate.gift && m.trust >= 0.7) {
      out.push({
        label: '"You alright?"',
        enabled: true,
        run: () => {
          this.game.mate.gift = true
          if (!inv.add('flatSpoon')) this.game.dynamic.spawnItem('flatSpoon', this.game.player.body.x + 0.5, this.game.player.body.z, this.game.player.zone)
          this.game.ui.talk(m.name, "Found this in the shower drain. For whatever you're doing at night. I never saw a thing. And I'll cough if anyone comes.", [])
        },
      })
    }
    return out
  }

  /** The last word on your cellmate, for the end screen. */
  mateEpilogue(won: boolean): string {
    const m = this.game.cellmate
    if (!m) return ''
    if (this.cellmateGrass && !this.game.mate.paidOff) return `\n${m.name} was moved to an enhanced wing the next day, with a telly. Funny, that.`
    if (m.trust >= 0.7) return won ? `\n${m.name} told the morning count you were on the toilet, and bought you an extra hour.` : `\n${m.name} saved you a biscuit every day.`
    return ''
  }
}
