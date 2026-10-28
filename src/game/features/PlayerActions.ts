import type { Game } from '../Game'
import { Guard } from '../../npc/Guard'
import { GANGS, gangOfWing } from '../../npc/Gangs'
import { type Door, EAST_WALL, type Grate, TILE, tileCentre } from '../../world/Grid'
import { ITEMS, type ItemId, vouchers } from '../Items'
import { screenCall } from '../Phone'
import { pick2 } from './shared'

/**
 * The things you do: keys, vents, fights, sick calls, the lure, riots, sleep,
 * work, the flag and torch, climbing the wall and the phone.
 */
export class PlayerActions {
  constructor(private readonly game: Game) {}

  chewSoap(): void {
    const p = this.game.player
    if (!p.inventory.has('soap')) {
      this.game.toast('You need a bar of soap to chew.', 'neutral')
      return
    }
    p.inventory.remove('soap')
    p.frothing = 150
    this.game.toast('You chew the soap. Foul. You are foaming at the mouth: very convincing.', 'good')
  }

  enterVent(g: Grate): void {
    const p = this.game.player
    const c = tileCentre(g.tx, g.ty)
    p.inVent = true
    p.body.x = c.x
    p.body.z = c.z
    this.game.methodHint = this.game.methodHint ?? 'vent'
    this.game.toast('In the ducts. Running is loud; sneaking (C) is quiet. Officers below can hear you.', 'neutral')
  }

  leaveVent(g: Grate): void {
    const p = this.game.player
    const c = tileCentre(g.tx, g.ty)
    // Someone standing right under it?
    const under = this.game.guards.find((gg) => gg.ko <= 0 && Math.hypot(gg.x - c.x, gg.z - c.z) < 2)
    p.inVent = false
    g.open = true
    p.body.x = c.x
    p.body.z = c.z + 0.4
    p.body.y = 0
    if (under) {
      under.say('Well, well. Look what crawled out.', 2.5)
      this.game.caught(under)
    }
  }

  takeKeys(g: Guard, knockedOut: boolean): void {
    const p = this.game.player
    if (p.inventory.full) {
      this.game.toast('No room in your pockets.', 'bad')
      return
    }
    const chance = knockedOut ? 1 : this.game.memory.pickpocketChance * (1 - g.wary * 0.6) * (g.busy ? 1.6 : 1)
    if (this.game.rng() < chance) {
      g.hasKeys = false
      this.game.stolenFrom = g
      p.inventory.add('guardKey')
      this.game.dodgyTimer = 2
      this.game.toast(`You have ${g.name}'s keys. They will notice at the next shift change. Press a mould into soap to keep a copy.`, 'good')
    } else {
      g.say('Oi! Get your hands off!', 2.5)
      g.suspicion = 1
      g.chasing = true
      g.lastSeen = { x: p.body.x, z: p.body.z, t: 0 }
      g.wary = Math.min(1, g.wary + 0.3)
      this.game.methodHint = 'key'
      p.attempt = p.attempt ?? 'key'
    }
  }

  useKey(door: Door, key: { id: ItemId; durability: number }): void {
    const inv = this.game.player.inventory
    const p = this.game.player
    if (door.kind === 'perimeter' && door.tx === EAST_WALL && key.id !== 'lockpick' && p.disguise === 'guard' && !p.disguiseBlown) {
      this.game.finish(true, 'staffDoor')
      return
    }
    if (door.kind === 'perimeter' && key.id === 'lockpick') {
      this.game.toast('The gatehouse lock is too heavy to pick.', 'bad')
      return
    }
    if (key.id === 'lockpick' && this.game.rng() < 0.4) {
      this.game.toast('The pick slips. Try again.', 'bad')
      this.game.emit({ x: (door.tx + 0.5) * TILE, z: (door.ty + 0.5) * TILE, radius: 4, kind: 'clank' })
      if (inv.wear(key)) this.game.toast('The lockpick snaps.', 'bad')
      return
    }
    this.game.keyHold = { door, t: 4 }
    this.game.sounds.push({ sound: 'buzz', volume: 0.8 })
    if (door.cell === this.game.player.cell && this.game.clock.locked) this.game.methodHint = 'key'
    else if (!this.game.methodHint) this.game.methodHint = door.kind === 'gate' || door.kind === 'perimeter' ? 'key' : this.game.methodHint
    this.game.emit({ x: (door.tx + 0.5) * TILE, z: (door.ty + 0.5) * TILE, radius: 3, kind: 'clank' })
    if (key.id === 'masterKey') {
      if (inv.wear(key)) this.game.toast("The master key snaps in the lock after this turn. Old brass: the Governor never needed it this much.", 'bad')
      else if (key.durability === 1) this.game.toast('The master key is bending. One more turn, and that will be it.', 'bad')
      else this.game.toast(`The master key turns. It is soft old brass: ${key.durability} turns left in it.`, 'neutral')
    } else if (key.id !== 'guardKey' && inv.wear(key)) this.game.toast(`The ${ITEMS[key.id].name.toLowerCase()} snaps in the lock after this turn.`, 'bad')
  }

  askGate(door: Door): void {
    const ok = this.game.doors.request(door, 'player', this.game.player.block, false, this.game.player.zone)
    if (ok) this.game.keyHold = { door, t: 2.5 }
    else {
      const g = this.game.guards.filter((gg) => gg.ko <= 0).sort((a, b) => a.distanceTo(this.game.player.body.x, this.game.player.body.z) - b.distanceTo(this.game.player.body.x, this.game.player.body.z))[0]
      g?.say(`Not now, ${this.game.player.name}. You're not on the movement list.`, 2.5)
      this.game.toast('Only officers can open gates. They only open them for wherever the regime sends you.', 'neutral')
    }
  }

  attack(): void {
    if (this.game.punchTimer > 0) return
    const p = this.game.player
    const b = p.body
    if (p.inVent) return
    this.game.punchTimer = 0.55
    const weapon = p.inventory.weapon
    const fx = Math.sin(b.yaw)
    const fz = Math.cos(b.yaw)
    const inFront = (x: number, z: number) => {
      const dx = x - b.x
      const dz = z - b.z
      const d = Math.hypot(dx, dz)
      return d < 1.7 && (dx * fx + dz * fz) / Math.max(0.01, d) > 0.2
    }
    this.game.fightingFor = 2.5
    b.pose = 'fight'
    b.poseTime = 0
    this.game.emit({ x: b.x, z: b.z, radius: 12, kind: 'fight' })
    for (const g of this.game.guards) {
      if (g.ko > 0 || !inFront(g.x, g.z)) continue
      const sneak = !g.canSeePlayer() || g.busy
      g.hp -= weapon.damage * (sneak ? 2 : 1)
      if (g.hp <= 0) {
        g.ko = 30
        g.hp = 10
        g.wary = 1
        this.game.achieve('knockout')
        g.chasing = false
        this.game.toast(`${g.name} goes down${weapon.id ? ` (${ITEMS[weapon.id].name})` : ''}. Grab the keys (R) before anyone sees.`, 'good')
      } else {
        g.say('Assaulting an officer?!', 2)
        g.suspicion = 1
        g.chasing = true
        g.lastSeen = { x: b.x, z: b.z, t: 0 }
      }
      this.game.methodHint = this.game.methodHint ?? (this.game.riot.active ? 'riot' : 'gate')
      p.attempt = p.attempt ?? this.game.methodHint
      return
    }
    for (const pr of this.game.prisoners) {
      if (pr.ko > 0 || !inFront(pr.x, pr.z)) continue
      const down = pr.hit(weapon.damage, 'player')
      if (down) this.game.toast(`${pr.name} is out cold.`, 'neutral')
      this.game.lastFightByPlayer = 20
      return
    }
  }

  callSick(): void {
    const p = this.game.player
    if (!this.game.clock.locked && p.zone === p.cell) {
      this.shoutForOfficer()
      return
    }
    if (!this.game.clock.locked || p.zone !== p.cell) {
      this.game.toast('Fake sickness works at night, behind your door: press H to bang for the night officer.', 'neutral')
      return
    }
    if (this.game.sickCall) return
    if (this.game.memory.sickIgnored && p.frothing <= 0) {
      this.game.toast('You bang and groan. Nobody comes. They have heard it too many times.', 'bad')
      return
    }
    const block = p.block
    const responders = this.game.guards
      .filter((g) => g.ko <= 0 && (g.block === block || g.duty === 'central'))
      .sort((a, b) => (a.duty === 'landing' ? -1 : 0) - (b.duty === 'landing' ? -1 : 0))
      .slice(0, this.game.memory.sickResponders)
    if (!responders.length) return
    this.game.sickCall = { cell: p.cell, responders, stage: 'called', timer: 0 }
    this.game.methodHint = 'sick'
    this.game.toast(p.frothing > 0 ? 'You bang on the door, frothing. The night officer comes running.' : 'You bang on the door and clutch your stomach. Someone is coming.', 'neutral')
  }

  /**
   * By day, in your own cell: shout an officer in to look at a rat. He has a
   * good look round with his back half turned, which is your moment.
   */
  shoutForOfficer(): void {
    const p = this.game.player
    if (this.game.lure || this.game.sickCall || p.zone !== p.cell || this.game.clock.locked) return
    if (this.game.memory.lureIgnored) {
      this.game.toast('You shout yourself hoarse about a rat. Nobody comes. They have heard about you.', 'bad')
      return
    }
    const g = this.game.guards
      .filter((gg) => gg.ko <= 0 && !gg.chasing && !gg.busy && !gg.uniformTaken && !this.game.sickCall?.responders.includes(gg))
      .sort((a, b) => (a.block === p.block ? 0 : 1) - (b.block === p.block ? 0 : 1) || a.distanceTo(p.body.x, p.body.z) - b.distanceTo(p.body.x, p.body.z))[0]
    if (!g) {
      this.game.toast('You shout for an officer. Nobody is free.', 'neutral')
      return
    }
    this.game.lure = { cell: p.cell, guard: g, stage: 'called', timer: 0 }
    this.game.emit({ x: p.body.x, z: p.body.z, radius: 6, kind: 'shout' })
    this.game.toast(`You shout through the door: "Guv! There's a rat in here the size of a dog!" ${g.name} is on the way.`, 'neutral')
  }

  /** The officer in your cell eats what you gave him, or wakes up from it. */
  updateLure(delta: number): void {
    const p = this.game.player
    if (this.game.lure && (this.game.lure.guard.ko > 0 || this.game.lure.guard.chasing)) {
      this.game.lure.guard.busy = false
      this.game.lure = null
    }
    const d = this.game.drugged
    if (d) {
      d.eatsIn -= delta
      if (d.eatsIn <= 0) {
        const g = d.guard
        this.game.drugged = null
        g.say('*yawns* I\'ll just... rest my eyes... for a...', 2.5)
        this.game.achieve('sausage')
        g.ko = 150
        g.hp = 10
        g.chasing = false
        g.busy = false
        if (this.game.lure?.guard === g) this.game.lure = null
        this.game.sleeper = g
        this.game.methodHint = 'lure'
        this.game.toast(`${g.name} slides down the wall, snoring. Out for hours. Take the uniform (E) and the keys (R).`, 'good')
      }
    }
    // Waking up in a vest and boxers: everyone hears about the stranger in uniform.
    const s = this.game.sleeper
    if (s && s.ko <= 0) {
      this.game.sleeper = null
      s.wary = 1
      if (s.uniformTaken) {
        s.say('Who\'s had my trousers?! And my KEYS?!', 3)
        if (p.disguise === 'guard' && !p.disguiseBlown && this.game.disguisedAs === s.name) {
          p.disguiseBlown = true
          this.game.toast(`${s.name} has woken up in your cell in a vest and pink boxers. Every officer now knows there is a stranger in a uniform.`, 'bad')
        }
      }
    }
  }

  /** "Fancy a sausage roll, guv?" */
  offerRoll(g: Guard): void {
    const inv = this.game.player.inventory
    this.game.ui.closePanels()
    if (this.game.memory.foodRefused) {
      g.say("I'm not eating anything you've touched, Bandit. I've read the memo.", 3)
      return
    }
    if (inv.has('sleepyRoll')) {
      inv.remove('sleepyRoll')
      g.say(pick2(this.game.rng, ["Ooh, go on then. Don't tell the Governor.", 'Is that a Greggs? For me? You shouldn\'t have. Mmf.', 'Well, it would be rude not to.']), 2.5)
      this.game.drugged = { guard: g, eatsIn: 4 }
      if (this.game.lure) this.game.lure.timer = Math.max(this.game.lure.timer, 8)
      return
    }
    inv.remove('sausageRoll')
    g.say('Lovely. Right, I have rounds to do.', 2.5)
    if (this.game.lure?.guard === g) this.game.lure.timer = 0.5
  }

  kickOff(): void {
    const p = this.game.player
    const supporters = this.game.prisoners.filter((pr) => pr.block === p.block && pr.supporter)
    const need = this.game.memory.riotSupportNeeded
    if (this.game.riot.active) return
    const firm = gangOfWing(p.block)
    if (!this.game.backingFirms(p.block).length) {
      const leader = this.game.gangLeader(firm)
      this.game.toast(`Nobody on this landing moves without ${GANGS[firm].name} saying so. Pay ${leader?.name ?? 'their boss'} first (${vouchers(this.game.memory.bribePrice(firm))}).`, 'bad')
      return
    }
    if (this.game.clock.locked) {
      if (p.zone !== p.cell) return
      if (supporters.length < need) {
        this.game.toast(`You shout through the hatch. ${supporters.length} answer. You need ${need}: pay another firm, or win over more of the landing with Greggs vouchers.`, 'bad')
        return
      }
      const landing = this.game.grid.rooms.get(`block${p.block}`)!.rects[0]
      this.game.riot = {
        active: true,
        night: true,
        block: p.block,
        x: ((landing.x0 + landing.x1) / 2 + 0.5) * TILE,
        z: (landing.y0 + 1.5) * TILE,
        timer: 55,
        byPlayer: true,
      }
      this.game.riotOpenTimer = 30
      this.game.methodHint = 'riot'
      this.game.toast('The landing goes up: doors banging, a mattress on fire. The officers are coming in to pull out ringleaders...', 'good')
      this.game.achieve('riot')
      return
    }
    // By day: your backers start swinging at whoever is nearest.
    const near = supporters.filter((pr) => pr.distanceTo(p.body.x, p.body.z) < 14 && pr.ko <= 0)
    if (near.length < Math.ceil(need / 2)) {
      this.game.toast(`Nobody near enough backs you (${near.length}/${Math.ceil(need / 2)}).`, 'bad')
      return
    }
    for (const s of near) {
      const target = this.game.prisoners.find((o) => !o.supporter && o.ko <= 0 && o.distanceTo(s.x, s.z) < 10)
      if (target) {
        s.fighting = true
        s.fightTarget = target
        target.fighting = true
        target.fightTarget = s
      }
    }
    this.game.lastFightByPlayer = 20
    this.game.toast('"Kick off!" Your lot pile in.', 'good')
    this.game.achieve('riot')
  }

  trySleep(): void {
    const p = this.game.player
    if (!this.game.clock.locked || p.zone !== p.cell) {
      this.game.toast('You can only sleep in your cell after lights out.', 'neutral')
      return
    }
    this.game.sleeping = true
    this.game.seated = null
    const cell = this.game.grid.cells.get(p.cell)!
    p.body.x = cell.bunks[0].x
    p.body.z = cell.bunks[0].z + 1.1
    p.body.pose = 'sleep'
    p.body.y = 1.72
    p.body.yaw = 0
    this.game.toast('You sleep. (Move to wake.)', 'neutral')
  }

  work(): void {
    if (this.game.workTimer > this.game.clock.minutes) {
      this.game.toast('You have done a shift already. Come back later.', 'neutral')
      return
    }
    this.game.workTimer = this.game.clock.minutes + 90
    if (this.game.player.inventory.add('voucher')) this.game.toast('Folded sheets for an hour and a half. Paid in a Greggs voucher.', 'good')
    this.game.clock.minutes += 30
  }

  raiseFlag(): void {
    this.game.player.inventory.remove('flag')
    this.game.flagUp = true
    this.game.signalTonight = true
    this.game.dodgyTimer = 6
    this.game.toast('The flag goes up. Out on the road, someone will have seen it. They will come tonight.', 'good')
    const seen = this.game.guards.find((g) => g.canSeePlayer())
    if (seen) {
      seen.say("Who put that up there?", 2.5)
      seen.suspicion = Math.max(seen.suspicion, 0.6)
      seen.searchTarget = true
    }
  }

  flashTorch(): void {
    this.game.signalTonight = true
    this.game.carArrivesAt = this.game.clock.minutes + 40
    this.game.toast('Three long flashes from the window. Far off, headlights blink twice. They are coming.', 'good')
  }

  startClimb(tx: number): void {
    this.game.climb = { t: 3.5, tx }
    this.game.methodHint = 'wall'
    this.game.player.body.pose = 'wave'
    this.game.player.body.yaw = 0
    this.game.emit({ x: this.game.player.body.x, z: this.game.player.body.z, radius: 8, kind: 'clank' })
    this.game.toast('The hook catches. You climb...', 'neutral')
  }

  updateClimb(delta: number): void {
    const c = this.game.climb!
    c.t -= delta
    this.game.player.body.y = Math.min(4.6, (3.5 - c.t) * 1.4)
    this.game.updateIllegal()
    if (c.t <= 0) {
      this.game.climb = null
      this.game.player.inventory.remove('grapple')
      this.game.placePlayer((c.tx + 0.5) * TILE, 60.7 * TILE)
      this.game.player.zone = 'outside'
      this.game.toast('Over the wall! Now get to the road.', 'good')
    }
  }

  usePhone(): void {
    this.game.player.body.pose = 'phone'
    this.game.ui.phone((message) => {
      const result = screenCall(message, this.game.memory.phoneStrictness)
      if (result.ok) {
        this.game.contactNights = 3
        this.game.toast('Contact made. A car will wait on the road outside the wall the next three nights.', 'good')
      } else if (result.flagged) {
        this.game.memory.phoneFlags++
        this.game.toast(`The duty officer was listening: "${result.flagged}" got the call cut. They will listen harder now.`, 'bad')
        const g = this.game.guards.filter((gg) => gg.ko <= 0).sort((a, b) => a.distanceTo(this.game.player.body.x, this.game.player.body.z) - b.distanceTo(this.game.player.body.x, this.game.player.body.z))[0]
        if (g) g.searchTarget = true
      }
      return result.reply
    })
  }
}
