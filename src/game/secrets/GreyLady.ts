import { HEX } from '../../art/palette'
import { type Add, type Near, type Option, SecretBase, type Spot, tile } from './Secret'

/**
 * The Grey Lady. Matron Agnes Grey vanished from Grim-on-the-Moor in 1887
 * with the key to the chapel crypt, which joins the Victorian sewer. The
 * prison history in the library says she played the organ every evening;
 * the Reverend knows the organ has a dead pipe; the key is in it. Then the
 * flagstone by the altar, at night, when nobody is about. She walks ahead.
 *
 *   rumour -> read -> organ -> key -> (out, at night)
 */
const ORGAN = tile(11, 42.3)
const ALTAR = tile(11.6, 44)
const GHOST = tile(12.4, 44.6)

export class GreyLady extends SecretBase {
  readonly id = 'greylady'
  private sighted = -1

  constructor(game: ConstructorParameters<typeof SecretBase>[0]) {
    super(game)
    this.stage = 'rumour'
  }

  get status() {
    if (!this.announced || this.over) return null
    const text = {
      rumour: 'Who was the Grey Lady? The library has a history of the prison.',
      read: 'Matron Agnes Grey played the chapel organ every evening, and took the crypt key with her. Ask the Reverend about the organ.',
      organ: 'The organ has a dead pipe, bottom C. Look inside it, in the chapel.',
      key: 'The crypt key is yours. The flagstone by the altar, at night, when nobody is about. Through the vents, perhaps.',
    }[this.stage]
    return text ? { title: 'The Grey Lady', text } : null
  }

  protected announce(): void {
    this.game.toast('Everyone at lunch is talking about the Grey Lady. Three people saw her on the landing last night, walking towards the chapel. Big Dave slept with the light on.', 'neutral')
  }

  protected tick(): void {
    const g = this.game
    // Now and then at night she is seen, and the rumour grows.
    if (g.clock.locked && this.sighted !== g.clock.day && this.m >= 22 * 60 + 30) {
      this.sighted = g.clock.day
      const lines = [
        'Through the hatch, something grey drifts along the landing towards the stairs, and is gone.',
        'A woman humming hymns, very faint, from the direction of the chapel. Nobody else seems to hear it.',
        'The landing goes cold. Somebody two doors down starts praying, quite loudly.',
      ]
      g.toast(lines[g.clock.day % lines.length], 'neutral')
    }
  }

  libraryOptions(): Option[] {
    if (this.stage !== 'rumour') return []
    return [
      {
        label: 'Read "Grim-on-the-Moor: A History, 1861 to 1961"',
        enabled: true,
        run: () => {
          this.stage = 'read'
          this.game.ui.talk('Library', 'Chapter Nine: "Matron Agnes Grey vanished on a winter night in 1887, and with her the only key to the chapel crypt, which joins the old sewer under the moor. She played the chapel organ every evening, and was never heard to play a wrong note." Somebody has underlined "organ" in biro.', [])
        },
      },
    ]
  }

  talkChaplain(): boolean {
    if (this.stage !== 'read') return false
    this.stage = 'organ'
    this.game.ui.talk(this.game.chaplain.name, 'The organ? Lovely old thing. One dead pipe, mind. Bottom C. It has not sounded since before my time. Why do you ask? ...Why are you looking at it like that?', [])
    return true
  }

  guestLook() {
    return { name: 'The Grey Lady', look: { top: HEX.paper, skirt: HEX.paper, hair: HEX.hairGrey, skin: 0xd8dde0, height: 0.98, build: 0.9, longHair: true } }
  }

  /** At night, once you have the key, she waits by the altar. */
  guestSpot(): Spot | null {
    const g = this.game
    if (!g.clock.locked || (this.stage !== 'key' && this.stage !== 'organ')) return null
    return { ...GHOST, yaw: -Math.PI / 2, pose: 'wave' }
  }

  talkGuest(): void {
    this.game.toast('You reach out, and there is nobody there. Just a cold patch, and the smell of lavender.', 'neutral')
  }

  prompts(add: Add, near: Near): void {
    const g = this.game
    const p = g.player
    if (p.zone !== 'chapel') return
    if (this.stage === 'organ' && near(ORGAN.x, ORGAN.z, 1.9)) {
      add('E', 'Reach inside the dead pipe of the organ', () => {
        if (!p.inventory.add('cryptKey')) return g.toast('No room in your pockets for whatever is in there.', 'bad')
        this.stage = 'key'
        g.toast('Cobwebs, a dead moth, and a heavy iron key on a ribbon: CRYPT. A.G. 1887. The flagstone by the altar. At night.', 'good')
      })
    }
    if (this.stage === 'key' && near(ALTAR.x, ALTAR.z, 1.9) && p.inventory.has('cryptKey')) {
      add('E', g.clock.locked ? 'Unlock the crypt flagstone with the old key' : 'The worn flagstone by the altar', () => {
        if (!g.clock.locked) return g.toast('Not with people about. The Grey Lady walks at night: come back after lights out.', 'neutral')
        g.escapeBy('greylady')
      })
    }
  }

  protected extra() {
    return { sighted: this.sighted }
  }

  protected restore(s: Record<string, unknown>): void {
    this.sighted = (s.sighted as number) ?? -1
  }
}
