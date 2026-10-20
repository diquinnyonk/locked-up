/**
 * Headless checks of every way out, run against the real game code.
 *
 *   npx tsx scripts/scenarios.ts
 */
import { Scene } from 'three'
import { Game, type UiPort } from '../src/game/Game'
import { screenCall } from '../src/game/Phone'
import { TILE, tileCentre } from '../src/world/Grid'

;(globalThis as unknown as { window: unknown }).window = globalThis
;(globalThis as unknown as { addEventListener: unknown }).addEventListener = () => {}

let failures = 0
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures++
}

let lastTalk: { title: string; line: string; options: { label: string; enabled: boolean; run: () => void }[] } | null = null
function fresh(): { game: Game; log: string[]; g: any } {
  const log: string[] = []
  const ui: UiPort = {
    toast: (t) => log.push(t),
    talk: (title, line, options) => {
      lastTalk = { title, line, options }
    },
    phone: () => {},
    card: (t, b) => log.push(`[card] ${t}: ${b}`),
    end: (w, t) => log.push(`[end] ${w} ${t}`),
    closePanels: () => {},
    panelOpen: false,
  }
  const game = new Game(new Scene(), ui, 'Tester')
  return { game, log, g: game as any }
}
const dt = 1 / 30
function run(game: Game, seconds: number, until?: () => boolean): boolean {
  for (let i = 0; i < seconds / dt; i++) {
    game.update(dt)
    if (until?.()) return true
  }
  return false
}
function prompt(game: Game, text: string): boolean {
  ;(game as any).buildPrompts()
  const p = game.prompts.find((pr) => pr.label.includes(text))
  p?.run()
  return !!p
}
function put(game: Game, tx: number, ty: number): void {
  const c = tileCentre(tx, ty)
  game.player.body.x = c.x
  game.player.body.z = c.z
  game.player.zone = game.grid.zoneAtWorld(c.x, c.z)
}

// ---- Phone ----
check('phone: innocent call passes', screenCall('Tell Nan I love her and the dog is fine', 0).ok)
check('phone: "tonight" is flagged', screenCall('see you tonight bro', 0).flagged === 'tonight')
check('phone: time is flagged', !!screenCall('be there at 11:30 yeah', 0).flagged)
check('phone: "soon" passes at first', screenCall('see you soon bruv love you', 0).ok)
check('phone: "soon" flagged once they learn', !screenCall('see you soon bruv love you', 2).ok)

// ---- Toothpaste ----
{
  const { game, log } = fresh()
  const door = game.grid.cells.get('cellA7')!.door
  game.clock.skipTo(20 * 60)
  run(game, 1)
  put(game, door.tx, door.ty + 1)
  check('toothpaste: prompt offered in doorway by day', prompt(game, 'toothpaste'))
  check('toothpaste: lock jammed', door.jammed)
  put(game, 18, 18)
  game.clock.skipTo(21 * 60 + 39)
  run(game, 2)
  check('toothpaste: lights out reports the bolt failed', log.some((l) => l.includes('toothpaste held')))
  check('toothpaste: door not locked', !door.locked)
  put(game, door.tx, door.ty + 1)
  check('toothpaste: can ease it open at night', prompt(game, 'Ease the door'))
  run(game, 1)
  check('toothpaste: door swings open', door.openness > 0.7, `openness ${door.openness.toFixed(2)}`)
  put(game, door.tx, door.ty - 1)
  run(game, 0.2)
  check('toothpaste: on the landing at night is out of bounds', game.player.illegal === 2)
  check('toothpaste: not an attempt until an officer sees you', game.player.attempt === null || game.guards.some((gu) => gu.seesPlayer), `attempt ${game.player.attempt}`)
  // Walk up and down the landing until the night officer finds us.
  game.input.forced = { x: 1, z: 0 }
  const caught = run(game, 90, () => game.memory.attemptsUsed > 0)
  game.input.forced = null
  check('toothpaste: night officer catches you', caught, log.filter((l) => l.startsWith('[card]')).join(' | ').slice(0, 160))
  check('toothpaste: the prison learned it', game.memory.used.toothpaste === 1 && game.memory.lockCheckChance > 0)
  run(game, 4)
  check('toothpaste: released to cell at unlock', game.player.zone === 'cellA7' && game.clock.period === 'unlock', `${game.player.zone} ${game.clock.text}`)
}

// ---- Fake sickness ----
{
  const { game, g, log } = fresh()
  game.clock.skipTo(23 * 60)
  run(game, 1)
  put(game, 18, 18)
  g.callSick()
  check('sick: call registered', !!game.sickCall)
  const atDoor = run(game, 40, () => game.sickCall?.stage === 'atDoor')
  check('sick: officer arrives and opens the door', atDoor, `stage ${game.sickCall?.stage}`)
  const door = game.grid.cells.get('cellA7')!.door
  run(game, 1)
  check('sick: door open for you', door.openness > 0.7)
  const lead = game.sickCall!.responders[0]
  put(game, door.tx, door.ty)
  game.player.body.x = lead.x
  game.player.body.z = lead.z + 0.8
  run(game, 0.5)
  check('sick: escorted', game.player.escortedBy === lead)
  // Follow the officer to healthcare.
  const treating = run(game, 90, () => {
    game.player.body.x = lead.x - Math.sin(lead.body.yaw) * 1.2
    game.player.body.z = lead.z - Math.cos(lead.body.yaw) * 1.2
    return game.sickCall?.stage === 'treating'
  })
  check('sick: walked to healthcare', treating && game.player.zone === 'infirmary', game.player.zone)
  check('sick: not illegal while escorted', game.player.illegal === 0 && !game.player.attempt)
  // Bolt for the door.
  game.player.body.x = 33.5 * TILE
  game.player.body.z = 18 * TILE
  run(game, 0.5)
  check('sick: slipping the escort starts a sick attempt', game.player.attempt === 'sick', `${game.player.attempt}`)
  void log
}

// ---- Riot at night ----
{
  const { game, g, log } = fresh()
  game.clock.skipTo(23 * 60)
  game.memory.pay('firm', game.clock.minutes)
  run(game, 1)
  put(game, 18, 18)
  g.kickOff()
  check('riot: landing goes up with enough backers', game.riot.active && game.riot.night, log[log.length - 1])
  const door = game.grid.cells.get('cellA7')!.door
  const opened = run(game, 30, () => door.openness > 0.7)
  check('riot: officers open your cell', opened)
  const busy = game.guards.filter((gu) => gu.busy).length
  check('riot: officers are busy on the landing', busy >= 3, `${busy} busy`)
}

// ---- Paying a firm ----
{
  const { game, log } = fresh()
  const boss = game.gangLeader('firm')!
  check('gangs: four firms each with a boss', (['firm', 'crows', 'lions', 'northern'] as const).every((g) => !!game.gangLeader(g)))
  check('gangs: five of the home firm on each wing', game.prisoners.filter((p) => p.gang === 'firm' && p.block === 'A').length === 5)
  for (let i = 0; i < 6; i++) game.player.inventory.add('snout')
  game.talkTo(boss)
  const pay = lastTalk?.options.find((o) => o.label.startsWith('Pay'))
  check('gangs: boss offers to back a riot for snout', !!pay && pay.enabled, pay?.label)
  pay?.run()
  check('gangs: the Firm now backs you', game.memory.backing('firm', game.clock.minutes) && boss.supporter, log[log.length - 1])
  check('gangs: their rival takes offence', game.memory.gangs.crows.hostility > 0)
  check('gangs: the price goes up next time', game.memory.bribePrice('firm') > 4)
}

// ---- Jobs from the firms ----
{
  const { game, log } = fresh()
  const boss = game.gangLeader('firm')!
  const job = (label: string) => {
    game.talkTo(boss)
    return lastTalk?.options.find((o) => o.label.includes(label))
  }
  const take = () => lastTalk?.options.find((o) => o.label.startsWith('Take the job'))?.run()
  job('Got any work')?.run()
  check('jobs: the Firm boss pitches a job', !!lastTalk?.title.includes('Soap Opera'), lastTalk?.title)
  take()
  check('jobs: job taken', game.missions.active.length === 1)
  game.player.inventory.add('soap')
  const snoutBefore = game.player.inventory.count('snout')
  const price = game.memory.bribePrice('firm')
  job("It's done")?.run()
  check('jobs: soap handed in for snout', game.player.inventory.count('snout') === snoutBefore + 2 && !game.player.inventory.has('soap'), log[log.length - 1])
  check('jobs: the riot price drops', game.memory.bribePrice('firm') < price, `${price} -> ${game.memory.bribePrice('firm')}`)

  job('Got any work')?.run()
  take()
  check('jobs: handed a parcel to plant', game.player.inventory.has('parcel'))
  game.player.inventory.remove('parcel')
  game.dynamic.spawnItem('parcel', 60 * 2, 14.5 * 2, 'blockB')
  run(game, 0.1)
  check('jobs: parcel planted on B wing', game.missions.active[0]?.done === true)
  job("It's done")?.run()

  job('Got any work')?.run()
  check('jobs: the beat-up job names a Crow', !!game.missions && /Crows|trifle/.test(lastTalk?.line ?? ''), lastTalk?.line.slice(0, 60))
  take()
  const target = game.missions.active[0].target!
  check('jobs: target is a rival', target.gang === 'crows')
  target.hit(20, 'player')
  run(game, 0.1)
  check('jobs: flattening him counts', game.missions.active[0].done, `${target.name}`)
  job("It's done")?.run()
  const gotLighter = game.player.inventory.has('lighter') || game.dynamic.items.some((i) => i.id === 'lighter' && Math.hypot(i.x - game.player.body.x, i.z - game.player.body.z) < 2)
  check('jobs: three Firm jobs done, lighter paid (in pockets or at your feet)', game.missions.completedCount === 3 && gotLighter)
}

// ---- Jobs from officers ----
{
  const { game, log } = fresh()
  const officer = game.guards.find((gu) => game.missions.hasOffer(gu))!
  check('jobs: some officers want a word', !!officer)
  ;(game.missions as any).officerOffers.set(officer, (game.missions as any).officerOffers.get(officer))
  // Force the biscuit job so the test knows what to bring.
  const all = [...(game.missions as any).officerOffers.values()]
  const custard = all.find((t: any) => t.id === 'custard-crisis') ?? { ...all[0], id: 'custard-crisis', objective: { kind: 'fetch', item: 'biscuits' }, reward: { blindEye: true } }
  ;(game.missions as any).officerOffers.set(officer, custard)
  game.player.body.x = officer.x
  game.player.body.z = officer.z + 1
  ;(game as any).talkToGuard(officer)
  lastTalk?.options.find((o) => o.label.includes('Got any work'))?.run()
  lastTalk?.options.find((o) => o.label.startsWith('Take the job'))?.run()
  game.player.inventory.add('biscuits')
  ;(game as any).talkToGuard(officer)
  lastTalk?.options.find((o) => o.label.includes("It's done"))?.run()
  check('jobs: officer owes you a blind eye', officer.blindEye, log[log.length - 1])
  // Now get caught out of bounds by him at night.
  game.clock.skipTo(23 * 60)
  officer.stop()
  officer.body.x = 20.5 * 2
  officer.body.z = 14.5 * 2
  officer.body.yaw = Math.PI / 2
  game.player.body.x = officer.x + 3
  game.player.body.z = officer.z
  for (const gu of game.guards) if (gu !== officer) { gu.body.x = 140; gu.body.z = 115 }
  const pin = { x: officer.x, z: officer.z }
  run(game, 3, () => {
    officer.body.x = pin.x
    officer.body.z = pin.z
    officer.body.yaw = Math.PI / 2
    game.player.body.x = pin.x + 3
    game.player.body.z = pin.z
    return !officer.blindEye
  })
  run(game, 0.5)
  check('jobs: he looks the other way', !officer.blindEye && !officer.chasing && officer.ignoring > 0, log.filter((l) => l.includes('other way'))[0])
}

// ---- The quiet shift ----
{
  const { game, log } = fresh()
  const officer = game.guards[0]
  const quiet = { id: 'quiet-shift', title: 'The Quiet Shift', brief: 'Keep your nose clean till {time}.', objective: { kind: 'behave', hours: 3 }, reward: { snout: 2 }, thanks: 'ta' }
  ;(game.missions as any).officerOffers.set(officer, quiet)
  ;(game as any).talkToGuard(officer)
  lastTalk?.options.find((o) => o.label.includes('Got any work'))?.run()
  lastTalk?.options.find((o) => o.label.startsWith('Take the job'))?.run()
  game.warn(game.guards[1], 'Oi.')
  check('jobs: a warning ruins the quiet shift', game.missions.active.length === 0 && log.some((l) => l.startsWith('Job failed')))
}

// ---- Riot refused without backing ----
{
  const { game, g, log } = fresh()
  for (const p of game.prisoners) p.trust = 0
  game.clock.skipTo(23 * 60)
  run(game, 1)
  put(game, 18, 18)
  g.kickOff()
  check('riot: nobody kicks off without paying the firm', !game.riot.active && log[log.length - 1].includes('Pay'), log[log.length - 1])
}

// ---- Vents ----
{
  const { game, log } = fresh()
  game.player.inventory.add('spoon')
  game.clock.skipTo(23 * 60)
  run(game, 1)
  put(game, 19, 19)
  check('vent: spoon turns the rusty screws', prompt(game, 'Unscrew'))
  check('vent: climb in', prompt(game, 'Climb into'))
  check('vent: in the ducts', game.player.inVent)
  run(game, 0.2)
  check('vent: out of bounds but unseen, so not yet an attempt', game.player.illegal === 2 && game.player.attempt === null)
  // Run (loud) along the ducts toward the hub.
  game.input.forced = { x: 0, z: -1 }
  run(game, 2)
  game.input.forced = { x: 1, z: 0 }
  ;(game.input as any).held.add('ShiftLeft')
  const caught = run(game, 120, () => game.memory.attemptsUsed > 0)
  if (!caught) console.log('   vent debug:', game.player.body.x.toFixed(1), game.player.body.z.toFixed(1), game.guards.filter((gu) => gu.investigate).map((gu) => `${gu.name}->${gu.investigate!.x},${gu.investigate!.z} at ${gu.x.toFixed(0)},${gu.z.toFixed(0)}`).join('; '))
  ;(game.input as any).held.clear()
  game.input.forced = null
  check('vent: running in the ducts gets you heard and caught', caught, log.filter((l) => l.includes('vent') || l.includes('card')).slice(-2).join(' | ').slice(0, 200))
  check('vent: your cell vent is welded shut', game.grid.grates.find((gr) => gr.id === 'your cell')!.sealed)
}

// ---- Pickpocket ----
{
  const { game, log } = fresh()
  run(game, 2)
  const guard = game.guards.find((gu) => gu.duty === 'gate' && gu.block === 'A')!
  guard.stop()
  game.player.body.x = guard.x - Math.sin(guard.body.yaw) * 1.0
  game.player.body.z = guard.z - Math.cos(guard.body.yaw) * 1.0
  ;(game as any).buildPrompts()
  const offered = game.prompts.some((p) => p.label.includes('Lift'))
  check('key: lift prompt when behind an officer', offered, game.prompts.map((p) => p.label).join(', '))
  game.rng = (() => 0.01) as any
  prompt(game, 'Lift')
  check('key: keys taken', game.player.inventory.has('guardKey'), log[log.length - 1])
  // The key opens a gate.
  const gate = game.grid.blockGate.get('A')!
  put(game, gate.tx - 1, gate.ty)
  game.clock.skipTo(23 * 60)
  put(game, 18, 18)
  run(game, 3)
  put(game, gate.tx - 1, gate.ty)
  check('key: unlock prompt at a gate', prompt(game, 'Unlock with'), game.prompts.map((p) => p.label).join(', '))
  run(game, 0.6)
  check('key: gate opens', gate.openness > 0.7)
}

// ---- Spotted, then back to the cell ----
{
  const { game, log } = fresh()
  game.clock.skipTo(23 * 60)
  run(game, 1)
  const officer = game.guards.find((gu) => gu.block === 'A' && gu.duty === 'landing')!
  // Put the landing officer mid-landing facing east, and stand four metres in front.
  officer.stop()
  officer.body.x = 20.5 * TILE
  officer.body.z = 14.5 * TILE
  officer.body.yaw = Math.PI / 2
  game.player.body.x = officer.x + 4
  game.player.body.z = officer.z
  const spotted = run(game, 3, () => game.player.attempt !== null)
  check('seen: being spotted out of bounds starts the attempt', spotted, `${game.player.attempt}`)
  // Slip back behind the door with nobody on you.
  for (const gu of game.guards) {
    gu.chasing = false
    gu.suspicion = 0
    gu.lastSeen = null
    gu.body.x = 80
    gu.body.z = 120
  }
  put(game, 18, 18)
  run(game, 0.3)
  check('seen: getting back to your cell cancels it', game.player.attempt === null && game.memory.attemptsUsed === 0, log[log.length - 1])
}

// ---- Sight guide ----
{
  const { game } = fresh()
  const len = game.grid.rayLength(36.5 * 2, 14.5 * 2, Math.PI, 30)
  check('sight: the guide stops at walls', len < 6, `ray north from the corridor runs ${len.toFixed(1)}m`)
}

// ---- Dressed as an officer ----
{
  const { game, log } = fresh()
  game.player.inventory.add('guardUniform')
  game.useItem(game.player.inventory.items.findIndex((i) => i.id === 'guardUniform'))
  check('disguise: uniform goes on', game.player.disguise === 'guard' && game.player.body.cap && game.player.body.uniform)
  game.clock.skipTo(23 * 60)
  run(game, 1)
  const officer = game.guards.find((gu) => gu.block === 'A' && gu.duty === 'landing')!
  officer.stop()
  officer.body.x = 20.5 * TILE
  officer.body.z = 14.5 * TILE
  officer.body.yaw = Math.PI / 2
  game.player.body.x = officer.x + 6
  game.player.body.z = officer.z
  run(game, 2)
  check('disguise: an officer at a distance sees a colleague', game.player.illegal === 0 && game.player.attempt === null && !officer.chasing)
  const pin = { x: officer.x, z: officer.z }
  game.player.body.x = pin.x + 1.5
  const blown = run(game, 8, () => {
    // Keep him stood still, staring straight at you.
    officer.stop()
    officer.body.x = pin.x
    officer.body.z = pin.z
    officer.body.yaw = Math.PI / 2
    game.player.body.x = pin.x + 1.5
    game.player.body.z = pin.z
    return game.player.disguiseBlown
  })
  check('disguise: up close for too long, it is blown', blown, log.filter((l) => l.includes('blown'))[0])
}

// ---- Clocking off ----
{
  const { game, log } = fresh()
  game.player.inventory.add('guardUniform')
  game.useItem(game.player.inventory.items.findIndex((i) => i.id === 'guardUniform'))
  game.clock.skipTo(20 * 60 + 50)
  run(game, 0.2)
  const exit = game.fixtures.staffExit
  game.player.body.x = exit.x
  game.player.body.z = exit.z - 1.5
  game.player.zone = 'bay'
  ;(game as any).rng = () => 0.01
  check('disguise: clock off at shift change', prompt(game, 'Clock off'))
  check('disguise: walks out with the day shift', game.over && log.some((l) => l.startsWith('[end] true Clocked off')), log.slice(-1)[0])
}

// ---- Visitor in a frock, rumbled ----
{
  const { game, log } = fresh()
  game.player.inventory.add('wig')
  game.player.inventory.add('dress')
  const recipe = (await import('../src/game/Items')).RECIPES.find((r) => r.makes === 'visitorDisguise')!
  game.craft(recipe)
  game.useItem(game.player.inventory.items.findIndex((i) => i.id === 'visitorDisguise'))
  check('visitor: frock and wig on', game.player.disguise === 'visitor' && game.player.body.skirt !== null && game.player.body.longHair)
  game.clock.skipTo(15 * 60 + 31)
  run(game, 0.5)
  const gate = game.fixtures.visitorsGate
  game.player.body.x = gate.x
  game.player.body.z = gate.z - 2
  game.player.zone = 'visits'
  check('visitor: visitors are on their way out', game.visitors.some((v) => v.body.visible && v.body.pose === 'walk'))
  ;(game as any).rng = () => 0.99
  check('visitor: shuffle out prompt', prompt(game, 'Shuffle out'))
  check('visitor: rumbled at the gate counts as an attempt', game.memory.used.visitorDisguise === 1 && game.memory.attemptsUsed === 1, log.filter((l) => l.startsWith('[card]')).slice(-1)[0]?.slice(0, 80))
  check('visitor: odds drop next time', game.memory.sillyExitChance('visitorDisguise') < 0.8)
}

// ---- The laundry van ----
{
  const { game, log } = fresh()
  game.clock.skipTo(10 * 60 + 45)
  run(game, 0.2)
  const basket = game.fixtures.laundryBasket
  game.player.body.x = basket.x
  game.player.body.z = basket.z - 1
  game.player.zone = 'laundry'
  check('laundry: climb into the basket', prompt(game, 'Climb into the laundry basket') && game.player.inBasket)
  ;(game as any).rng = () => 0.01
  const out = run(game, 30, () => game.over)
  check('laundry: the van takes you out', out && log.some((l) => l.startsWith('[end] true Spin cycle')), log.slice(-1)[0])
}

// ---- A knocked-out officer's uniform ----
{
  const { game, log } = fresh()
  run(game, 1)
  const g = game.guards[0]
  g.ko = 20
  game.player.body.x = g.x
  game.player.body.z = g.z + 1
  check('uniform: nick it off a knocked-out officer', prompt(game, 'uniform') && game.player.inventory.has('guardUniform') && g.uniformTaken, log.slice(-1)[0])
}

// ---- New rooms ----
{
  const { game } = fresh()
  const rooms = ['chapel', 'visits', 'gym', 'library', 'mess', 'bay']
  check('rooms: six new rooms on the map', rooms.every((r) => game.grid.rooms.has(r)))
  check('rooms: each has a vent grille', rooms.every((r) => game.grid.grates.some((gr) => gr.zone === r)), game.grid.grates.map((g) => g.zone).join(','))
}

// ---- Eight failures end it ----
{
  const { game, log } = fresh()
  for (let i = 0; i < 8; i++) {
    ;(game as any).punished = false
    game.player.attempt = 'gate'
    game.caught(game.guards[0])
  }
  check('rounds: second round reached and then the end', log.some((l) => l.includes('All four attempts')) && log.some((l) => l.startsWith('[end] false')), log.filter((l) => l.startsWith('[end]')).join())
}

// ---- Win ----
{
  const { game, log } = fresh()
  game.contactNights = 3
  game.clock.skipTo(23 * 60)
  run(game, 1)
  const car = game.dynamic.car.position
  game.player.body.x = car.x + 6
  game.player.body.z = car.z - 6
  game.player.zone = 'outside'
  game.input.forced = { x: -0.7, z: 0.7 }
  const won = run(game, 6, () => game.over)
  check('win: reach the car outside with contact made', won && log.some((l) => l.startsWith('[end] true')), log.slice(-1)[0])
}

console.log(failures ? `\n${failures} failing` : '\nall passing')
process.exit(failures ? 1 : 0)
