import type { Game } from '../Game'
import { type Letter } from '../Post'

/**
 * The post, and the notes left on your bunk.
 */
export class Mail {
  constructor(private readonly game: Game) {}

  deliverPost(): void {
    const arrived = this.game.post.deliver(this.game.clock.day, this.game.player.name)
    if (arrived.length) {
      this.game.toast(`Post: ${arrived.length === 1 ? `a letter from ${arrived[0].from}` : `${arrived.length} letters`}. Read it in your notebook (J, then Post).`, 'good')
      this.game.sounds.push({ sound: 'good', volume: 0.5 })
    }
  }

  /** Opens a letter: anything the censor missed goes in your pockets. */
  readLetter(letter: Letter): void {
    if (letter.read) return
    letter.read = true
    if (letter.gift) {
      for (let i = 0; i < letter.gift.count; i++) {
        if (!this.game.player.inventory.add(letter.gift.item)) this.game.dynamic.spawnItem(letter.gift.item, this.game.player.body.x, this.game.player.body.z + 0.6, this.game.player.zone)
      }
      this.game.toast(letter.gift.line, 'good')
    }
  }

  /**
   * Someone slips a note onto your bunk while you are out: once a day, after
   * unlock, never while you are in. When you come back it is waiting.
   */
  updateBunkNote(wasInCell: boolean): void {
    const p = this.game.player
    const cell = this.game.grid.cells.get(p.cell)!
    if (p.zone !== p.cell && !this.game.clock.locked && this.game.clock.minuteOfDay > 9 * 60) this.game.post.leaveNote(this.game.clock.day)
    if (!wasInCell && p.zone === p.cell && this.game.post.waiting && !this.game.noteAnnounced) {
      this.game.noteAnnounced = true
      this.game.toast('Somebody has been in. There is a note on your bunk.', 'neutral')
    }
    if (!this.game.post.waiting) this.game.noteAnnounced = false
    this.game.dynamic.setBunkNote(cell.bunks[0].x + 0.1, cell.bunks[0].z + 0.4, !!this.game.post.waiting)
  }

  readBunkNote(): void {
    const note = this.game.post.pickUp()
    if (note) this.game.ui.showNote(note)
  }
}
