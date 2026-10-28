import type { BufferGeometry } from 'three'
import { HEX } from '../../art/palette'
import { box, cyl } from '../../art/shapes'
import type { ItemId } from '../Items'
import type { Game } from '../Game'
import { SecretBase, type Spot, tile } from './Secret'

/**
 * The Great Grim Bake Off, filming in the canteen. Three rounds on three
 * afternoons, each wanting something different on the judge's table; win
 * them all and on the last afternoon the crew pack up their cameras into
 * flight cases bound for the studio in Leeds. One of them has room.
 */
const ROUNDS: { day: number; title: string; want: ItemId; count: number; ask: string; praise: string }[] = [
  { day: 1, title: 'Signature bake', want: 'sausageRoll', count: 1, ask: 'a sausage roll, deconstructed. Well. A sausage roll.', praise: 'The lamination! The seasoning! Is that... Greggs? Bold. Through to the technical.' },
  { day: 2, title: 'Technical', want: 'blueDrink', count: 1, ask: 'a blue drink drizzle cake. Which needs a blue drink. From the vending machine in visits.', praise: 'It is BLUE. It should not work. It works. Through to the final.' },
  { day: 3, title: 'Showstopper', want: 'voucher', count: 3, ask: 'a three-tier showstopper. You will need three Greggs vouchers for decorations.', praise: 'A three-tier tribute to the Greggs on the high street. I am weeping. I am actually weeping.' },
]
const FINAL = 4
const FROM = 14 * 60 + 30
const TO = 17 * 60
const PACK_FROM = 16 * 60
const JUDGE = tile(40, 27.8)
const CASE = tile(42.6, 27.8)

const caseParts = (): BufferGeometry[] => [
  box(1.0, 0.75, 0.7, { x: 0, y: 0, z: 0 }, HEX.ink),
  box(1.02, 0.06, 0.72, { x: 0, y: 0.38, z: 0 }, HEX.metal),
  box(0.3, 0.06, 0.1, { x: 0, y: 0.77, z: 0 }, HEX.metal),
  box(0.6, 1.4, 0.06, { x: 1.4, y: 0, z: 0 }, HEX.metal),
  cyl(0.18, 0.12, 0.35, { x: 1.4, y: 1.4, z: 0.1 }, HEX.ink, 12),
]

export class BakeOff extends SecretBase {
  readonly id = 'bakeoff'
  won = 0

  constructor(game: Game) {
    super(game)
    // The camera flight cases, by the judge's table, for the whole contest.
    game.things.add({
      id: 'flightCase',
      model: caseParts,
      place: () => ({ ...CASE, visible: this.announced && this.dayN >= 1 && this.dayN <= FINAL }),
      prompts: (add, near) => {
        const g = this.game
        if (this.dayN === FINAL && this.won === ROUNDS.length && g.player.zone === 'hub' && near(CASE.x, CASE.z, 1.8) && this.m >= PACK_FROM && this.m < TO) {
          add('E', 'Climb into a camera flight case', () => g.escapeBy('bakeoff'))
        }
      },
    })
  }

  get status() {
    if (!this.announced || this.over) return null
    const r = ROUNDS[this.won]
    if (r) return { title: 'The Great Grim Bake Off', text: `${r.title}, ${this.day(r.day)}, 14:30 to 17:00 in the canteen: bring Dame Prudence ${r.count > 1 ? `${r.count} Greggs vouchers` : r.want === 'sausageRoll' ? 'a sausage roll' : 'a blue drink'}.` }
    return { title: 'The Great Grim Bake Off', text: `You won! The crew pack up on ${this.day(FINAL)}, 16:00 to 17:00. The camera flight cases go to the studio in Leeds.` }
  }

  private get filming(): boolean {
    const d = this.dayN
    const roundDay = ROUNDS.some((r) => r.day === d)
    return !this.game.clock.locked && ((roundDay && this.m >= FROM && this.m < TO) || (d === FINAL && this.m >= FROM && this.m < TO))
  }

  protected announce(): void {
    this.game.toast(`The Great Grim Bake Off is filming in the canteen! Three rounds, ${this.day(1)} to ${this.day(3)}, 14:30 to 17:00, judged by Dame Prudence Bunn. The winner gets a trophy and their face on the telly.`, 'good')
  }

  isQuietDay(day: number): boolean {
    const d = day - this.startDay
    return this.announced && d >= 1 && d <= FINAL
  }

  protected morning(): void {
    const d = this.dayN
    const missed = ROUNDS.findIndex((r, i) => i >= this.won && r.day < d)
    if (missed >= 0) return this.fail(`You missed the ${ROUNDS[missed].title.toLowerCase()} round. Big Dave won the Bake Off with a prison-wine trifle. You are a footnote.`)
    const r = ROUNDS.find((x) => x.day === d)
    if (r) this.game.toast(`Bake Off today: the ${r.title.toLowerCase()} round in the canteen at 14:30.`, 'neutral')
    if (d === FINAL && this.won === ROUNDS.length) this.game.toast('The Bake Off crew pack up this afternoon. The camera flight cases leave for Leeds at 17:00.', 'good')
  }

  protected tick(): void {
    if (this.dayN > FINAL || (this.dayN === FINAL && this.m >= TO)) {
      if (this.won === ROUNDS.length) this.fail('The crew drive off to Leeds with their flight cases, and without you. The trophy goes on the Governor\'s desk.')
    }
  }

  guestLook() {
    return { name: 'Dame Prudence Bunn', look: { top: HEX.clothesRed, skirt: HEX.clothesRed, hair: HEX.hairGrey, skin: HEX.skinPale, height: 0.95, build: 1.05 } }
  }

  guestSpot(): Spot | null {
    return this.filming ? { ...JUDGE, yaw: 0, pose: 'stand' } : null
  }

  talkGuest(): void {
    const inv = this.game.player.inventory
    const d = this.dayN
    const r = ROUNDS[this.won]
    if (!r) return this.talk('Star baker! We wrap at five. The flight cases go back to Leeds. Do not touch them, they are very expensive.')
    if (r.day !== d) return this.talk(`Lovely to see you, darling. The ${r.title.toLowerCase()} is on ${this.day(r.day)}: ${r.ask}`)
    const have = inv.count(r.want) >= r.count
    this.talk(`The ${r.title.toLowerCase()}: ${r.ask}`, [
      {
        label: have ? `Present your bake` : 'You have nothing to present yet',
        enabled: have,
        run: () => {
          for (let i = 0; i < r.count; i++) inv.remove(r.want)
          this.won++
          this.game.toast(`You win the ${r.title.toLowerCase()} round!`, 'good')
          this.talk(r.praise)
        },
      },
    ])
  }

  /** The flight case is a thing in the world, with its own prompt. */
  prompts(): void {}

  protected extra() {
    return { won: this.won }
  }

  protected restore(s: Record<string, unknown>): void {
    this.won = (s.won as number) ?? 0
  }
}
