import { HEX } from '../../art/palette'
import type { ItemId } from '../Items'
import { type Add, type Near, SecretBase, type Spot, tile } from './Secret'

/**
 * Gavin Crumble, disgraced TV chef, arrives for the last week of a short
 * sentence and holds court in the library every afternoon. Do him three
 * favours and he lets you in on a plan: on his release day he walks out with
 * the visitors at half three, in his famous coat and sunglasses. Or rather,
 * you do.
 */
const WANTS: { item: ItemId; ask: string; thanks: string }[] = [
  { item: 'biscuits', ask: 'Proper biscuits. Not those grey things. There are digestives in the canteen, I can smell them.', thanks: 'A digestive. A real one. I could cry. I did cry, on Celebrity MasterChef, but that was contractual.' },
  { item: 'blueDrink', ask: 'Hydration, darling. One of those blue drinks from the machine in visits.', thanks: 'Blue! My favourite flavour. Blue.' },
  { item: 'magazine', ask: "Find me a magazine with me on the cover. They're all over the games room. Everyone reads about me.", thanks: "Page four. 'CRUMBLE CRUMBLES.' Not my best angle. Thank you." },
]
const RELEASE = 5
const FROM = 14 * 60 + 30
const TO = 17 * 60
const SWAP_FROM = 15 * 60
const SWAP_TO = 15 * 60 + 30
const LIBRARY = tile(60.8, 50.6)

export class Celebrity extends SecretBase {
  readonly id = 'celebrity'
  favours = 0

  get status() {
    if (!this.announced || this.over) return null
    if (this.favours < WANTS.length) return { title: 'The celebrity inmate', text: `Gavin Crumble holds court in the library, 14:30 to 17:00, until ${this.day(RELEASE)}. Do him favours: ${this.favours} of ${WANTS.length} done.` }
    return { title: 'The celebrity inmate', text: `Gavin walks out with the visitors on ${this.day(RELEASE)}. Be in the visiting hall between 15:00 and 15:30 to swap clothes with him.` }
  }

  protected announce(): void {
    this.game.toast('Intake: disgraced TV chef Gavin Crumble has arrived for the last few days of his sentence, with a photographer at the gate. He is signing autographs in the library every afternoon.', 'good')
  }

  isQuietDay(day: number): boolean {
    return this.announced && day - this.startDay === RELEASE
  }

  protected morning(): void {
    if (this.dayN === RELEASE) this.game.toast(this.favours >= WANTS.length ? "Gavin Crumble's release day. The photographers are at the gate already. Visiting hall, half three." : "Gavin Crumble is released today. He has not made a friend in here, and he leaves alone.", this.favours >= WANTS.length ? 'good' : 'neutral')
  }

  protected tick(): void {
    if (this.dayN > RELEASE || (this.dayN === RELEASE && this.m >= SWAP_TO)) {
      this.fail(this.favours >= WANTS.length ? 'Gavin Crumble waits at the gate as long as he dares, then walks out into the flashbulbs without you.' : 'Gavin Crumble walks out into the flashbulbs. He does not look back.')
    }
  }

  guestLook() {
    return { name: 'Gavin Crumble', look: { top: HEX.ink, trousers: HEX.ink, hair: HEX.hairBlonde, skin: HEX.skinTan, tuft: true, height: 1.05, build: 1.1 } }
  }

  guestSpot(): Spot | null {
    const d = this.dayN
    const g = this.game
    if (g.clock.locked) return null
    if (d === RELEASE && this.favours >= WANTS.length && this.m >= SWAP_FROM - 30 && this.m < SWAP_TO) {
      const gate = g.fixtures.visitorsGate
      return { x: gate.x + 1.5, z: gate.z - 2.5, yaw: Math.PI, pose: 'stand' }
    }
    if (d >= 0 && d < RELEASE && this.m >= FROM && this.m < TO) return { ...LIBRARY, yaw: 0, pose: 'stand' }
    return null
  }

  talkGuest(): void {
    const inv = this.game.player.inventory
    const want = WANTS[this.favours]
    if (!want) {
      return this.talk(
        this.dayN === RELEASE
          ? 'Coat. Sunglasses. Walk like you are famous and slightly annoyed. Go on, before I change my mind.'
          : `Right. ${this.day(RELEASE)}, half three, visiting hall. I walk out with the visitors. Or rather, you do, in my coat. I stay and write my memoir. Doing Time. It needs a twist.`,
      )
    }
    this.talk(want.ask, [
      {
        label: inv.has(want.item) ? 'Hand it over' : 'You have not got one yet',
        enabled: inv.has(want.item),
        run: () => {
          inv.remove(want.item)
          this.favours++
          this.talk(this.favours >= WANTS.length ? `${want.thanks} ...You know what? You have been kind to me. Let me tell you an idea I had.` : want.thanks)
        },
      },
    ])
  }

  prompts(add: Add, near: Near): void {
    const g = this.game
    const spot = this.guestSpot()
    if (this.dayN === RELEASE && this.favours >= WANTS.length && spot && g.player.zone === 'visits' && near(spot.x, spot.z, 2.2) && this.m >= SWAP_FROM && this.m < SWAP_TO) {
      add('R', "Swap coats and sunglasses with Gavin, and walk out", () => g.escapeBy('celebrity'))
    }
  }

  protected extra() {
    return { favours: this.favours }
  }

  protected restore(s: Record<string, unknown>): void {
    this.favours = (s.favours as number) ?? 0
  }
}
