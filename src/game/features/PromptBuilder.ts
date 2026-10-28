import type { Game, Prompt } from '../Game'
import { type LooseItem } from '../../world/Dynamic'
import { tileCentre, worldToTile } from '../../world/Grid'
import { ITEMS, type ItemId } from '../Items'

/**
 * Everything you can do where you stand, with its key, rebuilt every frame.
 */
export class PromptBuilder {
  constructor(private readonly game: Game) {}

  buildPrompts(): void {
    const p = this.game.player
    const b = p.body
    const inv = p.inventory
    const out: Prompt[] = []
    const near = (x: number, z: number, r: number) => Math.hypot(b.x - x, b.z - z) < r
    const add = (key: string, label: string, run: () => void) => {
      if (!out.some((o) => o.key === key)) out.push({ key, label, run })
    }

    if (p.inVent) {
      for (const g of this.game.grid.grates) {
        const c = tileCentre(g.tx, g.ty)
        if (!near(c.x, c.z, 1.2)) continue
        if (g.sealed) add('E', `Grille (${g.id}) is welded shut`, () => this.game.toast('Welded shut from the other side.', 'bad'))
        else add('E', `Drop out: ${g.id}`, () => this.game.actions.leaveVent(g))
      }
      this.game.prompts = out
      return
    }

    // The silly exits come first: they are the whole point of standing there.
    this.game.sillyExits.sillyPrompts(add)

    // Loose items.
    let nearest: LooseItem | null = null
    let nd = 1.5
    for (const it of this.game.dynamic.items) {
      const d = Math.hypot(it.x - b.x, it.z - b.z)
      if (d < nd) {
        nd = d
        nearest = it
      }
    }
    // Picking things up yields the key to anything more important nearby
    // (a door, a person, an exit), so it is added last, below.
    const item = nearest
    const pickup = item
      ? () =>
          add('E', `Pick up ${ITEMS[item.id].name}`, () => {
            if (inv.add(item.id)) {
              this.game.dynamic.removeItem(item)
              this.game.toast(`${ITEMS[item.id].name}: ${ITEMS[item.id].blurb}`, 'neutral')
              if (ITEMS[item.id].contraband) this.game.dodgyTimer = 3
            } else this.game.toast('Your pockets are full. Craft something or drop something (Tab).', 'bad')
          })
      : null

    // Vent grilles.
    for (const g of this.game.grid.grates) {
      const c = tileCentre(g.tx, g.ty)
      if (!near(c.x, c.z, 1.4)) continue
      if (g.sealed) {
        add('E', 'The vent is welded shut', () => this.game.toast('Welded shut. They know about this one now.', 'bad'))
      } else if (g.open) {
        add('E', `Climb into the vent`, () => this.game.actions.enterVent(g))
      } else {
        const tool = inv.withUse('openVent') ?? (inv.has('spoon') && g.id === 'your cell' ? { id: 'spoon' as ItemId, durability: 1 } : undefined)
        if (tool) add('E', `Unscrew the vent grille (${ITEMS[tool.id].name})`, () => {
          g.open = true
          this.game.dodgyTimer = 4
          this.game.emit({ x: c.x, z: c.z, radius: 4, kind: 'clank' })
          this.game.toast(g.id === 'your cell' ? 'The screws are rusted half through. The grille comes away.' : 'Grille off.', 'good')
        })
        else add('E', 'Vent grille: you need something to undo the screws', () => this.game.toast('A screwdriver or a flattened spoon would do it. (The one in your cell is so rusted an ordinary spoon will turn it.)', 'neutral'))
      }
    }

    // People.
    const front = (x: number, z: number) => near(x, z, 1.7)
    for (const g of this.game.guards) {
      if (!front(g.x, g.z)) continue
      if (g.ko > 0 && g.hasKeys) {
        add('R', `Take ${g.name}'s keys`, () => this.game.actions.takeKeys(g, true))
      } else if (g.canBePickpocketed()) {
        add('R', `Lift ${g.name}'s keys`, () => this.game.actions.takeKeys(g, false))
      }
      if (g.ko <= 0) add('E', `Talk to ${g.name}${this.game.missions.hasOffer(g) ? ' (wants a word)' : ''}`, () => this.game.talk.talkToGuard(g))
      break
    }
    for (const pr of this.game.prisoners) {
      if (pr.ko > 0 || !front(pr.x, pr.z)) continue
      add('E', `Talk to ${pr.name}${this.game.missions.hasOffer(pr) ? ' (has a job)' : ''}`, () => this.game.talk.talkTo(pr))
      break
    }

    // Doors.
    const t = worldToTile(b.x, b.z)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const door = this.game.grid.doorAtTile(t.tx + dx, t.ty + dy)
        if (!door) continue
        const dc = tileCentre(door.tx, door.ty)
        if (!near(dc.x, dc.z, 2.3)) continue
        const myDoor = door.cell === p.cell
        if (myDoor && !this.game.clock.locked && door.openness > 0.5 && !door.jammed && inv.has('toothpaste')) {
          add('R', 'Pack toothpaste into the lock', () => {
            inv.remove('toothpaste')
            door.jammed = true
            this.game.dodgyTimer = 3
            this.game.toast('You pack the strike plate with toothpaste. It will set hard by lights out.', 'good')
          })
        }
        if (door.openness < 0.5) {
          if (myDoor && this.game.clock.locked && door.jammed) {
            add('E', 'Ease the door open (toothpaste)', () => {
              this.game.pushingDoor = 6
              this.game.methodHint = 'toothpaste'
              this.game.emit({ x: dc.x, z: dc.z, radius: 3, kind: 'clank' })
            })
          } else if (!this.game.doors.isOpenByRegime(door)) {
            const key = inv.withUse('openDoor')
            if (key) {
              // Key in hand at a locked door: that beats a chat with whoever
              // is standing next to it.
              const chat = out.findIndex((o) => o.key === 'E' && o.label.startsWith('Talk to'))
              if (chat >= 0) out.splice(chat, 1)
              add('E', `Unlock with ${ITEMS[key.id].name}`, () => this.game.actions.useKey(door, key))
            } else if (door.kind === 'gate' && !this.game.clock.locked) {
              add('E', 'Ask to be let through', () => this.game.actions.askGate(door))
            }
          }
        }
      }
    }

    // Fixtures.
    const f = this.game.fixtures
    for (const ph of f.phones) if (near(ph.x, ph.z - 0.4, 1.6) && !this.game.clock.locked) add('E', 'Use the phone', () => this.game.actions.usePhone())
    if (near(f.flagpole.x, f.flagpole.z, 2.2) && !this.game.flagUp && inv.has('flag')) add('E', 'Run the signal flag up the pole', () => this.game.actions.raiseFlag())
    if (p.zone === p.cell && this.game.clock.locked && inv.has('torch') && !this.game.signalTonight) add('R', 'Flash the torch out of the window', () => this.game.actions.flashTorch())
    if (p.zone === 'yard' && t.ty >= 57 && inv.has('grapple')) add('E', 'Throw the grapple over the wall', () => this.game.actions.startClimb(t.tx))
    if (p.zone === 'laundry' && this.game.clock.period === 'work') {
      for (const w of f.washers) if (near(w.x, w.z, 1.4)) add('E', 'Work a laundry shift (+1 Greggs voucher)', () => this.game.actions.work())
    }
    if (p.zone === p.cell && this.game.post.waiting) {
      const cell = this.game.grid.cells.get(p.cell)!
      if (near(cell.bunks[0].x, cell.bunks[0].z, 2.2)) {
        // The note beats a chat with your cellmate sat on the bunk.
        const chat = out.findIndex((o) => o.key === 'E' && o.label.startsWith('Talk to'))
        if (chat >= 0) out.splice(chat, 1)
        add('E', 'Read the note on your bunk', () => this.game.mail.readBunkNote())
      }
    }
    if (p.zone === p.cell) {
      const cell = this.game.grid.cells.get(p.cell)!
      if (near(cell.bunks[1].x, cell.bunks[1].z, 1.6)) add('R', `Your stash (${this.game.stash.length}/4)`, () => this.game.talk.openStash())
      this.game.tunnelDig.tunnelPrompts(add)
      if (near(cell.bunks[0].x, cell.bunks[0].z, 1.6) && this.game.clock.locked) add('E', 'Sleep (Z) till morning', () => this.game.actions.trySleep())
      if (!this.game.clock.locked && !this.game.lure && !p.inVent && !this.game.memory.lureIgnored) add('H', 'Shout for an officer: "Guv! There\'s a rat!"', () => this.game.actions.shoutForOfficer())
    }
    if (inv.has('rubble') && p.zone === 'yard' && !this.game.clock.locked) add('R', `Shake the rubble out of your trouser legs (${inv.count('rubble')})`, () => this.game.tunnelDig.scatterRubble())
    if (inv.has('spoon') && p.zone === 'yard') add('R', 'Grind the spoon flat on the concrete', () => this.game.pockets.craftNamed('flatSpoon'))
    this.game.missions.prompts(add)
    pickup?.()

    // On a toilet: do your business, then flush, or don't.
    const loo = this.game.seated?.toilet
    if (loo) {
      const job = this.game.business
      if (!job) add('R', 'Do your business', () => this.game.toilets.doBusiness(loo))
      else if (job.done) add('R', 'Flush', () => this.game.toilets.flush())
      else add('R', 'Concentrating...', () => {})
    }
    // The newer routes, and whatever secret is on this sentence.
    // These are fixed spots and particular people, so they win over a chat
    // with whoever is standing nearby, or something lying on the floor.
    const claim = (key: string, label: string, run: () => void) => {
      const i = out.findIndex((o) => o.key === key && (o.label.startsWith('Talk to') || o.label.startsWith('Pick up')))
      if (i >= 0) out.splice(i, 1)
      add(key, label, run)
    }
    if (!this.game.seated) {
      const gu = this.game.guest
      if (gu.body.visible && this.game.secret?.talkGuest && near(gu.body.x, gu.body.z, 2.0)) claim('E', `Talk to ${gu.name}`, () => {
        this.game.converse(gu.body)
        this.game.secret!.talkGuest!()
      })
      this.game.secret?.prompts(claim, near)
      this.game.basketball.prompts(claim, near)
      this.game.routes.prompts(claim, near)
    }
    // Any bench, chair, pew, sofa or bunk edge. Lowest of all.
    if (this.game.seated) add('E', this.game.business?.done ? 'Stand up (without flushing)' : 'Stand up', () => this.game.standUp())
    else {
      let seat: { x: number; z: number; yaw: number } | null = null
      let sd = 1.2
      for (const st of this.game.grid.seats) {
        const d = Math.hypot(st.x - b.x, st.z - b.z)
        if (d < sd) {
          sd = d
          seat = st
        }
      }
      const taken = seat && this.game.bodies.some((o) => o !== b && o.visible && o.pose === 'sit' && Math.hypot(o.x - seat!.x, o.z - seat!.z) < 0.45)
      if (seat && !taken) {
        // Right at a free seat, sitting beats a chat with whoever is next to it.
        if (sd < 0.8) {
          const chat = out.findIndex((o) => o.key === 'E' && o.label.startsWith('Talk to'))
          if (chat >= 0) out.splice(chat, 1)
        }
        add('E', 'Sit down', () => this.game.sitDown(seat!))
      }
    }

    this.game.prompts = out
  }
}
