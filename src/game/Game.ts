import { type Object3D, type Scene } from 'three'
import { HEX } from '../art/palette'
import { Input } from '../core/Input'
import { type Body, Crowd, makeBody } from '../render/Crowd'
import { Guard, type GuardRole, NEW_FACE_DAYS } from '../npc/Guard'
import { ATTEMPTS_PER_ROUND, METHOD_NAMES, type Method, type Mode, PrisonMemory, ROUNDS } from '../npc/Memory'
import { Prisoner } from '../npc/Prisoner'
import { GANGS, GANG_IDS, type GangId, gangOfWing } from '../npc/Gangs'
import type { Lure, Noise, PlayerView, Riot, SickCall, World } from '../npc/World'
import { buildPrison, type Fixtures } from '../world/Build'
import { CONE_FRONT_RAYS, CONE_RAYS, Dynamic, type LooseItem } from '../world/Dynamic'
import { BLOCKS, type BlockId, type Door, EAST_WALL, type Grate, Grid, PLAYER_CELL, TILE, Tile, blockOfZone, tileCentre, worldToTile } from '../world/Grid'
import { findPath, moveCircle } from '../world/Nav'
import { Clock, RESTRICTED, allowedZones } from './Clock'
import { type DayEvent, Events, type Weather, isVisitingDay, weatherSteps } from './Events'
import type { EndingId } from './Records'
import { type GoalId, Goals } from './Goals'
import { Feuds } from './Feuds'
import type { DailyGoal } from './Daily'
import { Doors } from './Doors'
import { ITEMS, Inventory, type ItemId, RECIPES, type Recipe, SPAWNS, vouchers } from './Items'
import { screenCall } from './Phone'
import { Missions } from './Missions'
import { type BunkNote, type Letter, Post } from './Post'
import { LINES } from './Lines'
import { Play } from './Play'
import { makeSecret } from './secrets'
import type { Secret } from './secrets/Secret'
import { endingStory } from './EndingTexts'
import { Routes } from './Routes'
import { type AchievementId, unlock } from './Achievements'

/** What the game needs from the interface. Implemented in ui/Ui.ts. */
export interface UiPort {
  toast(text: string, tone?: 'good' | 'bad' | 'neutral'): void
  /** A badge earned; falls back to a toast. */
  achievement?(title: string, text: string): void
  talk(title: string, line: string, options: { label: string; enabled: boolean; run: () => void }[], voice?: string): void
  phone(onSend: (message: string) => string): void
  card(title: string, body: string, seconds?: number): void
  end(won: boolean, title: string, body: string): void
  showNote(note: BunkNote): void
  closePanels(): void
  readonly panelOpen: boolean
}

export interface Prompt {
  key: string
  label: string
  run: () => void
}

const PLAYER_SPEED = 3.2
const RUN_SPEED = 5.4
const SNEAK_SPEED = 1.6
const CRAWL_SPEED = 2.0

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class Game implements World {
  readonly grid = new Grid()
  readonly clock = new Clock()
  readonly memory = new PrisonMemory()
  /** Set before building a game to rebuild a saved prison exactly. */
  static seedForNext: number | null = null
  /** What the prison was rolled from: the same seed, the same eighty faces. */
  readonly seed = Game.seedForNext ?? (Date.now() & 0xffff)
  readonly rng = mulberry32(this.seed)
  readonly input = new Input()
  readonly post = new Post(this.rng)
  readonly fixtures: Fixtures
  readonly dynamic: Dynamic
  /** Draws everyone. Starts as the light jointed crowd; the browser swaps in
   *  the rigged People once the page is up (see useCrowd). */
  crowd: { group: Object3D; paint(index: number, body: Body): void; update(bodies: Body[], delta: number): void }
  readonly guards: Guard[] = []
  readonly prisoners: Prisoner[] = []
  readonly noises: Noise[] = []
  readonly lockChecks: Door[] = []
  readonly grates: Grate[]
  readonly doors: Doors
  readonly player: PlayerView
  readonly bodies: Body[] = []
  riot: Riot = { active: false, x: 0, z: 0, night: false, block: null, timer: 0, byPlayer: false }
  sickCall: SickCall | null = null
  /** An officer you have shouted into your cell. */
  lure: Lure | null = null
  /** An officer asleep on a sleepy sausage roll, and whose uniform you have on. */
  private drugged: { guard: Guard; eatsIn: number } | null = null
  private sleeper: Guard | null = null
  private disguisedAs: string | null = null
  /** The Governor's safe: what you know of the combination, and whether it is open. */
  readonly heist = { knowA: false, knowB: false, opened: false }
  /** The tunnel under the loose tile by your bunk: metres dug. */
  readonly tunnel = { metres: 0 }
  private digging: { x: number; z: number; noise: number; heard: number; warned: number } | null = null
  /** Seconds left cracking the safe by ear, and where you knelt. */
  private cracking: { t: number; x: number; z: number; click: number } | null = null
  alarm = { active: false, timer: 0, x: 0, z: 0 }

  /** Speech bubbles for the UI to draw this frame. */
  readonly bubbles: { body: Body; text: string; who: string | null }[] = []
  prompts: Prompt[] = []
  cellmate: Prisoner | null = null

  // Player state beyond the shared view.
  private methodHint: Method | null = null
  private punchTimer = 0
  private fightingFor = 0
  private keyHold: { door: Door; t: number } | null = null
  private climb: { t: number; tx: number } | null = null
  private outsideTimer = 0
  private warnings = 0
  private workTimer = 0
  private lastPeriod = ''
  private lastMinute = 0
  private riotOpenTimer = 0
  private riotQuiet = 0
  private punished = false
  private stolenFrom: Guard | null = null
  over = false
  /** How it ended, once it has: for the endings record. */
  ending: { id: EndingId; won: boolean } | null = null
  /** Real seconds played this sentence (kept by the page, saved with the game). */
  playSeconds = 0
  sleeping = false
  /** The outside world. */
  contactNights = 0
  signalTonight = false
  flagUp = false
  private carArrivesAt = -1
  readonly stash: ItemId[] = []
  /** Time since the last thing the player did that a snitch would notice. */
  private dodgyTimer = 0
  readonly log: string[] = []
  readonly missions: Missions
  /** What kind of day it is: a shakedown, a lockdown, a Greggs delivery... */
  readonly events = new Events(this)
  /** First-day goals on the HUD. */
  readonly goals = new Goals()
  /** The firms' feuds with each other. */
  readonly feuds = new Feuds(this)
  /** Bins, hospital, court, papers, fire engine, glider. */
  readonly routes = new Routes(this)
  /** The secret mission on this sentence, if any: about one sentence in ten. */
  secret: Secret | null = null
  /** The Governor's play, when that is the secret. */
  get play(): Play | null {
    return this.secret instanceof Play ? this.secret : null
  }
  set play(p: Play | null) {
    this.secret = p
  }
  /**
   * Whoever the secret brings in: a TV judge, a celebrity, a duke, a ghost.
   * Hidden until there is one. Their look is set when the secret starts.
   */
  readonly guest = { body: makeBody({ visible: false }), name: '', speech: '', speechTimer: 0 }
  private guestDressed = ''
  /** Your cellmate's story: warned they are a grass, paid off, the gift, a tip-off due. */
  readonly mate = { warned: false, paidOff: false, gift: false, tipOff: false, tipOffs: 0 }
  private vouchersSeen = -1
  readonly visitors: { body: Body; seat: { x: number; z: number }; gone: boolean }[] = []
  /** The player's own clothes, for when the disguise comes off. */
  private readonly ownLook = { top: HEX.player, trousers: HEX.prisonGreyDark, hair: HEX.hairBrown as number | null }
  private commentTimer = 0
  /** The laundry X-ray operator, and the day he was last paid off. */
  readonly keith = {
    body: makeBody({ top: HEX.hiVis, trousers: HEX.carDark, hair: HEX.hairGrey, skin: HEX.skinPale, build: 1.25, height: 0.95, tache: true }),
    bribedDay: -1,
    name: 'Keith',
    speech: '',
    speechTimer: 0,
  }

  /**
   * The chaplain. Runs the chapel, the panto and the five-a-side, in that
   * order of seriousness. Has one job for you, and a very useful thank you.
   */
  readonly chaplain = {
    body: makeBody({ top: HEX.ink, trousers: HEX.ink, hair: HEX.hairGrey, skin: HEX.skinPale, clergy: true, build: 1.08, height: 1.02 }),
    name: 'Reverend Clive Bunting',
    short: 'the Reverend',
    /** none: not asked yet. hunting: find the hymn books. done: thanked. */
    stage: 'none' as 'none' | 'hunting' | 'done',
    /** One alibi: the next time you are caught, he swears you were at choir. */
    alibi: false,
    speech: '',
    speechTimer: 0,
  }
  /**
   * The Governor, Rupert Pettigrew. At his desk on weekdays, out polishing
   * his Jag at lunch, walking the inspector round on inspection days, never
   * in at weekends. If he sees you where you should not be, he shouts.
   */
  readonly governor = {
    body: makeBody({ top: HEX.steelDark, trousers: HEX.steelDark, hair: HEX.hairGrey, skin: HEX.skinPale, tache: true, build: 1.15, height: 1.0 }),
    name: 'Rupert Pettigrew',
    speech: '',
    speechTimer: 0,
    /** Where he is: 'office', 'car', 'tour' or 'away'. */
    at: 'away' as 'office' | 'car' | 'tour' | 'away' | 'event',
    tour: [] as { tx: number; ty: number }[],
    shouted: 0,
  }
  /** Where the Reverend's three stolen hymn books turned up. */
  static readonly HYMN_SPOTS: { zone: string; where: string }[] = [
    { zone: 'games', where: 'levelling the pool table in the games room' },
    { zone: 'showers', where: 'being used as a soap dish in the showers' },
    { zone: 'gym', where: 'propping up the bench press in the gym' },
  ]

  constructor(scene: Scene, readonly ui: UiPort, name: string) {
    const built = buildPrison(this.grid)
    this.fixtures = built.fixtures
    scene.add(built.group)
    this.dynamic = new Dynamic(this.grid)
    scene.add(this.dynamic.group)
    this.grates = this.grid.grates
    this.doors = new Doors(this.grid, this.clock, () => this.guards)

    const cell = this.grid.cells.get(PLAYER_CELL)!
    const playerBody = makeBody({ top: HEX.player, trousers: HEX.prisonGreyDark, skin: HEX.skin, hair: HEX.hairBrown })
    playerBody.x = cell.bunks[1].x
    playerBody.z = cell.bunks[1].z + (cell.door.ty < cell.rect.y0 ? -1.2 : 1.2)
    this.bodies.push(playerBody)
    const inventory = new Inventory()
    for (const id of ['toothbrush', 'toothpaste', 'bedsheet', 'voucher', 'voucher'] as ItemId[]) inventory.add(id)
    this.player = {
      name,
      body: playerBody,
      inventory,
      inVent: false,
      sneaking: false,
      running: false,
      health: 100,
      illegal: 0,
      attempt: null,
      dodgy: 0,
      frothing: 0,
      zone: PLAYER_CELL,
      cell: PLAYER_CELL,
      block: 'A',
      escortedBy: null,
      disguise: null,
      disguiseBlown: false,
      inBasket: false,
    }

    this.spawnPeople()
    this.crowd = new Crowd(this.bodies.length)
    this.bodies.forEach((b, i) => this.crowd.paint(i, b))
    scene.add(this.crowd.group)
    this.dynamic.ensureCones(this.guards.length)
    this.restock(true)
    this.missions = new Missions(this)
    this.missions.newDay()
  }

  private spawnPeople(): void {
    // Prisoners: two to every cell, except the player's, which has one other.
    let index = 0
    for (const cell of this.grid.cells.values()) {
      for (let bunk = 0; bunk < 2; bunk++) {
        if (cell.zone === PLAYER_CELL && bunk === 1) continue
        const p = new Prisoner(index++, cell, bunk, this, this.rng)
        if (cell.zone === PLAYER_CELL) {
          p.isCellmate = true
          p.trust = 0.45
          this.cellmate = p
        }
        this.prisoners.push(p)
        this.bodies.push(p.body)
      }
    }
    // The firms: five of the home gang on every wing, the first of them in
    // charge, and one of their rival's soldiers living among them.
    for (const wing of BLOCKS) {
      const home = gangOfWing(wing)
      const pool = this.prisoners.filter((p) => p.block === wing && !p.isCellmate && p.temperament !== 'fixer' && p.temperament !== 'snitch')
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1))
        ;[pool[i], pool[j]] = [pool[j], pool[i]]
      }
      pool.slice(0, 5).forEach((p, i) => p.joinGang(home, i === 0))
      pool[5]?.joinGang(GANGS[home].rival, false)
    }
    // Visitors: mums, nans, girlfriends and one very nervous solicitor. They
    // only appear for visiting time.
    const looks = [
      { top: HEX.dress, skirt: HEX.dress, hair: HEX.hairBlonde, longHair: true },
      { top: HEX.bookBlue, skirt: null, hair: HEX.hairGrey, longHair: false },
      { top: HEX.peas, skirt: HEX.bookGreen, hair: HEX.hairGrey, longHair: true },
      { top: HEX.clothesYellow, skirt: null, hair: HEX.hairBrown, longHair: false },
      { top: HEX.boa, skirt: HEX.boa, hair: HEX.hairRed, longHair: true },
      { top: HEX.guardTrousers, skirt: null, hair: HEX.hairBlack, longHair: false },
    ]
    // Keith, the X-ray contractor. Not an officer, not interested, not paid
    // enough. Hi-vis, a mug, and twenty-two years of seeing everything.
    this.keith.body.x = this.fixtures.xray.x
    this.keith.body.z = this.fixtures.xray.z
    this.bodies.push(this.keith.body)
    this.bodies.push(this.chaplain.body)
    this.bodies.push(this.governor.body)
    this.bodies.push(this.guest.body)

    this.fixtures.visitTables.forEach((t, i) => {
      const look = looks[i % looks.length]
      const body = makeBody({ ...look, trousers: look.skirt ? HEX.skin : HEX.carDark, skin: [HEX.skin, HEX.skinTan, HEX.skinDeep, HEX.skinPale][i % 4], visible: false })
      const seat = { x: t.x, z: t.z - 0.9 }
      body.x = seat.x
      body.z = seat.z
      this.visitors.push({ body, seat, gone: false })
      this.bodies.push(body)
    })

    // Officers: four per wing.
    const central: Record<BlockId, { tx: number; ty: number }> = {
      A: { tx: 39, ty: 15 },
      B: { tx: 46, ty: 23 },
      C: { tx: 40, ty: 32 },
      D: { tx: 39, ty: 37 },
    }
    let gi = 0
    for (const block of BLOCKS) {
      const gate = this.grid.blockGate.get(block)!
      const inward = block === 'A' || block === 'C' ? -1 : 1
      const landing = this.grid.rooms.get(`block${block}`)!.rects[0]
      const duties: [GuardRole, { tx: number; ty: number }][] = [
        ['gate', { tx: gate.tx + inward, ty: gate.ty - 1 }],
        ['landing', { tx: Math.floor((landing.x0 + landing.x1) / 2), ty: landing.y0 + 1 }],
        ['escort', { tx: gate.tx + inward * 3, ty: gate.ty + 1 }],
        ['central', central[block]],
      ]
      for (const [duty, post] of duties) {
        const g = new Guard(gi++, block, duty, post, this)
        this.guards.push(g)
        this.bodies.push(g.body)
      }
    }
  }

  // ------------------------------------------------------------------
  // World interface
  // ------------------------------------------------------------------

  requestDoor(door: Door, who: 'guard' | 'prisoner' | 'player', block?: string, from?: string): boolean {
    return this.doors.request(door, who, block, this.riot.active, from)
  }

  /** Whose voice comes out of this body, for recorded lines. */
  voiceOf(body: Body | null): string | null {
    return [...this.guards, ...this.prisoners].find((a) => a.body === body)?.voiceId ?? null
  }

  say(body: Body, text: string, seconds = 2.6): void {
    const agent = [...this.guards, ...this.prisoners].find((a) => a.body === body)
    agent?.say(text, seconds)
  }

  toast(text: string, tone: 'good' | 'bad' | 'neutral' = 'neutral'): void {
    this.ui.toast(text, tone)
  }

  /** Earned this sentence, so a browser with no storage only says it once. */
  private readonly achieved = new Set<AchievementId>()

  achieve(id: AchievementId): void {
    if (this.achieved.has(id)) return
    this.achieved.add(id)
    const a = unlock(id)
    if (!a) return
    if (this.ui.achievement) this.ui.achievement(a.title, a.text)
    else this.toast(`Achievement: ${a.title}`, 'good')
    this.sounds.push({ sound: 'good', volume: 0.6 })
  }

  emit(noise: Omit<Noise, 'age'>): void {
    this.noises.push({ ...noise, age: 0 })
    const d = Math.hypot(noise.x - this.player.body.x, noise.z - this.player.body.z)
    if (d < 24) this.sounds.push({ sound: noise.kind, volume: Math.max(0.15, 1 - d / 24) })
  }

  /** Sounds for the audio layer to play this frame. */
  readonly sounds: { sound: 'clank' | 'fight' | 'throw' | 'alarm' | 'shout' | 'buzz' | 'caught' | 'good'; volume: number }[] = []

  warn(by: Guard, text: string): void {
    by.say(text, 3)
    this.missions.onTrouble()
    this.warnings++
    if (this.warnings >= 3) {
      this.warnings = 0
      this.toast('Three warnings. You are nicked: a night in segregation.', 'bad')
      this.punish(by, false)
    } else {
      this.toast(`Warning ${this.warnings} of 3 from ${by.name}.`, 'bad')
    }
  }

  patDown(by: Guard): void {
    const taken = this.player.inventory.confiscate()
    if (taken.length) {
      by.say(`What's all this then? ${taken.map((t) => ITEMS[t].name).join(', ')}. Confiscated.`, 3.5)
      this.toast(`Pat-down: lost ${taken.map((t) => ITEMS[t].name).join(', ')}.`, 'bad')
      by.wary = Math.min(1, by.wary + 0.2)
    } else {
      by.say('Clean. Off you go.', 2)
      this.toast('Pat-down: they found nothing.', 'good')
    }
  }

  toothpasteFound(by: Guard, door: Door): void {
    this.memory.used.toothpaste++
    if (door.cell === PLAYER_CELL) {
      this.toast(`${by.name} found the toothpaste in your lock. They will be checking every night now.`, 'bad')
      this.patDown(by)
    }
  }

  hurtPlayer(amount: number, by: Prisoner | Guard): void {
    if (this.over || this.player.health <= 0) return
    this.player.health -= amount
    this.flash = Math.max(this.flash, 0.5)
    if (this.player.health <= 0) {
      this.player.health = 0
      const gang = by instanceof Prisoner ? by.gang : null
      if (gang && this.memory.gangs[gang].hostility > 0.9 && this.memory.round === 2) {
        this.finish(false, 'gang', gang)
        return
      }
      this.toast(gang ? `${GANGS[gang].name} gave you a kicking.` : 'You were knocked out.', 'bad')
      this.knockedOut()
    }
  }

  /** Who you are in conversation with: the camera cuts to over your
   *  shoulder, and the prison holds its breath until you are done. */
  talkingTo: Body | null = null

  private converse(body: Body): void {
    this.talkingTo = body
    const p = this.player.body
    p.speed = 0
    p.pose = 'stand'
  }

  endConversation(): void {
    this.talkingTo = null
  }

  /** Red flash for the UI, decays per frame. */
  flash = 0
  /** Hard mode: no sight-cone guide, and officers spot you faster. */
  /** Difficulty. Setting it also sets how many attempts you get. */
  private modeValue: Mode = 'normal'
  get mode(): Mode {
    return this.modeValue
  }
  set mode(m: Mode) {
    this.modeValue = m
    this.memory.attemptsPerRound = m === 'story' ? 6 : m === 'hardcore' ? 1 : ATTEMPTS_PER_ROUND
    this.memory.rounds = m === 'hardcore' ? 1 : ROUNDS
  }
  /** Hard or Hardcore: no sight guide, sharper officers. */
  get hard(): boolean {
    return this.modeValue === 'hard' || this.modeValue === 'hardcore'
  }
  set hard(v: boolean) {
    this.mode = v ? 'hard' : 'normal'
  }

  caught(by: Guard): void {
    if (this.over || this.punished) return
    const p = this.player
    // Caught somewhere you cannot explain counts as an attempt, even if
    // nobody had laid eyes on you until this moment.
    if (!p.attempt && p.illegal === 2) p.attempt = this.inferMethod()
    const method = p.attempt
    if (!method) {
      // Caught out of bounds but not escaping: a nicking.
      this.warn(by, `Right, ${p.name}, you're coming with me.`)
      return
    }
    if (this.chaplain.alibi) {
      // The Reverend's thank you: once, and only once, you were at choir.
      this.chaplain.alibi = false
      p.attempt = null
      p.inVent = false
      const lost = p.inventory.confiscate()
      const cell = this.grid.cells.get(p.cell)!
      this.placePlayer(cell.bunks[1].x, cell.bunks[1].z)
      by.wary = Math.min(1, by.wary + 0.2)
      this.ui.card(
        'Choir practice',
        `${by.name} has you by the collar when ${this.chaplain.name} appears from nowhere, slightly out of breath. "Officer! There you are, ${p.name}. You missed the descant." He swears blind you were at choir practice. Nobody can prove otherwise, and nobody wants to sing.\nIt does not count as an attempt.${lost.length ? ' He does keep your contraband, "to pray over it".' : ''}\nThat was his one favour.`,
        8,
      )
      this.log.push(`Day ${this.clock.day}: caught by ${by.name}, but the Reverend gave you an alibi.`)
      return
    }
    by.wary = Math.min(1, by.wary + 0.35)
    this.missions.onTrouble()
    this.sounds.push({ sound: 'caught', volume: 1 })
    const wasVent = p.inVent || method === 'vent'
    const result = this.memory.fail(method, p.body.x, p.body.z)
    // Caught at the safe: the Governor changes the combination.
    if (method === 'safe') this.heist.knowA = this.heist.knowB = false
    this.digging = null
    if (method === 'tunnel' && this.tunnel.metres > 0) {
      this.tunnel.metres = 0
      this.toast('Maintenance pours concrete into your tunnel under the floor.', 'bad')
    }
    this.cracking = null
    this.log.push(`Day ${this.clock.day}: caught by ${by.name} (${METHOD_NAMES[method]}).`)
    if (wasVent) {
      const g = this.grid.grates.find((gr) => gr.id === 'your cell')!
      g.sealed = true
      g.open = false
    }
    p.attempt = null
    if (result === 'over') {
      const worst = this.memory.worstGang
      this.finish(false, worst.hostility > 0.45 ? 'gang' : 'solitary', worst.id)
      return
    }
    const lesson = this.memory.lessons[this.memory.lessons.length - 1]
    const sealed = wasVent ? '\nMaintenance welds your cell vent shut.' : ''
    if (result === 'round') {
      this.ui.card(
        'A visit from the Governor',
        `Rupert Pettigrew sits on the end of your bunk in segregation and straightens his tie. "${this.memory.attemptsPerRound} more, then. They remember everything, you know. I made sure of it. Do surprise me."\n\nThey learned: ${lesson.text}${sealed}`,
        8,
      )
    } else {
      this.ui.card(
        `Caught: attempt ${this.memory.attemptsUsed} of ${this.memory.attemptsPerRound}`,
        `${by.name} drags you to segregation. Contraband confiscated.\n\nThe prison learns: ${lesson.text}${sealed}`,
        6,
      )
      if (this.memory.attemptsLeft === 1 && this.memory.round === this.memory.rounds) this.toast('Slipped under your door, on headed paper: "One left. Make it a good one. R.P."', 'bad')
    }
    this.punish(by, true)
  }

  // ------------------------------------------------------------------
  // Punishment, knockouts, endings
  // ------------------------------------------------------------------

  private punish(by: Guard | null, searchCell: boolean): void {
    const p = this.player
    this.punished = true
    p.inventory.confiscate()
    if (searchCell && this.tunnel.metres > 0 && this.rng() < this.memory.tunnelFindChance) this.tunnelFound()
    if (searchCell && this.stash.length && this.rng() < 0.25 + this.memory.totalFailures * 0.08) {
      this.stash.length = 0
      this.toast('They spun your cell and found the stash.', 'bad')
    }
    p.inVent = false
    p.escortedBy = null
    p.attempt = null
    this.methodHint = null
    this.sickCall = null
    this.lure = null
    this.alarm.active = false
    this.climb = null
    this.keyHold = null
    for (const g of this.guards) {
      g.chasing = false
      g.suspicion = 0
      g.investigate = null
      g.searchTarget = false
    }
    void by
    // A night in segregation, then back on the wing at unlock.
    this.placePlayer(this.fixtures.solitaryBed.x + 1, this.fixtures.solitaryBed.z)
    this.pendingRelease = 2.5
  }

  private pendingRelease = 0

  private release(): void {
    this.clock.skipTo(6 * 60 + 30)
    const cell = this.grid.cells.get(PLAYER_CELL)!
    this.placePlayer(cell.bunks[1].x, cell.bunks[1].z)
    this.player.health = 100
    this.punished = false
    this.resetNight()
  }

  private knockedOut(): void {
    const p = this.player
    const lost = p.inventory.confiscate()
    if (p.attempt) {
      // Lying unconscious in the wrong place is as good as caught.
      const g = this.guards.find((gg) => gg.ko <= 0) ?? this.guards[0]
      this.caught(g)
      return
    }
    this.ui.card('Lights out', `You come round in healthcare with a headache.${lost.length ? ` Somebody went through your pockets: ${lost.map((t) => ITEMS[t].name).join(', ')}.` : ''}`, 4)
    this.placePlayer(this.fixtures.infirmaryBeds[0].x + 1, this.fixtures.infirmaryBeds[0].z)
    this.clock.minutes += 120
    p.health = 100
  }

  private finish(won: boolean, how: EndingId, gang: GangId = 'firm'): void {
    this.over = true
    this.input.enabled = false
    this.ending = { id: how === 'escape' ? 'escape' : how, won }
    const name = this.player.name
    const mateLine = this.mateEpilogue(won)
    const end = (w: boolean, title: string, text: string) => this.ui.end(w, title, text + mateLine)
    const tally = `Day ${this.clock.day}. ${this.memory.totalFailures} failed attempt${this.memory.totalFailures === 1 ? '' : 's'}.`
    const story = won ? endingStory(how, name, tally) : null
    if (story) {
      end(true, story.title, story.text)
    } else if (won && how === 'tunnel') {
      end(true, 'Like a mole', `${name} pushes up through the soil of the allotments beyond the wall, covered in clay, under a full moon. Somebody's prize marrows break the fall.\n${tally}\nAt morning roll call an officer lifts a loose floor tile in your cell and says a word the Bugle cannot print.`)
    } else if (won && how === 'jag') {
      end(true, "The Governor's Jag", `${name} slides into the cream leather seats of the Governor's Jaguar, adjusts the mirror, and drives out of the staff car park with a little wave at the gatehouse. The gatehouse waves back.\n${tally}\nThe Governor reports it stolen at nine the next morning. From the bus.`)
    } else if (won && how === 'staffDoor') {
      const who = this.disguisedAs ?? 'an officer'
      end(true, 'Off shift early', `${name} unlocks the staff door with ${who}'s keys, smelling faintly of Brut, and strolls across the staff car park like they own the place.\n${tally}\nHours later ${who} wakes up in a cell in a vest and pink boxers, with sausage roll crumbs down the front.`)
    } else if (won && how === 'guardDisguise') {
      end(true, 'Clocked off', `${name} walks out with the day shift, nods at the gatehouse and gets a lift to the station with Mrs Battenberg, who talks about her cats for forty minutes and never once looks at your face.\n${tally}\nThe count at nine comes up one short and one uniform missing. Nobody can work out which is more embarrassing.`)
    } else if (won && how === 'visitorDisguise') {
      end(true, 'Gone with the visitors', `${name} shuffles out in a floral frock and catches the number 47 with Big Dave's nan, who offers you a Werther's Original and says you have lovely cheekbones.\n${tally}\nThe chaplain has asked for his wig back.`)
    } else if (won && how === 'laundry') {
      end(true, 'Spin cycle', `The van rumbles out of the bay. Forty minutes later ${name} tumbles out of a basket at a laundrette in Wolverhampton, smelling of Persil and freedom.\n${tally}\nThe laundry contract has been "reviewed".`)
    } else if (won) {
      end(
        true,
        'Free',
        `${name} drops into the back seat and the car pulls away with its lights off.\nDay ${this.clock.day}. ${this.memory.totalFailures} failed attempt${this.memory.totalFailures === 1 ? '' : 's'}.\nBy the time the count comes up one short, you are on the M6.`,
      )
    } else if (how === 'gang') {
      end(
        false,
        `${GANGS[gang].name} got you`,
        `${this.memory.totalFailures} attempt${this.memory.totalFailures === 1 ? '' : 's'}, and every one of them brought the screws down on the wing.\n${GANGS[gang].name} caught ${name} in the showers with nobody watching. ${this.gangLeader(gang)?.name ?? 'Their boss'} did not even look up from his tea.\nThey never found out who did it.`,
      )
    } else {
      end(
        false,
        'Segregation. Indefinitely.',
        `${this.memory.totalFailures} attempt${this.memory.totalFailures === 1 ? '' : 's'}. The governor has had enough.\n${name} is moved to the segregation unit on a closed regime: twenty-three hours a day behind the door, and an officer outside it.\nNobody is getting out of here.`,
      )
    }
  }

  // ---- For the routes and secret missions (src/game/Routes.ts, secrets/) ----

  /** A way out that worked. */
  escapeBy(how: EndingId): void {
    this.sounds.push({ sound: 'good', volume: 1 })
    this.finish(true, how)
  }

  /** A way out that did not: it counts as an attempt, and the nearest officer has you. */
  rumbled(method: Method, line: string): void {
    const p = this.player
    p.inBasket = false
    p.hidingIn = null
    p.body.visible = true
    p.attempt = method
    this.methodHint = method
    const officer = this.guards.filter((g) => g.ko <= 0).sort((a, b) => a.distanceTo(p.body.x, p.body.z) - b.distanceTo(p.body.x, p.body.z))[0]
    officer.say(line, 3.5)
    this.caught(officer)
  }

  /** Curl up somewhere: out of sight, and out of the way of the officers. */
  hide(where: string): void {
    const p = this.player
    p.inBasket = true
    p.hidingIn = where
  }

  /** Back to your bunk, as if you had walked there. */
  sendToCell(): void {
    const cell = this.grid.cells.get(this.player.cell)!
    this.placePlayer(cell.bunks[1].x, cell.bunks[1].z)
  }

  private placePlayer(x: number, z: number): void {
    this.seated = null
    const b = this.player.body
    b.x = x
    b.z = z
    b.y = 0
    b.pose = 'stand'
  }

  /** Everyone back where they would be after a night. */
  private resetNight(): void {
    this.riot.active = false
    for (const pr of this.prisoners) {
      const b = pr.cell.bunks[pr.bunk]
      pr.body.x = b.x
      pr.body.z = b.z
      pr.body.y = 0
      pr.fighting = false
      pr.fightTarget = null
      pr.ko = 0
      pr.stop()
    }
    for (const g of this.guards) {
      const c = tileCentre(g.post.tx, g.post.ty)
      g.body.x = c.x
      g.body.z = c.z
      g.ko = 0
      g.busy = false
      g.stop()
    }
    for (const d of this.grid.doors) d.jammed = d.jammed && this.rng() < 0.3
  }

  // ------------------------------------------------------------------
  // Frame
  // ------------------------------------------------------------------

  update(delta: number): void {
    if (this.sounds.length > 64) this.sounds.length = 0
    // Mid-conversation the world waits. The two of you face each other and
    // whoever is talking gestures; nothing else moves.
    if (this.talkingTo) {
      const p = this.player.body
      const n = this.talkingTo
      // Step back to talking distance, so the close-up over your shoulder
      // shows their face rather than the back of your head.
      const gap = Math.hypot(p.x - n.x, p.z - n.z)
      if (gap < TALK_GAP - 0.05 && gap > 1e-3) {
        const step = Math.min(TALK_GAP - gap, delta * 3)
        moveCircle(p, ((p.x - n.x) / gap) * step, ((p.z - n.z) / gap) * step, 0.34, (tx, ty) => this.playerBlocked(tx, ty))
        this.grid.pushOutOfProps(p, 0.34)
      }
      p.yaw = Math.atan2(n.x - p.x, n.z - p.z)
      n.yaw = Math.atan2(p.x - n.x, p.z - n.z)
      p.pose = 'stand'
      p.speed = 0
      n.speed = 0
      if (n.pose !== 'sit') n.pose = 'talk'
      this.input.clear()
      // Keep the floating markers out of the close-up.
      this.dynamic.marker.visible = false
      this.dynamic.setBeacons([])
      for (const b of this.bodies) b.talking = b === n
      this.crowd.update(this.bodies, delta)
      return
    }
    if (this.over) {
      this.crowd.update(this.bodies, delta)
      return
    }
    if (this.pendingRelease > 0) {
      this.pendingRelease -= delta
      if (this.pendingRelease <= 0) this.release()
    }
    this.flash = Math.max(0, this.flash - delta * 1.5)

    // Sleeping fast-forwards the night.
    this.clock.speed = this.sleeping ? 25 : 1
    if (this.sleeping && (this.clock.period !== 'lightsOut' || this.riot.active || this.player.zone !== this.player.cell)) this.stopSleeping()
    this.clock.update(delta)
    this.events.tick()
    this.regime()
    this.events.update()
    this.feuds.update()
    this.secret?.update(delta)
    this.routes.update()

    this.doors.beginFrame()
    this.updatePlayer(delta)

    const agents = [...this.guards, ...this.prisoners]
    for (const g of this.guards) g.sense(delta)
    for (const pr of this.prisoners) pr.frame(delta)
    for (const a of agents) {
      a.tickTimer -= delta * (this.sleeping ? 4 : 1)
      if (a.tickTimer <= 0) {
        a.tickTimer += 1 / 6
        if (a instanceof Guard) a.tick()
        else (a as Prisoner).tick()
      }
    }
    for (const a of agents) a.move(delta * (this.sleeping ? 2 : 1), agents)
    this.separateBodies(agents)
    this.updateToilets(delta)
    this.updateTrespass(delta)
    this.doors.update(delta)
    this.updateRiot(delta)
    this.missions.update()
    this.updateNoises(delta)
    this.updateAlarm(delta)

    // Speech bubbles near the player.
    this.bubbles.length = 0
    for (const a of agents) {
      if (a.speechTimer > 0 && a.speech && Math.hypot(a.x - this.player.body.x, a.z - this.player.body.z) < 22) this.bubbles.push({ body: a.body, text: a.speech, who: a.voiceId })
    }

    // Visuals.
    this.updateSightGuide()
    this.updateVisitors(delta)
    this.updateKeith(delta)
    this.updateChaplain(delta)
    this.updateGovernor(delta)
    this.updateGuest(delta)
    this.updateDisguise(delta)
    this.dynamic.ducts.visible = this.player.inVent
    const carHere = this.carPresent
    this.dynamic.update(delta, {
      flag: this.flagUp,
      car: carHere,
      smokeAt: this.riot.active && this.riot.night ? { x: this.riot.x, z: this.riot.z } : null,
      flagAt: this.fixtures.flagpole,
    })
    const pb = this.player.body
    this.dynamic.setChristmas(this.season === 'christmas')
    this.dynamic.updateWeather(this.weather, pb.x, pb.z, delta, (x, z) => {
      const zone = this.grid.zone(Math.floor(x / TILE), Math.floor(z / TILE))
      return zone === 'yard' || zone === 'outside'
    })
    this.dynamic.marker.position.set(pb.x, pb.y + (this.player.inVent ? 3.6 : 2.9) + Math.sin(performance.now() / 300) * 0.08, pb.z)
    this.dynamic.marker.visible = true
    const beacons: { x: number; z: number; hex: number }[] = this.keith.body.visible ? [{ x: this.keith.body.x, z: this.keith.body.z, hex: HEX.stainedBlue }] : []
    if (!this.hard) for (const t of this.jobTargets()) beacons.push({ x: t.x, z: t.z, hex: HEX.gateYellow })
    this.dynamic.setBeacons(beacons)
    // Anyone with a speech bubble up is moving their mouth.
    for (const b of this.bodies) b.talking = false
    for (const bb of this.bubbles) bb.body.talking = true
    this.crowd.update(this.bodies, delta)
  }

  private readonly conePoints = this.guards.map(() => new Float32Array(CONE_RAYS * 2))

  /**
   * Draws what each officer can see onto the floor, cut off by walls. Off in
   * hard mode, in the vents (nobody below can see you there) and for anyone
   * too far away to matter.
   */
  private updateSightGuide(): void {
    const pb = this.player.body
    this.guards.forEach((g, i) => {
      const show = !this.hard && !this.player.inVent && g.ko <= 0 && Math.hypot(g.x - pb.x, g.z - pb.z) < 36
      if (!show) {
        this.dynamic.setCone(i, 0, 0, null, 0)
        return
      }
      const pts = this.conePoints[i] ?? (this.conePoints[i] = new Float32Array(CONE_RAYS * 2))
      const far = g.effectiveRange()
      const near = g.closeRange()
      const half = Guard.HALF_ANGLE
      for (let k = 0; k < CONE_RAYS; k++) {
        let angle: number
        let reach: number
        if (k < CONE_FRONT_RAYS) {
          angle = g.body.yaw - half + (2 * half * k) / (CONE_FRONT_RAYS - 1)
          reach = far
        } else {
          const t = (k - CONE_FRONT_RAYS + 1) / (CONE_RAYS - CONE_FRONT_RAYS + 1)
          angle = g.body.yaw + half + (Math.PI * 2 - 2 * half) * t
          reach = near
        }
        const len = this.grid.rayLength(g.x, g.z, angle, reach)
        pts[k * 2] = g.x + Math.sin(angle) * len
        pts[k * 2 + 1] = g.z + Math.cos(angle) * len
      }
      this.dynamic.setCone(i, g.x, g.z, pts, g.chasing ? 1 : g.suspicion)
    })
  }

  get carPresent(): boolean {
    const m = this.clock.minuteOfDay
    const night = m >= 22 * 60 || m < 5 * 60 + 30
    if (!night) return false
    if (this.carArrivesAt >= 0 && this.clock.minutes < this.carArrivesAt) return false
    return this.contactNights > 0 || this.signalTonight
  }

  private stopSleeping(): void {
    this.sleeping = false
    // Climb down off the top bunk and stand beside it.
    const p = this.player
    if (p.body.pose !== 'sleep') return
    const cell = this.grid.cells.get(p.cell)!
    this.placePlayer(cell.bunks[0].x + 0.9, cell.bunks[0].z)
  }

  /** Things that happen at set times: unlock, restock, shift change, bang-up. */
  private regime(): void {
    const period = this.clock.period
    const m = this.clock.minuteOfDay
    if (period !== this.lastPeriod) {
      const previous = this.lastPeriod
      this.lastPeriod = period
      if (previous) this.toast(`${this.clock.text}  ${this.clock.label}`, 'neutral')
      if (period === 'unlock') {
        this.mateMorning()
        this.deliverPost()
        for (const g of this.guards) if (g.uniformTaken) this.dressGuard(g, true)
        this.restock(false)
        this.missions.newDay()
        this.events.newDay()
        this.feuds.newDay()
        this.secret?.newDay()
        this.routes.newDay()
        if (this.contactNights > 0) this.contactNights--
        this.signalTonight = false
        this.flagUp = false
        this.carArrivesAt = -1
      }
      if (period === 'breakfast' || period === 'bangUp') this.shiftChange()
      if (period === 'lightsOut' && previous === 'bangUp') this.lightsOut()
    }
    // Car arrives once the evening has set in, if the signal went up.
    if (this.lastMinute < 22 * 60 && m >= 22 * 60 && this.carPresent) this.toast('Somewhere beyond the wall, an engine idles with its lights off.', 'good')
    this.lastMinute = m
  }

  private shiftChange(): void {
    if (this.stolenFrom && this.player.inventory.has('guardKey')) {
      const g = this.stolenFrom
      this.memory.keysLost++
      this.memory.used.key++
      g.wary = 1
      this.player.inventory.remove('guardKey')
      this.toast(`Shift change: ${g.name} reports their keys missing. The locks on that ring are changed. Officers will guard their keys more closely.`, 'bad')
      g.searchTarget = true
      this.stolenFrom = null
    }
  }

  private lightsOut(): void {
    this.mateNight()
    for (const d of this.grid.doors) if (d.kind === 'cell') d.locked = !d.jammed
    this.lockChecks.length = 0
    if (this.memory.lockCheckChance > 0) for (const d of this.grid.doors) if (d.kind === 'cell') this.lockChecks.push(d)
    // Anyone still out is locked in their cell by the officers.
    for (const pr of this.prisoners) {
      if (pr.zone !== pr.cell.zone) {
        const b = pr.cell.bunks[0]
        pr.body.x = b.x
        pr.body.z = b.z
        pr.stop()
      }
    }
    const p = this.player
    if (p.zone !== p.cell && !p.inVent && !p.attempt) {
      this.toast('You were not behind your door at lights out.', 'bad')
      const g = this.guards.find((gg) => gg.block === p.block && gg.duty === 'landing') ?? this.guards[0]
      this.warn(g, `${p.name}! Behind your door!`)
      const cell = this.grid.cells.get(p.cell)!
      this.placePlayer(cell.bunks[1].x, cell.bunks[1].z)
    }
    const myDoor = this.grid.cells.get(PLAYER_CELL)!.door
    if (myDoor.jammed) this.toast('Your door swings shut... but the bolt never catches. The toothpaste held.', 'good')
  }

  /** Loose items turn up again each morning. */
  private restock(first: boolean): void {
    for (const spawn of SPAWNS) {
      const present = this.dynamic.items.filter((i) => i.zone === spawn.zone).length
      if (!first && present >= spawn.items.length) continue
      for (const id of spawn.items) {
        if (!first && this.rng() < 0.5) continue
        const t = this.grid.randomTileIn(spawn.zone, this.rng)
        if (this.grid.tile(t.tx, t.ty) !== Tile.Floor) continue
        const c = tileCentre(t.tx, t.ty)
        this.dynamic.spawnItem(id, c.x + (this.rng() - 0.5), c.z + (this.rng() - 0.5), spawn.zone)
      }
    }
  }

  // ------------------------------------------------------------------
  // Player
  // ------------------------------------------------------------------

  private updatePlayer(delta: number): void {
    const p = this.player
    const b = p.body
    const input = this.input
    this.punchTimer -= delta
    this.fightingFor = Math.max(0, this.fightingFor - delta)
    this.dodgyTimer = Math.max(0, this.dodgyTimer - delta)
    p.frothing = Math.max(0, p.frothing - delta)
    if (p.health < 100 && p.health > 0) p.health = Math.min(100, p.health + delta * 1.5)

    if (input.take('sneak')) {
      p.sneaking = !p.sneaking
      this.toast(p.sneaking ? 'Sneaking: slower, quieter, harder to spot.' : 'Walking normally.', 'neutral')
    }
    if (input.take('froth')) this.chewSoap()

    if (p.inBasket) {
      b.visible = false
      b.speed = 0
      this.prompts = [{ key: 'E', label: `Climb out of the ${p.hidingIn ?? 'basket'}`, run: () => this.leaveBasket() }]
      if (input.take('interact')) this.leaveBasket()
      p.illegal = 0
      return
    }
    if (this.punished || this.climb) {
      if (this.climb) this.updateClimb(delta)
      b.speed = 0
      this.prompts = []
      return
    }

    if (this.sleeping) {
      const mv = input.move
      if (mv.x || mv.z) this.stopSleeping()
      else {
        this.prompts = []
        return
      }
      b.y = 0
    }

    // Sitting: stay put until you move, then get up off the seat.
    if (this.seated && (input.move.x || input.move.z)) this.standUp()

    // Movement.
    const mv = this.seated ? { x: 0, z: 0 } : input.move
    p.running = input.running && !p.sneaking
    const speed = p.inVent ? CRAWL_SPEED * (input.running ? 1.4 : p.sneaking ? 0.6 : 1) : p.running ? RUN_SPEED : p.sneaking ? SNEAK_SPEED : PLAYER_SPEED
    const dx = mv.x * speed * delta
    const dz = mv.z * speed * delta
    let face = { x: mv.x, z: mv.z }
    if (p.inVent) {
      const nx = b.x + dx
      const nz = b.z + dz
      // Face only the way the duct lets you go, or the body swings round and
      // sticks out over the room below.
      face = { x: 0, z: 0 }
      if (this.grid.inDuct(nx, b.z)) {
        b.x = nx
        face.x = mv.x
      }
      if (this.grid.inDuct(b.x, nz)) {
        b.z = nz
        face.z = mv.z
      }
      // The ducts are tin: moving makes noise.
      if (mv.x || mv.z) {
        this.ventNoise -= delta
        if (this.ventNoise <= 0) {
          this.ventNoise = 0.8
          // On normal the ducts are quiet unless you scramble; on hard every
          // knee on the tin carries.
          const radius = this.hard ? (input.running ? 11 : p.sneaking ? 2.5 : 5.5) : input.running ? 6 : p.sneaking ? 0.8 : 2.2
          this.emit({ x: b.x, z: b.z, radius: radius * (1 + this.memory.ventListening), kind: 'clank' })
        }
      }
    } else {
      // Walking up to a gate: the officer on it lets you through if the
      // regime says you can go that way.
      if (mv.x || mv.z) {
        const ahead = worldToTile(b.x + mv.x * 1.2, b.z + mv.z * 1.2)
        const door = this.grid.doorAtTile(ahead.tx, ahead.ty)
        if (door && p.disguise === 'guard' && !p.disguiseBlown && door.kind !== 'perimeter') this.doors.request(door, 'guard', p.block, false, p.zone)
        else if (door && door.kind === 'gate') this.doors.request(door, 'player', p.block, false, p.zone)
      }
      const bx = b.x
      const bz = b.z
      moveCircle(b, dx, dz, 0.34, (tx, ty) => this.playerBlocked(tx, ty))
      if (!this.seated) this.grid.pushOutOfProps(b, 0.34)
      this.doorAssist(bx, bz, mv, speed * delta)
    }
    const moving = face.x !== 0 || face.z !== 0
    b.speed += ((moving ? speed : 0) - b.speed) * Math.min(1, delta * 10)
    if (moving) {
      const yaw = Math.atan2(face.x, face.z)
      let d = yaw - b.yaw
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      b.yaw += d * Math.min(1, delta * 12)
    }
    b.y = p.inVent ? WALL_TOP : 0
    if (p.inVent) b.pose = 'crawl'
    else if (this.seated) b.pose = 'sit'
    else if (this.fightingFor > 0) b.pose = 'fight'
    else if (b.pose !== 'phone' || moving) b.pose = 'walk'
    if (p.running && moving && !p.inVent) this.emit({ x: b.x, z: b.z, radius: 5 * (p.zone === 'yard' || p.zone === 'outside' ? weatherSteps(this.weather) : 1), kind: 'clank' })

    const zone = this.grid.zoneAtWorld(b.x, b.z)
    const wasIn = p.zone === p.cell
    if (zone) p.zone = zone
    this.updateBunkNote(wasIn)

    // Key holding a door open behind you.
    if (this.keyHold) {
      this.keyHold.t -= delta
      this.doors.hold(this.keyHold.door)
      if (this.keyHold.t <= 0) this.keyHold = null
    }
    // A jammed door at night can be pushed.
    const myCell = this.grid.cells.get(p.cell)!
    if (this.clock.locked && myCell.door.jammed && this.pushingDoor > 0) {
      this.pushingDoor -= delta
      this.doors.hold(myCell.door)
    }
    // Riot: the officers open the cells to drag people out.
    if (this.riot.active && this.riot.night && this.riotOpenTimer > 0) {
      this.riotOpenTimer -= delta
      if (this.riotOpenTimer < 15) {
        this.doors.hold(myCell.door)
        for (const pr of this.prisoners) if (pr.block === this.riot.block && pr.supporter) this.doors.hold(pr.cell.door)
      }
    }

    this.updateLure(delta)
    this.updateHeist(delta)
    this.updateTunnel(delta)
    // A Greggs voucher more than you had: earned, found or given.
    const v = this.player.inventory.count('voucher')
    if (this.vouchersSeen >= 0 && v > this.vouchersSeen) this.goal('voucher')
    this.vouchersSeen = v
    if (this.goals.shown && !this.goals.finished && this.clock.day >= 3) this.goals.finished = true
    this.updateIllegal()
    p.dodgy = this.dodgyTimer > 0 || p.inventory.weapon.damage >= 4 ? 1 : 0

    // Outside the wall.
    if (zone === 'outside' && !p.inVent) {
      const car = this.dynamic.car.position
      const jag = this.fixtures.jag
      if (p.inventory.has('jagKeys') && Math.hypot(b.x - jag.x, b.z - jag.z) < 3) {
        this.sounds.push({ sound: 'good', volume: 1 })
        this.finish(true, 'jag')
        return
      }
      if (this.carPresent && Math.hypot(b.x - car.x, b.z - car.z) < 3.4) {
        this.sounds.push({ sound: 'good', volume: 1 })
        this.finish(true, 'escape')
        return
      }
      this.outsideTimer += delta
      if (!this.carPresent && this.outsideTimer > 0.1 && this.outsideTimer - delta <= 0.1) this.toast('Nobody is waiting for you out here. The dogs are already barking...', 'bad')
      if (!this.carPresent && this.outsideTimer > 30) {
        const g = this.guards.find((gg) => gg.duty === 'central') ?? this.guards[0]
        this.toast('The dog unit runs you down in the field.', 'bad')
        this.caught(g)
        this.outsideTimer = 0
      }
    } else this.outsideTimer = 0

    this.buildPrompts()
    for (const action of ['interact', 'secondary'] as const) {
      if (input.take(action)) {
        const key = action === 'interact' ? 'E' : 'R'
        this.prompts.find((pr) => pr.key === key)?.run()
      }
    }
    if (input.take('attack')) this.attack()
    if (input.take('sick')) this.callSick()
    if (input.take('riot')) this.kickOff()
    if (input.take('sleep')) this.trySleep()
  }

  /**
   * Snagged on a door frame: if the way straight ahead is a wall but a
   * doorway is just to one side, slide toward it. Doors are one tile wide,
   * so without this you catch the jamb more often than you get through.
   */
  private doorAssist(fromX: number, fromZ: number, mv: { x: number; z: number }, step: number): void {
    const b = this.player.body
    const movedX = Math.abs(b.x - fromX)
    const movedZ = Math.abs(b.z - fromZ)
    const t = worldToTile(b.x, b.z)
    if (Math.abs(mv.z) > 0.7 && movedZ < step * 0.3) {
      const ty = t.ty + Math.sign(mv.z)
      for (const side of [0, -1, 1]) {
        const tx = t.tx + side
        if (this.playerBlocked(tx, ty)) continue
        const cx = (tx + 0.5) * TILE
        if (Math.abs(cx - b.x) < 3) b.x += Math.sign(cx - b.x) * Math.min(Math.abs(cx - b.x), step)
        return
      }
    }
    if (Math.abs(mv.x) > 0.7 && movedX < step * 0.3) {
      const tx = t.tx + Math.sign(mv.x)
      for (const side of [0, -1, 1]) {
        const ty = t.ty + side
        if (this.playerBlocked(tx, ty)) continue
        const cz = (ty + 0.5) * TILE
        if (Math.abs(cz - b.z) < 3) b.z += Math.sign(cz - b.z) * Math.min(Math.abs(cz - b.z), step)
        return
      }
    }
  }

  private ventNoise = 0
  private pushingDoor = 0

  /**
   * Nobody walks through anybody. Every standing body is a circle; any two
   * that overlap are pushed apart, the lighter one further. Prisoners and
   * officers are heavier than you, so you bump off them rather than shove
   * them aside. Anyone sitting, mid-conversation, or a fixture of the place
   * (Keith, the Reverend, visitors) does not budge. Sleeping, knocked-out and
   * crawling bodies, and anyone up in the ducts, are left out.
   */
  private separateBodies(agents: (Guard | Prisoner)[]): void {
    const MIN = 0.68
    const list: { b: Body; inv: number; move: (dx: number, dz: number) => void }[] = []
    const upright = (b: Body) => b.visible && b.pose !== 'sleep' && b.pose !== 'down' && b.pose !== 'crawl' && Math.abs(b.y) < 0.3
    const p = this.player
    const pb = p.body
    if (upright(pb) && !p.inVent && !this.climb) {
      list.push({
        b: pb,
        inv: this.seated || this.talkingTo || this.punished ? 0 : 1,
        move: (dx, dz) => {
          moveCircle(pb, dx, dz, 0.34, (tx, ty) => this.playerBlocked(tx, ty))
          this.grid.pushOutOfProps(pb, 0.34)
        },
      })
    }
    for (const a of agents) {
      if (a.ko > 0 || !upright(a.body)) continue
      const still = a.body.pose === 'sit' || a.body === this.talkingTo
      list.push({ b: a.body, inv: still ? 0 : 0.5, move: (dx, dz) => a.nudge(dx, dz) })
    }
    const fixed = () => {}
    for (const b of [this.keith.body, this.chaplain.body, this.governor.body, ...this.visitors.map((v) => v.body)]) if (upright(b)) list.push({ b, inv: 0, move: fixed })

    for (let i = 0; i < list.length; i++) {
      const A = list[i]
      for (let j = i + 1; j < list.length; j++) {
        const B = list[j]
        const w = A.inv + B.inv
        if (w === 0) continue
        let dx = B.b.x - A.b.x
        let dz = B.b.z - A.b.z
        if (Math.abs(dx) > MIN || Math.abs(dz) > MIN) continue
        let d = Math.hypot(dx, dz)
        if (d >= MIN) continue
        const overlap = MIN - d
        if (d < 1e-4) {
          // Exactly on top of each other: part them along a fixed axis.
          dx = 1
          dz = 0
          d = 1
        }
        const nx = dx / d
        const nz = dz / d
        if (A.inv) A.move(-nx * overlap * (A.inv / w), -nz * overlap * (A.inv / w))
        if (B.inv) B.move(nx * overlap * (B.inv / w), nz * overlap * (B.inv / w))
      }
    }
  }

  private playerBlocked(tx: number, ty: number): boolean {
    const t = this.grid.tile(tx, ty)
    if (t === Tile.Floor || t === Tile.Outside) return false
    if (t === Tile.Door) return (this.grid.doorAtTile(tx, ty)?.openness ?? 0) < 0.6
    return true
  }

  private updateIllegal(): void {
    const p = this.player
    const b = p.body
    let level: 0 | 1 | 2 = 0
    // Stepping out to the officer who came for the sick call.
    const call = this.sickCall
    if (call && call.stage === 'atDoor' && !p.escortedBy) {
      const door = this.grid.cells.get(call.cell)!.door
      if (Math.hypot((door.tx + 0.5) * TILE - b.x, (door.ty + 0.5) * TILE - b.z) < 2.6) {
        call.stage = 'escorting'
        p.escortedBy = call.responders[0]
      }
    }
    if (p.escortedBy) {
      const d = Math.hypot(p.escortedBy.x - b.x, p.escortedBy.z - b.z)
      if (d > 7 || p.inVent) {
        p.escortedBy.say(`Where's ${p.name} gone?!`, 2.5)
        p.escortedBy.chasing = false
        p.escortedBy.suspicion = 0.9
        p.escortedBy.lastSeen = { x: b.x, z: b.z, t: 0 }
        p.escortedBy = null
        this.sickCall = null
        this.methodHint = this.methodHint ?? 'sick'
      }
    }
    const disguised = p.disguise && !p.disguiseBlown
    if (p.escortedBy) level = 0
    else if (disguised && p.disguise === 'guard' && !p.inVent && !this.climb && p.zone !== 'outside') level = 0
    else if (disguised && p.disguise === 'visitor' && (p.zone === 'visits' || this.visitingTime)) level = 0
    else if (this.climb) level = 2
    else if (p.inVent) level = 2
    else if (RESTRICTED.has(p.zone)) level = 2
    else if (this.clock.locked && p.zone !== p.cell) level = 2
    else {
      const allowed = allowedZones(this.clock.period, p.block)
      const zoneBlock = blockOfZone(p.zone)
      const ownBlockCell = p.zone.startsWith('cell') && zoneBlock === p.block
      if (p.zone !== p.cell && !allowed.has(p.zone) && !(ownBlockCell && allowed.has(`block${p.block}`)) && !this.secret?.allows?.(p.zone)) level = 1
      if (p.zone === 'infirmary' && !this.sickCall) level = 1
    }
    if (this.fightingFor > 0 && !this.riot.active && level < 1) level = 1
    p.illegal = level

    // Out of bounds is only an attempt once an officer has seen you there.
    const watched = this.guards.some((g) => g.seesPlayer || g.chasing)
    if (level === 2 && !p.attempt && watched) {
      p.attempt = this.inferMethod()
      this.toast(`Spotted! Escape attempt under way: ${METHOD_NAMES[p.attempt]}. Get back to your cell before they catch you and it will not count.`, 'bad')
    }
    // Back behind your own door with nobody on you: it never happened.
    // (How you got out is kept: you may still be on your way.)
    if (p.attempt && p.zone === p.cell && !p.inVent && !this.climb && !watched) {
      this.toast('Back in your cell. They saw something, but they cannot prove it was you.', 'good')
      p.attempt = null
      this.methodHint = null
      this.alarm.active = false
    }
  }

  private inferMethod(): Method {
    const p = this.player
    return this.methodHint ?? (p.inVent ? 'vent' : p.zone === 'outside' ? 'wall' : 'gate')
  }

  gangLeader(gang: GangId): Prisoner | undefined {
    return this.prisoners.find((p) => p.gang === gang && p.leader)
  }

  /** Firms whose paid backing covers this wing right now. */
  private backingFirms(wing: string): GangId[] {
    const now = this.clock.minutes
    return GANG_IDS.filter((g) => this.memory.backing(g, now) && this.prisoners.some((p) => p.gang === g && p.block === wing))
  }

  // ---- Prompts and actions ----

  private buildPrompts(): void {
    const p = this.player
    const b = p.body
    const inv = p.inventory
    const out: Prompt[] = []
    const near = (x: number, z: number, r: number) => Math.hypot(b.x - x, b.z - z) < r
    const add = (key: string, label: string, run: () => void) => {
      if (!out.some((o) => o.key === key)) out.push({ key, label, run })
    }

    if (p.inVent) {
      for (const g of this.grid.grates) {
        const c = tileCentre(g.tx, g.ty)
        if (!near(c.x, c.z, 1.2)) continue
        if (g.sealed) add('E', `Grille (${g.id}) is welded shut`, () => this.toast('Welded shut from the other side.', 'bad'))
        else add('E', `Drop out: ${g.id}`, () => this.leaveVent(g))
      }
      this.prompts = out
      return
    }

    // The silly exits come first: they are the whole point of standing there.
    this.sillyPrompts(add)

    // Loose items.
    let nearest: LooseItem | null = null
    let nd = 1.5
    for (const it of this.dynamic.items) {
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
              this.dynamic.removeItem(item)
              this.toast(`${ITEMS[item.id].name}: ${ITEMS[item.id].blurb}`, 'neutral')
              if (ITEMS[item.id].contraband) this.dodgyTimer = 3
            } else this.toast('Your pockets are full. Craft something or drop something (Tab).', 'bad')
          })
      : null

    // Vent grilles.
    for (const g of this.grid.grates) {
      const c = tileCentre(g.tx, g.ty)
      if (!near(c.x, c.z, 1.4)) continue
      if (g.sealed) {
        add('E', 'The vent is welded shut', () => this.toast('Welded shut. They know about this one now.', 'bad'))
      } else if (g.open) {
        add('E', `Climb into the vent`, () => this.enterVent(g))
      } else {
        const tool = inv.withUse('openVent') ?? (inv.has('spoon') && g.id === 'your cell' ? { id: 'spoon' as ItemId, durability: 1 } : undefined)
        if (tool) add('E', `Unscrew the vent grille (${ITEMS[tool.id].name})`, () => {
          g.open = true
          this.dodgyTimer = 4
          this.emit({ x: c.x, z: c.z, radius: 4, kind: 'clank' })
          this.toast(g.id === 'your cell' ? 'The screws are rusted half through. The grille comes away.' : 'Grille off.', 'good')
        })
        else add('E', 'Vent grille: you need something to undo the screws', () => this.toast('A screwdriver or a flattened spoon would do it. (The one in your cell is so rusted an ordinary spoon will turn it.)', 'neutral'))
      }
    }

    // People.
    const front = (x: number, z: number) => near(x, z, 1.7)
    for (const g of this.guards) {
      if (!front(g.x, g.z)) continue
      if (g.ko > 0 && g.hasKeys) {
        add('R', `Take ${g.name}'s keys`, () => this.takeKeys(g, true))
      } else if (g.canBePickpocketed()) {
        add('R', `Lift ${g.name}'s keys`, () => this.takeKeys(g, false))
      }
      if (g.ko <= 0) add('E', `Talk to ${g.name}${this.missions.hasOffer(g) ? ' (wants a word)' : ''}`, () => this.talkToGuard(g))
      break
    }
    for (const pr of this.prisoners) {
      if (pr.ko > 0 || !front(pr.x, pr.z)) continue
      add('E', `Talk to ${pr.name}${this.missions.hasOffer(pr) ? ' (has a job)' : ''}`, () => this.talkTo(pr))
      break
    }

    // Doors.
    const t = worldToTile(b.x, b.z)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const door = this.grid.doorAtTile(t.tx + dx, t.ty + dy)
        if (!door) continue
        const dc = tileCentre(door.tx, door.ty)
        if (!near(dc.x, dc.z, 2.3)) continue
        const myDoor = door.cell === p.cell
        if (myDoor && !this.clock.locked && door.openness > 0.5 && !door.jammed && inv.has('toothpaste')) {
          add('R', 'Pack toothpaste into the lock', () => {
            inv.remove('toothpaste')
            door.jammed = true
            this.dodgyTimer = 3
            this.toast('You pack the strike plate with toothpaste. It will set hard by lights out.', 'good')
          })
        }
        if (door.openness < 0.5) {
          if (myDoor && this.clock.locked && door.jammed) {
            add('E', 'Ease the door open (toothpaste)', () => {
              this.pushingDoor = 6
              this.methodHint = 'toothpaste'
              this.emit({ x: dc.x, z: dc.z, radius: 3, kind: 'clank' })
            })
          } else if (!this.doors.isOpenByRegime(door)) {
            const key = inv.withUse('openDoor')
            if (key) {
              // Key in hand at a locked door: that beats a chat with whoever
              // is standing next to it.
              const chat = out.findIndex((o) => o.key === 'E' && o.label.startsWith('Talk to'))
              if (chat >= 0) out.splice(chat, 1)
              add('E', `Unlock with ${ITEMS[key.id].name}`, () => this.useKey(door, key))
            } else if (door.kind === 'gate' && !this.clock.locked) {
              add('E', 'Ask to be let through', () => this.askGate(door))
            }
          }
        }
      }
    }

    // Fixtures.
    const f = this.fixtures
    for (const ph of f.phones) if (near(ph.x, ph.z - 0.4, 1.6) && !this.clock.locked) add('E', 'Use the phone', () => this.usePhone())
    if (near(f.flagpole.x, f.flagpole.z, 2.2) && !this.flagUp && inv.has('flag')) add('E', 'Run the signal flag up the pole', () => this.raiseFlag())
    if (p.zone === p.cell && this.clock.locked && inv.has('torch') && !this.signalTonight) add('R', 'Flash the torch out of the window', () => this.flashTorch())
    if (p.zone === 'yard' && t.ty >= 57 && inv.has('grapple')) add('E', 'Throw the grapple over the wall', () => this.startClimb(t.tx))
    if (p.zone === 'laundry' && this.clock.period === 'work') {
      for (const w of f.washers) if (near(w.x, w.z, 1.4)) add('E', 'Work a laundry shift (+1 Greggs voucher)', () => this.work())
    }
    if (p.zone === p.cell && this.post.waiting) {
      const cell = this.grid.cells.get(p.cell)!
      if (near(cell.bunks[0].x, cell.bunks[0].z, 2.2)) {
        // The note beats a chat with your cellmate sat on the bunk.
        const chat = out.findIndex((o) => o.key === 'E' && o.label.startsWith('Talk to'))
        if (chat >= 0) out.splice(chat, 1)
        add('E', 'Read the note on your bunk', () => this.readBunkNote())
      }
    }
    if (p.zone === p.cell) {
      const cell = this.grid.cells.get(p.cell)!
      if (near(cell.bunks[1].x, cell.bunks[1].z, 1.6)) add('R', `Your stash (${this.stash.length}/4)`, () => this.openStash())
      this.tunnelPrompts(add)
      if (near(cell.bunks[0].x, cell.bunks[0].z, 1.6) && this.clock.locked) add('E', 'Sleep (Z) till morning', () => this.trySleep())
      if (!this.clock.locked && !this.lure && !p.inVent && !this.memory.lureIgnored) add('H', 'Shout for an officer: "Guv! There\'s a rat!"', () => this.shoutForOfficer())
    }
    if (inv.has('rubble') && p.zone === 'yard' && !this.clock.locked) add('R', `Shake the rubble out of your trouser legs (${inv.count('rubble')})`, () => this.scatterRubble())
    if (inv.has('spoon') && p.zone === 'yard') add('R', 'Grind the spoon flat on the concrete', () => this.craftNamed('flatSpoon'))
    this.missions.prompts(add)
    pickup?.()

    // On a toilet: do your business, then flush, or don't.
    const loo = this.seated?.toilet
    if (loo) {
      const job = this.business
      if (!job) add('R', 'Do your business', () => this.doBusiness(loo))
      else if (job.done) add('R', 'Flush', () => this.flush())
      else add('R', 'Concentrating...', () => {})
    }
    // The newer routes, and whatever secret is on this sentence.
    if (!this.seated) {
      this.routes.prompts(add, near)
      this.secret?.prompts(add, near)
      const gu = this.guest
      if (gu.body.visible && this.secret?.talkGuest && near(gu.body.x, gu.body.z, 2.0)) add('E', `Talk to ${gu.name}`, () => {
        this.converse(gu.body)
        this.secret!.talkGuest!()
      })
    }
    // Any bench, chair, pew, sofa or bunk edge. Lowest of all.
    if (this.seated) add('E', this.business?.done ? 'Stand up (without flushing)' : 'Stand up', () => this.standUp())
    else {
      let seat: { x: number; z: number; yaw: number } | null = null
      let sd = 1.2
      for (const st of this.grid.seats) {
        const d = Math.hypot(st.x - b.x, st.z - b.z)
        if (d < sd) {
          sd = d
          seat = st
        }
      }
      const taken = seat && this.bodies.some((o) => o !== b && o.visible && o.pose === 'sit' && Math.hypot(o.x - seat!.x, o.z - seat!.z) < 0.45)
      if (seat && !taken) {
        // Right at a free seat, sitting beats a chat with whoever is next to it.
        if (sd < 0.8) {
          const chat = out.findIndex((o) => o.key === 'E' && o.label.startsWith('Talk to'))
          if (chat >= 0) out.splice(chat, 1)
        }
        add('E', 'Sit down', () => this.sitDown(seat!))
      }
    }

    this.prompts = out
  }

  /** Where you are sitting, if you are. Move to get up. */
  seated: { x: number; z: number; yaw: number; toilet?: string } | null = null
  /** On a toilet, in progress or done. */
  private business: { cell: string; t: number; done: boolean; witnessed: boolean; ownerSaw: boolean } | null = null
  /** Cells with something unflushed in the toilet, and who might know. */
  readonly messes = new Map<string, { witnessed: boolean; ownerSaw: boolean; floor: boolean }>()
  private toiletIncidents = 0

  private doBusiness(cell: string): void {
    this.business = { cell, t: 3.5, done: false, witnessed: false, ownerSaw: false }
    this.toast('You settle in. This could take a minute.', 'neutral')
  }

  private flush(): void {
    this.business = null
    this.toast(pick2(this.rng, ['You flush. The pipes groan like a dying whale.', 'Flushed. The cistern sounds like a bin lorry reversing.', 'You flush, like a decent human being.']), 'neutral')
  }

  private leaveMess(cell: string, witnessed: boolean): void {
    const ownerSaw = this.business?.ownerSaw ?? false
    const before = this.messes.get(cell)
    this.messes.set(cell, { witnessed: witnessed || !!before?.witnessed, ownerSaw: ownerSaw || !!before?.ownerSaw, floor: !!before?.floor })
    const seat = this.grid.seats.find((s) => s.toilet === cell)
    if (seat) this.dynamic.setToiletMess(cell, seat.x, seat.z, true)
    this.toast(cell === this.player.cell ? 'You leave it. In your own cell. Your cellmate will be thrilled.' : 'You walk away without flushing. Somebody is going to be very upset.', 'neutral')
  }

  private dropOnFloor(cell: string, seat: { x: number; z: number; yaw: number }): void {
    const p = this.player
    const owners = this.prisoners.filter((pr) => pr.cell.zone === cell)
    const ownerSaw = owners.some((o) => o.zone === cell && o.ko <= 0 && o.body.pose !== 'sleep')
    const witnessed = ownerSaw || this.watchersOf(p.body.x, p.body.z) > 0
    const before = this.messes.get(cell)
    this.messes.set(cell, { witnessed: witnessed || !!before?.witnessed, ownerSaw: ownerSaw || !!before?.ownerSaw, floor: true })
    // Just in front of the bowl, where you were stood up from.
    const fx = seat.x + Math.sin(seat.yaw) * 0.45
    const fz = seat.z + Math.cos(seat.yaw) * 0.45
    this.dynamic.dropFloorMess(`${cell}:floor`, fx, fz, 0.55)
    this.sounds.push({ sound: 'clank', volume: 0.3 })
    this.toast(pick2(this.rng, ['You stand up mid-business. It drops straight onto the floor. Splat.', 'You get up too soon. Gravity does the rest. On the floor. In his cell.', 'Halfway through, you stand. It lands on the lino with a noise you will never forget.']), 'bad')
  }

  /** Who could have seen you go: anyone with eyes on you nearby. */
  private watchersOf(x: number, z: number, except?: Prisoner): number {
    let n = 0
    for (const a of [...this.prisoners, ...this.guards]) {
      if (a === except || a.ko > 0 || a.body.pose === 'sleep') continue
      if (Math.hypot(a.x - x, a.z - z) < 12 && this.grid.sightClear(a.x, a.z, x, z)) n++
    }
    return n
  }

  private updateToilets(delta: number): void {
    const p = this.player
    const job = this.business
    if (job && !job.done) {
      job.t -= delta
      if (job.t <= 0) {
        job.done = true
        const owners = this.prisoners.filter((pr) => pr.cell.zone === job.cell)
        job.ownerSaw = owners.some((o) => o.zone === job.cell && o.ko <= 0 && o.body.pose !== 'sleep')
        job.witnessed = job.ownerSaw || this.watchersOf(p.body.x, p.body.z) > 0
        this.toast(pick2(this.rng, ['Job done. Grim.', 'There. Better out than in.', 'Done. You would not want to be the next one in here.']), 'neutral')
      }
    }
    // Shivs go away once the fight and the hunt are over.
    for (const pr of this.prisoners) {
      pr.hunt = Math.max(0, pr.hunt - delta)
      if (pr.ko > 0) pr.hunt = 0
      if (pr.armed && !pr.fighting && pr.hunt <= 0) {
        pr.armed = false
        pr.body.shiv = false
      }
    }
    // An owner coming home to it.
    for (const [cell, mess] of this.messes) {
      if (this.business?.cell === cell && !this.business.done) continue
      if (this.seated?.toilet === cell) continue
      const owner = this.prisoners.find((pr) => pr.cell.zone === cell && pr.zone === cell && pr.ko <= 0 && pr.body.pose !== 'sleep' && !pr.fighting)
      if (!owner) continue
      this.messes.delete(cell)
      this.dynamic.setToiletMess(cell, 0, 0, false)
      this.dynamic.hideFloorMess(`${cell}:floor`)
      this.discoverMess(owner, cell, mess)
    }
  }

  private discoverMess(owner: Prisoner, cell: string, mess: { witnessed: boolean; ownerSaw: boolean; floor: boolean }): void {
    const p = this.player
    const near = Math.hypot(owner.x - p.body.x, owner.z - p.body.z) < 12
    // On his floor is worse than in his toilet: he looks harder, and for longer.
    const floor = mess.floor
    const chance = cell === p.cell || mess.ownerSaw ? 1 : Math.min(0.97, 0.25 + (floor ? 0.2 : 0) + (mess.witnessed ? 0.45 : 0) + (near ? 0.25 : 0) + this.toiletIncidents * 0.1)
    const what = floor ? 'what you left on his floor' : 'what you left in his toilet'
    this.toiletIncidents++
    owner.trust = Math.max(0, owner.trust - 0.3)
    if (this.rng() < chance) {
      owner.grudge = 1
      if (owner.gang) this.memory.annoy(owner.gang, 0.08)
      owner.say(floor ? `ON MY FLOOR?! ...${p.name}. It was YOU.` : `WHO DID THIS?! ...${p.name}. It was YOU.`, 3.5)
      if (owner.temperament === 'old' && !floor) {
        this.toast(`${owner.name} found ${what} and knows it was you. He is too old to fight, but he will never forgive you.`, 'bad')
        return
      }
      if (owner.temperament === 'snitch' && !floor) {
        owner.report = true
        this.toast(`${owner.name} found ${what}, knows it was you, and is off to tell an officer.`, 'bad')
        return
      }
      // On the floor, even the old boys and the grasses come for you.
      owner.hunt = floor ? 200 : 120
      if (owner.temperament === 'hothead' || owner.temperament === 'gang' || this.rng() < (floor ? 0.5 : 0.25)) {
        owner.armed = true
        owner.body.shiv = true
      }
      this.toast(`${owner.name} found ${what}. He knows it was you, and he is coming${owner.armed ? ' with a shiv' : ''}.`, 'bad')
      return
    }
    // Wrong man: somebody nearby gets the blame, and the fists.
    const victim = this.prisoners
      .filter((o) => o !== owner && o.ko <= 0 && o.cuffed <= 0 && !o.fighting && o.body.visible && o.distanceTo(owner.x, owner.z) < 16)
      .sort((a, b) => a.distanceTo(owner.x, owner.z) - b.distanceTo(owner.x, owner.z))[0]
    if (victim && owner.temperament !== 'old') {
      owner.say(`WHO DID THIS?! ...Was it YOU, ${victim.name}?!`, 3)
      owner.fighting = true
      owner.fightTarget = victim
      victim.fighting = true
      victim.fightTarget = owner
      this.toast(`${owner.name} found ${what} and blames ${victim.name}. Fists are flying.`, 'good')
    } else {
      owner.say('WHO DID THIS?! I will find out. I WILL find out.', 3)
      this.toast(`${owner.name} found ${what}. He has no idea who did it. Yet.`, 'neutral')
    }
  }

  /**
   * Standing in somebody else's cell while they are in it. They tell you to
   * leave; stay, and what happens next depends on the man.
   */
  private updateTrespass(delta: number): void {
    const p = this.player
    const where = p.zone
    const inside = where.startsWith('cell') && where !== p.cell && !p.inVent && !this.over && !this.talkingTo
    for (const pr of this.prisoners) {
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
                : pick2(this.rng, [`What you doing in my cell, ${p.name}?`, 'Oi. Out. This is my peter.', 'You lost? This is my cell. Get out.']),
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
          this.toast(`${pr.name} is very disappointed in you.`, 'neutral')
          break
        case 'snitch':
          pr.say("Right. I'm telling.", 2.5)
          pr.report = true
          this.toast(`${pr.name} has gone to tell an officer you were in his cell.`, 'bad')
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

  private trespassFight(pr: Prisoner, shiv: boolean, line: string): void {
    pr.say(line, 2.5)
    pr.armed = shiv
    pr.body.shiv = shiv
    pr.fighting = true
    pr.fightTarget = 'player'
    pr.hunt = 20
    this.toast(shiv ? `${pr.name} has pulled a shiv. Get out of his cell!` : `${pr.name} is coming at you. Get out of his cell!`, 'bad')
  }

  private sitDown(seat: { x: number; z: number; yaw: number }): void {
    const b = this.player.body
    this.seated = seat
    b.x = seat.x
    b.z = seat.z
    b.yaw = seat.yaw
    b.pose = 'sit'
    b.poseTime = 0
    b.speed = 0
  }

  private standUp(): void {
    if (!this.seated) return
    // Walked off without flushing: it stays there for its owner to find.
    // Stood up halfway through: it lands on the floor.
    const job = this.business
    if (job?.done) this.leaveMess(job.cell, job.witnessed)
    else if (job && this.seated) this.dropOnFloor(job.cell, this.seated)
    this.business = null
    this.seated = null
    this.player.body.pose = 'stand'
    this.grid.pushOutOfProps(this.player.body, 0.34)
  }

  private chewSoap(): void {
    const p = this.player
    if (!p.inventory.has('soap')) {
      this.toast('You need a bar of soap to chew.', 'neutral')
      return
    }
    p.inventory.remove('soap')
    p.frothing = 150
    this.toast('You chew the soap. Foul. You are foaming at the mouth: very convincing.', 'good')
  }

  private enterVent(g: Grate): void {
    const p = this.player
    const c = tileCentre(g.tx, g.ty)
    p.inVent = true
    p.body.x = c.x
    p.body.z = c.z
    this.methodHint = this.methodHint ?? 'vent'
    this.toast('In the ducts. Running is loud; sneaking (C) is quiet. Officers below can hear you.', 'neutral')
  }

  private leaveVent(g: Grate): void {
    const p = this.player
    const c = tileCentre(g.tx, g.ty)
    // Someone standing right under it?
    const under = this.guards.find((gg) => gg.ko <= 0 && Math.hypot(gg.x - c.x, gg.z - c.z) < 2)
    p.inVent = false
    g.open = true
    p.body.x = c.x
    p.body.z = c.z + 0.4
    p.body.y = 0
    if (under) {
      under.say('Well, well. Look what crawled out.', 2.5)
      this.caught(under)
    }
  }

  private takeKeys(g: Guard, knockedOut: boolean): void {
    const p = this.player
    if (p.inventory.full) {
      this.toast('No room in your pockets.', 'bad')
      return
    }
    const chance = knockedOut ? 1 : this.memory.pickpocketChance * (1 - g.wary * 0.6) * (g.busy ? 1.6 : 1)
    if (this.rng() < chance) {
      g.hasKeys = false
      this.stolenFrom = g
      p.inventory.add('guardKey')
      this.dodgyTimer = 2
      this.toast(`You have ${g.name}'s keys. They will notice at the next shift change. Press a mould into soap to keep a copy.`, 'good')
    } else {
      g.say('Oi! Get your hands off!', 2.5)
      g.suspicion = 1
      g.chasing = true
      g.lastSeen = { x: p.body.x, z: p.body.z, t: 0 }
      g.wary = Math.min(1, g.wary + 0.3)
      this.methodHint = 'key'
      p.attempt = p.attempt ?? 'key'
    }
  }

  private useKey(door: Door, key: { id: ItemId; durability: number }): void {
    const inv = this.player.inventory
    const p = this.player
    if (door.kind === 'perimeter' && door.tx === EAST_WALL && key.id !== 'lockpick' && p.disguise === 'guard' && !p.disguiseBlown) {
      this.finish(true, 'staffDoor')
      return
    }
    if (door.kind === 'perimeter' && key.id === 'lockpick') {
      this.toast('The gatehouse lock is too heavy to pick.', 'bad')
      return
    }
    if (key.id === 'lockpick' && this.rng() < 0.4) {
      this.toast('The pick slips. Try again.', 'bad')
      this.emit({ x: (door.tx + 0.5) * TILE, z: (door.ty + 0.5) * TILE, radius: 4, kind: 'clank' })
      if (inv.wear(key)) this.toast('The lockpick snaps.', 'bad')
      return
    }
    this.keyHold = { door, t: 4 }
    this.sounds.push({ sound: 'buzz', volume: 0.8 })
    if (door.cell === this.player.cell && this.clock.locked) this.methodHint = 'key'
    else if (!this.methodHint) this.methodHint = door.kind === 'gate' || door.kind === 'perimeter' ? 'key' : this.methodHint
    this.emit({ x: (door.tx + 0.5) * TILE, z: (door.ty + 0.5) * TILE, radius: 3, kind: 'clank' })
    if (key.id === 'masterKey') {
      if (inv.wear(key)) this.toast("The master key snaps in the lock after this turn. Old brass: the Governor never needed it this much.", 'bad')
      else if (key.durability === 1) this.toast('The master key is bending. One more turn, and that will be it.', 'bad')
      else this.toast(`The master key turns. It is soft old brass: ${key.durability} turns left in it.`, 'neutral')
    } else if (key.id !== 'guardKey' && inv.wear(key)) this.toast(`The ${ITEMS[key.id].name.toLowerCase()} snaps in the lock after this turn.`, 'bad')
  }

  private askGate(door: Door): void {
    const ok = this.doors.request(door, 'player', this.player.block, false, this.player.zone)
    if (ok) this.keyHold = { door, t: 2.5 }
    else {
      const g = this.guards.filter((gg) => gg.ko <= 0).sort((a, b) => a.distanceTo(this.player.body.x, this.player.body.z) - b.distanceTo(this.player.body.x, this.player.body.z))[0]
      g?.say(`Not now, ${this.player.name}. You're not on the movement list.`, 2.5)
      this.toast('Only officers can open gates. They only open them for wherever the regime sends you.', 'neutral')
    }
  }

  private attack(): void {
    if (this.punchTimer > 0) return
    const p = this.player
    const b = p.body
    if (p.inVent) return
    this.punchTimer = 0.55
    const weapon = p.inventory.weapon
    const fx = Math.sin(b.yaw)
    const fz = Math.cos(b.yaw)
    const inFront = (x: number, z: number) => {
      const dx = x - b.x
      const dz = z - b.z
      const d = Math.hypot(dx, dz)
      return d < 1.7 && (dx * fx + dz * fz) / Math.max(0.01, d) > 0.2
    }
    this.fightingFor = 2.5
    b.pose = 'fight'
    b.poseTime = 0
    this.emit({ x: b.x, z: b.z, radius: 12, kind: 'fight' })
    for (const g of this.guards) {
      if (g.ko > 0 || !inFront(g.x, g.z)) continue
      const sneak = !g.canSeePlayer() || g.busy
      g.hp -= weapon.damage * (sneak ? 2 : 1)
      if (g.hp <= 0) {
        g.ko = 30
        g.hp = 10
        g.wary = 1
        this.achieve('knockout')
        g.chasing = false
        this.toast(`${g.name} goes down${weapon.id ? ` (${ITEMS[weapon.id].name})` : ''}. Grab the keys (R) before anyone sees.`, 'good')
      } else {
        g.say('Assaulting an officer?!', 2)
        g.suspicion = 1
        g.chasing = true
        g.lastSeen = { x: b.x, z: b.z, t: 0 }
      }
      this.methodHint = this.methodHint ?? (this.riot.active ? 'riot' : 'gate')
      p.attempt = p.attempt ?? this.methodHint
      return
    }
    for (const pr of this.prisoners) {
      if (pr.ko > 0 || !inFront(pr.x, pr.z)) continue
      const down = pr.hit(weapon.damage, 'player')
      if (down) this.toast(`${pr.name} is out cold.`, 'neutral')
      this.lastFightByPlayer = 20
      return
    }
  }

  private lastFightByPlayer = 0

  private callSick(): void {
    const p = this.player
    if (!this.clock.locked && p.zone === p.cell) {
      this.shoutForOfficer()
      return
    }
    if (!this.clock.locked || p.zone !== p.cell) {
      this.toast('Fake sickness works at night, behind your door: press H to bang for the night officer.', 'neutral')
      return
    }
    if (this.sickCall) return
    if (this.memory.sickIgnored && p.frothing <= 0) {
      this.toast('You bang and groan. Nobody comes. They have heard it too many times.', 'bad')
      return
    }
    const block = p.block
    const responders = this.guards
      .filter((g) => g.ko <= 0 && (g.block === block || g.duty === 'central'))
      .sort((a, b) => (a.duty === 'landing' ? -1 : 0) - (b.duty === 'landing' ? -1 : 0))
      .slice(0, this.memory.sickResponders)
    if (!responders.length) return
    this.sickCall = { cell: p.cell, responders, stage: 'called', timer: 0 }
    this.methodHint = 'sick'
    this.toast(p.frothing > 0 ? 'You bang on the door, frothing. The night officer comes running.' : 'You bang on the door and clutch your stomach. Someone is coming.', 'neutral')
  }

  /**
   * By day, in your own cell: shout an officer in to look at a rat. He has a
   * good look round with his back half turned, which is your moment.
   */
  shoutForOfficer(): void {
    const p = this.player
    if (this.lure || this.sickCall || p.zone !== p.cell || this.clock.locked) return
    if (this.memory.lureIgnored) {
      this.toast('You shout yourself hoarse about a rat. Nobody comes. They have heard about you.', 'bad')
      return
    }
    const g = this.guards
      .filter((gg) => gg.ko <= 0 && !gg.chasing && !gg.busy && !gg.uniformTaken && !this.sickCall?.responders.includes(gg))
      .sort((a, b) => (a.block === p.block ? 0 : 1) - (b.block === p.block ? 0 : 1) || a.distanceTo(p.body.x, p.body.z) - b.distanceTo(p.body.x, p.body.z))[0]
    if (!g) {
      this.toast('You shout for an officer. Nobody is free.', 'neutral')
      return
    }
    this.lure = { cell: p.cell, guard: g, stage: 'called', timer: 0 }
    this.emit({ x: p.body.x, z: p.body.z, radius: 6, kind: 'shout' })
    this.toast(`You shout through the door: "Guv! There's a rat in here the size of a dog!" ${g.name} is on the way.`, 'neutral')
  }

  /** The officer in your cell eats what you gave him, or wakes up from it. */
  private updateLure(delta: number): void {
    const p = this.player
    if (this.lure && (this.lure.guard.ko > 0 || this.lure.guard.chasing)) {
      this.lure.guard.busy = false
      this.lure = null
    }
    const d = this.drugged
    if (d) {
      d.eatsIn -= delta
      if (d.eatsIn <= 0) {
        const g = d.guard
        this.drugged = null
        g.say('*yawns* I\'ll just... rest my eyes... for a...', 2.5)
        this.achieve('sausage')
        g.ko = 150
        g.hp = 10
        g.chasing = false
        g.busy = false
        if (this.lure?.guard === g) this.lure = null
        this.sleeper = g
        this.methodHint = 'lure'
        this.toast(`${g.name} slides down the wall, snoring. Out for hours. Take the uniform (E) and the keys (R).`, 'good')
      }
    }
    // Waking up in a vest and boxers: everyone hears about the stranger in uniform.
    const s = this.sleeper
    if (s && s.ko <= 0) {
      this.sleeper = null
      s.wary = 1
      if (s.uniformTaken) {
        s.say('Who\'s had my trousers?! And my KEYS?!', 3)
        if (p.disguise === 'guard' && !p.disguiseBlown && this.disguisedAs === s.name) {
          p.disguiseBlown = true
          this.toast(`${s.name} has woken up in your cell in a vest and pink boxers. Every officer now knows there is a stranger in a uniform.`, 'bad')
        }
      }
    }
  }

  // ---- Your cellmate ----

  /** Some cellmates are grasses: the prison decides when it is built. */
  get cellmateGrass(): boolean {
    return mulberry32(this.seed * 13 + 5)() < 0.4
  }

  /** A grass still talking: not paid off, and not won over. */
  private get mateTalking(): boolean {
    const m = this.cellmate
    return !!m && this.cellmateGrass && !this.mate.paidOff && m.trust < 0.6
  }

  /** On side, and awake: coughs when footsteps come while you dig. */
  private get mateLookout(): boolean {
    const m = this.cellmate
    return !!m && !this.cellmateGrass && m.trust >= 0.6 && m.ko <= 0
  }

  /** Lights out: a grass with something to tell decides whether to. */
  private mateNight(): void {
    const p = this.player
    const hiding = this.stash.length > 0 || this.tunnel.metres > 0 || p.inventory.items.some((i) => ITEMS[i.id].contraband)
    if (this.mateTalking && hiding && this.rng() < 0.5) this.mate.tipOff = true
  }

  /** Unlock: officers come straight to your cell, and a friend slips you a note. */
  private mateMorning(): void {
    const m = this.cellmate
    if (!m) return
    if (this.mate.tipOff) {
      this.mate.tipOff = false
      this.mate.tipOffs++
      this.toast('Two officers come straight to your cell at unlock. Somebody tipped them off.', 'bad')
      if (this.stash.length && this.rng() < 0.6) {
        this.stash.length = 0
        this.toast('They go straight to the loose brick. Your stash is gone.', 'bad')
      }
      if (this.tunnel.metres > 0 && this.rng() < 0.6) this.tunnelFound()
      const g = this.guards.filter((gg) => gg.ko <= 0 && gg.block === this.player.block).sort((a, b) => a.distanceTo(this.player.body.x, this.player.body.z) - b.distanceTo(this.player.body.x, this.player.body.z))[0]
      if (g) g.searchTarget = true
    }
    if (this.cellmateGrass && !this.mate.warned && (this.clock.day >= 3 || this.mate.tipOffs > 0)) {
      this.mate.warned = true
      this.toast(`A note pushed under your door: "${m.name} is a grass. Watch your stash. A friend."`, 'bad')
    }
  }

  private mateOptions(m: Prisoner): { label: string; enabled: boolean; run: () => void }[] {
    const inv = this.player.inventory
    const out: { label: string; enabled: boolean; run: () => void }[] = []
    if (this.mate.warned && !this.mate.paidOff) {
      out.push({
        label: '"Have you been grassing on me?"',
        enabled: true,
        run: () => {
          if (m.trust >= 0.6) {
            this.mate.paidOff = true
            this.ui.talk(m.name, 'Used to. They squeezed me: extra visits, a telly maybe. Not any more. You have been good to me.', [])
            return
          }
          this.ui.talk(m.name, 'Alright, alright. They squeeze me: extra visits, a telly maybe. Make it worth my while and my memory goes very bad.', [
            {
              label: 'Pay for their silence (2 Greggs vouchers)',
              enabled: inv.count('voucher') >= 2,
              run: () => {
                inv.remove('voucher')
                inv.remove('voucher')
                this.mate.paidOff = true
                m.trust = Math.max(m.trust, 0.65)
                this.ui.talk(m.name, "Saw nothing. Heard nothing. Can't even remember your name. What's your name?", [])
              },
            },
          ])
        },
      })
    }
    if (!this.cellmateGrass && !this.mate.gift && m.trust >= 0.7) {
      out.push({
        label: '"You alright?"',
        enabled: true,
        run: () => {
          this.mate.gift = true
          if (!inv.add('flatSpoon')) this.dynamic.spawnItem('flatSpoon', this.player.body.x + 0.5, this.player.body.z, this.player.zone)
          this.ui.talk(m.name, "Found this in the shower drain. For whatever you're doing at night. I never saw a thing. And I'll cough if anyone comes.", [])
        },
      })
    }
    return out
  }

  /** The last word on your cellmate, for the end screen. */
  private mateEpilogue(won: boolean): string {
    const m = this.cellmate
    if (!m) return ''
    if (this.cellmateGrass && !this.mate.paidOff) return `\n${m.name} was moved to an enhanced wing the next day, with a telly. Funny, that.`
    if (m.trust >= 0.7) return won ? `\n${m.name} told the morning count you were on the toilet, and bought you an extra hour.` : `\n${m.name} saved you a biscuit every day.`
    return ''
  }

  /** A first-day goal done. */
  goal(id: GoalId): void {
    if (!this.goals.shown) return
    if (this.goals.tick(id)) {
      this.toast('First day: done. You know your way around. Now find your way out.', 'good')
      this.achieve('settled')
    }
  }

  // ---- The tunnel under the loose tile ----

  /** The loose floor tile beside your bunk, in the open where you can see it. */
  private get tunnelSpot(): { x: number; z: number } {
    const cell = this.grid.cells.get(this.player.cell)!
    return { x: cell.rect.x0 * TILE + 1.85, z: ((cell.rect.y0 + cell.rect.y1 + 1) / 2) * TILE }
  }

  /** Metres a second for whatever you are digging with. */
  private get digTool(): { name: string; rate: number } | null {
    const inv = this.player.inventory
    if (inv.has('screwdriver')) return { name: 'screwdriver', rate: 1 / 9 }
    if (inv.has('flatSpoon')) return { name: 'flattened spoon', rate: 1 / 12 }
    if (inv.has('spoon')) return { name: 'spoon', rate: 1 / 16 }
    return null
  }

  private tunnelPrompts(add: (key: string, label: string, run: () => void) => void): void {
    const p = this.player
    const spot = this.tunnelSpot
    if (!this.clock.locked || p.inVent || Math.hypot(p.body.x - spot.x, p.body.z - spot.z) > 1.3) return
    if (this.memory.tunnelBlocked) {
      add('E', 'The loose tile (solid concrete under it now)', () => this.toast('They poured concrete under every cell floor. This way is closed for good.', 'bad'))
      return
    }
    const t = this.tunnel
    if (t.metres >= TUNNEL_LENGTH) add('E', 'Crawl out through the tunnel', () => this.finish(true, 'tunnel'))
    else if (this.digging) add('E', `Digging: ${t.metres.toFixed(1)} of ${TUNNEL_LENGTH} metres (step away to stop)`, () => this.stopDigging('You slide the tile back over the hole.'))
    else {
      const tool = this.digTool
      add('E', tool ? `Dig under the loose tile (${tool.name}): ${t.metres.toFixed(1)} of ${TUNNEL_LENGTH} metres` : 'A loose floor tile: you need something to dig with', () => this.startDigging())
    }
  }

  private startDigging(): void {
    const p = this.player
    const tool = this.digTool
    if (!tool) {
      this.toast('Under the loose tile is soft old clay. A spoon would do it, slowly. A screwdriver, less slowly.', 'neutral')
      return
    }
    const mate = this.cellmate
    if (mate && mate.ko <= 0 && mate.trust < TUNNEL_TRUST) {
      mate.say(pick2(this.rng, ["Not in my cell you don't. Not for free.", 'You dig a hole, I go down with you. Make it worth my while.']), 3)
      this.toast(`${mate.name} will grass on a tunnel unless they trust you. Greggs vouchers help.`, 'bad')
      return
    }
    if (p.inventory.full) {
      this.toast('Your pockets are full. Rubble has to go somewhere: get rid of it in the yard first.', 'bad')
      return
    }
    this.digging = { x: p.body.x, z: p.body.z, noise: 1, heard: 0, warned: 0 }
    this.toast(this.tunnel.metres === 0 ? 'You prise up the loose tile by your bunk and start on the clay underneath.' : `You lift the tile. ${this.tunnel.metres.toFixed(1)} metres so far.`, 'neutral')
  }

  private stopDigging(why: string): void {
    this.digging = null
    if (why) this.toast(why, 'neutral')
  }

  private updateTunnel(delta: number): void {
    const p = this.player
    const spot = this.tunnelSpot
    const d = this.digging
    this.dynamic.setTunnelHole(spot.x, spot.z, !!d && this.tunnel.metres > 0.05)
    if (!d) return
    if (!this.clock.locked || p.zone !== p.cell || p.inVent || Math.hypot(p.body.x - d.x, p.body.z - d.z) > 0.7) {
      this.stopDigging('You slide the tile back over the hole.')
      return
    }
    const tool = this.digTool
    if (!tool) return this.stopDigging('Nothing left to dig with.')
    p.body.pose = 'search'
    const before = Math.floor(this.tunnel.metres)
    this.tunnel.metres = Math.min(TUNNEL_LENGTH, this.tunnel.metres + delta * tool.rate)
    const after = Math.floor(this.tunnel.metres)
    if (after > before) {
      p.inventory.add('rubble')
      const milestone = TUNNEL_MILESTONES[after]
      if (milestone) this.toast(milestone, 'good')
      if (this.tunnel.metres >= TUNNEL_LENGTH) return this.stopDigging('')
      if (p.inventory.full) return this.stopDigging('Your pockets are bulging with rubble. Shake it out in the yard tomorrow.')
    }
    // Scraping carries. An officer near your door for long enough hears it.
    d.noise -= delta
    if (d.noise <= 0) {
      d.noise = 3
      this.emit({ x: p.body.x, z: p.body.z, radius: 4, kind: 'clank' })
    }
    // Night officers pass about ten metres off; one who stops long enough to
    // listen hears it. You get footsteps first, once each time one comes.
    const near = this.guards.filter((g) => g.ko <= 0 && Math.hypot(g.x - p.body.x, g.z - p.body.z) < 11.5)
    const close = this.guards.some((g) => g.ko <= 0 && Math.hypot(g.x - p.body.x, g.z - p.body.z) < 16)
    if (close && d.warned <= 0) {
      d.warned = 1
      this.toast(this.mateLookout ? `${this.cellmate!.name} coughs. Footsteps on the landing: step away from the hole until they pass.` : 'Footsteps on the landing. Step away from the hole until they pass.', 'bad')
    } else if (!close) d.warned = 0
    if (near.length) d.heard += delta
    else d.heard = Math.max(0, d.heard - delta * 0.5)
    // A cellmate on side covers the scraping with a coughing fit.
    if (d.heard > (this.mateLookout ? 6 : 4)) {
      const g = near[0]
      g.say(pick2(this.rng, ['What is that scraping? ...Right. Lights on. Stand AWAY from that floor.', "Are you DIGGING? In MY landing? With a SPOON?"]), 3)
      this.methodHint = 'tunnel'
      p.attempt = 'tunnel'
      this.digging = null
      this.caught(g)
    }
  }

  /** A search finds the hole under the loose tile. */
  tunnelFound(): void {
    if (this.tunnel.metres <= 0) return
    this.tunnel.metres = 0
    this.memory.used.tunnel++
    this.toast('They found the hole under the loose tile, and filled it with concrete. Back to the start.', 'bad')
  }

  private scatterRubble(): void {
    const inv = this.player.inventory
    const n = inv.count('rubble')
    for (let i = 0; i < n; i++) inv.remove('rubble')
    this.dodgyTimer = 2
    const seen = this.guards.find((g) => g.ko <= 0 && g.canSeePlayer() && g.distanceTo(this.player.body.x, this.player.body.z) < 7)
    if (seen) {
      seen.suspicion = Math.max(seen.suspicion, 0.6)
      seen.wary = Math.min(1, seen.wary + 0.15)
      this.toast(`You shake ${n} lot${n === 1 ? '' : 's'} of rubble out of your trouser legs. ${seen.name} is looking at the little piles round your feet.`, 'bad')
    } else this.toast(`You shake ${n} lot${n === 1 ? '' : 's'} of rubble out of your trouser legs and scuff it into the tarmac.`, 'good')
  }

  // ---- The Governor's safe ----

  /**
   * Four digits: his mother's birthday (in the desk diary) and the number on
   * his Jag's private plate (Keith sees it every day). A new combination
   * every time someone is caught at it.
   */
  get safeCode(): string {
    const r = mulberry32(this.seed * 31 + 7 + this.memory.used.safe * 7919)
    const day = 10 + Math.floor(r() * 19)
    const plate = 10 + Math.floor(r() * 90)
    return `${day}${plate}`
  }

  private safeHint(): string {
    const h = this.heist
    const code = this.safeCode
    if (h.knowA) return `A heavy old safe with a four-digit dial. You know it starts ${code.slice(0, 2)}. The rest? Something the Governor loves more than his mother.`
    if (h.knowB) return `A heavy old safe with a four-digit dial. You know it ends ${code.slice(2)}. The start must be on his desk somewhere.`
    return 'A heavy old safe with a four-digit dial. The Governor would pick numbers he cannot forget. Or a stethoscope from healthcare would let you hear the tumblers.'
  }

  private readDiary(): void {
    this.heist.knowA = true
    const day = this.safeCode.slice(0, 2)
    this.toast(`The desk diary: "Mother's birthday" circled on the ${day}th, underlined three times, with "SAFE?? NO, TOO OBVIOUS" crossed out next to it. That is the first half: ${day}.`, 'good')
  }

  private startCracking(): void {
    const b = this.player.body
    this.cracking = { t: 30, x: b.x, z: b.z, click: 4 }
    this.toast('Stethoscope to the door, dial in your fingers. Thirty seconds, and keep still: every click carries.', 'neutral')
  }

  private updateHeist(delta: number): void {
    const p = this.player
    if (p.zone === 'governor' && !this.methodHint) this.methodHint = 'safe'
    const c = this.cracking
    if (c) {
      if (Math.hypot(p.body.x - c.x, p.body.z - c.z) > 1 || p.zone !== 'governor') {
        this.cracking = null
        this.toast('You lose the count. Start again.', 'bad')
      } else {
        c.t -= delta
        c.click -= delta
        if (c.click <= 0) {
          c.click = 5
          this.emit({ x: p.body.x, z: p.body.z, radius: 7, kind: 'clank' })
        }
        if (c.t <= 0) {
          this.cracking = null
          this.openSafe()
        }
      }
    }
    // Once burned, an officer looks into the office every hour.
    const m = this.clock.minuteOfDay
    if (this.memory.used.safe >= 1 && Math.floor(m / 60) !== Math.floor((m - delta * 2) / 60)) {
      const office = this.grid.rooms.get('governor')!.rects[0]
      const spot = { x: ((office.x0 + office.x1) / 2) * TILE, z: (office.y1 - 0.5) * TILE }
      const g = this.guards.filter((gg) => gg.ko <= 0 && !gg.chasing && !gg.busy && !gg.investigate).sort((a, b) => a.distanceTo(spot.x, spot.z) - b.distanceTo(spot.x, spot.z))[0]
      if (g) g.investigate = { x: spot.x, z: spot.z, t: 12 }
    }
  }

  private openSafe(): void {
    const p = this.player
    const inv = p.inventory
    this.heist.opened = true
    this.achieve('safe')
    this.dodgyTimer = 5
    this.sounds.push({ sound: 'good', volume: 0.8 })
    const give = (id: ItemId) => {
      if (!inv.add(id)) this.dynamic.spawnItem(id, p.body.x + 0.5, p.body.z + 0.3, p.zone)
    }
    give('masterKey')
    give('jagKeys')
    for (let i = 0; i < 6; i++) give('voucher')
    this.toast("The door swings open. The Governor's master key (good for five turns), the keys to his Jag, and six Greggs vouchers in an envelope marked PETTY CASH (PASTRY).", 'good')
    // Your file: through the shredder, and the prison forgets one lesson.
    const last = this.memory.lessons.pop()
    if (last) {
      this.memory.used[last.method] = Math.max(0, this.memory.used[last.method] - 1)
      this.toast(`And a brown folder with your name on it. You feed it through the Governor's shredder. They have forgotten: ${last.text}`, 'good')
    } else this.toast('And a brown folder with your name on it, still thin. You shred it anyway, for the joy of it.', 'neutral')
  }

  /** "Fancy a sausage roll, guv?" */
  private offerRoll(g: Guard): void {
    const inv = this.player.inventory
    this.ui.closePanels()
    if (this.memory.foodRefused) {
      g.say("I'm not eating anything you've touched, Bandit. I've read the memo.", 3)
      return
    }
    if (inv.has('sleepyRoll')) {
      inv.remove('sleepyRoll')
      g.say(pick2(this.rng, ["Ooh, go on then. Don't tell the Governor.", 'Is that a Greggs? For me? You shouldn\'t have. Mmf.', 'Well, it would be rude not to.']), 2.5)
      this.drugged = { guard: g, eatsIn: 4 }
      if (this.lure) this.lure.timer = Math.max(this.lure.timer, 8)
      return
    }
    inv.remove('sausageRoll')
    g.say('Lovely. Right, I have rounds to do.', 2.5)
    if (this.lure?.guard === g) this.lure.timer = 0.5
  }

  private kickOff(): void {
    const p = this.player
    const supporters = this.prisoners.filter((pr) => pr.block === p.block && pr.supporter)
    const need = this.memory.riotSupportNeeded
    if (this.riot.active) return
    const firm = gangOfWing(p.block)
    if (!this.backingFirms(p.block).length) {
      const leader = this.gangLeader(firm)
      this.toast(`Nobody on this landing moves without ${GANGS[firm].name} saying so. Pay ${leader?.name ?? 'their boss'} first (${vouchers(this.memory.bribePrice(firm))}).`, 'bad')
      return
    }
    if (this.clock.locked) {
      if (p.zone !== p.cell) return
      if (supporters.length < need) {
        this.toast(`You shout through the hatch. ${supporters.length} answer. You need ${need}: pay another firm, or win over more of the landing with Greggs vouchers.`, 'bad')
        return
      }
      const landing = this.grid.rooms.get(`block${p.block}`)!.rects[0]
      this.riot = {
        active: true,
        night: true,
        block: p.block,
        x: ((landing.x0 + landing.x1) / 2 + 0.5) * TILE,
        z: (landing.y0 + 1.5) * TILE,
        timer: 55,
        byPlayer: true,
      }
      this.riotOpenTimer = 30
      this.methodHint = 'riot'
      this.toast('The landing goes up: doors banging, a mattress on fire. The officers are coming in to pull out ringleaders...', 'good')
      this.achieve('riot')
      return
    }
    // By day: your backers start swinging at whoever is nearest.
    const near = supporters.filter((pr) => pr.distanceTo(p.body.x, p.body.z) < 14 && pr.ko <= 0)
    if (near.length < Math.ceil(need / 2)) {
      this.toast(`Nobody near enough backs you (${near.length}/${Math.ceil(need / 2)}).`, 'bad')
      return
    }
    for (const s of near) {
      const target = this.prisoners.find((o) => !o.supporter && o.ko <= 0 && o.distanceTo(s.x, s.z) < 10)
      if (target) {
        s.fighting = true
        s.fightTarget = target
        target.fighting = true
        target.fightTarget = s
      }
    }
    this.lastFightByPlayer = 20
    this.toast('"Kick off!" Your lot pile in.', 'good')
    this.achieve('riot')
  }

  private trySleep(): void {
    const p = this.player
    if (!this.clock.locked || p.zone !== p.cell) {
      this.toast('You can only sleep in your cell after lights out.', 'neutral')
      return
    }
    this.sleeping = true
    this.seated = null
    const cell = this.grid.cells.get(p.cell)!
    p.body.x = cell.bunks[0].x
    p.body.z = cell.bunks[0].z + 1.1
    p.body.pose = 'sleep'
    p.body.y = 1.72
    p.body.yaw = 0
    this.toast('You sleep. (Move to wake.)', 'neutral')
  }

  private work(): void {
    if (this.workTimer > this.clock.minutes) {
      this.toast('You have done a shift already. Come back later.', 'neutral')
      return
    }
    this.workTimer = this.clock.minutes + 90
    if (this.player.inventory.add('voucher')) this.toast('Folded sheets for an hour and a half. Paid in a Greggs voucher.', 'good')
    this.clock.minutes += 30
  }

  private raiseFlag(): void {
    this.player.inventory.remove('flag')
    this.flagUp = true
    this.signalTonight = true
    this.dodgyTimer = 6
    this.toast('The flag goes up. Out on the road, someone will have seen it. They will come tonight.', 'good')
    const seen = this.guards.find((g) => g.canSeePlayer())
    if (seen) {
      seen.say("Who put that up there?", 2.5)
      seen.suspicion = Math.max(seen.suspicion, 0.6)
      seen.searchTarget = true
    }
  }

  private flashTorch(): void {
    this.signalTonight = true
    this.carArrivesAt = this.clock.minutes + 40
    this.toast('Three long flashes from the window. Far off, headlights blink twice. They are coming.', 'good')
  }

  private startClimb(tx: number): void {
    this.climb = { t: 3.5, tx }
    this.methodHint = 'wall'
    this.player.body.pose = 'wave'
    this.player.body.yaw = 0
    this.emit({ x: this.player.body.x, z: this.player.body.z, radius: 8, kind: 'clank' })
    this.toast('The hook catches. You climb...', 'neutral')
  }

  private updateClimb(delta: number): void {
    const c = this.climb!
    c.t -= delta
    this.player.body.y = Math.min(4.6, (3.5 - c.t) * 1.4)
    this.updateIllegal()
    if (c.t <= 0) {
      this.climb = null
      this.player.inventory.remove('grapple')
      this.placePlayer((c.tx + 0.5) * TILE, 60.7 * TILE)
      this.player.zone = 'outside'
      this.toast('Over the wall! Now get to the road.', 'good')
    }
  }

  private usePhone(): void {
    this.player.body.pose = 'phone'
    this.ui.phone((message) => {
      const result = screenCall(message, this.memory.phoneStrictness)
      if (result.ok) {
        this.contactNights = 3
        this.toast('Contact made. A car will wait on the road outside the wall the next three nights.', 'good')
      } else if (result.flagged) {
        this.memory.phoneFlags++
        this.toast(`The duty officer was listening: "${result.flagged}" got the call cut. They will listen harder now.`, 'bad')
        const g = this.guards.filter((gg) => gg.ko <= 0).sort((a, b) => a.distanceTo(this.player.body.x, this.player.body.z) - b.distanceTo(this.player.body.x, this.player.body.z))[0]
        if (g) g.searchTarget = true
      }
      return result.reply
    })
  }

  private talkToGuard(g: Guard): void {
    g.stop()
    this.converse(g.body)
    const offer = this.missions.hasOffer(g)
    const lines =
      g.wary > 0.6
        ? ["I've got my eye on you. Both of them. This one's glass.", "Don't even think about it. I can see you thinking. Your lips move.", 'Move along before I find a reason.']
        : offer
          ? ["Ah. You. Just the person. Keep your voice down.", "Psst. Over here. No, act natural. NATURAL.", "You look like someone who can keep their mouth shut. Can you? Good."]
          : ["Ah, the Greggs Bandit. I've got my eye on you. And on my lunch.", 'What do you want? If it is the telly remote, the answer is no.', 'Keep your nose clean and we will get along famously.', "Not now, I'm on my break. I'm always on my break.", 'Lovely weather for it. Not that you would know.', "If you're after the toilet roll, there is none. There's never any."]
    const line = lines[Math.floor(this.rng() * lines.length)]
    const options = this.missions.options(g)
    // Mr Crumpet's sweet tooth.
    if (g.trait === 'biscuits' && !g.blindEye) {
      const inv = this.player.inventory
      options.unshift({
        label: '"Custard cream, guv? Whole packet."',
        enabled: inv.has('biscuits'),
        run: () => {
          inv.remove('biscuits')
          g.blindEye = true
          this.ui.talk(g.name, "Well. I never say no to a custard cream. And I never see anything with my mouth full. Funny, that.", [])
          this.toast(`${g.name} will look the other way, once.`, 'good')
        },
      })
    }
    if (this.lure?.guard === g && this.lure.stage === 'inside') {
      const inv = this.player.inventory
      options.unshift({ label: '"Fancy a sausage roll, guv?"', enabled: inv.has('sleepyRoll') || inv.has('sausageRoll'), run: () => this.offerRoll(g) })
    }
    this.ui.talk(g.name, line, options)
  }

  talkTo(pr: Prisoner): void {
    pr.stop()
    this.converse(pr.body)
    if (pr.isCellmate) this.goal('cellmate')
    if (pr.sells.length) this.goal('fixer')
    const inv = this.player.inventory
    const options: { label: string; enabled: boolean; run: () => void }[] = []
    const refresh = () => this.talkTo(pr)
    options.push({
      label: 'Give a Greggs voucher',
      enabled: inv.has('voucher'),
      run: () => {
        inv.remove('voucher')
        pr.trust = Math.min(1, pr.trust + (pr.gang ? 0.12 : 0.22))
        pr.grudge = Math.max(0, pr.grudge - 0.2)
        if (pr.gang) this.memory.annoy(pr.gang, -0.05)
        pr.say('Cheers.', 1.5)
        refresh()
      },
    })
    for (const item of pr.sells) {
      // Pills only for people the fixer knows: a voucher or two as a gift first.
      const wary = item === 'sleepingPills' && pr.trust < PILLS_TRUST
      options.push({
        label: wary ? `Buy ${ITEMS[item].name} (they do not know you well enough yet)` : `Buy ${ITEMS[item].name} (2 Greggs vouchers)`,
        enabled: !wary && inv.count('voucher') >= 2 && !inv.full,
        run: () => {
          inv.remove('voucher')
          inv.remove('voucher')
          inv.add(item)
          pr.trust = Math.min(1, pr.trust + 0.05)
          this.toast(`Bought: ${ITEMS[item].name}.`, 'good')
          refresh()
        },
      })
    }
    if (pr.gang && pr.leader) {
      const gang = pr.gang
      const def = GANGS[gang]
      const price = this.memory.bribePrice(gang)
      const state = this.memory.gangs[gang]
      const backing = this.memory.backing(gang, this.clock.minutes)
      options.push({
        label: backing ? `${def.name} are already with you` : `Pay ${def.name} to back a riot (${vouchers(price)})`,
        enabled: !backing && inv.count('voucher') >= price,
        run: () => {
          if (state.hostility >= 0.7) {
            this.ui.talk(pr.name, `After what you have done to my lads? Not for all the sausage rolls in Grim-on-the-Moor.`, [])
            return
          }
          for (let i = 0; i < price; i++) inv.remove('voucher')
          this.memory.pay(gang, this.clock.minutes)
          this.toast(`${def.name} will back you for two days. ${GANGS[def.rival].name} will hear about it.`, 'good')
          this.ui.talk(pr.name, `Pleasure doing business. Give the word (G) on ${def.wing} wing and my lads go up. You have two days.`, [])
        },
      })
      // The feud with their rivals: fan it, or calm it.
      const rival = GANGS[def.rival]
      const feud = this.feuds.of(gang)
      const truce = feud.truceUntil > this.clock.minutes
      options.push({
        label: `"${rival.name} are planning something, you know."`,
        enabled: feud.brawlAt < 0,
        run: () => {
          this.ui.talk(pr.name, this.feuds.stir(gang), [])
          this.achieve('stir')
        },
      })
      options.push({
        label: truce ? `A truce with ${rival.name} holds` : `Broker a truce with ${rival.name} (3 Greggs vouchers)`,
        enabled: !truce && inv.count('voucher') >= 3,
        run: () => {
          for (let i = 0; i < 3; i++) inv.remove('voucher')
          this.feuds.truce(gang)
          this.achieve('peace')
          this.ui.talk(pr.name, `Three days. Not a minute more. And tell ${rival.name} it was their idea.`, [])
          this.toast(`A truce between ${def.name} and ${rival.name} for three days. Both think a bit better of you.`, 'good')
        },
      })
    } else {
      options.push({
        label: 'Will you back me when it kicks off?',
        enabled: true,
        run: () => {
          const yes = pr.supporter
          let line: string
          if (pr.gang) {
            const leader = this.gangLeader(pr.gang)
            line = yes ? `${leader?.name ?? 'The boss'} says we are on. Give the word.` : `Not my call. Talk to ${leader?.name ?? 'the boss'} on ${GANGS[pr.gang].wing} wing.`
          } else line = yes ? "I've got your back. Say the word (G) and I'm in." : pr.temperament === 'snitch' ? 'Sorry mate, not my thing.' : 'Do I look like your mate? Make it worth my while.'
          this.ui.talk(pr.name, line, [])
        },
      })
    }
    options.push({ label: 'Ask about the firms', enabled: true, run: () => this.ui.talk(pr.name, this.firmsGossip(), []) })
    options.unshift(...this.missions.options(pr))
    options.push({ label: 'Ask what they have heard', enabled: true, run: () => this.ui.talk(pr.name, this.gossip(pr), []) })
    if (pr.isCellmate) options.push({ label: 'Ask about the cell', enabled: true, run: () => this.ui.talk(pr.name, cellmateTip(this.memory.round), []) })
    if (pr.isCellmate) options.push(...this.mateOptions(pr))
    const greeting =
      pr.grudge > 0.5
        ? pick2(this.rng, ['What do YOU want?', 'Oh, it is you. Marvellous. Smashing. Go away.'])
        : pr.gang
          ? pr.leader
            ? `You know who I am. ${GANGS[pr.gang].name} run ${GANGS[pr.gang].wing} wing.`
            : pick2(this.rng, ['You lost?', 'You look like you want something. Everyone wants something.'])
          : pr.temperament === 'fixer'
            ? pick2(this.rng, ['Looking for something? I can get things. Not Freddos. Never ask me for Freddos.', "Psst. Batteries, wire, a lighter, a screwdriver. Cash or Greggs vouchers. Mostly vouchers. Only vouchers."])
            : pr.isCellmate
              ? `Alright, ${this.player.name}.`
              : pick2(this.rng, ['Oi oi, it\'s the Greggs Bandit!', 'Is it true you nicked a festive bake? In OCTOBER? Respect.', 'My cousin works in that Greggs. She has nightmares.', 'Alright?', 'Y\'alright, our kid?', 'Wotcha.', 'Ey up.', 'Alright, chief? Kettle on?', 'Do I know you? I feel like I know you. Did you do my mum\'s guttering?'])
    const firm = pr.gang ? `, ${pr.leader ? 'boss of ' : ''}${GANGS[pr.gang].name}` : ''
    const trust = `${firm}${pr.supporter ? ' (backs you)' : pr.grudge > 0.5 ? ' (holds a grudge)' : ''}`
    this.ui.talk(`${pr.name}${trust}`, greeting, options)
  }

  private gossip(pr: Prisoner): string {
    const lessons = this.memory.lessons
    if (lessons.length && this.rng() < 0.7) {
      const l = lessons[Math.floor(this.rng() * lessons.length)]
      return `Word is ${l.text.charAt(0).toLowerCase()}${l.text.slice(1)} All since your little stunt.`
    }
    const tips = [
      "The screws carry the keys on their belts. Get behind one while he's arguing about the footy.",
      "Toothpaste in the strike plate sets like concrete. Door looks locked. It isn't. Whitening AND escaping.",
      'Bang on your door at night like you are dying and they have to take you to healthcare. Make it a good groan. They score you.',
      'Proper kick-off on the landing and every screw in the place comes running. Doors get left open. Kettles get left on.',
      'Phones are taped. Never say when. Never say how. Talk about your nan. Everybody talks about their nan.',
      'Lads used to run a red rag up the yard flagpole for their people on the road. Like semaphore, but dodgier.',
      "Maintenance has every tool you could want. Shame it's behind a red door. Shame about a lot of things.",
      'The vents run over everything except the cells. Except some cells... I have said too much. I always say too much.',
      'Two sheets knotted make a rope. Bend a fork and tape it on and it is a hook. Blue Peter taught me that. Sort of.',
      'Soap takes a key impression lovely. Melt a fork into it with a lighter. Do not do it in the canteen. Ask me how I know.',
      'Chew soap before you fake it. Froth sells it. Tastes like a disappointing Tuesday.',
      'Officers get bored. Bored officers want favours. Do one and they might not see you. Once.',
      "Never trust a man who says 'with all due respect'. Or a man in maroon. Or the fish pie.",
    ]
    if (pr.gang) return this.memory.gangs[pr.gang].hostility > 0.4 ? 'Every time you mess about, the screws come down on all of us. Keep it up.' : 'Mind your own.'
    return tips[Math.floor(this.rng() * tips.length)]
  }

  private firmsGossip(): string {
    const lines = GANG_IDS.map((g) => {
      const def = GANGS[g]
      const leader = this.gangLeader(g)
      return `${def.name} run ${def.wing} wing, ${leader?.name ?? 'nobody'} in charge. ${def.blurb}`
    })
    return `${lines.join(' ')} Nobody kicks off without the firm that runs the landing. Pay the boss, and mind who you pay: the Firm and the Crows hate each other, and so do the Lions and the Mob.`
  }

  openStash(): void {
    const inv = this.player.inventory
    const options = [
      ...inv.items.map((it) => ({
        label: `Hide ${ITEMS[it.id].name}`,
        enabled: this.stash.length < 4,
        run: () => {
          this.stash.push(it.id)
          inv.remove(it.id)
          this.openStash()
        },
      })),
      ...this.stash.map((id, i) => ({
        label: `Take ${ITEMS[id].name}`,
        enabled: !inv.full,
        run: () => {
          this.stash.splice(i, 1)
          inv.add(id)
          this.openStash()
        },
      })),
    ]
    this.ui.talk('Loose brick behind the table', 'Four slots. Officers search cells after an attempt; they do not always find it.', options)
  }

  // ---- Post and the notes on your bunk ----

  /** Day one's post, handed over once you have a name. */
  // ------------------------------------------------------------------
  // Saving (see Save.ts)

  /** Only when things are quiet: never mid-escape, mid-chase or mid-chat. */
  get canSave(): boolean {
    const p = this.player
    return (
      !this.over && this.mode !== 'hardcore' && p.illegal === 0 && !p.attempt && !p.inVent && !p.inBasket && !p.escortedBy && !this.talkingTo &&
      !this.riot.active && !this.sickCall && !this.lure && !this.drugged && !this.climb && !this.alarm.active &&
      !this.business && !this.cracking && !this.digging && !this.guards.some((g) => g.chasing)
    )
  }

  toSave() {
    const p = this.player
    return {
      name: p.name,
      hard: this.hard,
      mode: this.mode,
      minutes: this.clock.minutes,
      player: {
        x: p.body.x, z: p.body.z, zone: p.zone, health: p.health,
        items: p.inventory.items.map((i) => ({ ...i })),
        disguise: p.disguise, disguiseBlown: p.disguiseBlown, sneaking: p.sneaking,
      },
      stash: [...this.stash],
      memory: JSON.parse(JSON.stringify(this.memory)) as Record<string, unknown>,
      contactNights: this.contactNights,
      signalTonight: this.signalTonight,
      flagUp: this.flagUp,
      carArrivesAt: this.carArrivesAt,
      keith: { bribedDay: this.keith.bribedDay, name: this.keith.name },
      chaplain: { stage: this.chaplain.stage, alibi: this.chaplain.alibi },
      guards: this.guards.map((g) => ({ wary: g.wary, hasKeys: g.hasKeys, uniformTaken: g.uniformTaken })),
      prisoners: this.prisoners.map((pr) => ({ trust: pr.trust, grudge: pr.grudge, reportsMade: pr.reportsMade })),
      stolenFrom: this.stolenFrom ? this.guards.indexOf(this.stolenFrom) : -1,
      disguisedAs: this.disguisedAs,
      items: this.dynamic.items.map((i) => ({ id: i.id, x: i.x, z: i.z, zone: i.zone })),
      grates: this.grates.map((g) => ({ id: g.id, open: g.open, sealed: g.sealed })),
      jammed: this.grid.doors.flatMap((d, i) => (d.jammed ? [i] : [])),
      messes: [...this.messes],
      toiletIncidents: this.toiletIncidents,
      missions: this.missions.toSave(),
      events: this.events.toSave(),
      feuds: this.feuds.toSave(),
      secret: this.secret ? { id: this.secret.id, state: this.secret.toSave() } : null,
      routes: this.routes.toSave(),
      heist: { ...this.heist },
      tunnel: { ...this.tunnel },
      goals: this.goals.toSave(),
      daily: this.daily,
      mate: { ...this.mate },
      override: this.clock.override,
      post: this.post.toSave(),
      log: [...this.log],
      playSeconds: this.playSeconds,
    }
  }

  /** Puts a saved game back on top of a freshly built prison from the same seed. */
  fromSave(s: ReturnType<Game['toSave']>): void {
    const p = this.player
    p.name = s.name
    this.mode = s.mode ?? (s.hard ? 'hard' : 'normal')
    this.clock.minutes = s.minutes
    this.lastPeriod = this.clock.period
    this.lastMinute = this.clock.minuteOfDay
    this.placePlayer(s.player.x, s.player.z)
    p.zone = s.player.zone
    p.health = s.player.health
    p.inventory.items.splice(0, p.inventory.items.length, ...s.player.items)
    p.disguise = s.player.disguise
    p.disguiseBlown = s.player.disguiseBlown
    p.sneaking = s.player.sneaking
    this.applyLook()
    this.stash.splice(0, this.stash.length, ...s.stash)
    Object.assign(this.memory, s.memory)
    // Saves from before a route existed: it has never been used.
    for (const k of Object.keys(METHOD_NAMES) as Method[]) this.memory.used[k] ??= 0
    this.contactNights = s.contactNights
    this.signalTonight = s.signalTonight
    this.flagUp = s.flagUp
    this.carArrivesAt = s.carArrivesAt
    this.keith.bribedDay = s.keith.bribedDay
    this.keith.name = s.keith.name
    this.chaplain.stage = s.chaplain.stage
    this.chaplain.alibi = s.chaplain.alibi
    s.guards.forEach((o, i) => {
      const g = this.guards[i]
      if (!g) return
      g.wary = o.wary
      g.hasKeys = o.hasKeys
      if (o.uniformTaken) this.dressGuard(g, false)
    })
    s.prisoners.forEach((o, i) => {
      const pr = this.prisoners[i]
      if (!pr) return
      pr.trust = o.trust
      pr.grudge = o.grudge
      pr.reportsMade = o.reportsMade
    })
    this.stolenFrom = this.guards[s.stolenFrom] ?? null
    this.disguisedAs = s.disguisedAs
    for (const item of [...this.dynamic.items]) this.dynamic.removeItem(item)
    for (const i of s.items) this.dynamic.spawnItem(i.id, i.x, i.z, i.zone)
    for (const o of s.grates) {
      const g = this.grates.find((gr) => gr.id === o.id)
      if (g) Object.assign(g, { open: o.open, sealed: o.sealed })
    }
    for (const i of s.jammed) if (this.grid.doors[i]) this.grid.doors[i].jammed = true
    this.messes.clear()
    for (const [k, v] of s.messes) {
      this.messes.set(k, v)
      const seat = this.grid.seats.find((st) => st.toilet === k)
      if (!seat) continue
      if (v.floor) this.dynamic.dropFloorMess(`${k}:floor`, seat.x + Math.sin(seat.yaw) * 0.45, seat.z + Math.cos(seat.yaw) * 0.45, 0.02)
      else this.dynamic.setToiletMess(k, seat.x, seat.z, true)
    }
    this.toiletIncidents = s.toiletIncidents
    this.missions.fromSave(s.missions)
    this.events.fromSave(s.events)
    this.feuds.fromSave(s.feuds)
    this.routes.fromSave(s.routes)
    if (s.secret) {
      this.secret = makeSecret(s.secret.id, this)
      this.secret.fromSave(s.secret.state)
    } else {
      // Saves from when the play was the only secret.
      const old = (s as { play?: Record<string, unknown> | null }).play
      if (old) {
        this.secret = new Play(this)
        this.secret.fromSave(old)
      }
    }
    if (s.heist) Object.assign(this.heist, s.heist)
    if (s.tunnel) Object.assign(this.tunnel, s.tunnel)
    this.goals.fromSave(s.goals)
    this.daily = s.daily ?? null
    if (s.mate) Object.assign(this.mate, s.mate)
    this.clock.override = s.override ?? null
    this.post.fromSave(s.post)
    this.log.splice(0, this.log.length, ...s.log)
    this.playSeconds = s.playSeconds ?? 0
    const cell = this.grid.cells.get(p.cell)!
    this.dynamic.setBunkNote(cell.bunks[0].x + 0.1, cell.bunks[0].z + 0.4, !!this.post.waiting)
  }

  startSentence(): void {
    this.deliverPost()
  }

  private deliverPost(): void {
    const arrived = this.post.deliver(this.clock.day, this.player.name)
    if (arrived.length) {
      this.toast(`Post: ${arrived.length === 1 ? `a letter from ${arrived[0].from}` : `${arrived.length} letters`}. Read it in your notebook (J, then Post).`, 'good')
      this.sounds.push({ sound: 'good', volume: 0.5 })
    }
  }

  /** Opens a letter: anything the censor missed goes in your pockets. */
  readLetter(letter: Letter): void {
    if (letter.read) return
    letter.read = true
    if (letter.gift) {
      for (let i = 0; i < letter.gift.count; i++) {
        if (!this.player.inventory.add(letter.gift.item)) this.dynamic.spawnItem(letter.gift.item, this.player.body.x, this.player.body.z + 0.6, this.player.zone)
      }
      this.toast(letter.gift.line, 'good')
    }
  }

  /**
   * Someone slips a note onto your bunk while you are out: once a day, after
   * unlock, never while you are in. When you come back it is waiting.
   */
  private updateBunkNote(wasInCell: boolean): void {
    const p = this.player
    const cell = this.grid.cells.get(p.cell)!
    if (p.zone !== p.cell && !this.clock.locked && this.clock.minuteOfDay > 9 * 60) this.post.leaveNote(this.clock.day)
    if (!wasInCell && p.zone === p.cell && this.post.waiting && !this.noteAnnounced) {
      this.noteAnnounced = true
      this.toast('Somebody has been in. There is a note on your bunk.', 'neutral')
    }
    if (!this.post.waiting) this.noteAnnounced = false
    this.dynamic.setBunkNote(cell.bunks[0].x + 0.1, cell.bunks[0].z + 0.4, !!this.post.waiting)
  }

  private noteAnnounced = false

  private readBunkNote(): void {
    const note = this.post.pickUp()
    if (note) this.ui.showNote(note)
  }

  // ---- Silly ways out ----

  /** Visiting runs from half two to quarter to four, on visiting days. */
  get visitingTime(): boolean {
    const m = this.clock.minuteOfDay
    return isVisitingDay(this.clock.weekday) && m >= 14 * 60 + 30 && m < 15 * 60 + 45
  }

  get todayEvent(): DayEvent {
    return this.events.today
  }

  get weather(): Weather {
    return this.events.weather
  }

  /** December: snow, a tree in the canteen, the panto on Saturdays. Set by the page. */
  season: 'none' | 'christmas' = 'none'

  /** The daily challenge, when that is what this is. */
  daily: DailyGoal | null = null

  private toggleDisguise(kind: 'guard' | 'visitor'): void {
    const p = this.player
    if (p.disguise === kind) {
      p.disguise = null
      p.disguiseBlown = false
      this.applyLook()
      this.toast('You change back into your prison greys.', 'neutral')
      return
    }
    p.disguise = kind
    p.disguiseBlown = false
    for (const g of this.guards) g.recognise = 0
    this.applyLook()
    this.dodgyTimer = 3
    this.toast(
      kind === 'guard'
        ? "You are now an officer. Walk like you are on overtime: doors open for you. Don't let anyone get a long look at your face."
        : 'You are now a visitor. Stunning. Get to the visiting hall and leave with the others when visiting ends at 15:30.',
      'good',
    )
  }

  /** Puts the player's body in whatever they are wearing. */
  private applyLook(): void {
    const p = this.player
    const b = p.body
    const own = this.ownLook
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
    this.crowd?.paint(0, b)
  }

  /** Clothes confiscated or lost: the disguise goes with them. */
  private updateDisguise(delta: number): void {
    const p = this.player
    if (p.disguise) {
      const item = p.disguise === 'guard' ? 'guardUniform' : 'visitorDisguise'
      if (!p.inventory.has(item)) {
        p.disguise = null
        p.disguiseBlown = false
        this.applyLook()
      }
    }
    // The lads have opinions about your outfit.
    this.commentTimer -= delta
    if (p.disguise && this.commentTimer <= 0) {
      this.commentTimer = 4
      const near = this.prisoners.find((pr) => pr.ko <= 0 && pr.distanceTo(p.body.x, p.body.z) < 4)
      if (near && this.rng() < 0.5) {
        near.say(
          p.disguise === 'guard'
            ? pick2(this.rng, ['Evening, officer... hang on.', "Since when do they let screws wear trainers?", 'Is that you? It is, isn\'t it. Say nothing. Say NOTHING.'])
            : pick2(this.rng, ['Nice frock.', 'Alright, darling? ...Oh no.', 'Is that the panto wig? Bold.', "You've got lovely ankles, I'll give you that."]),
          2.5,
        )
      }
    }
  }

  private takeUniform(g: Guard): void {
    if (this.player.inventory.full) {
      this.toast('No room in your pockets for a whole uniform.', 'bad')
      return
    }
    this.player.inventory.add('guardUniform')
    this.disguisedAs = g.name
    this.achieve('dressed')
    this.dressGuard(g, false)
    this.dodgyTimer = 4
    this.toast(`You strip ${g.name} to his vest and a pair of pink boxers. Dignity: confiscated. Wear the uniform from your pockets (Tab).`, 'good')
  }

  /** Strip an officer to vest and boxers, or dress him again at unlock. */
  private dressGuard(g: Guard, dressed: boolean): void {
    g.uniformTaken = !dressed
    g.wary = dressed ? g.wary : 1
    const b = g.body
    b.top = dressed ? HEX.guardShirt : 0xf6f6f6
    b.trousers = dressed ? HEX.guardTrousers : HEX.boa
    b.cap = dressed
    b.uniform = dressed
    this.crowd.paint(this.bodies.indexOf(b), b)
    if (dressed) g.say('Right. New uniform. Nobody mention the boxers.', 3)
  }

  private sillyPrompts(add: (key: string, label: string, run: () => void) => void): void {
    const p = this.player
    const b = p.body
    const f = this.fixtures
    const m = this.clock.minuteOfDay
    const near = (pt: { x: number; z: number }, r: number) => Math.hypot(b.x - pt.x, b.z - pt.z) < r
    for (const g of this.guards) {
      if (g.ko > 0 && !g.uniformTaken && !p.inventory.has('guardUniform') && near(g.body, 1.8)) {
        add('E', `Nick ${g.name}'s uniform`, () => this.takeUniform(g))
        break
      }
    }
    if (p.zone === 'changing' && near(f.staffExit, 3.5)) {
      const keys = p.inventory.withUse('openDoor')
      if (p.disguise === 'guard' && !p.disguiseBlown && keys && keys.id !== 'lockpick') {
        // In uniform with keys: let yourself out, any time, like you own the place.
        add('E', 'Let yourself out of the staff door', () => this.finish(true, 'staffDoor'))
      } else if (p.disguise === 'guard' && !p.disguiseBlown) {
        const shift = m >= 20 * 60 + 45 && m < 21 * 60 + 20
        add('E', shift ? 'Clock off with the day shift' : 'Staff door (locked: keys, or wait for shift change, 20:45 to 21:20)', () => {
          if (shift) this.sillyExit('guardDisguise')
        })
      } else if (!keys || keys.id === 'lockpick') add('E', 'Staff door: officers only', () => this.toast('Only staff leave this way. You would need to look like one, and have keys or wait for shift change.', 'neutral'))
      // With a key and no uniform, the door's own unlock prompt takes it from here.
    }
    // The Governor's office: the desk diary and the safe.
    if (p.zone === 'governor') {
      const h = this.heist
      if (!h.knowA && near(f.govDesk, 1.6)) add('E', "Read the Governor's desk diary", () => this.readDiary())
      if (near(f.safe, 1.6)) {
        if (h.opened) add('E', "The Governor's safe (open, and empty)", () => this.toast('Nothing left but a smell of cigars and a Greggs receipt.', 'neutral'))
        else if (this.cracking) add('E', `Cracking the safe by ear: ${Math.ceil(this.cracking.t)}s, keep still`, () => {})
        else if (h.knowA && h.knowB) add('E', `Open the safe (${this.safeCode})`, () => this.openSafe())
        else if (p.inventory.has('stethoscope')) add('E', 'Crack the safe by ear (stethoscope)', () => this.startCracking())
        else add('E', "The Governor's safe", () => this.toast(this.safeHint(), 'neutral'))
      }
    }
    if (p.zone === 'chapel' && near(f.costumeBox, 1.8)) {
      if (this.chaplain.stage === 'done' && !(p.inventory.has('wig') && p.inventory.has('dress')) && !p.inventory.has('visitorDisguise')) {
        add('E', 'Rummage in the panto box (the Reverend lent you the key)', () => {
          const inv = p.inventory
          for (const id of ['wig', 'dress'] as ItemId[]) if (!inv.has(id) && !inv.add(id)) this.dynamic.spawnItem(id, b.x + 0.5, b.z, p.zone)
          this.toast('A panto wig, a floral frock and a smell of 2009. Put them together in your pockets (Tab) for a visitor disguise.', 'good')
        })
      } else if (this.chaplain.stage !== 'done') add('E', 'The panto box (padlocked)', () => this.toast('The panto box is padlocked, and the Reverend wears the key on a string round his neck. Do him a favour and he might lend it.', 'neutral'))
    }
    if (p.zone === 'visits' && this.events.nanHere) add('E', 'Sit with your nan', () => this.events.sitWithNan())
    if (p.zone === 'visits' && near(f.visitorsGate, 4)) {
      if (p.disguise === 'visitor' && !p.disguiseBlown) {
        const visitDay = isVisitingDay(this.clock.weekday)
        const out = visitDay && m >= 15 * 60 + 25 && m < 15 * 60 + 45
        add('E', out ? 'Shuffle out with the visitors' : visitDay ? "Visitors' gate (visitors leave at 15:30)" : "Visitors' gate (no visits today: Tuesdays, Thursdays and weekends)", () => {
          if (out) this.sillyExit('visitorDisguise')
        })
      }
    }
    if (p.zone === 'laundry' && near(f.laundryBasket, 2)) {
      const before = this.clock.period === 'work' && m < 11 * 60
      add('E', before ? 'Climb into the laundry basket (the van leaves at 11:00)' : 'Laundry basket (the van takes them at 11:00 during work)', () => {
        if (!before) return
        p.inBasket = true
        this.methodHint = 'laundry'
        const paid = this.keith.bribedDay === this.clock.day
        this.toast(
          paid
            ? `You burrow under a pile of damp towels. Somebody's sock is in your ear. ${this.keith.name} has been paid. Now wait for the van.`
            : `You burrow under the towels... but every basket goes through ${this.keith.name}'s X-ray on the way out, and nobody has bought him off. Climb out (E) unless you fancy your chances.`,
          paid ? 'neutral' : 'bad',
        )
      })
    }
    if (near(this.keith.body, 1.9) && this.keith.body.visible) add('E', `Talk to ${this.keith.name} (X-ray, hi-vis, mug)`, () => this.talkToKeith())
    const gov = this.governor
    if (near(gov.body, 2.0) && gov.body.visible && p.illegal === 0) add('E', 'Talk to the Governor', () => this.talkToGovernor())
    const rev = this.chaplain
    if (near(rev.body, 2.0) && rev.body.visible) {
      const hint = rev.stage === 'none' ? ' (has a job)' : rev.stage === 'hunting' && this.player.inventory.count('hymnBook') >= 3 ? ' (hand in the hymn books)' : ''
      add('E', `Talk to ${rev.name}${hint}`, () => this.talkToChaplain())
    }
    const vend = { x: (21 + 0.5) * 2, z: (49.2 + 0.5) * 2 + 0.6 }
    if (p.zone === 'visits' && near(vend, 1.6) && !this.clock.locked) {
      add('R', 'Vending machine: blue drink (1 Greggs voucher)', () => {
        if (!p.inventory.has('voucher')) return this.toast('No Greggs vouchers. The machine stares at you.', 'bad')
        if (p.inventory.full) return this.toast('No room in your pockets.', 'bad')
        p.inventory.remove('voucher')
        p.inventory.add('blueDrink')
        this.toast('Clunk. One blue drink. The label just says BLUE.', 'good')
      })
    }
  }

  private leaveBasket(): void {
    const p = this.player
    const where = p.hidingIn
    p.inBasket = false
    p.hidingIn = null
    p.body.visible = true
    p.body.z += 0.8
    this.methodHint = null
    this.toast(where ? `You climb out of the ${where}.` : 'You climb out, covered in fluff.', 'neutral')
  }

  /** The visitors and the laundry van run to their own little timetables. */
  private updateVisitors(delta: number): void {
    const m = this.clock.minuteOfDay
    const visiting = this.visitingTime
    const leaving = m >= 15 * 60 + 30
    const gate = this.grid.doorAtTile(15, 59)
    if (visiting && leaving && gate) this.doors.hold(gate)
    for (const v of this.visitors) {
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
      const target = { x: this.fixtures.visitorsGate.x, z: this.fixtures.visitorsGate.z + 2 }
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
    const p = this.player
    if (p.inBasket && !p.hidingIn && m >= 10 * 60 + 55 && !this.vanWarned) {
      this.vanWarned = true
      this.toast('You hear the van reversing into the bay. Beep. Beep. Beep. Hold your breath...', 'neutral')
    }
    if (p.inBasket && !p.hidingIn && m >= 11 * 60 && this.clock.period === 'work') {
      this.vanWarned = false
      this.sillyExit('laundry')
    }
    if (p.inBasket && !p.hidingIn && this.clock.period !== 'work') {
      p.inBasket = false
      p.body.visible = true
    }
  }

  private vanWarned = false

  /**
   * One roll of the dice at the silly exits. Better odds the first time;
   * the prison remembers each one that got rumbled.
   */
  private sillyExit(method: 'guardDisguise' | 'visitorDisguise' | 'laundry'): void {
    const p = this.player
    this.methodHint = method
    p.attempt = method
    // The laundry only ever works if the X-ray man is looking at his phone.
    const xrayFooled = method !== 'laundry' || this.keith.bribedDay === this.clock.day
    // A brand new face fools nobody for long: worse odds in your first days.
    const fresh = method !== 'laundry' && this.clock.day <= NEW_FACE_DAYS ? 0.5 : 1
    if (xrayFooled && this.rng() < this.memory.sillyExitChance(method) * fresh) {
      this.sounds.push({ sound: 'good', volume: 1 })
      this.finish(true, method)
      return
    }
    p.inBasket = false
    p.body.visible = true
    if (method === 'laundry') {
      const bay = this.fixtures.van
      p.body.x = bay.x - 1.5
      p.body.z = bay.z
      p.zone = 'bay'
    }
    if (method === 'laundry') {
      this.keithSays(
        xrayFooled
          ? "I KNOW I said I'd look away but the governor was standing RIGHT behind me."
          : pick2(this.rng, ["That basket's got a skeleton in it. A WALKING skeleton.", "Twenty-two years. Phones in pies, a ferret in a duvet, and now YOU."]),
      )
      if (xrayFooled) {
        this.keith.name = this.memory.used.laundry === 0 ? 'Brenda' : 'Clive'
        this.keith.bribedDay = -1
      }
    }
    const officer = this.guards.filter((g) => g.ko <= 0).sort((a, b) => a.distanceTo(p.body.x, p.body.z) - b.distanceTo(p.body.x, p.body.z))[0]
    officer.say(
      method === 'guardDisguise'
        ? pick2(this.rng, [`Hang about. ${officer.colleague()} is six foot four with a moustache. You are neither.`, "Warrant card? ...That's a Tesco Clubcard."])
        : method === 'visitorDisguise'
          ? pick2(this.rng, ['Madam, you have a prison number on your neck. And a beard.', "Lovely to see you, Mrs... Mrs... that's a pillowcase, not a handbag."])
          : pick2(this.rng, ['This pillowcase is breathing.', "Since when do towels wear trainers?"]),
      3.5,
    )
    this.caught(officer)
  }

  private keithSays(text: string): void {
    this.keith.speech = text
    this.keith.speechTimer = 3.5
  }

  /**
   * The X-ray operator's day: a cuppa in the canteen at breakfast and lunch,
   * collecting baskets from the laundry before the van, and the rest of the
   * time sat at his machine in the bay doing the crossword.
   */
  private updateKeith(delta: number): void {
    const k = this.keith
    const m = this.clock.minuteOfDay
    const period = this.clock.period
    let spot = { x: this.fixtures.xray.x, z: this.fixtures.xray.z, pose: 'sit' as const as 'sit' | 'stand' | 'search' }
    if (period === 'breakfast' || period === 'lunch') spot = { x: 45 * 2, z: 27 * 2, pose: 'sit' }
    else if (period === 'work' && m >= 10 * 60) spot = { x: this.fixtures.laundryBasket.x - 3.4, z: this.fixtures.laundryBasket.z - 1.8, pose: 'search' }
    k.body.visible = !this.clock.locked
    k.body.x = spot.x
    k.body.z = spot.z
    k.body.pose = spot.pose
    k.body.speed = 0
    k.body.yaw = period === 'work' ? Math.PI / 2 : 0
    if (k.speechTimer > 0) k.speechTimer -= delta
    if (k.speechTimer > 0) this.bubbles.push({ body: k.body, text: k.speech, who: null })
  }

  /** Swaps how people are drawn, repainting everyone into the new crowd. */
  useCrowd(next: Game['crowd']): void {
    const parent = this.crowd.group.parent
    parent?.remove(this.crowd.group)
    this.crowd = next
    this.bodies.forEach((b, i) => next.paint(i, b))
    parent?.add(next.group)
  }

  /** Every job's targets for the map: the missions, plus the Reverend's. */
  jobTargets(): { x: number; z: number; label: string }[] {
    const out = this.missions.mapTargets()
    const r = this.chaplain
    const here = r.body.visible
    if (r.stage === 'none' && here) out.push({ x: r.body.x, z: r.body.z, label: 'The Reverend (has a job)' })
    if (r.stage === 'hunting') {
      if (this.player.inventory.count('hymnBook') >= 3) {
        if (here) out.push({ x: r.body.x, z: r.body.z, label: 'The Reverend' })
      } else for (const it of this.dynamic.items) if (it.id === 'hymnBook') out.push({ x: it.x, z: it.z, label: 'Hymn book' })
    }
    return out
  }

  private updateChaplain(delta: number): void {
    const r = this.chaplain
    const period = this.clock.period
    // In his chapel all day, behind the altar, facing the pews. Lunch with
    // the lads in the canteen, because he believes in it.
    const altar = this.fixtures.altar
    let spot = { x: altar.x + 1.2, z: altar.z, yaw: Math.PI / 2, pose: 'stand' as 'stand' | 'sit' | 'talk' }
    if (period === 'lunch') spot = { x: 46 * 2, z: 27 * 2, yaw: 0, pose: 'sit' }
    r.body.visible = !this.clock.locked
    if (this.talkingTo !== r.body) {
      r.body.x = spot.x
      r.body.z = spot.z
      r.body.yaw = spot.yaw
      r.body.pose = spot.pose
    }
    r.body.speed = 0
    r.speechTimer -= delta
    if (r.speechTimer <= 0 && r.body.visible && Math.hypot(this.player.body.x - r.body.x, this.player.body.z - r.body.z) < 7 && this.rng() < delta * 0.08) {
      r.speech = pick2(this.rng, [
        'Lovely to see a new face. Well. An old face. A face.',
        'Panto auditions Thursday. We need a back half of a horse.',
        'The Lord moves in mysterious ways. So does the tea trolley.',
        'Choir at four. Bring your lungs.',
      ])
      r.speechTimer = 5
    }
    if (r.speechTimer > 0 && r.body.visible) this.bubbles.push({ body: r.body, text: r.speech, who: null })
  }

  private updateGovernor(delta: number): void {
    const gv = this.governor
    const m = this.clock.minuteOfDay
    const weekday = this.clock.weekday < 5
    const inspection = this.events.today === 'inspection' && m >= 10 * 60 && m < 16 * 60
    const was = gv.at
    const wanted = this.secret?.governorSpot?.() ?? null
    gv.at = wanted ? 'event' : inspection ? 'tour' : !weekday || this.clock.locked ? 'away' : m >= 750 && m < 810 ? 'car' : m >= 570 && m < 990 ? 'office' : 'away'
    const b = gv.body
    b.visible = gv.at !== 'away'
    if (this.talkingTo !== b) {
      if (gv.at === 'office') {
        b.x = this.fixtures.govDesk.x
        b.z = this.fixtures.govDesk.z - 0.25
        b.yaw = 0
        b.pose = 'sit'
      } else if (gv.at === 'car') {
        b.x = this.fixtures.jag.x - 1.5
        b.z = this.fixtures.jag.z + 0.4
        b.yaw = Math.PI / 2
        b.pose = 'search'
      } else if (wanted) {
        // Wherever the secret wants him: directing the play, meeting a duke.
        b.x = wanted.x
        b.z = wanted.z
        b.yaw = wanted.yaw
        b.pose = wanted.pose
        if (wanted.lines?.length && gv.speechTimer <= -6 && this.rng() < 0.01) {
          gv.speech = pick2(this.rng, wanted.lines)
          gv.speechTimer = 3.5
        }
      } else if (gv.at === 'tour') this.governorTour(delta, was !== 'tour')
    }
    if (gv.at !== 'tour') b.speed = 0
    // If he sees you where you should not be, he shouts for security.
    gv.shouted -= delta
    const p = this.player
    const close = Math.hypot(p.body.x - b.x, p.body.z - b.z)
    const inHisOffice = gv.at === 'office' && p.zone === 'governor'
    const seen = b.visible && !p.inVent && p.illegal > 0 && (inHisOffice || (close < 7 && (p.zone === this.grid.zone(Math.floor(b.x / TILE), Math.floor(b.z / TILE)) || close < 4)))
    if (seen && gv.shouted <= 0) {
      gv.shouted = 30
      gv.speech = pick2(this.rng, ['Can I HELP you? SECURITY!', 'Is that... the Greggs Bandit? In MY office? SECURITY!', 'Officers! OFFICERS! There is a prisoner touching my car!'])
      gv.speechTimer = 3
      this.alarm.active = true
      this.alarm.x = p.body.x
      this.alarm.z = p.body.z
      this.alarm.timer = 20
      const near = this.guards.filter((g) => g.ko <= 0).sort((a, c) => a.distanceTo(p.body.x, p.body.z) - c.distanceTo(p.body.x, p.body.z)).slice(0, 2)
      for (const g of near) {
        g.chasing = true
        g.suspicion = 1
        g.lastSeen = { x: p.body.x, z: p.body.z, t: 0 }
      }
      if (!p.attempt) p.attempt = this.methodHint ?? (p.zone === 'governor' ? 'safe' : 'gate')
    }
    gv.speechTimer -= delta
    if (gv.speechTimer > 0 && b.visible) this.bubbles.push({ body: b, text: gv.speech, who: null })
  }

  /** Inspection day: the Governor walks the inspector round the landings. */
  private governorTour(delta: number, start: boolean): void {
    const gv = this.governor
    const b = gv.body
    const stops = ['blockA', 'corridorN', 'hub', 'corridorS', 'blockC', 'yard', 'blockD', 'hub', 'blockB']
    if (start) {
      const c = tileCentre(39, 24)
      b.x = c.x
      b.z = c.z
      gv.tour = []
    }
    if (!gv.tour.length) {
      const from = worldToTile(b.x, b.z)
      const to = this.grid.randomTileIn(stops[Math.floor(this.rng() * stops.length)], this.rng)
      gv.tour = findPath(this.grid, from, to, () => true) ?? []
      if (!gv.tour.length) return
    }
    const next = tileCentre(gv.tour[0].tx, gv.tour[0].ty)
    const dx = next.x - b.x
    const dz = next.z - b.z
    const d = Math.hypot(dx, dz)
    const step = 1.3 * delta
    if (d <= step) {
      b.x = next.x
      b.z = next.z
      gv.tour.shift()
    } else {
      b.x += (dx / d) * step
      b.z += (dz / d) * step
      b.yaw = Math.atan2(dx, dz)
    }
    b.pose = 'walk'
    b.speed = 1.3
    if (gv.speechTimer <= 0 && this.rng() < delta * 0.05) {
      gv.speech = pick2(this.rng, ['And this, Inspector, is our award-winning landing.', 'Mind the puddle. It is a feature.', 'We pride ourselves on the custard here.', 'Nobody has ever escaped. Not once. I check daily.'])
      gv.speechTimer = 4
    }
  }

  /** The secret's guest: dressed once, then wherever the secret says. */
  private updateGuest(delta: number): void {
    const gu = this.guest
    const b = gu.body
    const info = this.secret?.guestLook?.()
    if (info && info.name !== this.guestDressed) {
      this.guestDressed = info.name
      gu.name = info.name
      Object.assign(b, info.look)
      this.crowd.paint(this.bodies.indexOf(b), b)
    }
    const spot = info ? (this.secret?.guestSpot?.() ?? null) : null
    b.visible = !!spot
    if (spot && this.talkingTo !== b) {
      b.x = spot.x
      b.z = spot.z
      b.yaw = spot.yaw
      b.pose = spot.pose
      b.speed = 0
    }
    gu.speechTimer -= delta
    if (gu.speechTimer > 0 && b.visible) this.bubbles.push({ body: b, text: gu.speech, who: null })
  }

  private talkToGovernor(): void {
    const gv = this.governor
    this.converse(gv.body)
    this.achieve('governor')
    if (this.secret?.talkGovernor?.()) return
    const lines =
      this.memory.round > 1
        ? ["Back again. I admire persistence. I also admire concrete, and I have ordered a great deal of it.", 'You are making my prison better every time you fail. I do appreciate it.']
        : gv.at === 'tour'
          ? ['Inspector, this is one of our more... enterprising residents. Wave, ' + this.player.name + '.', 'Smile for the Inspector. Lovely.']
          : ["Pettigrew. Governor. You will be the one with the pastry.", 'Keep up the good work. Whatever it is you are doing. I will find out.', 'My door is always open. Except to you. And the safe is always locked. Especially to you.']
    this.ui.talk(`${gv.name}, Governor`, pick2(this.rng, lines), [])
  }

  /** Puts the three stolen hymn books out where they were last seen. */
  private scatterHymnBooks(): void {
    for (const spot of Game.HYMN_SPOTS) {
      const t = this.grid.randomTileIn(spot.zone, this.rng)
      const c = tileCentre(t.tx, t.ty)
      this.dynamic.spawnItem('hymnBook', c.x + (this.rng() - 0.5) * 0.8, c.z + (this.rng() - 0.5) * 0.8, spot.zone)
    }
  }

  private talkToChaplain(): void {
    if (this.secret?.talkChaplain?.()) {
      this.converse(this.chaplain.body)
      return
    }
    const r = this.chaplain
    const p = this.player
    const inv = p.inventory
    const title = `${r.name}, chaplain`
    this.converse(r.body)
    if (r.stage === 'none') {
      this.ui.talk(
        title,
        LINES['chaplain.intro'].text,
        [
          {
            label: 'Take the job: find three hymn books',
            enabled: true,
            run: () => {
              r.stage = 'hunting'
              this.scatterHymnBooks()
              this.ui.talk(
                title,
                LINES['chaplain.accept'].text,
                [],
                'chaplain.accept',
              )
              this.toast('New job: The Missing Hymn Books. Find three hymn books for the Reverend.', 'good')
            },
          },
          {
            label: 'What do I get?',
            enabled: true,
            run: () =>
              this.ui.talk(
                title,
                LINES['chaplain.reward'].text,
                [],
                'chaplain.reward',
              ),
          },
        ],
        'chaplain.intro',
      )
      return
    }
    if (r.stage === 'hunting') {
      const have = inv.count('hymnBook')
      if (have >= 3) {
        this.ui.talk(title, LINES['chaplain.found'].text, [
          {
            label: 'Hand over the hymn books',
            enabled: true,
            run: () => {
              for (let i = 0; i < 3; i++) inv.remove('hymnBook')
              r.stage = 'done'
              r.alibi = true
              this.toast('The Reverend presses a little brass key into your hand: "For the panto box. Wardrobe needs a volunteer."', 'good')
              let paid = 0
              for (let i = 0; i < 3; i++) if (inv.add('voucher')) paid++
              for (let i = paid; i < 3; i++) this.dynamic.spawnItem('voucher', p.body.x + 0.6, p.body.z + 0.4 * i, p.zone)
              this.ui.talk(
                title,
                LINES['chaplain.thanks'].text,
                [],
                'chaplain.thanks',
              )
              this.toast(`Job done: The Missing Hymn Books. ${vouchers(3)}, and the Reverend owes you one alibi.`, 'good')
            },
          },
        ], 'chaplain.found')
      } else {
        this.ui.talk(title, LINES['chaplain.waiting'].text, [], 'chaplain.waiting')
        if (have) this.toast(`Hymn books found: ${have} of 3.`, 'neutral')
      }
      return
    }
    const after = r.alibi ? pick2(this.rng, ['chaplain.after.1', 'chaplain.after.2'] as const) : 'chaplain.spent'
    this.ui.talk(title, LINES[after].text, [], after)
  }

  private talkToKeith(): void {
    this.converse(this.keith.body)
    const k = this.keith
    const inv = this.player.inventory
    const need = this.memory.xrayBribe
    const paid = k.bribedDay === this.clock.day
    const keith = k.name === 'Keith'
    const intro = keith ? LINES['keith.intro'].text : `${k.name}. I replaced Keith. Keith is now "between opportunities". I am not Keith. I want ${need} of everything.`
    const voice = paid ? 'keith.paid' : keith ? 'keith.intro' : undefined
    this.ui.talk(`${k.name}, X-ray operator`, paid ? LINES['keith.paid'].text : intro, [
      {
        label: `Slip ${k.name} ${need} blue drink${need > 1 ? 's' : ''} and ${need} sausage roll${need > 1 ? 's' : ''}`,
        enabled: !paid && inv.count('blueDrink') >= need && inv.count('sausageRoll') >= need,
        run: () => {
          for (let i = 0; i < need; i++) {
            inv.remove('blueDrink')
            inv.remove('sausageRoll')
          }
          k.bribedDay = this.clock.day
          const take = pick2(this.rng, ['keith.bribed.1', 'keith.bribed.2'] as const)
          this.ui.talk(`${k.name}, X-ray operator`, LINES[take].text, [], take)
          this.toast(`${k.name} is paid off for today. Get in a laundry basket before 11:00.`, 'good')
        },
      },
      {
        label: 'Ask about the Governor',
        enabled: true,
        run: () => {
          const plate = this.safeCode.slice(2)
          this.heist.knowB = true
          this.ui.talk(`${k.name}, X-ray operator`, `The Governor? Green Jag, private plate: R P ${plate}. Polishes it in the staff car park every lunchtime. Says it's the only thing in here that doesn't answer back.`, [])
          this.toast(`R P ${plate}. A man who puts his initials on his car puts his numbers everywhere. Second half of the combination: ${plate}?`, 'good')
        },
      },
      {
        label: 'Ask what he fancies',
        enabled: true,
        run: () =>
          need > 1
            ? this.ui.talk(`${k.name}, X-ray operator`, `A blue drink. The proper blue, from the vending machine in visits. And a sausage roll from the canteen. ${need} of each, mind. Inflation.`, [])
            : this.ui.talk(`${k.name}, X-ray operator`, LINES['keith.wants'].text, [], 'keith.wants'),
      },
    ], voice)
  }

  // ---- Crafting (called by the UI) ----

  craftable(recipe: Recipe): boolean {
    if (recipe.makes === 'flatSpoon' && this.player.zone !== 'yard') return false
    return this.player.inventory.canCraft(recipe)
  }

  craft(recipe: Recipe): void {
    if (!this.craftable(recipe)) return
    this.player.inventory.craft(recipe)
    this.dodgyTimer = 5
    this.toast(`Made: ${ITEMS[recipe.makes].name}. ${ITEMS[recipe.makes].blurb}`, 'good')
  }

  private craftNamed(id: ItemId): void {
    const r = RECIPES.find((rr) => rr.makes === id)
    if (r && this.craftable(r)) this.craft(r)
  }

  drop(index: number): void {
    const it = this.player.inventory.items[index]
    if (!it) return
    this.player.inventory.items.splice(index, 1)
    this.dynamic.spawnItem(it.id, this.player.body.x, this.player.body.z + 0.6, this.player.zone)
  }

  useItem(index: number): void {
    const it = this.player.inventory.items[index]
    if (!it) return
    if (it.id === 'guardUniform' || it.id === 'visitorDisguise') this.toggleDisguise(it.id === 'guardUniform' ? 'guard' : 'visitor')
    else if (it.id === 'soap') this.chewSoap()
    else if (ITEMS[it.id].uses.includes('distract')) {
      // Throw it ahead: officers go and look.
      const b = this.player.body
      const x = b.x + Math.sin(b.yaw) * 7
      const z = b.z + Math.cos(b.yaw) * 7
      this.player.inventory.items.splice(index, 1)
      this.dynamic.spawnItem(it.id, x, z, this.grid.zoneAtWorld(x, z))
      this.emit({ x, z, radius: 12, kind: 'throw' })
      this.toast('Clatter. Heads turn.', 'neutral')
    } else this.toast(ITEMS[it.id].blurb, 'neutral')
  }

  // ------------------------------------------------------------------
  // Riots, noise, alarms
  // ------------------------------------------------------------------

  private updateRiot(delta: number): void {
    this.lastFightByPlayer = Math.max(0, this.lastFightByPlayer - delta)
    if (this.riot.active && this.riot.night) {
      this.riot.timer -= delta
      if (this.riot.timer <= 0) {
        this.riot.active = false
        this.toast('The landing is quiet again. Officers count heads.', 'neutral')
      }
      return
    }
    const fighters = this.prisoners.filter((p) => p.fighting && p.ko <= 0)
    if (!this.riot.active) {
      if (fighters.length >= 3) {
        const cx = fighters.reduce((s, f) => s + f.x, 0) / fighters.length
        const cz = fighters.reduce((s, f) => s + f.z, 0) / fighters.length
        const close = fighters.filter((f) => Math.hypot(f.x - cx, f.z - cz) < 14)
        if (close.length >= 3) {
          this.riot = { active: true, night: false, block: null, x: cx, z: cz, timer: 60, byPlayer: this.lastFightByPlayer > 0 }
          this.riotQuiet = 0
          this.toast(this.riot.byPlayer ? 'It has gone off! Officers are running in from everywhere. Doors are being left open...' : 'A fight has broken out.', this.riot.byPlayer ? 'good' : 'neutral')
          if (this.riot.byPlayer) this.methodHint = 'riot'
          this.emit({ x: cx, z: cz, radius: 40, kind: 'alarm' })
        }
      }
      return
    }
    this.riot.timer -= delta
    if (fighters.length) {
      this.riot.x += (fighters[0].x - this.riot.x) * delta * 0.5
      this.riot.z += (fighters[0].z - this.riot.z) * delta * 0.5
    }
    this.riotQuiet = fighters.length < 2 ? this.riotQuiet + delta : 0
    if (this.riotQuiet > 5 || this.riot.timer <= 0) {
      this.riot.active = false
      for (const f of fighters) f.subdue()
      this.toast('The disturbance is over.', 'neutral')
      if (this.riot.byPlayer && this.methodHint === 'riot' && !this.player.attempt) this.methodHint = null
    }
  }

  private updateNoises(delta: number): void {
    for (let i = this.noises.length - 1; i >= 0; i--) {
      const n = this.noises[i]
      if (n.age === 0) {
        // Fresh noise: the nearest free officer in earshot comes to look.
        if (n.kind === 'clank' || n.kind === 'throw') {
          let best: Guard | null = null
          let bd = Infinity
          for (const g of this.guards) {
            if (g.ko > 0 || g.chasing || g.busy || this.sickCall?.responders.includes(g)) continue
            // The nosy hear it from much further off.
            const d = Math.hypot(g.x - n.x, g.z - n.z) / (g.trait === 'nosy' ? 1.6 : 1)
            if (d < n.radius && d < bd) {
              bd = d
              best = g
            }
          }
          if (best && !best.investigate) {
            // In the ducts, the sound comes out of the nearest grille.
            if (this.player.inVent && n.kind === 'clank') {
              let gr = this.grid.grates[0]
              let gd = Infinity
              for (const g of this.grid.grates) {
                const d = Math.hypot((g.tx + 0.5) * TILE - n.x, (g.ty + 0.5) * TILE - n.z)
                if (d < gd) {
                  gd = d
                  gr = g
                }
              }
              const c = tileCentre(gr.tx, gr.ty)
              best.investigate = { x: c.x, z: c.z, t: 6 + this.memory.ventListening * 10 }
              best.say('What was that? ...In the vents?', 2)
            } else {
              best.investigate = { x: n.x, z: n.z, t: 4 }
              best.say(n.kind === 'throw' ? 'Who threw that?' : 'Hello?', 1.5)
            }
          }
        }
      }
      n.age += delta
      if (n.age > 0.2) this.noises.splice(i, 1)
    }
  }

  private updateAlarm(delta: number): void {
    if (!this.alarm.active) return
    this.alarm.timer -= delta
    // Officers nearby join the hunt.
    for (const g of this.guards) {
      if (g.chasing || g.ko > 0) continue
      if (Math.hypot(g.x - this.alarm.x, g.z - this.alarm.z) < 30 && !g.investigate) g.investigate = { x: this.alarm.x, z: this.alarm.z, t: 6 }
    }
    if (this.alarm.timer <= 0 || !this.guards.some((g) => g.chasing)) {
      if (this.alarm.timer <= 0) this.alarm.active = false
    }
  }
}

const WALL_TOP = 2.75
/** How far apart two people stand to talk. */
/** Metres from under your bunk to the allotments beyond the wall. */
export const TUNNEL_LENGTH = 30
/** How far your cellmate must trust you before they will sleep over a tunnel. */
const TUNNEL_TRUST = 0.4
const TUNNEL_MILESTONES: Record<number, string> = {
  5: 'Five metres. Down through the floor and into the old foundations.',
  10: 'Ten metres. You break into an old Victorian drain. It smells like the canteen.',
  15: 'Halfway. Somewhere above you, the yard. You can hear the flagpole halyard tapping.',
  20: 'Twenty metres. The drain narrows. You are under the yard now.',
  25: 'Twenty-five metres. Footings of the outer wall. You go under them.',
  30: 'Thirty metres. Cold air, and the smell of compost. You are under the allotments beyond the wall. Crawl out tonight.',
}

/** How much a fixer must trust you before selling sleeping pills. */
const PILLS_TRUST = 0.4
const TALK_GAP = 1.9

function cellmateTip(round: number): string {
  return round === 1
    ? "See that grille behind the table? Maintenance never put it on the list. Screws are rusted to nothing; a spoon'd turn them. Goes up into the ducts. Don't get caught in there, mind, or they'll weld it."
    : "They've been at all the locks since you started. Keep your head down for a day or two. They forget faster than you think. They don't, actually."
}

function pick2<T>(rng: () => number, list: T[]): T {
  return list[Math.floor(rng() * list.length)]
}
