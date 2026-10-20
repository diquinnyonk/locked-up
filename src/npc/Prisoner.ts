import { HEX } from '../art/palette'
import { type Body, type Pose, makeBody } from '../render/Crowd'
import type { ItemId } from '../game/Items'
import { type CellInfo, type Door, TILE, blockOfZone } from '../world/Grid'
import { Agent } from './Agent'
import { GANGS, type GangId } from './Gangs'
import { type Node, type Status, bt, traced } from './BehaviourTree'
import type { Guard } from './Guard'
import type { World } from './World'

/**
 * A prisoner. Twenty to a wing, two to a cell.
 *
 *   select
 *   ├─ knocked out ............................. lie there
 *   ├─ cuffed by an officer .................... stand and take it
 *   ├─ in a fight .............................. swing at whoever it is
 *   ├─ landing kicking off at night ............ bang the door, shout
 *   ├─ brawl nearby ............................ hotheads join, the rest back off
 *   ├─ gang, and you are fair game ............. come for you
 *   ├─ saw you up to something (snitch) ........ tell an officer
 *   ├─ lights out .............................. bunk
 *   ├─ bang-up ................................. back to the cell
 *   └─ the regime .............................. meals, work, yard, association
 *
 * Each one remembers you: `trust` goes up with snout and favours, `grudge`
 * with every punch and every time your trouble lands on them. Snitches who
 * see a report pay off report more readily; the gang's grudge feeds the
 * prison-wide hostility that decides how this ends if you never get out.
 */
export type Temperament = 'lag' | 'gang' | 'snitch' | 'hothead' | 'old' | 'fixer'

const FIRST = ['Dave', 'Gaz', 'Tommo', 'Dean', 'Wayne', 'Kev', 'Lee', 'Jamal', 'Callum', 'Ryan', 'Darren', 'Nathan', 'Liam', 'Craig', 'Marcus', 'Kieran', 'Shane', 'Reece', 'Tariq', 'Mo', 'Jonno', 'Stu', 'Paddy', 'Ollie', 'Dwayne', 'Ade', 'Taff', 'Jock', 'Scouse', 'Fergus', 'Carl', 'Neil', 'Barry', 'Terry', 'Vince', 'Rocco', 'Ash', 'Dom', 'Jase', 'Rich']
const NICK = ['Big', 'Little', 'Mad', 'Posh', 'Two-Sugars', 'Biscuits', 'Kettle', 'Dodgy', 'Fingers', 'Wonky', 'Chalky', 'Pie', 'Spanner', 'Bins', 'Gravy', 'Scampi', 'Sausage', 'Toast']

const WALK = 2.2
const RUN = 4.6

/** What a fixer will sell you, for snout. */
const STOCK: ItemId[][] = [
  ['razor', 'lighter'],
  ['wire', 'tape'],
  ['battery', 'lighter'],
  ['screwdriver', 'tape'],
  ['sock', 'poolBall'],
]

export interface ActivitySpot {
  x: number
  z: number
  pose: Pose
  yaw?: number
  dwell: number
}

export class Prisoner extends Agent {
  readonly role: 'prisoner' = 'prisoner'
  name: string
  readonly cell: CellInfo
  readonly bunk: number
  temperament: Temperament
  /** Which firm, if any, and whether they run it. */
  gang: GangId | null = null
  leader = false
  readonly sells: ItemId[]
  private readonly tree: Node<Prisoner>

  trust = 0.15
  grudge = 0
  hp = 10
  fighting = false
  fightTarget: Prisoner | 'player' | null = null
  private punchTimer = 0
  cuffed = 0
  /** Saw you crafting or carrying: off to tell someone. */
  report = false
  reportsMade = 0
  private spot: ActivitySpot | null = null
  private spotTimer = 0
  private lastPeriod = ''
  fearTimer = 0
  isCellmate = false
  /** The last punch they took was yours: jobs that want someone flattened check this. */
  lastHitByPlayer = false

  constructor(index: number, cell: CellInfo, bunk: number, world: World, rng: () => number) {
    const skins = [HEX.skin, HEX.skinTan, HEX.skinDeep, HEX.skinPale, HEX.skin]
    const hairs = [HEX.hairBlack, HEX.hairBrown, HEX.hairBlonde, HEX.hairGrey, HEX.hairRed, null]
    const roll = rng()
    const temperament: Temperament =
      roll < 0.1 ? 'snitch' : roll < 0.34 ? 'hothead' : roll < 0.44 ? 'old' : roll < 0.52 ? 'fixer' : 'lag'
    const body: Body = makeBody({
      top: rng() < 0.15 ? HEX.prisonBlue : HEX.prisonGrey,
      trousers: HEX.prisonGreyDark,
      skin: skins[Math.floor(rng() * skins.length)],
      hair: temperament === 'old' ? HEX.hairGrey : hairs[Math.floor(rng() * hairs.length)],
    })
    super(body, world)
    this.cell = cell
    this.bunk = bunk
    this.block = cell.block
    this.temperament = temperament
    const first = FIRST[index % FIRST.length]
    this.name = rng() < 0.4 ? `${NICK[Math.floor(rng() * NICK.length)]} ${first}` : first
    this.sells = temperament === 'fixer' ? STOCK[index % STOCK.length] : []
    if (temperament === 'old') this.trust = 0.3
    const b = cell.bunks[bunk]
    body.x = b.x + (bunk === 0 ? 0.55 : 0)
    body.z = b.z
    this.tree = buildPrisonerTree(world)
  }

  canUse(door: Door): boolean {
    if (this.ko > 0) return false
    const period = this.world.clock.period
    if (period === 'lightsOut') return door.cell === this.cell.zone && door.openness > 0.5
    if (door.kind === 'cell') return door.cell === this.cell.zone || !door.locked || door.openness > 0.5 || blockOfZone(door.cell ?? '') === this.block
    if (door.kind === 'room') return true
    if (door.kind === 'gate') return true
    return false
  }

  /** Signed up to a firm. Members wear its colour; the leader takes its name. */
  joinGang(gang: GangId, leader: boolean): void {
    this.gang = gang
    this.leader = leader
    this.temperament = 'gang'
    this.trust = 0
    this.body.top = GANGS[gang].hex
    if (leader) this.name = `${GANGS[gang].leaderNick} ${this.name.split(' ').pop()}`
  }

  /** Will back you when it kicks off: a mate you have won over, or a member of a firm you have paid. */
  get supporter(): boolean {
    if (this.gang) return this.world.memory.backing(this.gang, this.world.clock.minutes)
    return this.trust >= 0.6 && this.temperament !== 'snitch'
  }

  tick(): void {
    this.tree.tick(this)
  }

  /** Hit by someone. Returns true if that put them down. */
  hit(damage: number, by: Prisoner | 'player'): boolean {
    this.hp -= damage
    this.lastHitByPlayer = by === 'player'
    if (by === 'player') {
      this.grudge = Math.min(1, this.grudge + 0.25)
      this.trust = Math.max(0, this.trust - 0.3)
      if (this.gang) this.world.memory.annoy(this.gang, this.leader ? 0.2 : 0.06)
    }
    if (this.hp <= 0) {
      this.ko = 14
      this.hp = 10
      this.fighting = false
      this.fightTarget = null
      this.stop()
      return true
    }
    if (this.temperament === 'old' || this.temperament === 'snitch') {
      this.fearTimer = 6
      return false
    }
    this.fighting = true
    this.fightTarget = by
    return false
  }

  /** An officer has hold of them. */
  subdue(): void {
    this.fighting = false
    this.fightTarget = null
    this.cuffed = 6
    if (this.world.riot.byPlayer) {
      this.grudge = Math.min(1, this.grudge + 0.15)
      // A firm you paid takes its lumps; anyone else blames you.
      if (this.gang && !this.supporter) this.world.memory.annoy(this.gang, 0.03)
    }
  }

  frame(delta: number): void {
    if (this.cuffed > 0) this.cuffed -= delta
    if (this.fearTimer > 0) this.fearTimer -= delta
    this.punchTimer -= delta
    this.spotTimer -= delta
  }

  /** Spot for the current period, picked fresh each time it runs out. */
  activity(): ActivitySpot {
    const w = this.world
    const period = w.clock.period
    if (period !== this.lastPeriod) {
      this.lastPeriod = period
      this.spot = null
    }
    if (this.spot && this.spotTimer > 0) return this.spot
    const rng = w.rng
    const f = w.fixtures
    const anyTile = (zone: string, pose: Pose = 'stand', dwell = 6): ActivitySpot => {
      const t = w.grid.randomTileIn(zone, rng)
      return { x: (t.tx + 0.5) * TILE + (rng() - 0.5), z: (t.ty + 0.5) * TILE + (rng() - 0.5), pose, dwell }
    }
    const cellSpot = (): ActivitySpot => {
      const b = this.cell.bunks[this.bunk]
      return this.bunk === 0
        ? { x: b.x + 0.55, z: b.z, pose: 'sit', yaw: Math.PI / 2, dwell: 20 }
        : { x: b.x, z: b.z, pose: 'sit', yaw: -Math.PI / 2, dwell: 20 }
    }
    let spot: ActivitySpot
    switch (period) {
      case 'breakfast':
      case 'lunch':
      case 'dinner': {
        const benches = f.benches.filter((b) => b.zone === 'hub')
        const b = benches[Math.floor(rng() * benches.length)]
        spot = { x: b.x + (rng() - 0.5) * 3.6, z: b.z, pose: 'sit', yaw: b.z > 40 ? Math.PI : 0, dwell: 25 }
        break
      }
      case 'work':
        if (this.block === 'A' || this.block === 'B') {
          const m = f.washers[Math.floor(rng() * f.washers.length)]
          spot = rng() < 0.6 ? { x: m.x + (rng() - 0.5), z: m.z + 0.3, pose: 'search', yaw: Math.PI, dwell: 10 } : anyTile('laundry')
        } else spot = anyTile(`block${this.block}`, 'search', 5)
        break
      case 'yard': {
        const r = rng()
        if (r < 0.3) {
          const benches = f.benches.filter((b) => b.zone === 'yard')
          const b = benches[Math.floor(rng() * benches.length)]
          spot = { x: b.x + (rng() - 0.5) * 2.5, z: b.z, pose: 'sit', dwell: 20 }
        } else spot = anyTile('yard', 'stand', 4 + rng() * 8)
        break
      }
      case 'association':
      case 'evening': {
        const r = rng()
        if (r < 0.35) {
          const pt = f.poolTable
          const a = rng() * Math.PI * 2
          spot = { x: pt.x + Math.cos(a) * 2.8, z: pt.z + Math.sin(a) * 1.8, pose: 'stand', dwell: 12 }
        } else if (r < 0.5) spot = anyTile('games', 'sit', 15)
        else if (r < 0.65) {
          const ph = f.phones[Math.floor(rng() * f.phones.length)]
          spot = { x: ph.x, z: ph.z - 0.6, pose: 'phone', yaw: Math.PI, dwell: 15 }
        } else if (r < 0.75) {
          const sh = f.showerHeads[Math.floor(rng() * f.showerHeads.length)]
          spot = { x: sh.x, z: sh.z, pose: 'stand', dwell: 10 }
        } else if (r < 0.88) spot = anyTile('hub', 'stand', 10)
        else spot = cellSpot()
        break
      }
      case 'unlock':
        spot = rng() < 0.5 ? cellSpot() : anyTile(`block${this.block}`, 'stand', 6)
        break
      default:
        spot = cellSpot()
    }
    this.spot = spot
    this.spotTimer = spot.dwell + 8
    return spot
  }

  /** Swing at the current target. */
  brawl(): Status {
    const w = this.world
    const t = this.fightTarget
    if (!t) {
      this.fighting = false
      return 'failure'
    }
    const tx = t === 'player' ? w.player.body.x : t.x
    const tz = t === 'player' ? w.player.body.z : t.z
    if ((t !== 'player' && (t.ko > 0 || t.cuffed > 0)) || (t === 'player' && (w.player.inVent || w.player.health <= 0))) {
      this.fighting = false
      this.fightTarget = null
      return 'failure'
    }
    const d = this.distanceTo(tx, tz)
    if (d > 14) {
      this.fighting = false
      this.fightTarget = null
      return 'failure'
    }
    if (d > 1.1) {
      this.body.pose = 'walk'
      return this.goToWorld(tx, tz, RUN, 0.9)
    }
    this.stop()
    this.face(tx, tz)
    this.body.pose = 'fight'
    if (this.punchTimer <= 0) {
      this.punchTimer = 0.7 + w.rng() * 0.5
      w.emit({ x: this.x, z: this.z, radius: 12, kind: 'fight' })
      if (w.rng() < 0.65) {
        if (t === 'player') w.hurtPlayer(this.temperament === 'gang' ? 9 : 6, this)
        else t.hit(2 + Math.floor(w.rng() * 2), this)
      }
    }
    return 'running'
  }
}

function nearestGuard(world: World, x: number, z: number): { g: Guard; d: number } | null {
  let best: { g: Guard; d: number } | null = null
  for (const g of world.guards) {
    if (g.ko > 0) continue
    const d = Math.hypot(g.x - x, g.z - z)
    if (!best || d < best.d) best = { g, d }
  }
  return best
}

function buildPrisonerTree(world: World): Node<Prisoner> {
  const p = world.player

  const knockedOut = bt.sequence<Prisoner>(
    'knocked out',
    bt.when('ko', (s) => s.ko > 0),
    traced('lie there', (s) => {
      s.stop()
      s.body.pose = 'down'
      return 'running'
    }),
  )

  const cuffed = bt.sequence<Prisoner>(
    'cuffed',
    bt.when('held', (s) => s.cuffed > 0),
    traced('take it', (s) => {
      s.stop()
      s.body.pose = 'cuffed'
      return 'running'
    }),
  )

  const fight = bt.sequence<Prisoner>(
    'fight',
    bt.when('fighting', (s) => s.fighting),
    traced('brawl', (s) => s.brawl()),
  )

  const nightRiot = bt.sequence<Prisoner>(
    'night riot',
    bt.when('landing kicking off', (s) => world.riot.active && world.riot.night && world.riot.block === s.block),
    bt.when('in cell', (s) => s.zone === s.cell.zone),
    traced('bang the door', (s) => {
      s.stop()
      s.body.pose = s.supporter || world.rng() < 0.5 ? 'wave' : 'stand'
      const d = s.cell.door
      s.face((d.tx + 0.5) * TILE, (d.ty + 0.5) * TILE)
      if (world.rng() < 0.04) s.say(['Screws out!', 'Oi oi oi!', 'We want proper gravy!', 'Free the telly!', 'Bring back the custard!'][Math.floor(world.rng() * 5)], 1.5)
      return 'running'
    }),
  )

  const dayRiot = bt.sequence<Prisoner>(
    'brawl nearby',
    bt.when('riot', (s) => world.riot.active && !world.riot.night && s.distanceTo(world.riot.x, world.riot.z) < 16),
    traced('join in or back off', (s) => {
      if (s.temperament === 'hothead' || s.temperament === 'gang' || (s.supporter && world.riot.byPlayer)) {
        let best: Prisoner | null = null
        let bd = 8
        for (const o of world.prisoners) {
          if (o === s || o.ko > 0 || o.cuffed > 0) continue
          if (s.supporter && o.supporter) continue
          const d = s.distanceTo(o.x, o.z)
          if (d < bd) {
            bd = d
            best = o
          }
        }
        if (best) {
          s.fighting = true
          s.fightTarget = best
          if (world.rng() < 0.3) s.say(['Come on then!', 'Have it!', 'You what?!', "That's for the custard!", 'Not the face!'][Math.floor(world.rng() * 5)], 1.4)
          return 'running'
        }
      }
      // Back away from the middle of it.
      const dx = s.x - world.riot.x
      const dz = s.z - world.riot.z
      const d = Math.max(0.1, Math.hypot(dx, dz))
      s.body.pose = 'walk'
      const st = s.goToWorld(s.x + (dx / d) * 6, s.z + (dz / d) * 6, WALK * 1.3, 1)
      if (st === 'failure') {
        s.body.pose = 'stand'
        s.face(world.riot.x, world.riot.z)
      }
      return 'running'
    }),
  )

  const gangHunt = bt.sequence<Prisoner>(
    'gang',
    bt.when('gang', (s) => !!s.gang && (s.grudge > 0.5 || world.memory.gangs[s.gang].hostility > 0.55)),
    bt.when('you are close and alone', (s) => {
      if (p.inVent || p.health <= 0 || world.clock.locked) return false
      if (s.distanceTo(p.body.x, p.body.z) > 9) return false
      const g = nearestGuard(world, p.body.x, p.body.z)
      return !g || g.d > 13
    }),
    traced('come for you', (s) => {
      if (s.speechTimer <= 0) s.say([`${GANGS[s.gang!].name} send their regards.`, `Wrong place, ${p.name}.`, 'Nowhere to run in here.'][Math.floor(world.rng() * 3)], 2)
      s.fighting = true
      s.fightTarget = 'player'
      return 'running'
    }),
  )

  const flee = bt.sequence<Prisoner>(
    'scared',
    bt.when('frightened', (s) => s.fearTimer > 0),
    traced('get away', (s) => {
      const dx = s.x - p.body.x
      const dz = s.z - p.body.z
      const d = Math.max(0.1, Math.hypot(dx, dz))
      s.body.pose = 'walk'
      s.goToWorld(s.x + (dx / d) * 5, s.z + (dz / d) * 5, RUN, 1)
      return 'running'
    }),
  )

  const snitch = bt.sequence<Prisoner>(
    'snitch',
    bt.when('saw something', (s) => s.report),
    traced('tell an officer', (s) => {
      const g = nearestGuard(world, s.x, s.z)
      if (!g || world.clock.locked) {
        s.report = false
        return 'failure'
      }
      s.body.pose = 'walk'
      const st = s.goToWorld(g.g.x, g.g.z, WALK * 1.3, 1.4)
      if (st === 'success') {
        s.say(`Guv... ${p.name}'s carrying. You didn't hear it from me. I'm not here.`, 2.5)
        g.g.searchTarget = true
        s.report = false
        s.reportsMade++
      } else if (st === 'failure') s.report = false
      return 'running'
    }),
  )

  const sleep = bt.sequence<Prisoner>(
    'lights out',
    bt.when('locked', () => world.clock.locked),
    traced('bunk', (s) => {
      const bed = s.cell.bunks[0]
      s.stop()
      s.body.pose = 'sleep'
      s.body.x = bed.x
      s.body.z = bed.z + 1.1
      s.body.y = s.bunk === 0 ? 0.62 : 1.72
      s.body.yaw = 0
      return 'running'
    }),
  )

  const regime = traced<Prisoner>('the regime', (s) => {
    s.body.y = 0
    const spot = s.activity()
    // Bang-up is a hurry: officers chivvy everyone along.
    const st = s.goToWorld(spot.x, spot.z, world.clock.period === 'bangUp' ? WALK * 1.6 : WALK, 0.45)
    if (st === 'running') {
      s.body.pose = 'walk'
      return 'running'
    }
    s.body.pose = spot.pose
    if (spot.yaw != null) s.lookYaw = spot.yaw
    // Watch the player if they are close and up to something.
    if (s.temperament === 'snitch' && p.dodgy > 0 && s.distanceTo(p.body.x, p.body.z) < 7 && !s.report && s.grudge + 0.4 + s.reportsMade * 0.15 > world.rng() * 1.2) {
      if (world.grid.sightClear(s.x, s.z, p.body.x, p.body.z)) s.report = true
    }
    return 'running'
  })

  return bt.select<Prisoner>('prisoner', knockedOut, cuffed, fight, nightRiot, dayRiot, gangHunt, flee, snitch, sleep, regime)
}

