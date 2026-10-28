import type { BufferGeometry } from 'three'
import { HEX } from '../../art/palette'
import { ball, box, cyl } from '../../art/shapes'
import type { Game } from '../Game'
import { type Option, SecretBase, type Spot, tile } from './Secret'

/**
 * A royal visit: the Duke of Grimsby opens the new gym. Volunteer for the
 * guard of honour (the Governor or the Reverend will sign you up), and on
 * the day you are let into the gym in the middle of work. The florist's
 * van leaves after the ribbon is cut, taking the giant arrangement with it.
 */
const ROYAL_DAY = 3
const LET_IN = 10 * 60
const DUKE_FROM = 11 * 60
const HIDE_FROM = 11 * 60 + 15
const DUKE_TO = 12 * 60
const FLOWERS = tile(67.6, 45.4)
const DUKE = tile(65.8, 44.4)
const GOVERNOR = tile(64.4, 44.4)

const flowerParts = (): BufferGeometry[] => [
  cyl(0.55, 0.4, 0.8, { x: 0, y: 0, z: 0 }, HEX.stainedGold, 16),
  ball(0.9, { x: 0, y: 1.3, z: 0 }, HEX.yardGrass, 1, 0.9, 1),
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ball(0.22, { x: Math.cos(i) * 0.7, y: 1.4 + (i % 3) * 0.25, z: Math.sin(i) * 0.7 }, [HEX.clothesRed, HEX.paper, HEX.clothesYellow, HEX.stainedBlue][i % 4])),
  box(1.6, 0.03, 0.12, { x: -2.0, y: 1.0, z: 0 }, HEX.clothesRed),
]

export class Royal extends SecretBase {
  readonly id = 'royal'
  volunteered = false

  constructor(game: Game) {
    super(game)
    // The florist's giant arrangement in the gym, on the day.
    game.things.add({
      id: 'royalFlowers',
      model: flowerParts,
      place: () => ({ ...FLOWERS, visible: this.announced && this.dayN === ROYAL_DAY && this.m < DUKE_TO + 30 }),
      prompts: (add, near) => {
        const g = this.game
        if (this.volunteered && this.onTheDay && g.player.zone === 'gym' && near(FLOWERS.x, FLOWERS.z, 1.9) && this.m >= HIDE_FROM && this.m < DUKE_TO) {
          add('E', 'Hide inside the giant floral arrangement', () => {
            if (g.rng() < 0.8) g.escapeBy('royal')
            else g.rumbled('stunt', 'Your Royal Highness, the chrysanthemums appear to have... feet.')
          })
        }
      },
    })
  }

  get status() {
    if (!this.announced || this.over) return null
    if (!this.volunteered) return { title: 'A royal visit', text: `The Duke of Grimsby opens the new gym on ${this.day(ROYAL_DAY)} at 11:00. Volunteer for the guard of honour: ask the Governor or the Reverend.` }
    return { title: 'A royal visit', text: `Guard of honour, ${this.day(ROYAL_DAY)}: you may be in the gym from 10:00. The florist's van takes the giant arrangement away at noon.` }
  }

  protected announce(): void {
    this.game.toast(`A royal visit! The Duke of Grimsby will open the new gym on ${this.day(ROYAL_DAY)} at 11:00. The Governor wants volunteers for a guard of honour. The florist has already been, twice.`, 'good')
  }

  isQuietDay(day: number): boolean {
    return this.announced && day - this.startDay === ROYAL_DAY
  }

  private get onTheDay(): boolean {
    return this.dayN === ROYAL_DAY && !this.game.clock.locked
  }

  protected morning(): void {
    if (this.dayN !== ROYAL_DAY) return
    this.game.toast(this.volunteered ? 'The Duke arrives at 11:00. Guard of honour: the gym, from 10:00. Polish your shoes.' : 'The Duke of Grimsby is here today. You did not volunteer, so you will not be anywhere near him.', 'neutral')
  }

  protected tick(): void {
    if (this.dayN > ROYAL_DAY || (this.dayN === ROYAL_DAY && this.m >= DUKE_TO)) {
      this.fail(this.volunteered ? "The ribbon is cut, the Duke has gone, and the florist's van drives off without you." : 'The Duke has been and gone. He said the gym was "very gym-like".')
    }
  }

  allows(zone: string): boolean {
    return this.volunteered && this.onTheDay && this.m >= LET_IN && this.m < DUKE_TO + 30 && (zone === 'gym' || zone === 'yard' || zone === 'corridorS')
  }

  guestLook() {
    return { name: 'The Duke of Grimsby', look: { top: HEX.steelDark, trousers: HEX.steelDark, hair: HEX.hairGrey, skin: HEX.skinPale, tache: true, height: 1.04, build: 1.0 } }
  }

  guestSpot(): Spot | null {
    return this.onTheDay && this.m >= DUKE_FROM && this.m < DUKE_TO ? { ...DUKE, yaw: -Math.PI / 2, pose: 'wave' } : null
  }

  talkGuest(): void {
    this.talk(this.game.rng() < 0.5 ? 'And what do you do here? ...Ah. Yes. Of course you do. Splendid.' : 'Lovely gym. Very... gym-like. Have you come far?')
  }

  governorSpot() {
    return this.onTheDay && this.m >= DUKE_FROM - 30 && this.m < DUKE_TO
      ? { ...GOVERNOR, yaw: Math.PI / 2, pose: 'stand' as const, lines: ['Your Royal Highness, this way. Mind the medicine ball.', 'Smile, everyone. SMILE.', 'Ribbon! Who has the ribbon? WHO HAS THE RIBBON?'] }
      : null
  }

  private volunteer(who: string): Option {
    return {
      label: 'Volunteer for the guard of honour',
      enabled: !this.volunteered,
      run: () => {
        this.volunteered = true
        this.game.ui.talk(who, `Splendid. Gym, ${this.day(ROYAL_DAY)}, ten sharp. Stand up straight, say "Your Royal Highness" and nothing else. And do not touch the flowers. They cost more than you.`, [])
      },
    }
  }

  talkGovernor(): boolean {
    if (this.volunteered || this.dayN >= ROYAL_DAY || !this.announced) return false
    this.game.ui.talk(`${this.game.governor.name}, Governor`, 'The Duke is coming, and I need a guard of honour that does not look like a police line-up. You will have to do.', [this.volunteer(`${this.game.governor.name}, Governor`)])
    return true
  }

  talkChaplain(): boolean {
    if (this.volunteered || this.dayN >= ROYAL_DAY || !this.announced || this.over) return false
    const name = this.game.chaplain.name
    this.game.ui.talk(name, 'The Governor has asked me to find him a guard of honour for the Duke. Respectable faces. I said I would do my best.', [this.volunteer(name)])
    return true
  }

  /** The flowers are a thing in the world, with their own prompt. */
  prompts(): void {}

  protected extra() {
    return { volunteered: this.volunteered }
  }

  protected restore(s: Record<string, unknown>): void {
    this.volunteered = (s.volunteered as boolean) ?? false
  }
}
