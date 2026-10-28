import type { BufferGeometry } from 'three'
import { HEX } from '../art/palette'
import { fireEngineParts } from '../art/vehicles'
import { box, cyl } from '../art/shapes'
import { TILE } from '../world/Grid'
import type { Game } from './Game'
import type { ItemId } from './Items'

/**
 * Six more ways out, open in every sentence:
 *
 *   bins ........ Thursday is bin day: into a kitchen wheelie bin before the
 *                 lorry comes at 10:30
 *   hospital .... read up on appendicitis, fake sick at night, and convince
 *                 healthcare you need a real hospital
 *   court ....... write to your solicitor for a hearing, and take a handcuff
 *                 key in your shoe
 *   papers ...... a blank form from the library printer, the Governor's
 *                 stamp from his desk, and his signature (from the diary)
 *   fireEngine .. a fire drill brings a fire engine into the yard: hide in a
 *                 locker before it leaves
 *   glider ...... two bedsheets, a mop handle and tape, off the south edge of
 *                 the yard on a windy day
 *
 * Each is one roll of the dice at the end, and each one rumbled makes the
 * next worse (PrisonMemory.routeChance); twice rumbled and it is shut.
 */
const at = (tx: number, ty: number) => ({ x: (tx + 0.5) * TILE, z: (ty + 0.5) * TILE })

/** The kitchen wheelie bins, by the end of the servery. */
export const BINS = at(44.6, 28.2)
/** Where the fire engine parks in the yard during a drill. */
export const FIRE_ENGINE = at(51.5, 49.5)
/** Thursday, Monday being day 0. */
const BIN_DAY = 3
const LORRY = 10 * 60 + 30
const COURT_VAN = 8 * 60 + 30

const binParts = (): BufferGeometry[] =>
  [-0.75, 0, 0.75].flatMap((dx, i) => [
    box(0.62, 1.0, 0.7, { x: dx, y: 0, z: 0 }, i === 1 ? HEX.ink : HEX.bookGreen),
    box(0.66, 0.06, 0.74, { x: dx, y: 1.0, z: -0.02 }, i === 1 ? HEX.ink : HEX.bookGreen),
    cyl(0.1, 0.1, 0.06, { x: dx - 0.24, y: 0.05, z: -0.38 }, HEX.ink, 10),
    cyl(0.1, 0.1, 0.06, { x: dx + 0.24, y: 0.05, z: -0.38 }, HEX.ink, 10),
  ])

const engineParts = fireEngineParts

export class Routes {
  /** Read up on appendicitis in the library. */
  knowsAppendix = false
  /** The day of your court hearing, once you have asked; -1 none. */
  courtDay = -1
  private courtDone = false
  /** Where you are hiding for a route: the bin or the fire engine. */
  hiding: 'bins' | 'fireEngine' | null = null
  private warned = false

  constructor(private readonly game: Game) {
    // The kitchen bins, by the end of the servery, and you can get in one.
    game.things.add({
      id: 'bins',
      model: binParts,
      place: () => ({ ...BINS, visible: true }),
      prompts: (add, near) => {
        const g = this.game
        const p = g.player
        const m = this.m
        if (p.zone === 'hub' && near(BINS.x, BINS.z, 1.9)) {
          const open = this.binDay && g.clock.period === 'work' && m < LORRY - 5
          add('E', g.memory.routeClosed('bins') ? 'Kitchen bins (padlocked now)' : open ? 'Climb into a wheelie bin (the lorry comes at 10:30)' : 'Kitchen wheelie bins (emptied Thursdays at 10:30)', () => {
            if (g.memory.routeClosed('bins')) return g.toast('Padlocked, and labelled NOT YOU.', 'bad')
            if (!open) return g.toast('Bin day is Thursday. The lorry comes at 10:30, during work.', 'neutral')
            this.hiding = 'bins'
            g.hide('wheelie bin')
            g.toast(g.memory.used.bins ? 'You squeeze in under the chip papers. The kitchen tips the bins out by hand now, so pray they are busy.' : 'You squeeze in under a week of chip papers and a whole cold lasagne. Now wait for the lorry.', 'neutral')
          })
        }
      },
    })
    // The fire engine, in the yard for most of a fire drill.
    game.things.add({
      id: 'fireEngine',
      model: engineParts,
      place: () => ({ ...FIRE_ENGINE, ry: -Math.PI / 2, visible: this.engineHere || this.hiding === 'fireEngine' }),
      prompts: (add, near) => {
        const g = this.game
        const p = g.player
        if (this.engineHere && p.zone === 'yard' && near(FIRE_ENGINE.x, FIRE_ENGINE.z, 4)) {
          const t = this.engineLeaves
          add('E', g.memory.routeClosed('fireEngine') ? 'The fire engine (searched at the gate now)' : `Hide in a hose locker on the fire engine (it leaves at ${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')})`, () => {
            if (g.memory.routeClosed('fireEngine')) return g.toast('They search the engine at the gate now. The fire crew are furious about it.', 'bad')
            this.hiding = 'fireEngine'
            g.hide('hose locker')
            g.toast('You fold yourself in between two hoses and a box of biscuits. Smells of smoke and custard creams.', 'neutral')
          })
        }
      },
    })
  }

  private get m(): number {
    return this.game.clock.minuteOfDay
  }

  get binDay(): boolean {
    return this.game.clock.weekday === BIN_DAY
  }

  /** The fire engine is in the yard for most of a fire drill. */
  get engineHere(): boolean {
    const e = this.game.events
    return e.today === 'fireDrill' && e.fired && this.m >= e.at + 4 && this.m < e.at + 30
  }

  get engineLeaves(): number {
    return this.game.events.at + 30
  }

  newDay(): void {
    const g = this.game
    this.warned = false
    if (this.courtDay === g.clock.day && !this.courtDone) g.toast('Court today. The van leaves at 08:30 from the loading bay. Anything in your shoes?', 'neutral')
    if (this.binDay) g.toast('Thursday: bin day. The lorry empties the kitchen wheelie bins at 10:30.', 'neutral')
  }

  /** Every frame. */
  update(): void {
    const g = this.game
    const m = this.m
    if (this.hiding === 'bins') {
      if (m >= LORRY - 5 && !this.warned) {
        this.warned = true
        g.toast('Beep. Beep. Beep. The bin lorry is reversing up to the kitchen door. It smells of yesterday.', 'neutral')
      }
      if (m >= LORRY || !this.binDay) this.leave('bins')
    }
    if (this.hiding === 'fireEngine') {
      if (m >= this.engineLeaves - 3 && !this.warned) {
        this.warned = true
        g.toast('Boots on the yard, doors slamming, and the engine shudders into life.', 'neutral')
      }
      if (!this.engineHere) this.leave('fireEngine')
    }
    if (this.hiding && !g.player.inBasket) this.hiding = null
    if (this.courtDay === g.clock.day && !this.courtDone && m >= COURT_VAN && m < 12 * 60) this.courtVan()
  }

  /** The bin lorry or the fire engine leaves, with or without you. */
  private leave(route: 'bins' | 'fireEngine'): void {
    const g = this.game
    this.hiding = null
    this.warned = false
    if (g.rng() < g.memory.routeChance(route)) return g.escapeBy(route)
    if (route === 'bins') {
      g.player.body.x = BINS.x
      g.player.body.z = BINS.z + 1.2
      g.rumbled('bins', g.memory.used.bins ? 'I SAID tip them out first. And look what was in this one.' : 'Oi! Oi! This bin has got LEGS!')
    } else {
      g.player.body.x = FIRE_ENGINE.x + 2.2
      g.player.body.z = FIRE_ENGINE.z
      g.rumbled('fireEngine', g.memory.used.fireEngine ? 'Hose count is one prisoner over, guv.' : "Watch Manager! There's a lad in my hose locker!")
    }
  }

  /** Court day: two officers walk you to the van. */
  private courtVan(): void {
    const g = this.game
    const p = g.player
    this.courtDone = true
    if (g.over || p.attempt || p.inVent || p.inBasket) return
    const inv = p.inventory
    const hasKey = inv.has('cuffKey')
    if (g.memory.used.court >= 1 && hasKey) {
      // They X-ray shoes now.
      inv.remove('cuffKey')
      g.rumbled('court', 'Shoes off. Both of them. ...Well, well. What is THIS?')
      return
    }
    const behave = () => {
      g.ui.closePanels()
      g.clock.skipTo(17 * 60 + 30)
      g.sendToCell()
      g.toast('A long day in a cold room. The magistrate adjourns your case until next month. Back in time for tea.', 'neutral')
    }
    g.ui.talk(
      'Court day',
      `Cuffed to an officer in the back of the court van, on the A1 to Grimsby Magistrates. The van pulls into a services so the driver can buy a pasty.${hasKey ? ' The handcuff key is still in your shoe.' : ''}`,
      [
        ...(hasKey
          ? [
              {
                label: 'Slip the cuffs (handcuff key) and run for it',
                enabled: true,
                run: () => {
                  g.ui.closePanels()
                  inv.remove('cuffKey')
                  if (g.rng() < g.memory.routeChance('court')) g.escapeBy('court')
                  else g.rumbled('court', 'Nice try. These are the new cuffs. They do not take that key.')
                },
              },
            ]
          : []),
        { label: 'Sit tight and go to court', enabled: true, run: behave },
      ],
    )
  }

  /** The library's shelves, computer and printer, as one menu. */
  private library(): void {
    const g = this.game
    const inv = g.player.inventory
    const give = (id: ItemId) => {
      if (!inv.add(id)) g.dynamic.spawnItem(id, g.player.body.x + 0.5, g.player.body.z, g.player.zone)
    }
    const options = [
      {
        label: this.knowsAppendix ? 'You know appendicitis by heart now' : 'Read up on appendicitis in the medical dictionary',
        enabled: !this.knowsAppendix,
        run: () => {
          this.knowsAppendix = true
          g.ui.talk('Library', 'Pain starting round the belly button and moving down to the RIGHT. A fever. Not wanting your dinner. The right side. Remember: the RIGHT side.', [])
        },
      },
      {
        label: 'Print a blank release form (form HMP-R7)',
        enabled: !inv.has('releaseForm') && !inv.has('releasePapers') && !g.memory.routeClosed('papers'),
        run: () => {
          give('releaseForm')
          g.ui.talk('Library', 'The printer wheezes out form HMP-R7, Discharge of a Prisoner. The librarian is asleep under a Dick Francis. It wants a stamp and a signature.', [])
        },
      },
      {
        label: this.courtDay >= g.clock.day ? `Your hearing is on day ${this.courtDay}` : 'Write to your solicitor asking for a court date',
        enabled: this.courtDay < g.clock.day && !g.memory.routeClosed('court'),
        run: () => {
          this.courtDay = g.clock.day + 2
          this.courtDone = false
          g.ui.talk('Library', `"Dear Mr Grabbit, I demand my day in court." Your solicitor writes back by return: day ${this.courtDay}, 09:00, Grimsby Magistrates. The van leaves at 08:30.`, [])
        },
      },
    ]
    options.push(...(g.secret?.libraryOptions?.() ?? []))
    g.ui.talk('Library', 'Three shelves of Westerns, a computer from 2004, and a printer nobody watches.', options)
  }

  /** Prompts for the routes, wherever you are standing. */
  prompts(add: (key: string, label: string, run: () => void) => void, near: (x: number, z: number, r: number) => boolean): void {
    const g = this.game
    const p = g.player
    const inv = p.inventory
    if (p.zone === 'library' && !g.clock.locked) add('R', 'The library: books, computer and printer', () => this.library())
    // The glider, off the south edge of the yard.
    const ty = Math.floor(p.body.z / TILE)
    if (p.zone === 'yard' && ty >= 56 && inv.has('glider')) {
      const windy = g.weather === 'wind'
      add('E', windy ? 'Launch the bedsheet glider into the gale' : 'Bedsheet glider (needs a proper gale)', () => {
        if (!windy) return g.toast('Not a breath of wind. You would just fall off the wall. Wait for a gale off the moor.', 'neutral')
        if (g.memory.routeClosed('glider')) return g.toast('There is netting along the wall now. You would just bounce.', 'bad')
        inv.remove('glider')
        if (g.rng() < g.memory.routeChance('glider')) g.escapeBy('glider')
        else g.rumbled('glider', pick(g, ['A gust drops you straight into the Governor\'s rhubarb. Up you get.', 'You are in the razor wire, upside down. Do not move. Do NOT move.']))
      })
    }
    // Forged release papers, at the discharge desk by the visitors' gate.
    if (p.zone === 'visits' && near(g.fixtures.visitorsGate.x, g.fixtures.visitorsGate.z, 4) && inv.has('releasePapers') && !g.clock.locked) {
      add('R', 'Hand your release papers in at the discharge desk', () => {
        inv.remove('releasePapers')
        if (g.memory.routeClosed('papers')) return g.rumbled('papers', 'The Governor has a new stamp. In his pocket. Nice try.')
        // The signature has to look like his: you need to have seen it, in the desk diary.
        const signed = g.heist.knowA
        if (g.rng() < g.memory.routeChance('papers') * (signed ? 1 : 0.2)) g.escapeBy('papers')
        else g.rumbled('papers', signed ? 'I will just phone this through to the Governor. ...He says hello.' : 'The Governor signs his name. He does not draw a cat.')
      })
    }
    // The Governor's rubber stamp, in his office.
    if (p.zone === 'governor' && near(g.fixtures.govDesk.x, g.fixtures.govDesk.z, 1.8) && !inv.has('stamp') && !inv.has('releasePapers')) {
      add('R', "Pocket the Governor's rubber stamp", () => {
        if (!inv.add('stamp')) return g.toast('No room in your pockets.', 'bad')
        g.toast('APPROVED: R. PETTIGREW. Now a blank release form, and a signature that looks like his.', 'good')
      })
    }
    // The hospital run, from a sick call.
    const call = g.sickCall
    if (call && call.stage === 'treating' && p.zone === 'infirmary') {
      add('R', 'Clutch your side: "It\'s my appendix!"', () => {
        const nurse = call.responders[0]
        if (!this.knowsAppendix) {
          nurse.say("That's your LEFT side, love. Appendix is on the right. Have a Rennie.", 3.5)
          return
        }
        if (g.memory.routeClosed('hospital')) return g.rumbled('hospital', 'Scanner says no. Scanner says you had a sausage roll.')
        if (g.rng() < g.memory.routeChance('hospital')) g.escapeBy('hospital')
        else g.rumbled('hospital', g.memory.used.hospital ? 'Cuffed to the trolley, sunshine. New rules.' : 'Ambulance? It is wind. It is always wind. Back to your cell.')
      })
    }
  }

  /** The Notebook's checklist for these routes. */
  checklist(tick: (done: boolean, text: string, hint?: string) => string): string {
    const g = this.game
    const inv = g.player.inventory
    const mem = g.memory
    const shut = (k: 'bins' | 'hospital' | 'court' | 'papers' | 'fireEngine' | 'glider') => (mem.routeClosed(k) ? ' Shut now: they know.' : '')
    return [
      tick(this.binDay && g.clock.period === 'work', 'Bin day', `Thursdays, the lorry empties the kitchen wheelie bins by the servery at 10:30. Climb in during work.${shut('bins')}`),
      tick(this.knowsAppendix, 'Hospital run', `Read up on appendicitis in the library, fake sick at night (H), and in healthcare clutch your side (R).${shut('hospital')}`),
      tick(inv.has('cuffKey') && this.courtDay >= g.clock.day, this.courtDay >= g.clock.day ? `Court on day ${this.courtDay}` : 'A day in court', `Write to your solicitor from the library. Take a handcuff key in your shoe: copper wire, hardened in a lighter flame.${shut('court')}`),
      tick(inv.has('releasePapers'), 'Forged release papers', `A blank form from the library printer, the Governor's stamp from his desk (R), and his signature: see it in his desk diary. Hand them in at the discharge desk by the visitors' gate (R).${shut('papers')}`),
      tick(this.engineHere, 'The fire engine', `A fire drill brings it into the yard for half an hour. Hide in a hose locker before it leaves.${shut('fireEngine')}`),
      tick(inv.has('glider') && g.weather === 'wind', 'Bedsheet glider', `Two bedsheets, a mop handle and tape. Launch from the south edge of the yard on a windy day.${shut('glider')}`),
    ].join('')
  }

  toSave() {
    return { knowsAppendix: this.knowsAppendix, courtDay: this.courtDay, courtDone: this.courtDone }
  }

  fromSave(s: Partial<ReturnType<Routes['toSave']>> | undefined): void {
    if (!s) return
    this.knowsAppendix = s.knowsAppendix ?? false
    this.courtDay = s.courtDay ?? -1
    this.courtDone = s.courtDone ?? false
  }
}

function pick<T>(g: Game, list: T[]): T {
  return list[Math.floor(g.rng() * list.length)]
}
