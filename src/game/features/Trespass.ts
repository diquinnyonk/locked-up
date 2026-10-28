import type { Game } from '../Game'
import { Prisoner } from '../../npc/Prisoner'
import { GANGS } from '../../npc/Gangs'
import { pick2 } from './shared'

/**
 * Walking into another prisoner's cell, and what they think of it.
 */
export class Trespass {
  constructor(private readonly game: Game) {}

  /**
   * Standing in somebody else's cell while they are in it. They tell you to
   * leave; stay, and what happens next depends on the man.
   */
  updateTrespass(delta: number): void {
    const p = this.game.player
    const where = p.zone
    const inside = where.startsWith('cell') && where !== p.cell && !p.inVent && !this.game.over && !this.game.talkingTo
    for (const pr of this.game.prisoners) {
      const home = pr.cell.zone
      const watching = inside && home === where && pr.zone === home && pr.ko <= 0 && pr.cuffed <= 0 && pr.body.pose !== 'sleep' && !pr.fighting
      if (!watching) {
        if (pr.trespass > 0 && home !== where && pr.ko <= 0 && pr.zone === home && pr.trespass < 50) pr.say('And stay out.', 2)
        pr.trespass = 0
        continue
      }
      if (pr.trespass === 0) {
        pr.face(p.body.x, p.body.z)
        pr.say(
          pr.temperament === 'hothead'
            ? `Oi. ${p.name}. Out of my cell. NOW.`
            : pr.temperament === 'old'
              ? 'Can I help you, young man? This is my cell.'
              : pr.temperament === 'snitch'
                ? "You're not meant to be in here. I'm just saying."
                : pick2(this.game.rng, [`What you doing in my cell, ${p.name}?`, 'Oi. Out. This is my peter.', 'You lost? This is my cell. Get out.']),
          3,
        )
      }
      pr.trespass += delta
      const patience = pr.temperament === 'hothead' ? 2.5 : pr.temperament === 'gang' ? 4 : 5.5
      if (pr.trespass < patience || pr.trespass >= 50) continue
      pr.trespass = 50
      pr.grudge = Math.min(1, pr.grudge + 0.2)
      pr.trust = Math.max(0, pr.trust - 0.15)
      switch (pr.temperament) {
        case 'old':
          pr.say('Some of us have to live here, you know. I shall be writing to my MP.', 3)
          this.game.toast(`${pr.name} is very disappointed in you.`, 'neutral')
          break
        case 'snitch':
          pr.say("Right. I'm telling.", 2.5)
          pr.report = true
          this.game.toast(`${pr.name} has gone to tell an officer you were in his cell.`, 'bad')
          break
        case 'hothead':
          this.trespassFight(pr, true, "You're getting cut.")
          break
        case 'gang':
          this.trespassFight(pr, pr.leader || pr.grudge > 0.4, `Nobody walks into a ${pr.gang ? GANGS[pr.gang].name : 'firm'} cell.`)
          break
        default:
          this.trespassFight(pr, false, 'Right. You asked for it.')
      }
    }
  }

  trespassFight(pr: Prisoner, shiv: boolean, line: string): void {
    pr.say(line, 2.5)
    pr.armed = shiv
    pr.body.shiv = shiv
    pr.fighting = true
    pr.fightTarget = 'player'
    pr.hunt = 20
    this.game.toast(shiv ? `${pr.name} has pulled a shiv. Get out of his cell!` : `${pr.name} is coming at you. Get out of his cell!`, 'bad')
  }
}
