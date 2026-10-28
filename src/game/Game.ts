import { type Object3D, type Scene } from 'three'
import { HEX } from '../art/palette'
import { Input } from '../core/Input'
import { type Body, Crowd, makeBody } from '../render/Crowd'
import { Guard, type GuardRole } from '../npc/Guard'
import { ATTEMPTS_PER_ROUND, METHOD_NAMES, type Method, type Mode, PrisonMemory, ROUNDS } from '../npc/Memory'
import { Prisoner } from '../npc/Prisoner'
import { GANGS, GANG_IDS, type GangId, gangOfWing } from '../npc/Gangs'
import type { Lure, Noise, PlayerView, Riot, SickCall, World } from '../npc/World'
import { buildPrison, type Fixtures } from '../world/Build'
import { CONE_FRONT_RAYS, CONE_RAYS, Dynamic } from '../world/Dynamic'
import { BLOCKS, type BlockId, type Door, type Grate, Grid, PLAYER_CELL, TILE, Tile, blockOfZone, tileCentre, worldToTile } from '../world/Grid'
import { moveCircle } from '../world/Nav'
import { Clock, RESTRICTED, allowedZones } from './Clock'
import { type DayEvent, Events, type Weather, isVisitingDay, weatherSteps } from './Events'
import type { EndingId } from './Records'
import { type GoalId, Goals } from './Goals'
import { Feuds } from './Feuds'
import type { DailyGoal } from './Daily'
import { Doors } from './Doors'
import { ITEMS, Inventory, type ItemId, SPAWNS } from './Items'
import { Missions } from './Missions'
import { type BunkNote, Post } from './Post'
import { Play } from './Play'
import { makeSecret } from './secrets'
import type { Secret } from './secrets/Secret'
import { endingStory } from './EndingTexts'
import { Routes } from './Routes'
import { Basketball } from './Basketball'
import { PLAYER_SPEED, RUN_SPEED, SNEAK_SPEED, CRAWL_SPEED, mulberry32, WALL_TOP, TALK_GAP , HYMN_SPOTS } from './features/shared'
export { TUNNEL_LENGTH } from './features/shared'
import { Characters } from './features/Characters'
import { SillyExits } from './features/SillyExits'
import { CellmateStory } from './features/CellmateStory'
import { TunnelDig } from './features/TunnelDig'
import { SafeHeist } from './features/SafeHeist'
import { Toilets } from './features/Toilets'
import { Trespass } from './features/Trespass'
import { Talk } from './features/Talk'
import { PlayerActions } from './features/PlayerActions'
import { Disorder } from './features/Disorder'
import { Mail } from './features/Mail'
import { Pockets } from './features/Pockets'
import { PromptBuilder } from './features/PromptBuilder'
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
  // ---- Feature modules (src/game/features), sharing this state ----
  readonly characters = new Characters(this)
  readonly sillyExits = new SillyExits(this)
  readonly cellmateStory = new CellmateStory(this)
  readonly tunnelDig = new TunnelDig(this)
  readonly safeHeist = new SafeHeist(this)
  readonly toilets = new Toilets(this)
  readonly trespass = new Trespass(this)
  readonly talk = new Talk(this)
  readonly actions = new PlayerActions(this)
  readonly disorder = new Disorder(this)
  readonly mail = new Mail(this)
  readonly pockets = new Pockets(this)
  readonly promptBuilder = new PromptBuilder(this)
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
  drugged: { guard: Guard; eatsIn: number } | null = null
  sleeper: Guard | null = null
  disguisedAs: string | null = null
  /** The Governor's safe: what you know of the combination, and whether it is open. */
  readonly heist = { knowA: false, knowB: false, opened: false }
  /** The tunnel under the loose tile by your bunk: metres dug. */
  readonly tunnel = { metres: 0 }
  digging: { x: number; z: number; noise: number; heard: number; warned: number } | null = null
  /** Seconds left cracking the safe by ear, and where you knelt. */
  cracking: { t: number; x: number; z: number; click: number } | null = null
  alarm = { active: false, timer: 0, x: 0, z: 0 }

  /** Speech bubbles for the UI to draw this frame. */
  readonly bubbles: { body: Body; text: string; who: string | null }[] = []
  prompts: Prompt[] = []
  cellmate: Prisoner | null = null

  // Player state beyond the shared view.
  methodHint: Method | null = null
  punchTimer = 0
  fightingFor = 0
  keyHold: { door: Door; t: number } | null = null
  climb: { t: number; tx: number } | null = null
  private outsideTimer = 0
  private warnings = 0
  workTimer = 0
  private lastPeriod = ''
  private lastMinute = 0
  riotOpenTimer = 0
  riotQuiet = 0
  private punished = false
  stolenFrom: Guard | null = null
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
  carArrivesAt = -1
  readonly stash: ItemId[] = []
  /** Time since the last thing the player did that a snitch would notice. */
  dodgyTimer = 0
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
  /** The ball in the yard. */
  readonly basketball = new Basketball(this)
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
  guestDressed = ''
  /** Your cellmate's story: warned they are a grass, paid off, the gift, a tip-off due. */
  readonly mate = { warned: false, paidOff: false, gift: false, tipOff: false, tipOffs: 0 }
  private vouchersSeen = -1
  readonly visitors: { body: Body; seat: { x: number; z: number }; gone: boolean }[] = []
  /** The player's own clothes, for when the disguise comes off. */
  readonly ownLook = { top: HEX.player, trousers: HEX.prisonGreyDark, hair: HEX.hairBrown as number | null }
  commentTimer = 0
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
  static readonly HYMN_SPOTS = HYMN_SPOTS

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
  readonly sounds: { sound: 'clank' | 'fight' | 'throw' | 'alarm' | 'shout' | 'buzz' | 'caught' | 'good' | 'bounce'; volume: number }[] = []

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

  converse(body: Body): void {
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
    if (searchCell && this.tunnel.metres > 0 && this.rng() < this.memory.tunnelFindChance) this.tunnelDig.tunnelFound()
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

  finish(won: boolean, how: EndingId, gang: GangId = 'firm'): void {
    this.over = true
    this.input.enabled = false
    this.ending = { id: how === 'escape' ? 'escape' : how, won }
    const name = this.player.name
    const mateLine = this.cellmateStory.mateEpilogue(won)
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

  placePlayer(x: number, z: number): void {
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
    this.basketball.update(delta)
    const bb = this.basketball
    this.dynamic.setBall(bb.x, bb.y, bb.z, bb.spin, !bb.gone)

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
    this.toilets.updateToilets(delta)
    this.trespass.updateTrespass(delta)
    this.doors.update(delta)
    this.disorder.updateRiot(delta)
    this.missions.update()
    this.disorder.updateNoises(delta)
    this.disorder.updateAlarm(delta)

    // Speech bubbles near the player.
    this.bubbles.length = 0
    for (const a of agents) {
      if (a.speechTimer > 0 && a.speech && Math.hypot(a.x - this.player.body.x, a.z - this.player.body.z) < 22) this.bubbles.push({ body: a.body, text: a.speech, who: a.voiceId })
    }

    // Visuals.
    this.updateSightGuide()
    this.sillyExits.updateVisitors(delta)
    this.characters.updateKeith(delta)
    this.characters.updateChaplain(delta)
    this.characters.updateGovernor(delta)
    this.characters.updateGuest(delta)
    this.sillyExits.updateDisguise(delta)
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
        this.cellmateStory.mateMorning()
        this.mail.deliverPost()
        for (const g of this.guards) if (g.uniformTaken) this.sillyExits.dressGuard(g, true)
        this.restock(false)
        this.missions.newDay()
        this.events.newDay()
        this.feuds.newDay()
        this.secret?.newDay()
        this.routes.newDay()
        this.basketball.newDay()
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
    this.cellmateStory.mateNight()
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
    if (input.take('froth')) this.actions.chewSoap()

    if (p.inBasket) {
      b.visible = false
      b.speed = 0
      this.prompts = [{ key: 'E', label: `Climb out of the ${p.hidingIn ?? 'basket'}`, run: () => this.sillyExits.leaveBasket() }]
      if (input.take('interact')) this.sillyExits.leaveBasket()
      p.illegal = 0
      return
    }
    if (this.punished || this.climb) {
      if (this.climb) this.actions.updateClimb(delta)
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
    this.mail.updateBunkNote(wasIn)

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

    this.actions.updateLure(delta)
    this.safeHeist.updateHeist(delta)
    this.tunnelDig.updateTunnel(delta)
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

    this.promptBuilder.buildPrompts()
    for (const action of ['interact', 'secondary'] as const) {
      if (input.take(action)) {
        const key = action === 'interact' ? 'E' : 'R'
        this.prompts.find((pr) => pr.key === key)?.run()
      }
    }
    if (input.take('attack')) this.actions.attack()
    if (input.take('sick')) this.actions.callSick()
    if (input.take('riot')) this.actions.kickOff()
    if (input.take('sleep')) this.actions.trySleep()
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
  pushingDoor = 0

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

  updateIllegal(): void {
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
  backingFirms(wing: string): GangId[] {
    const now = this.clock.minutes
    return GANG_IDS.filter((g) => this.memory.backing(g, now) && this.prisoners.some((p) => p.gang === g && p.block === wing))
  }

  // ---- Prompts and actions ----

  /** Where you are sitting, if you are. Move to get up. */
  seated: { x: number; z: number; yaw: number; toilet?: string } | null = null
  /** On a toilet, in progress or done. */
  business: { cell: string; t: number; done: boolean; witnessed: boolean; ownerSaw: boolean } | null = null
  /** Cells with something unflushed in the toilet, and who might know. */
  readonly messes = new Map<string, { witnessed: boolean; ownerSaw: boolean; floor: boolean }>()
  toiletIncidents = 0

  sitDown(seat: { x: number; z: number; yaw: number }): void {
    const b = this.player.body
    this.seated = seat
    b.x = seat.x
    b.z = seat.z
    b.yaw = seat.yaw
    b.pose = 'sit'
    b.poseTime = 0
    b.speed = 0
  }

  standUp(): void {
    if (!this.seated) return
    // Walked off without flushing: it stays there for its owner to find.
    // Stood up halfway through: it lands on the floor.
    const job = this.business
    if (job?.done) this.toilets.leaveMess(job.cell, job.witnessed)
    else if (job && this.seated) this.toilets.dropOnFloor(job.cell, this.seated)
    this.business = null
    this.seated = null
    this.player.body.pose = 'stand'
    this.grid.pushOutOfProps(this.player.body, 0.34)
  }

  lastFightByPlayer = 0

  // ---- Your cellmate ----

  /** A grass still talking: not paid off, and not won over. */
  get mateTalking(): boolean {
    const m = this.cellmate
    return !!m && this.cellmateStory.cellmateGrass && !this.mate.paidOff && m.trust < 0.6
  }

  /** On side, and awake: coughs when footsteps come while you dig. */
  get mateLookout(): boolean {
    const m = this.cellmate
    return !!m && !this.cellmateStory.cellmateGrass && m.trust >= 0.6 && m.ko <= 0
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
  get tunnelSpot(): { x: number; z: number } {
    const cell = this.grid.cells.get(this.player.cell)!
    return { x: cell.rect.x0 * TILE + 1.85, z: ((cell.rect.y0 + cell.rect.y1 + 1) / 2) * TILE }
  }

  /** Metres a second for whatever you are digging with. */
  get digTool(): { name: string; rate: number } | null {
    const inv = this.player.inventory
    if (inv.has('screwdriver')) return { name: 'screwdriver', rate: 1 / 9 }
    if (inv.has('flatSpoon')) return { name: 'flattened spoon', rate: 1 / 12 }
    if (inv.has('spoon')) return { name: 'spoon', rate: 1 / 16 }
    return null
  }

  // ---- The Governor's safe ----

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
    this.sillyExits.applyLook()
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
      if (o.uniformTaken) this.sillyExits.dressGuard(g, false)
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
    this.mail.deliverPost()
  }

  noteAnnounced = false

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

  vanWarned = false

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

  // ---- Crafting (called by the UI) ----

  // ------------------------------------------------------------------
  // Riots, noise, alarms
  // ------------------------------------------------------------------


  // ---- Pass-throughs to the feature modules, for the UI, tests and scripts ----

  attack(...args: Parameters<PlayerActions['attack']>): ReturnType<PlayerActions['attack']> {
    return this.actions.attack(...args)
  }

  buildPrompts(...args: Parameters<PromptBuilder['buildPrompts']>): ReturnType<PromptBuilder['buildPrompts']> {
    return this.promptBuilder.buildPrompts(...args)
  }

  callSick(...args: Parameters<PlayerActions['callSick']>): ReturnType<PlayerActions['callSick']> {
    return this.actions.callSick(...args)
  }

  get cellmateGrass() {
    return this.cellmateStory.cellmateGrass
  }

  craft(...args: Parameters<Pockets['craft']>): ReturnType<Pockets['craft']> {
    return this.pockets.craft(...args)
  }

  craftable(...args: Parameters<Pockets['craftable']>): ReturnType<Pockets['craftable']> {
    return this.pockets.craftable(...args)
  }

  drop(...args: Parameters<Pockets['drop']>): ReturnType<Pockets['drop']> {
    return this.pockets.drop(...args)
  }

  enterVent(...args: Parameters<PlayerActions['enterVent']>): ReturnType<PlayerActions['enterVent']> {
    return this.actions.enterVent(...args)
  }

  kickOff(...args: Parameters<PlayerActions['kickOff']>): ReturnType<PlayerActions['kickOff']> {
    return this.actions.kickOff(...args)
  }

  leaveMess(...args: Parameters<Toilets['leaveMess']>): ReturnType<Toilets['leaveMess']> {
    return this.toilets.leaveMess(...args)
  }

  mateEpilogue(...args: Parameters<CellmateStory['mateEpilogue']>): ReturnType<CellmateStory['mateEpilogue']> {
    return this.cellmateStory.mateEpilogue(...args)
  }

  mateMorning(...args: Parameters<CellmateStory['mateMorning']>): ReturnType<CellmateStory['mateMorning']> {
    return this.cellmateStory.mateMorning(...args)
  }

  mateNight(...args: Parameters<CellmateStory['mateNight']>): ReturnType<CellmateStory['mateNight']> {
    return this.cellmateStory.mateNight(...args)
  }

  offerRoll(...args: Parameters<PlayerActions['offerRoll']>): ReturnType<PlayerActions['offerRoll']> {
    return this.actions.offerRoll(...args)
  }

  readLetter(...args: Parameters<Mail['readLetter']>): ReturnType<Mail['readLetter']> {
    return this.mail.readLetter(...args)
  }

  get safeCode() {
    return this.safeHeist.safeCode
  }

  startCracking(...args: Parameters<SafeHeist['startCracking']>): ReturnType<SafeHeist['startCracking']> {
    return this.safeHeist.startCracking(...args)
  }

  talkTo(...args: Parameters<Talk['talkTo']>): ReturnType<Talk['talkTo']> {
    return this.talk.talkTo(...args)
  }

  talkToChaplain(...args: Parameters<Characters['talkToChaplain']>): ReturnType<Characters['talkToChaplain']> {
    return this.characters.talkToChaplain(...args)
  }

  talkToGovernor(...args: Parameters<Characters['talkToGovernor']>): ReturnType<Characters['talkToGovernor']> {
    return this.characters.talkToGovernor(...args)
  }

  talkToGuard(...args: Parameters<Talk['talkToGuard']>): ReturnType<Talk['talkToGuard']> {
    return this.talk.talkToGuard(...args)
  }

  talkToKeith(...args: Parameters<Characters['talkToKeith']>): ReturnType<Characters['talkToKeith']> {
    return this.characters.talkToKeith(...args)
  }

  toggleDisguise(...args: Parameters<SillyExits['toggleDisguise']>): ReturnType<SillyExits['toggleDisguise']> {
    return this.sillyExits.toggleDisguise(...args)
  }

  trySleep(...args: Parameters<PlayerActions['trySleep']>): ReturnType<PlayerActions['trySleep']> {
    return this.actions.trySleep(...args)
  }

  tunnelFound(...args: Parameters<TunnelDig['tunnelFound']>): ReturnType<TunnelDig['tunnelFound']> {
    return this.tunnelDig.tunnelFound(...args)
  }

  updateToilets(...args: Parameters<Toilets['updateToilets']>): ReturnType<Toilets['updateToilets']> {
    return this.toilets.updateToilets(...args)
  }

  updateTrespass(...args: Parameters<Trespass['updateTrespass']>): ReturnType<Trespass['updateTrespass']> {
    return this.trespass.updateTrespass(...args)
  }

  useItem(...args: Parameters<Pockets['useItem']>): ReturnType<Pockets['useItem']> {
    return this.pockets.useItem(...args)
  }

  useKey(...args: Parameters<PlayerActions['useKey']>): ReturnType<PlayerActions['useKey']> {
    return this.actions.useKey(...args)
  }
}
