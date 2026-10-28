import type { Game } from '../Game'
import { TILE } from '../../world/Grid'
import { type ItemId } from '../Items'
import { mulberry32 } from './shared'

/**
 * The Governor's safe: the combination, cracking it by ear, what is inside.
 */
export class SafeHeist {
  constructor(private readonly game: Game) {}

  /**
   * Four digits: his mother's birthday (in the desk diary) and the number on
   * his Jag's private plate (Keith sees it every day). A new combination
   * every time someone is caught at it.
   */
  get safeCode(): string {
    const r = mulberry32(this.game.seed * 31 + 7 + this.game.memory.used.safe * 7919)
    const day = 10 + Math.floor(r() * 19)
    const plate = 10 + Math.floor(r() * 90)
    return `${day}${plate}`
  }

  safeHint(): string {
    const h = this.game.heist
    const code = this.safeCode
    if (h.knowA) return `A heavy old safe with a four-digit dial. You know it starts ${code.slice(0, 2)}. The rest? Something the Governor loves more than his mother.`
    if (h.knowB) return `A heavy old safe with a four-digit dial. You know it ends ${code.slice(2)}. The start must be on his desk somewhere.`
    return 'A heavy old safe with a four-digit dial. The Governor would pick numbers he cannot forget. Or a stethoscope from healthcare would let you hear the tumblers.'
  }

  readDiary(): void {
    this.game.heist.knowA = true
    const day = this.safeCode.slice(0, 2)
    this.game.toast(`The desk diary: "Mother's birthday" circled on the ${day}th, underlined three times, with "SAFE?? NO, TOO OBVIOUS" crossed out next to it. That is the first half: ${day}.`, 'good')
  }

  startCracking(): void {
    const b = this.game.player.body
    this.game.cracking = { t: 30, x: b.x, z: b.z, click: 4 }
    this.game.toast('Stethoscope to the door, dial in your fingers. Thirty seconds, and keep still: every click carries.', 'neutral')
  }

  updateHeist(delta: number): void {
    const p = this.game.player
    if (p.zone === 'governor' && !this.game.methodHint) this.game.methodHint = 'safe'
    const c = this.game.cracking
    if (c) {
      if (Math.hypot(p.body.x - c.x, p.body.z - c.z) > 1 || p.zone !== 'governor') {
        this.game.cracking = null
        this.game.toast('You lose the count. Start again.', 'bad')
      } else {
        c.t -= delta
        c.click -= delta
        if (c.click <= 0) {
          c.click = 5
          this.game.emit({ x: p.body.x, z: p.body.z, radius: 7, kind: 'clank' })
        }
        if (c.t <= 0) {
          this.game.cracking = null
          this.openSafe()
        }
      }
    }
    // Once burned, an officer looks into the office every hour.
    const m = this.game.clock.minuteOfDay
    if (this.game.memory.used.safe >= 1 && Math.floor(m / 60) !== Math.floor((m - delta * 2) / 60)) {
      const office = this.game.grid.rooms.get('governor')!.rects[0]
      const spot = { x: ((office.x0 + office.x1) / 2) * TILE, z: (office.y1 - 0.5) * TILE }
      const g = this.game.guards.filter((gg) => gg.ko <= 0 && !gg.chasing && !gg.busy && !gg.investigate).sort((a, b) => a.distanceTo(spot.x, spot.z) - b.distanceTo(spot.x, spot.z))[0]
      if (g) g.investigate = { x: spot.x, z: spot.z, t: 12 }
    }
  }

  openSafe(): void {
    const p = this.game.player
    const inv = p.inventory
    this.game.heist.opened = true
    this.game.achieve('safe')
    this.game.dodgyTimer = 5
    this.game.sounds.push({ sound: 'good', volume: 0.8 })
    const give = (id: ItemId) => {
      if (!inv.add(id)) this.game.dynamic.spawnItem(id, p.body.x + 0.5, p.body.z + 0.3, p.zone)
    }
    give('masterKey')
    give('jagKeys')
    for (let i = 0; i < 6; i++) give('voucher')
    this.game.toast("The door swings open. The Governor's master key (good for five turns), the keys to his Jag, and six Greggs vouchers in an envelope marked PETTY CASH (PASTRY).", 'good')
    // Your file: through the shredder, and the prison forgets one lesson.
    const last = this.game.memory.lessons.pop()
    if (last) {
      this.game.memory.used[last.method] = Math.max(0, this.game.memory.used[last.method] - 1)
      this.game.toast(`And a brown folder with your name on it. You feed it through the Governor's shredder. They have forgotten: ${last.text}`, 'good')
    } else this.game.toast('And a brown folder with your name on it, still thin. You shred it anyway, for the joy of it.', 'neutral')
  }
}
