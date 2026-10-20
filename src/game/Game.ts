import { type Scene } from 'three'
import { HEX } from '../art/palette'
import { Input } from '../core/Input'
import { type Body, Crowd, makeBody } from '../render/Crowd'
import { Guard, type GuardRole } from '../npc/Guard'
import { ATTEMPTS_PER_ROUND, METHOD_NAMES, type Method, PrisonMemory } from '../npc/Memory'
import { Prisoner } from '../npc/Prisoner'
import { GANGS, GANG_IDS, type GangId, gangOfWing } from '../npc/Gangs'
import type { Noise, PlayerView, Riot, SickCall, World } from '../npc/World'
import { buildPrison, type Fixtures } from '../world/Build'
import { CONE_FRONT_RAYS, CONE_RAYS, Dynamic, type LooseItem } from '../world/Dynamic'
import { BLOCKS, type BlockId, type Door, type Grate, Grid, PLAYER_CELL, TILE, Tile, blockOfZone, tileCentre, worldToTile } from '../world/Grid'
import { moveCircle } from '../world/Nav'
import { Clock, RESTRICTED, allowedZones } from './Clock'
import { Doors } from './Doors'
import { ITEMS, Inventory, type ItemId, RECIPES, type Recipe, SPAWNS } from './Items'
import { screenCall } from './Phone'

/** What the game needs from the interface. Implemented in ui/Ui.ts. */
export interface UiPort {
  toast(text: string, tone?: 'good' | 'bad' | 'neutral'): void
  talk(title: string, line: string, options: { label: string; enabled: boolean; run: () => void }[]): void
  phone(onSend: (message: string) => string): void
  card(title: string, body: string, seconds?: number): void
  end(won: boolean, title: string, body: string): void
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
  readonly rng = mulberry32(Date.now() & 0xffff)
  readonly input = new Input()
  readonly fixtures: Fixtures
  readonly dynamic: Dynamic
  readonly crowd: Crowd
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
  alarm = { active: false, timer: 0, x: 0, z: 0 }

  /** Speech bubbles for the UI to draw this frame. */
  readonly bubbles: { body: Body; text: string }[] = []
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
    for (const id of ['toothbrush', 'toothpaste', 'bedsheet', 'snout', 'snout'] as ItemId[]) inventory.add(id)
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
    }

    this.spawnPeople()
    this.crowd = new Crowd(this.bodies.length)
    this.bodies.forEach((b, i) => this.crowd.paint(i, b))
    scene.add(this.crowd.group)
    this.dynamic.ensureCones(this.guards.length)
    this.restock(true)
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

  say(body: Body, text: string, seconds = 2.6): void {
    const agent = [...this.guards, ...this.prisoners].find((a) => a.body === body)
    agent?.say(text, seconds)
  }

  toast(text: string, tone: 'good' | 'bad' | 'neutral' = 'neutral'): void {
    this.ui.toast(text, tone)
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

  /** Red flash for the UI, decays per frame. */
  flash = 0
  /** Hard mode: no sight-cone guide, and officers spot you faster. */
  hard = false

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
    by.wary = Math.min(1, by.wary + 0.35)
    this.sounds.push({ sound: 'caught', volume: 1 })
    const wasVent = p.inVent || method === 'vent'
    const result = this.memory.fail(method, p.body.x, p.body.z)
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
        'All four attempts gone',
        `The governor moves the officers round and starts the count again: four more attempts.\nBut they remember everything.\n\nThey learned: ${lesson.text}${sealed}`,
        7,
      )
    } else {
      this.ui.card(
        `Caught: attempt ${this.memory.attemptsUsed} of ${ATTEMPTS_PER_ROUND}`,
        `${by.name} drags you to segregation. Contraband confiscated.\n\nThe prison learns: ${lesson.text}${sealed}`,
        6,
      )
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
    if (searchCell && this.stash.length && this.rng() < 0.25 + this.memory.totalFailures * 0.08) {
      this.stash.length = 0
      this.toast('They spun your cell and found the stash.', 'bad')
    }
    p.inVent = false
    p.escortedBy = null
    p.attempt = null
    this.methodHint = null
    this.sickCall = null
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

  private finish(won: boolean, how: 'escape' | 'gang' | 'solitary', gang: GangId = 'firm'): void {
    this.over = true
    this.input.enabled = false
    const name = this.player.name
    if (won) {
      this.ui.end(
        true,
        'Free',
        `${name} drops into the back seat and the car pulls away with its lights off.\nDay ${this.clock.day}. ${this.memory.totalFailures} failed attempt${this.memory.totalFailures === 1 ? '' : 's'}.\nBy the time the count comes up one short, you are on the M6.`,
      )
    } else if (how === 'gang') {
      this.ui.end(
        false,
        `${GANGS[gang].name} got you`,
        `Eight attempts, eight failures, and every one of them brought the screws down on the wing.\n${GANGS[gang].name} caught ${name} in the showers with nobody watching. ${this.gangLeader(gang)?.name ?? 'Their boss'} did not even look up from his tea.\nThey never found out who did it.`,
      )
    } else {
      this.ui.end(
        false,
        'Segregation. Indefinitely.',
        `Eight attempts. The governor has had enough.\n${name} is moved to the segregation unit on a closed regime: twenty-three hours a day behind the door, and an officer outside it.\nNobody is getting out of here.`,
      )
    }
  }

  private placePlayer(x: number, z: number): void {
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
    this.regime()

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
    this.doors.update(delta)
    this.updateRiot(delta)
    this.updateNoises(delta)
    this.updateAlarm(delta)

    // Speech bubbles near the player.
    this.bubbles.length = 0
    for (const a of agents) {
      if (a.speechTimer > 0 && a.speech && Math.hypot(a.x - this.player.body.x, a.z - this.player.body.z) < 22) this.bubbles.push({ body: a.body, text: a.speech })
    }

    // Visuals.
    this.updateSightGuide()
    this.dynamic.ducts.visible = this.player.inVent
    const carHere = this.carPresent
    this.dynamic.update(delta, {
      flag: this.flagUp,
      car: carHere,
      smokeAt: this.riot.active && this.riot.night ? { x: this.riot.x, z: this.riot.z } : null,
      flagAt: this.fixtures.flagpole,
    })
    const pb = this.player.body
    this.dynamic.marker.position.set(pb.x, pb.y + (this.player.inVent ? 3.6 : 2.9) + Math.sin(performance.now() / 300) * 0.08, pb.z)
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
        this.restock(false)
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

    // Movement.
    const mv = input.move
    p.running = input.running && !p.sneaking
    const speed = p.inVent ? CRAWL_SPEED * (input.running ? 1.4 : p.sneaking ? 0.6 : 1) : p.running ? RUN_SPEED : p.sneaking ? SNEAK_SPEED : PLAYER_SPEED
    const dx = mv.x * speed * delta
    const dz = mv.z * speed * delta
    if (p.inVent) {
      const nx = b.x + dx
      const nz = b.z + dz
      if (this.grid.inDuct(nx, b.z)) b.x = nx
      if (this.grid.inDuct(b.x, nz)) b.z = nz
      // The ducts are tin: moving makes noise.
      if (mv.x || mv.z) {
        this.ventNoise -= delta
        if (this.ventNoise <= 0) {
          this.ventNoise = 0.8
          const radius = input.running ? 11 : p.sneaking ? 2.5 : 5.5
          this.emit({ x: b.x, z: b.z, radius: radius * (1 + this.memory.ventListening), kind: 'clank' })
        }
      }
    } else {
      // Walking up to a gate: the officer on it lets you through if the
      // regime says you can go that way.
      if (mv.x || mv.z) {
        const ahead = worldToTile(b.x + mv.x * 1.2, b.z + mv.z * 1.2)
        const door = this.grid.doorAtTile(ahead.tx, ahead.ty)
        if (door && door.kind === 'gate') this.doors.request(door, 'player', p.block, false, p.zone)
      }
      const bx = b.x
      const bz = b.z
      moveCircle(b, dx, dz, 0.34, (tx, ty) => this.playerBlocked(tx, ty))
      this.doorAssist(bx, bz, mv, speed * delta)
    }
    const moving = mv.x !== 0 || mv.z !== 0
    b.speed += ((moving ? speed : 0) - b.speed) * Math.min(1, delta * 10)
    if (moving) {
      const yaw = Math.atan2(mv.x, mv.z)
      let d = yaw - b.yaw
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      b.yaw += d * Math.min(1, delta * 12)
    }
    b.y = p.inVent ? WALL_TOP : 0
    if (p.inVent) b.pose = 'crawl'
    else if (this.fightingFor > 0) b.pose = 'fight'
    else if (b.pose !== 'phone' || moving) b.pose = 'walk'
    if (p.running && moving && !p.inVent) this.emit({ x: b.x, z: b.z, radius: 5, kind: 'clank' })

    const zone = this.grid.zoneAtWorld(b.x, b.z)
    if (zone) p.zone = zone

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

    this.updateIllegal()
    p.dodgy = this.dodgyTimer > 0 || p.inventory.weapon.damage >= 4 ? 1 : 0

    // Outside the wall.
    if (zone === 'outside' && !p.inVent) {
      const car = this.dynamic.car.position
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
    if (p.escortedBy) level = 0
    else if (this.climb) level = 2
    else if (p.inVent) level = 2
    else if (RESTRICTED.has(p.zone)) level = 2
    else if (this.clock.locked && p.zone !== p.cell) level = 2
    else {
      const allowed = allowedZones(this.clock.period, p.block)
      const zoneBlock = blockOfZone(p.zone)
      const ownBlockCell = p.zone.startsWith('cell') && zoneBlock === p.block
      if (p.zone !== p.cell && !allowed.has(p.zone) && !(ownBlockCell && allowed.has(`block${p.block}`))) level = 1
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
    if (nearest) {
      const it = nearest
      add('E', `Pick up ${ITEMS[it.id].name}`, () => {
        if (inv.add(it.id)) {
          this.dynamic.removeItem(it)
          this.toast(`${ITEMS[it.id].name}: ${ITEMS[it.id].blurb}`, 'neutral')
          if (ITEMS[it.id].contraband) this.dodgyTimer = 3
        } else this.toast('Your pockets are full. Craft something or drop something (Tab).', 'bad')
      })
    }

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
      if (g.ko <= 0) add('E', `Talk to ${g.name}`, () => this.talkToGuard(g))
      break
    }
    for (const pr of this.prisoners) {
      if (pr.ko > 0 || !front(pr.x, pr.z)) continue
      add('E', `Talk to ${pr.name}`, () => this.talkTo(pr))
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
      for (const w of f.washers) if (near(w.x, w.z, 1.4)) add('E', 'Work a laundry shift (+snout)', () => this.work())
    }
    if (p.zone === p.cell) {
      const cell = this.grid.cells.get(p.cell)!
      if (near(cell.bunks[1].x, cell.bunks[1].z, 1.6)) add('R', `Your stash (${this.stash.length}/4)`, () => this.openStash())
      if (near(cell.bunks[0].x, cell.bunks[0].z, 1.6) && this.clock.locked) add('E', 'Sleep (Z) till morning', () => this.trySleep())
    }
    if (inv.has('spoon') && p.zone === 'yard') add('R', 'Grind the spoon flat on the concrete', () => this.craftNamed('flatSpoon'))

    this.prompts = out
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
    if (key.id !== 'guardKey' && inv.wear(key)) this.toast(`The ${ITEMS[key.id].name.toLowerCase()} snaps in the lock after this turn.`, 'bad')
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

  private kickOff(): void {
    const p = this.player
    const supporters = this.prisoners.filter((pr) => pr.block === p.block && pr.supporter)
    const need = this.memory.riotSupportNeeded
    if (this.riot.active) return
    const firm = gangOfWing(p.block)
    if (!this.backingFirms(p.block).length) {
      const leader = this.gangLeader(firm)
      this.toast(`Nobody on this landing moves without ${GANGS[firm].name} saying so. Pay ${leader?.name ?? 'their boss'} first (${this.memory.bribePrice(firm)} snout).`, 'bad')
      return
    }
    if (this.clock.locked) {
      if (p.zone !== p.cell) return
      if (supporters.length < need) {
        this.toast(`You shout through the hatch. ${supporters.length} answer. You need ${need}: pay another firm, or win over more of the landing with snout.`, 'bad')
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
  }

  private trySleep(): void {
    const p = this.player
    if (!this.clock.locked || p.zone !== p.cell) {
      this.toast('You can only sleep in your cell after lights out.', 'neutral')
      return
    }
    this.sleeping = true
    const cell = this.grid.cells.get(p.cell)!
    p.body.x = cell.bunks[0].x
    p.body.z = cell.bunks[0].z + 1.1
    p.body.pose = 'sleep'
    p.body.y = 1.72
    this.toast('You sleep. (Move to wake.)', 'neutral')
  }

  private work(): void {
    if (this.workTimer > this.clock.minutes) {
      this.toast('You have done a shift already. Come back later.', 'neutral')
      return
    }
    this.workTimer = this.clock.minutes + 90
    if (this.player.inventory.add('snout')) this.toast('Folded sheets for an hour and a half. Paid in snout.', 'good')
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
    const lines = g.wary > 0.6 ? ["I've got my eye on you.", "Don't even think about it.", 'Move along.'] : ['What do you want?', 'Keep your nose clean.', "Not now, I'm busy.", 'Lovely weather for it, eh?']
    g.say(lines[Math.floor(this.rng() * lines.length)], 2.5)
  }

  talkTo(pr: Prisoner): void {
    const inv = this.player.inventory
    const options: { label: string; enabled: boolean; run: () => void }[] = []
    const refresh = () => this.talkTo(pr)
    options.push({
      label: 'Give 1 snout',
      enabled: inv.has('snout'),
      run: () => {
        inv.remove('snout')
        pr.trust = Math.min(1, pr.trust + (pr.gang ? 0.12 : 0.22))
        pr.grudge = Math.max(0, pr.grudge - 0.2)
        if (pr.gang) this.memory.annoy(pr.gang, -0.05)
        pr.say('Cheers.', 1.5)
        refresh()
      },
    })
    for (const item of pr.sells) {
      options.push({
        label: `Buy ${ITEMS[item].name} (2 snout)`,
        enabled: inv.count('snout') >= 2 && !inv.full,
        run: () => {
          inv.remove('snout')
          inv.remove('snout')
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
        label: backing ? `${def.name} are already with you` : `Pay ${def.name} to back a riot (${price} snout)`,
        enabled: !backing && inv.count('snout') >= price,
        run: () => {
          if (state.hostility >= 0.7) {
            this.ui.talk(pr.name, `After what you have done to my lads? Not for all the snout on the wing.`, [])
            return
          }
          for (let i = 0; i < price; i++) inv.remove('snout')
          this.memory.pay(gang, this.clock.minutes)
          this.toast(`${def.name} will back you for two days. ${GANGS[def.rival].name} will hear about it.`, 'good')
          this.ui.talk(pr.name, `Pleasure doing business. Give the word (G) on ${def.wing} wing and my lads go up. You have two days.`, [])
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
    options.push({ label: 'Ask what they have heard', enabled: true, run: () => this.ui.talk(pr.name, this.gossip(pr), []) })
    if (pr.isCellmate) options.push({ label: 'Ask about the cell', enabled: true, run: () => this.ui.talk(pr.name, cellmateTip(this.memory.round), []) })
    const greeting =
      pr.grudge > 0.5
        ? 'What do YOU want?'
        : pr.gang
          ? pr.leader
            ? `You know who I am. ${GANGS[pr.gang].name} run ${GANGS[pr.gang].wing} wing.`
            : 'You lost?'
          : pr.temperament === 'fixer'
            ? 'Looking for something? I can get things.'
            : pr.isCellmate
              ? `Alright, ${this.player.name}.`
              : 'Alright?'
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
      'The screws carry the keys on their belts. Get behind one when he is distracted.',
      'Toothpaste in the strike plate sets like concrete. Door looks locked, but it is not.',
      'Bang on your door at night like you are dying and they have to take you to healthcare.',
      'A proper kick-off on the landing and every screw in the place comes running. Doors get left open.',
      'Phones are taped. Never say when. Never say how.',
      'Lads used to run a red rag up the yard flagpole for their people on the road.',
      'Maintenance has every tool you could want. Shame it is behind a red door.',
      'The vents run over everything except the cells. Except some cells...',
      'Two sheets knotted make a rope. Bend a fork and tape it on and it is a hook.',
      'Soap takes a key impression lovely. Melt a fork into it with a lighter.',
      'Chew soap before you fake it. Froth sells it.',
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
    if (it.id === 'soap') this.chewSoap()
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
          let bd = n.radius
          for (const g of this.guards) {
            if (g.ko > 0 || g.chasing || g.busy || this.sickCall?.responders.includes(g)) continue
            const d = Math.hypot(g.x - n.x, g.z - n.z)
            if (d < bd) {
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

function cellmateTip(round: number): string {
  return round === 1
    ? "See that grille behind the table? Maintenance never put it on the list. Screws are rusted to nothing; a spoon'd turn them. Goes up into the ducts. Don't get caught in there, mind, or they'll weld it."
    : "They've been at all the locks since you started. Keep your head down for a day or two. They forget faster than you think. They don't, actually."
}
