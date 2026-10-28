import type { Game } from '../Game'
import { Prisoner } from '../../npc/Prisoner'
import { pick2 } from './shared'

/**
 * Toilets, and the mess you can leave in other people's cells.
 */
export class Toilets {
  constructor(private readonly game: Game) {}

  doBusiness(cell: string): void {
    this.game.business = { cell, t: 3.5, done: false, witnessed: false, ownerSaw: false }
    this.game.toast('You settle in. This could take a minute.', 'neutral')
  }

  flush(): void {
    this.game.business = null
    this.game.toast(pick2(this.game.rng, ['You flush. The pipes groan like a dying whale.', 'Flushed. The cistern sounds like a bin lorry reversing.', 'You flush, like a decent human being.']), 'neutral')
  }

  leaveMess(cell: string, witnessed: boolean): void {
    const ownerSaw = this.game.business?.ownerSaw ?? false
    const before = this.game.messes.get(cell)
    this.game.messes.set(cell, { witnessed: witnessed || !!before?.witnessed, ownerSaw: ownerSaw || !!before?.ownerSaw, floor: !!before?.floor })
    const seat = this.game.grid.seats.find((s) => s.toilet === cell)
    if (seat) this.game.dynamic.setToiletMess(cell, seat.x, seat.z, true)
    this.game.toast(cell === this.game.player.cell ? 'You leave it. In your own cell. Your cellmate will be thrilled.' : 'You walk away without flushing. Somebody is going to be very upset.', 'neutral')
  }

  dropOnFloor(cell: string, seat: { x: number; z: number; yaw: number }): void {
    const p = this.game.player
    const owners = this.game.prisoners.filter((pr) => pr.cell.zone === cell)
    const ownerSaw = owners.some((o) => o.zone === cell && o.ko <= 0 && o.body.pose !== 'sleep')
    const witnessed = ownerSaw || this.watchersOf(p.body.x, p.body.z) > 0
    const before = this.game.messes.get(cell)
    this.game.messes.set(cell, { witnessed: witnessed || !!before?.witnessed, ownerSaw: ownerSaw || !!before?.ownerSaw, floor: true })
    // Just in front of the bowl, where you were stood up from.
    const fx = seat.x + Math.sin(seat.yaw) * 0.45
    const fz = seat.z + Math.cos(seat.yaw) * 0.45
    this.game.dynamic.dropFloorMess(`${cell}:floor`, fx, fz, 0.55)
    this.game.sounds.push({ sound: 'clank', volume: 0.3 })
    this.game.toast(pick2(this.game.rng, ['You stand up mid-business. It drops straight onto the floor. Splat.', 'You get up too soon. Gravity does the rest. On the floor. In his cell.', 'Halfway through, you stand. It lands on the lino with a noise you will never forget.']), 'bad')
  }

  /** Who could have seen you go: anyone with eyes on you nearby. */
  watchersOf(x: number, z: number, except?: Prisoner): number {
    let n = 0
    for (const a of [...this.game.prisoners, ...this.game.guards]) {
      if (a === except || a.ko > 0 || a.body.pose === 'sleep') continue
      if (Math.hypot(a.x - x, a.z - z) < 12 && this.game.grid.sightClear(a.x, a.z, x, z)) n++
    }
    return n
  }

  updateToilets(delta: number): void {
    const p = this.game.player
    const job = this.game.business
    if (job && !job.done) {
      job.t -= delta
      if (job.t <= 0) {
        job.done = true
        const owners = this.game.prisoners.filter((pr) => pr.cell.zone === job.cell)
        job.ownerSaw = owners.some((o) => o.zone === job.cell && o.ko <= 0 && o.body.pose !== 'sleep')
        job.witnessed = job.ownerSaw || this.watchersOf(p.body.x, p.body.z) > 0
        this.game.toast(pick2(this.game.rng, ['Job done. Grim.', 'There. Better out than in.', 'Done. You would not want to be the next one in here.']), 'neutral')
      }
    }
    // Shivs go away once the fight and the hunt are over.
    for (const pr of this.game.prisoners) {
      pr.hunt = Math.max(0, pr.hunt - delta)
      if (pr.ko > 0) pr.hunt = 0
      if (pr.armed && !pr.fighting && pr.hunt <= 0) {
        pr.armed = false
        pr.body.shiv = false
      }
    }
    // An owner coming home to it.
    for (const [cell, mess] of this.game.messes) {
      if (this.game.business?.cell === cell && !this.game.business.done) continue
      if (this.game.seated?.toilet === cell) continue
      const owner = this.game.prisoners.find((pr) => pr.cell.zone === cell && pr.zone === cell && pr.ko <= 0 && pr.body.pose !== 'sleep' && !pr.fighting)
      if (!owner) continue
      this.game.messes.delete(cell)
      this.game.dynamic.setToiletMess(cell, 0, 0, false)
      this.game.dynamic.hideFloorMess(`${cell}:floor`)
      this.discoverMess(owner, cell, mess)
    }
  }

  discoverMess(owner: Prisoner, cell: string, mess: { witnessed: boolean; ownerSaw: boolean; floor: boolean }): void {
    const p = this.game.player
    const near = Math.hypot(owner.x - p.body.x, owner.z - p.body.z) < 12
    // On his floor is worse than in his toilet: he looks harder, and for longer.
    const floor = mess.floor
    const chance = cell === p.cell || mess.ownerSaw ? 1 : Math.min(0.97, 0.25 + (floor ? 0.2 : 0) + (mess.witnessed ? 0.45 : 0) + (near ? 0.25 : 0) + this.game.toiletIncidents * 0.1)
    const what = floor ? 'what you left on his floor' : 'what you left in his toilet'
    this.game.toiletIncidents++
    owner.trust = Math.max(0, owner.trust - 0.3)
    if (this.game.rng() < chance) {
      owner.grudge = 1
      if (owner.gang) this.game.memory.annoy(owner.gang, 0.08)
      owner.say(floor ? `ON MY FLOOR?! ...${p.name}. It was YOU.` : `WHO DID THIS?! ...${p.name}. It was YOU.`, 3.5)
      if (owner.temperament === 'old' && !floor) {
        this.game.toast(`${owner.name} found ${what} and knows it was you. He is too old to fight, but he will never forgive you.`, 'bad')
        return
      }
      if (owner.temperament === 'snitch' && !floor) {
        owner.report = true
        this.game.toast(`${owner.name} found ${what}, knows it was you, and is off to tell an officer.`, 'bad')
        return
      }
      // On the floor, even the old boys and the grasses come for you.
      owner.hunt = floor ? 200 : 120
      if (owner.temperament === 'hothead' || owner.temperament === 'gang' || this.game.rng() < (floor ? 0.5 : 0.25)) {
        owner.armed = true
        owner.body.shiv = true
      }
      this.game.toast(`${owner.name} found ${what}. He knows it was you, and he is coming${owner.armed ? ' with a shiv' : ''}.`, 'bad')
      return
    }
    // Wrong man: somebody nearby gets the blame, and the fists.
    const victim = this.game.prisoners
      .filter((o) => o !== owner && o.ko <= 0 && o.cuffed <= 0 && !o.fighting && o.body.visible && o.distanceTo(owner.x, owner.z) < 16)
      .sort((a, b) => a.distanceTo(owner.x, owner.z) - b.distanceTo(owner.x, owner.z))[0]
    if (victim && owner.temperament !== 'old') {
      owner.say(`WHO DID THIS?! ...Was it YOU, ${victim.name}?!`, 3)
      owner.fighting = true
      owner.fightTarget = victim
      victim.fighting = true
      victim.fightTarget = owner
      this.game.toast(`${owner.name} found ${what} and blames ${victim.name}. Fists are flying.`, 'good')
    } else {
      owner.say('WHO DID THIS?! I will find out. I WILL find out.', 3)
      this.game.toast(`${owner.name} found ${what}. He has no idea who did it. Yet.`, 'neutral')
    }
  }
}
