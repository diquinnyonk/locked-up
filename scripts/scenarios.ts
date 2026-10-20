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

function fresh(): { game: Game; log: string[]; g: any } {
  const log: string[] = []
  const ui: UiPort = {
    toast: (t) => log.push(t),
    talk: () => {},
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
  check('toothpaste: on the landing at night is an attempt', game.player.attempt === 'toothpaste', `attempt ${game.player.attempt}`)
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
  const mine = game.prisoners.filter((p) => p.block === 'A').slice(0, 6)
  for (const p of mine) p.trust = 1
  game.clock.skipTo(23 * 60)
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

// ---- Riot refused without backing ----
{
  const { game, g, log } = fresh()
  for (const p of game.prisoners) p.trust = 0
  game.clock.skipTo(23 * 60)
  run(game, 1)
  put(game, 18, 18)
  g.kickOff()
  check('riot: nobody joins without trust', !game.riot.active, log[log.length - 1])
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
  check('vent: is an attempt', game.player.attempt === 'vent')
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
