import { HEX } from '../art/palette'
import { type Body, makeBody } from '../render/Crowd'
import { type BlockId, type Door, TILE, blockOfZone, tileCentre, worldToTile } from '../world/Grid'
import { Agent } from './Agent'
import { type Node, type Status, bt, traced } from './BehaviourTree'
import type { World } from './World'

/**
 * A prison officer.
 *
 * Four to a wing: one on the wing gate, one walking the landing (and on nights
 * after bang-up), one who follows the wing's prisoners to wherever the regime
 * sends them, and one posted at a central gate. Officers open every gate in
 * the place for themselves; nobody else can, without a key.
 *
 * The tree, top to bottom, is the order of what an officer cares about:
 *
 *   select
 *   ├─ knocked out ............................. lie there
 *   ├─ chasing an escaper ...................... run them down
 *   ├─ spotted something wrong ................. stare, then act
 *   ├─ disturbance on my patch ................. go and break it up
 *   ├─ sick call assigned to me ................ door, escort, wait, return
 *   ├─ prisoner reported carrying .............. pat them down
 *   ├─ heard something ......................... investigate
 *   ├─ lock checks at bang-up (learned) ........ try every door
 *   ├─ bang-up ................................. send everyone behind their door
 *   ├─ listening at a vent (learned) ........... stand under a grille
 *   └─ duty .................................... post, patrol, or follow the wing
 */
export type GuardRole = 'gate' | 'landing' | 'escort' | 'central'

const NAMES = [
  'Mr Hughes', 'Ms Okafor', 'Mr Doyle', 'Mrs Patel',
  'Mr Brennan', 'Ms Kowalski', 'Mr Asante', 'Mr Price',
  'Ms Byrne', 'Mr Whitlock', 'Mrs Adeyemi', 'Mr Rourke',
  'Mr Lennox', 'Ms Harding', 'Mr Mahmood', 'Mrs Fenwick',
]

const WALK = 2.6
const RUN = 5.2

export class Guard extends Agent {
  readonly name: string
  readonly role: 'guard' = 'guard'
  readonly duty: GuardRole
  readonly post: { tx: number; ty: number }
  private readonly tree: Node<Guard>

  /** 0..1 how sure they are you are up to something. */
  suspicion = 0
  chasing = false
  lastSeen: { x: number; z: number; t: number } | null = null
  investigate: { x: number; z: number; t: number } | null = null
  searchTarget = false
  hasKeys = true
  /** Personal memory: this officer has been fooled or hurt by you. 0..1. */
  wary = 0
  hp = 10
  /** Helping at a riot. */
  busy = false
  patrolTarget: { tx: number; ty: number } | null = null
  dwell = 0
  lockIndex = 0
  warnCooldown = 0
  /** Index into the wing's cells while walking a lock check. */
  checking: Door | null = null

  constructor(index: number, block: BlockId, duty: GuardRole, post: { tx: number; ty: number }, world: World) {
    const female = /M(s|rs)/.test(NAMES[index])
    const skins = [HEX.skin, HEX.skinTan, HEX.skinDeep, HEX.skinPale]
    const body: Body = makeBody({
      top: HEX.guardShirt,
      trousers: HEX.guardTrousers,
      skin: skins[index % skins.length],
      hair: female ? HEX.hairBlack : null,
      cap: true,
    })
    super(body, world)
    this.name = NAMES[index]
    this.block = block
    this.duty = duty
    this.post = post
    const c = tileCentre(post.tx, post.ty)
    body.x = c.x
    body.z = c.z
    this.tree = buildGuardTree(world)
  }

  canUse(_door: Door): boolean {
    return this.ko <= 0
  }

  tick(): void {
    this.tree.tick(this)
  }

  /** Per-frame senses: vision runs every frame so detection never lags a tick. */
  sense(delta: number): void {
    this.warnCooldown -= delta
    if (this.ko > 0) {
      this.suspicion = 0
      this.chasing = false
      this.body.pose = 'down'
      return
    }
    const w = this.world
    const p = w.player
    const sees = this.canSeePlayer()
    if (sees) this.lastSeen = { x: p.body.x, z: p.body.z, t: 0 }
    else if (this.lastSeen) this.lastSeen.t += delta

    const escorting = p.escortedBy === this
    if (sees && p.illegal > 0 && !escorting) {
      const d = this.distanceTo(p.body.x, p.body.z)
      const range = this.visionRange()
      const rate = (1.8 - d / range) * (p.illegal === 2 ? 1.6 : 0.7) * (1 + this.wary) * (this.busy ? 0.4 : 1)
      this.suspicion = Math.min(1, this.suspicion + delta * Math.max(0.25, rate))
    } else if (sees && p.dodgy > 0 && !escorting) {
      this.suspicion = Math.min(1, this.suspicion + delta * 0.35)
    } else if (!this.chasing) {
      this.suspicion = Math.max(0, this.suspicion - delta * 0.25)
    }

    if (this.suspicion >= 1 && sees && p.illegal === 2 && !this.chasing) {
      this.chasing = true
      this.say(pick(w.rng, [`Oi! ${p.name}! Stop right there!`, 'Escape! Escape! All units!', `Stay where you are, ${p.name}!`]), 2.5)
      w.alarm.active = true
      w.alarm.timer = 40
      w.alarm.x = p.body.x
      w.alarm.z = p.body.z
      w.emit({ x: this.x, z: this.z, radius: 30, kind: 'alarm' })
    }
  }

  visionRange(): number {
    const night = this.world.clock.darkness
    const base = 15 - night * 7
    return base * this.world.memory.visionScale * (this.busy ? 0.6 : 1)
  }

  canSeePlayer(): boolean {
    const p = this.world.player
    if (p.inVent || !p.body.visible) return false
    const dx = p.body.x - this.x
    const dz = p.body.z - this.z
    const d = Math.hypot(dx, dz)
    const range = this.visionRange() * (p.sneaking ? 0.7 : 1)
    const close = (p.running ? 4.5 : p.sneaking ? 1.6 : 2.6) + Math.min(2, this.world.memory.used.gate * 1.0)
    if (d > range) return false
    if (d > close) {
      const angle = Math.atan2(dx, dz) - this.body.yaw
      const a = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)))
      if (a > 1.0) return false
    }
    return this.world.grid.sightClear(this.x, this.z, p.body.x, p.body.z)
  }

  /** Is the player behind this officer, close enough to lift their keys? */
  canBePickpocketed(): boolean {
    const p = this.world.player
    const d = this.distanceTo(p.body.x, p.body.z)
    if (d > 1.6 || !this.hasKeys || this.ko > 0) return false
    const angle = Math.atan2(p.body.x - this.x, p.body.z - this.z) - this.body.yaw
    const a = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)))
    return a > 1.9 || this.busy
  }
}

function pick<T>(rng: () => number, list: T[]): T {
  return list[Math.floor(rng() * list.length)]
}

/** Each wing's landing as a few waypoints down the spine. */
function landingWaypoints(world: World, block: string): { tx: number; ty: number }[] {
  const room = world.grid.rooms.get(`block${block}`)
  if (!room) return []
  const r = room.rects[0]
  const y = r.y0 + 1
  return [r.x0 + 1, Math.floor((r.x0 + r.x1) / 2), r.x1 - 1].map((tx) => ({ tx, ty: y }))
}

/** Where the regime sends a wing right now; the escort officer follows. */
function activityZone(world: World, block: string): string {
  switch (world.clock.period) {
    case 'breakfast':
    case 'lunch':
    case 'dinner':
      return 'hub'
    case 'work':
      return block === 'A' || block === 'B' ? 'laundry' : `block${block}`
    case 'yard':
      return 'yard'
    case 'association':
    case 'evening':
      return block === 'A' || block === 'C' ? 'games' : 'hub'
    default:
      return `block${block}`
  }
}

function buildGuardTree(world: World): Node<Guard> {
  const p = world.player
  const knockedOut = bt.sequence<Guard>(
    'knocked out',
    bt.when('ko', (g) => g.ko > 0),
    traced('lie there', (g) => {
      g.stop()
      g.body.pose = 'down'
      return 'running'
    }),
  )

  const chase = bt.sequence<Guard>(
    'chase',
    bt.when('chasing', (g) => g.chasing),
    traced('run them down', (g) => {
      g.body.pose = 'walk'
      if (p.inVent && g.lastSeen && g.lastSeen.t > 2) {
        // Lost them into the ducts: wait under the nearest grille.
        g.chasing = false
        const near = nearestGrate(world, g.lastSeen.x, g.lastSeen.z)
        if (near) g.investigate = { x: (near.tx + 0.5) * TILE, z: (near.ty + 0.5) * TILE, t: 25 }
        return 'failure'
      }
      if (!g.lastSeen || g.lastSeen.t > 9) {
        g.chasing = false
        g.suspicion = 0.5
        if (g.lastSeen) g.investigate = { x: g.lastSeen.x, z: g.lastSeen.z, t: 8 }
        g.say('Lost them...', 2)
        return 'failure'
      }
      const d = g.distanceTo(p.body.x, p.body.z)
      if (d < 1.15 && g.lastSeen.t < 0.5) {
        g.stop()
        world.caught(g)
        g.chasing = false
        g.suspicion = 0
        return 'success'
      }
      const target = g.lastSeen.t < 0.5 ? { x: p.body.x, z: p.body.z } : g.lastSeen
      return g.goToWorld(target.x, target.z, RUN, 0.4)
    }),
  )

  const notice = bt.sequence<Guard>(
    'noticed something',
    bt.when('suspicious', (g) => g.suspicion > 0.12 && g.lastSeen !== null && g.lastSeen.t < 3),
    traced('stare', (g) => {
      g.stop()
      g.face(g.lastSeen!.x, g.lastSeen!.z)
      g.body.pose = 'stand'
      if (g.speechTimer <= 0 && g.suspicion < 0.5) g.say('?', 1)
      // Out of bounds rather than escaping: walk over and give a warning.
      if (g.suspicion >= 1 && p.illegal === 1) {
        if (g.distanceTo(p.body.x, p.body.z) > 2) return g.goToWorld(p.body.x, p.body.z, WALK * 1.2, 1.8)
        if (g.warnCooldown <= 0) {
          world.warn(g, `${p.name}! You're not meant to be here. Back where you belong.`)
          g.warnCooldown = 12
          g.suspicion = 0.3
        }
        return 'success'
      }
      return 'running'
    }),
  )

  const riot = bt.sequence<Guard>(
    'disturbance',
    bt.when('riot nearby', (g) => {
      if (!world.riot.active) return false
      if (g.duty === 'gate' && world.memory.gatesHeldInRiot) return false
      if (world.riot.night) return g.block === world.riot.block || g.duty === 'central'
      return g.distanceTo(world.riot.x, world.riot.z) < 45
    }),
    traced('break it up', (g) => {
      g.busy = true
      g.body.pose = 'walk'
      // Nearest brawler gets cuffed.
      let target = null as null | { x: number; z: number; calm: () => void }
      let best = 6
      for (const pr of world.prisoners) {
        if (!pr.fighting || pr.ko > 0) continue
        const d = g.distanceTo(pr.x, pr.z)
        if (d < best) {
          best = d
          target = { x: pr.x, z: pr.z, calm: () => pr.subdue() }
        }
      }
      if (target) {
        if (best < 1.2) {
          target.calm()
          g.say(pick(world.rng, ['Get down! Down!', 'Hands behind your back!', 'Pack it in!']), 1.6)
          g.body.pose = 'search'
          return 'running'
        }
        return g.goToWorld(target.x, target.z, RUN, 1.0)
      }
      const s = g.goToWorld(world.riot.x, world.riot.z, RUN, 3)
      if (s === 'success') g.body.pose = 'stand'
      return 'running'
    }),
  )

  const sickCall = bt.sequence<Guard>(
    'sick call',
    bt.when('assigned', (g) => !!world.sickCall && world.sickCall.responders.includes(g)),
    traced('attend sick call', (g) => attendSick(world, g)),
  )

  const search = bt.sequence<Guard>(
    'search',
    bt.when('reported', (g) => g.searchTarget),
    traced('pat down', (g) => {
      if (p.inVent) {
        g.searchTarget = false
        return 'failure'
      }
      g.body.pose = 'walk'
      const s = g.goToWorld(p.body.x, p.body.z, WALK * 1.3, 1.3)
      if (s === 'success') {
        g.body.pose = 'search'
        g.searchTarget = false
        world.warn(g, `Arms up, ${p.name}. Someone says you're carrying.`)
        world.patDown(g)
      }
      return 'running'
    }),
  )

  const investigate = bt.sequence<Guard>(
    'investigate',
    bt.when('heard something', (g) => !!g.investigate),
    traced('investigate', (g) => {
      const inv = g.investigate!
      const s = g.goToWorld(inv.x, inv.z, WALK * 1.5, 1.2)
      g.body.pose = 'walk'
      if (s !== 'running') {
        g.body.pose = 'stand'
        inv.t -= 1 / 6
        g.lookYaw = g.body.yaw + Math.sin(inv.t * 2) * 1.4
        // In the duct right above me?
        const earshot = 3.2 + (p.running ? 4 : p.sneaking ? 0 : 1.6) + world.memory.ventListening * 3
        if (p.inVent && Math.hypot(p.body.x - inv.x, p.body.z - inv.z) < earshot) {
          g.say(`I can hear you up there! Come out!`, 2.5)
          world.caught(g)
          g.investigate = null
          return 'success'
        }
        if (inv.t <= 0) g.investigate = null
      }
      return 'running'
    }),
  )

  const lockCheck = bt.sequence<Guard>(
    'lock checks',
    bt.when('night officer with doors to try', (g) => g.duty === 'landing' && world.lockChecks.some((d) => d.cell && blockOfZone(d.cell) === g.block)),
    traced('try each door', (g) => {
      const mine = world.lockChecks.filter((d) => d.cell && blockOfZone(d.cell) === g.block)
      const door = mine[0]
      g.checking = door
      const outside = door.ty < world.grid.cells.get(door.cell!)!.rect.y0 ? door.ty - 1 : door.ty + 1
      const s = g.goToWorld(...xy(door.tx, outside), WALK, 0.5)
      g.body.pose = 'walk'
      if (s === 'success') {
        g.body.pose = 'search'
        g.face((door.tx + 0.5) * TILE, (door.ty + 0.5) * TILE)
        g.lockIndex++
        if (g.lockIndex > 4) {
          g.lockIndex = 0
          world.lockChecks.splice(world.lockChecks.indexOf(door), 1)
          if (door.jammed && world.rng() < world.memory.lockCheckChance) {
            door.jammed = false
            g.say('Toothpaste in the lock?! Cheeky sod.', 3)
            world.toothpasteFound(g, door)
          }
        }
      }
      return 'running'
    }),
  )

  const bangUp = bt.sequence<Guard>(
    'bang-up',
    bt.when('bang-up', () => world.clock.period === 'bangUp'),
    bt.when('landing duty', (g) => g.duty === 'landing' || g.duty === 'escort'),
    traced('behind your doors', (g) => {
      const wp = landingWaypoints(world, g.block)
      if (!wp.length) return 'failure'
      if (!g.patrolTarget || g.goTo(g.patrolTarget.tx, g.patrolTarget.ty, WALK) !== 'running') {
        g.patrolTarget = wp[Math.floor(world.rng() * wp.length)]
        if (world.rng() < 0.3) g.say(pick(world.rng, ['Behind your doors, gents!', 'Bang-up! Come on!', 'Doors in five minutes!']), 2)
      }
      g.body.pose = 'walk'
      return 'running'
    }),
  )

  const ventListen = bt.sequence<Guard>(
    'listen at vents',
    bt.when('learned the vents', (g) => world.memory.ventListening > 0 && g.duty === 'central' && world.clock.locked),
    traced('listen under a grille', (g) => {
      if (g.dwell > 0) {
        g.dwell -= 1 / 6
        g.body.pose = 'stand'
        g.lookYaw = g.body.yaw + 0.4
        if (p.inVent) {
          const grate = nearestGrate(world, g.x, g.z)
          if (grate && Math.hypot(p.body.x - (grate.tx + 0.5) * TILE, p.body.z - (grate.ty + 0.5) * TILE) < 6 * world.memory.ventListening) {
            g.investigate = { x: (grate.tx + 0.5) * TILE, z: (grate.ty + 0.5) * TILE, t: 20 }
          }
        }
        return 'running'
      }
      if (!g.patrolTarget) {
        const options = world.grates.filter((gr) => gr.zone !== 'cellA7' && !gr.zone.startsWith('cell'))
        const gr = options[Math.floor(world.rng() * options.length)]
        g.patrolTarget = { tx: gr.tx, ty: gr.ty }
      }
      const s = g.goTo(g.patrolTarget.tx, g.patrolTarget.ty, WALK)
      g.body.pose = 'walk'
      if (s !== 'running') {
        g.patrolTarget = null
        g.dwell = 8
      }
      return 'running'
    }),
  )

  const duty = traced<Guard>('duty', (g) => {
    g.busy = false
    const night = world.clock.locked
    // Posts. Gate officers stand by their gate by day; the central officer
    // holds a hub gate. At night the landing officer walks, the rest sit in
    // the hub office, and once the wall has been gone over, one walks it.
    if (night && g.duty === 'escort' && world.memory.wallPatrol && g.block === 'D') return patrol(world, g, () => world.grid.randomTileIn('yard', world.rng), 6)
    if (g.duty === 'gate' || g.duty === 'central' || (night && g.duty === 'escort')) {
      const post = night && g.duty === 'escort' ? { tx: 36 + ['A', 'B', 'C', 'D'].indexOf(g.block) * 2, ty: 19 } : g.post
      const s = g.goTo(post.tx, post.ty, WALK, 0.5)
      g.body.pose = s === 'running' ? 'walk' : 'stand'
      if (s !== 'running') {
        g.dwell -= 1 / 6
        if (g.dwell <= 0) {
          g.dwell = 2 + world.rng() * 4
          g.lookYaw = world.rng() * Math.PI * 2
        }
      }
      return 'running'
    }
    if (g.duty === 'landing' || night) {
      // Learned hotspots get folded into the landing walk.
      return patrol(world, g, () => {
        const hs = world.memory.hotspots
        if (hs.length && world.rng() < 0.25) {
          const h = hs[Math.floor(world.rng() * hs.length)]
          return worldToTile(h.x, h.z)
        }
        const wp = landingWaypoints(world, g.block)
        return wp[Math.floor(world.rng() * wp.length)]
      }, 3)
    }
    // Escort: follow the wing to the activity.
    const zone = activityZone(world, g.block)
    return patrol(world, g, () => world.grid.randomTileIn(zone, world.rng), 5)
  })

  return bt.select<Guard>('officer', knockedOut, chase, riot, notice, sickCall, search, investigate, lockCheck, bangUp, ventListen, duty)

  function xy(tx: number, ty: number): [number, number] {
    return [(tx + 0.5) * TILE, (ty + 0.5) * TILE]
  }
}

function patrol(world: World, g: Guard, choose: () => { tx: number; ty: number }, dwellFor: number): Status {
  if (g.dwell > 0 && !g.patrolTarget) {
    g.dwell -= 1 / 6
    g.body.pose = 'stand'
    if (world.rng() < 0.05) g.lookYaw = world.rng() * Math.PI * 2
    return 'running'
  }
  if (!g.patrolTarget) g.patrolTarget = choose()
  const t = g.patrolTarget
  const s = g.goTo(t.tx, t.ty, WALK)
  g.body.pose = 'walk'
  if (s !== 'running') {
    g.patrolTarget = null
    g.dwell = dwellFor * (0.5 + world.rng())
  }
  return 'running'
}

function nearestGrate(world: World, x: number, z: number) {
  let best = null as null | (typeof world.grates)[number]
  let bd = Infinity
  for (const gr of world.grates) {
    const d = Math.hypot((gr.tx + 0.5) * TILE - x, (gr.ty + 0.5) * TILE - z)
    if (d < bd) {
      bd = d
      best = gr
    }
  }
  return best
}

/**
 * The sick call, as a small state machine shared by the responders. Lead
 * officer opens the door and walks you to healthcare; the second (once they
 * have learned) hangs back by the door.
 */
function attendSick(world: World, g: Guard): Status {
  const call = world.sickCall!
  const p = world.player
  const cell = world.grid.cells.get(call.cell)!
  const door = cell.door
  const lead = call.responders[0] === g
  const outsideTy = door.ty < cell.rect.y0 ? door.ty - 1 : door.ty + 1
  g.body.pose = 'walk'

  if (call.stage === 'called') {
    const s = g.goTo(door.tx, outsideTy, WALK * 1.4, 0.6)
    if (s !== 'running' && lead) {
      if (world.memory.sickNeedsFroth && p.frothing <= 0) {
        g.say("You look fine to me. Get some kip.", 3)
        g.wary = Math.min(1, g.wary + 0.3)
        world.toast('The officer is not convinced. You need real symptoms.', 'bad')
        world.sickCall = null
        return 'success'
      }
      call.stage = 'atDoor'
      call.timer = 25
      g.say(`Alright ${p.name}, out you come. Slowly.`, 3)
    }
    return 'running'
  }

  if (call.stage === 'atDoor') {
    world.requestDoor(door, 'guard')
    g.face((door.tx + 0.5) * TILE, (door.ty + 0.5) * TILE)
    g.body.pose = 'stand'
    call.timer -= 1 / 6
    if (lead && g.distanceTo(p.body.x, p.body.z) < 2.2) {
      call.stage = 'escorting'
      p.escortedBy = g
    }
    if (call.timer <= 0) {
      g.say('Suit yourself.', 2)
      world.sickCall = null
    }
    return 'running'
  }

  const bed = { tx: 22, ty: 23 }
  if (call.stage === 'escorting') {
    if (!lead) return g.goTo(33, 24, WALK, 0.8)
    const d = g.distanceTo(p.body.x, p.body.z)
    if (d > 3.5) {
      g.stop()
      g.face(p.body.x, p.body.z)
      g.body.pose = 'stand'
      if (g.speechTimer <= 0) g.say('Keep up.', 1.5)
      return 'running'
    }
    const s = g.goTo(bed.tx + 1, bed.ty + 1, WALK * 0.9, 0.8)
    if (s !== 'running') {
      call.stage = 'treating'
      call.timer = 30
      g.say('Sit on the bed. Nurse will be along.', 3)
    }
    return 'running'
  }

  if (call.stage === 'treating') {
    // The officer drifts to the door and looks out: the window you have.
    const s = g.goTo(32, 24, WALK, 0.5)
    g.body.pose = s === 'running' ? 'walk' : 'stand'
    if (s !== 'running') g.lookYaw = Math.PI / 2 + Math.sin(call.timer * 0.7) * 0.9
    call.timer -= 1 / 6
    if (call.timer <= 0) {
      call.stage = 'returning'
      g.say('Right, nurse says paracetamol and back to bed.', 3)
    }
    return 'running'
  }

  // Returning.
  if (!lead) return g.goTo(door.tx, outsideTy, WALK, 0.8)
  const d = g.distanceTo(p.body.x, p.body.z)
  if (d > 3.5 && p.zone !== call.cell) {
    g.stop()
    g.face(p.body.x, p.body.z)
    g.body.pose = 'stand'
    return 'running'
  }
  if (p.zone === call.cell) {
    p.escortedBy = null
    world.sickCall = null
    return 'success'
  }
  return g.goTo(door.tx, outsideTy, WALK, 0.8)
}
