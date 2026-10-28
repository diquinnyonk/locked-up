import type { Game } from '../Game'
import { HEX } from '../../art/palette'
import { Guard, NEW_FACE_DAYS } from '../../npc/Guard'
import { isVisitingDay } from '../Events'
import { type ItemId } from '../Items'
import { pick2 } from './shared'

/**
 * Disguises and the silly ways out: the officer's uniform, the visitor's frock,
 * the laundry basket and the visitors who leave at half three.
 */
export class SillyExits {
  constructor(private readonly game: Game) {}

  toggleDisguise(kind: 'guard' | 'visitor'): void {
    const p = this.game.player
    if (p.disguise === kind) {
      p.disguise = null
      p.disguiseBlown = false
      this.applyLook()
      this.game.toast('You change back into your prison greys.', 'neutral')
      return
    }
    p.disguise = kind
    p.disguiseBlown = false
    for (const g of this.game.guards) g.recognise = 0
    this.applyLook()
    this.game.dodgyTimer = 3
    this.game.toast(
      kind === 'guard'
        ? "You are now an officer. Walk like you are on overtime: doors open for you. Don't let anyone get a long look at your face."
        : 'You are now a visitor. Stunning. Get to the visiting hall and leave with the others when visiting ends at 15:30.',
      'good',
    )
  }

  /** Puts the player's body in whatever they are wearing. */
  applyLook(): void {
    const p = this.game.player
    const b = p.body
    const own = this.game.ownLook
    b.top = own.top
    b.trousers = own.trousers
    b.hair = own.hair
    b.cap = false
    b.uniform = false
    b.skirt = null
    b.longHair = false
    if (p.disguise === 'guard') {
      b.top = HEX.guardShirt
      b.trousers = HEX.guardTrousers
      b.cap = true
      b.uniform = true
    } else if (p.disguise === 'visitor') {
      b.top = HEX.dress
      b.skirt = HEX.dress
      b.hair = HEX.hairBlonde
      b.longHair = true
    }
    this.game.crowd?.paint(0, b)
  }

  /** Clothes confiscated or lost: the disguise goes with them. */
  updateDisguise(delta: number): void {
    const p = this.game.player
    if (p.disguise) {
      const item = p.disguise === 'guard' ? 'guardUniform' : 'visitorDisguise'
      if (!p.inventory.has(item)) {
        p.disguise = null
        p.disguiseBlown = false
        this.applyLook()
      }
    }
    // The lads have opinions about your outfit.
    this.game.commentTimer -= delta
    if (p.disguise && this.game.commentTimer <= 0) {
      this.game.commentTimer = 4
      const near = this.game.prisoners.find((pr) => pr.ko <= 0 && pr.distanceTo(p.body.x, p.body.z) < 4)
      if (near && this.game.rng() < 0.5) {
        near.say(
          p.disguise === 'guard'
            ? pick2(this.game.rng, ['Evening, officer... hang on.', "Since when do they let screws wear trainers?", 'Is that you? It is, isn\'t it. Say nothing. Say NOTHING.'])
            : pick2(this.game.rng, ['Nice frock.', 'Alright, darling? ...Oh no.', 'Is that the panto wig? Bold.', "You've got lovely ankles, I'll give you that."]),
          2.5,
        )
      }
    }
  }

  takeUniform(g: Guard): void {
    if (this.game.player.inventory.full) {
      this.game.toast('No room in your pockets for a whole uniform.', 'bad')
      return
    }
    this.game.player.inventory.add('guardUniform')
    this.game.disguisedAs = g.name
    this.game.achieve('dressed')
    this.dressGuard(g, false)
    this.game.dodgyTimer = 4
    this.game.toast(`You strip ${g.name} to his vest and a pair of pink boxers. Dignity: confiscated. Wear the uniform from your pockets (Tab).`, 'good')
  }

  /** Strip an officer to vest and boxers, or dress him again at unlock. */
  dressGuard(g: Guard, dressed: boolean): void {
    g.uniformTaken = !dressed
    g.wary = dressed ? g.wary : 1
    const b = g.body
    b.top = dressed ? HEX.guardShirt : 0xf6f6f6
    b.trousers = dressed ? HEX.guardTrousers : HEX.boa
    b.cap = dressed
    b.uniform = dressed
    this.game.crowd.paint(this.game.bodies.indexOf(b), b)
    if (dressed) g.say('Right. New uniform. Nobody mention the boxers.', 3)
  }

  sillyPrompts(add: (key: string, label: string, run: () => void) => void): void {
    const p = this.game.player
    const b = p.body
    const f = this.game.fixtures
    const m = this.game.clock.minuteOfDay
    const near = (pt: { x: number; z: number }, r: number) => Math.hypot(b.x - pt.x, b.z - pt.z) < r
    for (const g of this.game.guards) {
      if (g.ko > 0 && !g.uniformTaken && !p.inventory.has('guardUniform') && near(g.body, 1.8)) {
        add('E', `Nick ${g.name}'s uniform`, () => this.takeUniform(g))
        break
      }
    }
    if (p.zone === 'changing' && near(f.staffExit, 3.5)) {
      const keys = p.inventory.withUse('openDoor')
      if (p.disguise === 'guard' && !p.disguiseBlown && keys && keys.id !== 'lockpick') {
        // In uniform with keys: let yourself out, any time, like you own the place.
        add('E', 'Let yourself out of the staff door', () => this.game.finish(true, 'staffDoor'))
      } else if (p.disguise === 'guard' && !p.disguiseBlown) {
        const shift = m >= 20 * 60 + 45 && m < 21 * 60 + 20
        add('E', shift ? 'Clock off with the day shift' : 'Staff door (locked: keys, or wait for shift change, 20:45 to 21:20)', () => {
          if (shift) this.sillyExit('guardDisguise')
        })
      } else if (!keys || keys.id === 'lockpick') add('E', 'Staff door: officers only', () => this.game.toast('Only staff leave this way. You would need to look like one, and have keys or wait for shift change.', 'neutral'))
      // With a key and no uniform, the door's own unlock prompt takes it from here.
    }
    // The Governor's office: the desk diary and the safe.
    if (p.zone === 'governor') {
      const h = this.game.heist
      if (!h.knowA && near(f.govDesk, 1.6)) add('E', "Read the Governor's desk diary", () => this.game.safeHeist.readDiary())
      if (near(f.safe, 1.6)) {
        if (h.opened) add('E', "The Governor's safe (open, and empty)", () => this.game.toast('Nothing left but a smell of cigars and a Greggs receipt.', 'neutral'))
        else if (this.game.cracking) add('E', `Cracking the safe by ear: ${Math.ceil(this.game.cracking.t)}s, keep still`, () => {})
        else if (h.knowA && h.knowB) add('E', `Open the safe (${this.game.safeHeist.safeCode})`, () => this.game.safeHeist.openSafe())
        else if (p.inventory.has('stethoscope')) add('E', 'Crack the safe by ear (stethoscope)', () => this.game.safeHeist.startCracking())
        else add('E', "The Governor's safe", () => this.game.toast(this.game.safeHeist.safeHint(), 'neutral'))
      }
    }
    if (p.zone === 'chapel' && near(f.costumeBox, 1.8)) {
      if (this.game.chaplain.stage === 'done' && !(p.inventory.has('wig') && p.inventory.has('dress')) && !p.inventory.has('visitorDisguise')) {
        add('E', 'Rummage in the panto box (the Reverend lent you the key)', () => {
          const inv = p.inventory
          for (const id of ['wig', 'dress'] as ItemId[]) if (!inv.has(id) && !inv.add(id)) this.game.dynamic.spawnItem(id, b.x + 0.5, b.z, p.zone)
          this.game.toast('A panto wig, a floral frock and a smell of 2009. Put them together in your pockets (Tab) for a visitor disguise.', 'good')
        })
      } else if (this.game.chaplain.stage !== 'done') add('E', 'The panto box (padlocked)', () => this.game.toast('The panto box is padlocked, and the Reverend wears the key on a string round his neck. Do him a favour and he might lend it.', 'neutral'))
    }
    if (p.zone === 'visits' && this.game.events.nanHere) add('E', 'Sit with your nan', () => this.game.events.sitWithNan())
    if (p.zone === 'visits' && near(f.visitorsGate, 4)) {
      if (p.disguise === 'visitor' && !p.disguiseBlown) {
        const visitDay = isVisitingDay(this.game.clock.weekday)
        const out = visitDay && m >= 15 * 60 + 25 && m < 15 * 60 + 45
        add('E', out ? 'Shuffle out with the visitors' : visitDay ? "Visitors' gate (visitors leave at 15:30)" : "Visitors' gate (no visits today: Tuesdays, Thursdays and weekends)", () => {
          if (out) this.sillyExit('visitorDisguise')
        })
      }
    }
    if (p.zone === 'laundry' && near(f.laundryBasket, 2)) {
      const before = this.game.clock.period === 'work' && m < 11 * 60
      add('E', before ? 'Climb into the laundry basket (the van leaves at 11:00)' : 'Laundry basket (the van takes them at 11:00 during work)', () => {
        if (!before) return
        p.inBasket = true
        this.game.methodHint = 'laundry'
        const paid = this.game.keith.bribedDay === this.game.clock.day
        this.game.toast(
          paid
            ? `You burrow under a pile of damp towels. Somebody's sock is in your ear. ${this.game.keith.name} has been paid. Now wait for the van.`
            : `You burrow under the towels... but every basket goes through ${this.game.keith.name}'s X-ray on the way out, and nobody has bought him off. Climb out (E) unless you fancy your chances.`,
          paid ? 'neutral' : 'bad',
        )
      })
    }
    if (near(this.game.keith.body, 1.9) && this.game.keith.body.visible) add('E', `Talk to ${this.game.keith.name} (X-ray, hi-vis, mug)`, () => this.game.characters.talkToKeith())
    const gov = this.game.governor
    if (near(gov.body, 2.0) && gov.body.visible && p.illegal === 0) add('E', 'Talk to the Governor', () => this.game.characters.talkToGovernor())
    const rev = this.game.chaplain
    if (near(rev.body, 2.0) && rev.body.visible) {
      const hint = rev.stage === 'none' ? ' (has a job)' : rev.stage === 'hunting' && this.game.player.inventory.count('hymnBook') >= 3 ? ' (hand in the hymn books)' : ''
      add('E', `Talk to ${rev.name}${hint}`, () => this.game.characters.talkToChaplain())
    }
    const vend = { x: (21 + 0.5) * 2, z: (49.2 + 0.5) * 2 + 0.6 }
    if (p.zone === 'visits' && near(vend, 1.6) && !this.game.clock.locked) {
      add('R', 'Vending machine: blue drink (1 Greggs voucher)', () => {
        if (!p.inventory.has('voucher')) return this.game.toast('No Greggs vouchers. The machine stares at you.', 'bad')
        if (p.inventory.full) return this.game.toast('No room in your pockets.', 'bad')
        p.inventory.remove('voucher')
        p.inventory.add('blueDrink')
        this.game.toast('Clunk. One blue drink. The label just says BLUE.', 'good')
      })
    }
  }

  leaveBasket(): void {
    const p = this.game.player
    const where = p.hidingIn
    p.inBasket = false
    p.hidingIn = null
    p.body.visible = true
    p.body.z += 0.8
    this.game.methodHint = null
    this.game.toast(where ? `You climb out of the ${where}.` : 'You climb out, covered in fluff.', 'neutral')
  }

  /** The visitors and the laundry van run to their own little timetables. */
  updateVisitors(delta: number): void {
    const m = this.game.clock.minuteOfDay
    const visiting = this.game.visitingTime
    const leaving = m >= 15 * 60 + 30
    const gate = this.game.grid.doors.find((d) => d.kind === 'perimeter' && d.zones[0] === 'visits')
    if (visiting && leaving && gate) this.game.doors.hold(gate)
    for (const v of this.game.visitors) {
      const b = v.body
      if (!visiting) {
        b.visible = false
        v.gone = false
        b.x = v.seat.x
        b.z = v.seat.z
        continue
      }
      if (v.gone) continue
      b.visible = true
      if (!leaving) {
        b.x = v.seat.x
        b.z = v.seat.z
        b.yaw = 0
        b.pose = 'sit'
        b.speed = 0
        continue
      }
      const target = { x: this.game.fixtures.visitorsGate.x, z: this.game.fixtures.visitorsGate.z + 2 }
      const dx = target.x - b.x
      const dz = target.z - b.z
      const d = Math.hypot(dx, dz)
      if (d < 0.5) {
        v.gone = true
        b.visible = false
        continue
      }
      b.pose = 'walk'
      b.speed = 1.6
      b.x += (dx / d) * 1.6 * delta
      b.z += (dz / d) * 1.6 * delta
      b.yaw = Math.atan2(dx, dz)
    }
    // The van leaves at eleven with whatever is in the baskets.
    const p = this.game.player
    if (p.inBasket && !p.hidingIn && m >= 10 * 60 + 55 && !this.game.vanWarned) {
      this.game.vanWarned = true
      this.game.toast('You hear the van reversing into the bay. Beep. Beep. Beep. Hold your breath...', 'neutral')
    }
    if (p.inBasket && !p.hidingIn && m >= 11 * 60 && this.game.clock.period === 'work') {
      this.game.vanWarned = false
      this.sillyExit('laundry')
    }
    if (p.inBasket && !p.hidingIn && this.game.clock.period !== 'work') {
      p.inBasket = false
      p.body.visible = true
    }
  }

  /**
   * One roll of the dice at the silly exits. Better odds the first time;
   * the prison remembers each one that got rumbled.
   */
  sillyExit(method: 'guardDisguise' | 'visitorDisguise' | 'laundry'): void {
    const p = this.game.player
    this.game.methodHint = method
    p.attempt = method
    // The laundry only ever works if the X-ray man is looking at his phone.
    const xrayFooled = method !== 'laundry' || this.game.keith.bribedDay === this.game.clock.day
    // A brand new face fools nobody for long: worse odds in your first days.
    const fresh = method !== 'laundry' && this.game.clock.day <= NEW_FACE_DAYS ? 0.5 : 1
    if (xrayFooled && this.game.rng() < this.game.memory.sillyExitChance(method) * fresh) {
      this.game.sounds.push({ sound: 'good', volume: 1 })
      this.game.finish(true, method)
      return
    }
    p.inBasket = false
    p.body.visible = true
    if (method === 'laundry') {
      const bay = this.game.fixtures.van
      p.body.x = bay.x - 1.5
      p.body.z = bay.z
      p.zone = 'bay'
    }
    if (method === 'laundry') {
      this.game.characters.keithSays(
        xrayFooled
          ? "I KNOW I said I'd look away but the governor was standing RIGHT behind me."
          : pick2(this.game.rng, ["That basket's got a skeleton in it. A WALKING skeleton.", "Twenty-two years. Phones in pies, a ferret in a duvet, and now YOU."]),
      )
      if (xrayFooled) {
        this.game.keith.name = this.game.memory.used.laundry === 0 ? 'Brenda' : 'Clive'
        this.game.keith.bribedDay = -1
      }
    }
    const officer = this.game.guards.filter((g) => g.ko <= 0).sort((a, b) => a.distanceTo(p.body.x, p.body.z) - b.distanceTo(p.body.x, p.body.z))[0]
    officer.say(
      method === 'guardDisguise'
        ? pick2(this.game.rng, [`Hang about. ${officer.colleague()} is six foot four with a moustache. You are neither.`, "Warrant card? ...That's a Tesco Clubcard."])
        : method === 'visitorDisguise'
          ? pick2(this.game.rng, ['Madam, you have a prison number on your neck. And a beard.', "Lovely to see you, Mrs... Mrs... that's a pillowcase, not a handbag."])
          : pick2(this.game.rng, ['This pillowcase is breathing.', "Since when do towels wear trainers?"]),
      3.5,
    )
    this.game.caught(officer)
  }
}
