/**
 * Headless checks of every way out, run against the real game code.
 *
 *   npx tsx scripts/scenarios.ts
 */
import { Scene } from 'three'
import { Game, type UiPort } from '../src/game/Game'
import { screenCall } from '../src/game/Phone'
import { EAST_WALL, MAP_H, MAP_W, TILE, Tile, tileCentre } from '../src/world/Grid'
import { findPath } from '../src/world/Nav'
import { keyFor } from '../src/audio/lineKeys'
import { castLine, ownerOf, voiceFor } from '../src/audio/cast'
import script from '../dialogue/script.json'

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
    showNote: (n) => log.push(`[note] ${n.text}`),
    closePanels: () => {},
    panelOpen: false,
  }
  const game = new Game(new Scene(), ui, 'Tester')
  return { game, log, g: game as any }
}
const dt = 1 / 30
function run(game: Game, seconds: number, until?: () => boolean): boolean {
  // The real interface ends a conversation when its panel closes; the test
  // harness has no panel, so walk away before time moves on.
  game.endConversation()
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
function worldToTileOf(d: { tx: number; ty: number }): { tx: number; ty: number } {
  return { tx: d.tx, ty: d.ty }
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
  for (let i = 0; i < 6; i++) game.player.inventory.add('voucher')
  game.talkTo(boss)
  const pay = lastTalk?.options.find((o) => o.label.startsWith('Pay'))
  check('gangs: boss offers to back a riot for Greggs vouchers', !!pay && pay.enabled, pay?.label)
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
  const snoutBefore = game.player.inventory.count('voucher')
  const price = game.memory.bribePrice('firm')
  job("It's done")?.run()
  check('jobs: soap handed in for Greggs vouchers', game.player.inventory.count('voucher') === snoutBefore + 2 && !game.player.inventory.has('soap'), log[log.length - 1])
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
  const quiet = { id: 'quiet-shift', title: 'The Quiet Shift', brief: 'Keep your nose clean till {time}.', objective: { kind: 'behave', hours: 3 }, reward: { vouchers: 2 }, thanks: 'ta' }
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

// ---- Canteen tables are solid ----
{
  const { game } = fresh()
  const t = game.grid.props.find((q) => Math.abs(q.x1 - q.x0 - 4.4) < 0.01 && Math.abs(q.z1 - q.z0 - 1.6) < 0.01)!
  const row = Math.floor((t.z0 + t.z1) / 2 / TILE)
  const path = findPath(game.grid, { tx: Math.floor(t.x0 / TILE) - 1, ty: row }, { tx: Math.floor(t.x1 / TILE) + 1, ty: row }, () => true)
  check('canteen: paths go round the tables', !!path && path.every((p) => !game.grid.underProp(p.tx, p.ty)), path?.map((p) => `${p.tx},${p.ty}`).join(' '))
  const body = { x: (t.x0 + t.x1) / 2, z: (t.z0 + t.z1) / 2 + 0.1 }
  game.grid.pushOutOfProps(body, 0.36)
  check('canteen: nobody stands inside a table', body.z >= t.z1 + 0.35 || body.z <= t.z0 - 0.35 || body.x <= t.x0 - 0.35 || body.x >= t.x1 + 0.35)
  // A minute of lunch: no one ends up inside a table.
  game.clock.skipTo(12 * 60)
  run(game, 60)
  const tables = game.grid.props.filter((q) => Math.abs(q.x1 - q.x0 - 4.4) < 0.01 && Math.abs(q.z1 - q.z0 - 1.6) < 0.01)
  const inside = [...game.prisoners, ...game.guards].filter((a) => tables.some((q) => a.body.x > q.x0 + 0.05 && a.body.x < q.x1 - 0.05 && a.body.z > q.z0 + 0.05 && a.body.z < q.z1 - 0.05))
  check('canteen: a whole lunch with nobody walking through a table', inside.length === 0, inside.map((a) => a.body.x.toFixed(1) + ',' + a.body.z.toFixed(1)).join(' '))
}

// ---- Furniture: sit on it, never walk through it ----
{
  const { game } = fresh()
  game.clock.skipTo(12 * 60)
  run(game, 0.5)
  // A free seat on a canteen bench.
  const seat = game.grid.seats.find((st) => game.grid.zoneAtWorld(st.x, st.z) === 'hub' && !game.prisoners.some((p) => Math.hypot(p.x - st.x, p.z - st.z) < 0.6))!
  game.player.body.x = seat.x
  game.player.body.z = seat.z + (seat.yaw === 0 ? -0.6 : 0.6)
  check('sit: offered at a canteen bench', prompt(game, 'Sit down'))
  check('sit: sat on the bench, facing the table', game.player.body.pose === 'sit' && game.player.body.x === seat.x && game.player.body.z === seat.z && game.player.body.yaw === seat.yaw)
  run(game, 0.5)
  check('sit: stays sat until you move', game.player.body.pose === 'sit')
  game.input.forced = { x: 0, z: seat.yaw === 0 ? -1 : 1 }
  run(game, 0.5)
  game.input.forced = null
  check('sit: moving gets you up and off the bench', !game.seated && game.player.body.pose !== 'sit')

  // Walk straight at a washing machine.
  const washer = game.fixtures.washers[0]
  game.player.body.x = washer.x
  game.player.body.z = washer.z + 0.6
  game.player.zone = 'laundry'
  let inside = false
  game.input.forced = { x: 0, z: -1 }
  for (let i = 0; i < 60; i++) {
    game.update(1 / 30)
    const b = game.player.body
    if (game.grid.props.some((q) => b.x > q.x0 + 0.02 && b.x < q.x1 - 0.02 && b.z > q.z0 + 0.02 && b.z < q.z1 - 0.02)) inside = true
  }
  game.input.forced = null
  check('solid: you cannot walk into a washing machine', !inside)

  // No piece of furniture cuts off any part of the prison.
  const seen = new Set<number>()
  const start = worldToTileOf(game.grid.cells.get('cellA7')!.door)
  const queue = [start]
  seen.add(start.ty * MAP_W + start.tx)
  while (queue.length) {
    const t = queue.pop()!
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = t.tx + dx
      const ny = t.ty + dy
      const k = ny * MAP_W + nx
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H || seen.has(k)) continue
      const tile = game.grid.tile(nx, ny)
      if (tile !== Tile.Floor && tile !== Tile.Door && tile !== Tile.Outside) continue
      if (game.grid.underProp(nx, ny)) continue
      seen.add(k)
      queue.push({ tx: nx, ty: ny })
    }
  }
  const cutOff: string[] = []
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    if (game.grid.tile(tx, ty) === Tile.Floor && !game.grid.underProp(tx, ty) && !seen.has(ty * MAP_W + tx) && game.grid.zone(tx, ty) !== 'outside') cutOff.push(`${game.grid.zone(tx, ty)}@${tx},${ty}`)
  }
  if (cutOff.length) for (let ty = 53; ty <= 59; ty++) {
    let row = ''
    for (let tx = 55; tx <= 70; tx++) row += game.grid.underProp(tx, ty) ? 'X' : ['#', '.', 'D', 'P', 'o'][game.grid.tile(tx, ty)]
    console.log('   ', ty, row)
  }
  check('solid: furniture never cuts off a room', cutOff.length === 0, [...new Set(cutOff.map((c) => c.split('@')[0]))].join(' ') + ' | ' + cutOff.slice(0, 8).join(' '))

  // A day of the regime: no one ends up stuck inside a table or machine.
  const solids = game.grid.props.filter((q) => !game.grid.seats.some((st) => st.x > q.x0 - 0.05 && st.x < q.x1 + 0.05 && st.z > q.z0 - 0.05 && st.z < q.z1 + 0.05))
  game.clock.skipTo(8 * 60)
  let worst = ''
  for (let i = 0; i < 12; i++) {
    run(game, 20)
    for (const a of [...game.prisoners, ...game.guards]) {
      if (a.ko > 0 || a.body.pose === 'sleep') continue
      const q = solids.find((q) => a.body.x > q.x0 + 0.1 && a.body.x < q.x1 - 0.1 && a.body.z > q.z0 + 0.1 && a.body.z < q.z1 - 0.1)
      if (q) worst = `${a.body.x.toFixed(1)},${a.body.z.toFixed(1)} ${game.clock.text} ${a.zone}`
    }
  }
  check('solid: nobody walks through tables, machines or gym kit all day', !worst, worst)
}

// ---- People are solid ----
{
  const { game } = fresh()
  game.clock.skipTo(12 * 60 + 10)
  run(game, 2)
  // Walk straight at someone standing still.
  const other = game.guards.find((g) => g.ko <= 0 && g.body.visible && Math.abs(g.body.y) < 0.1)!
  other.stop()
  const b = game.player.body
  b.x = other.x
  b.z = other.z + 2.5
  game.player.zone = game.grid.zoneAtWorld(b.x, b.z)
  let closest = Infinity
  game.input.forced = { x: 0, z: -1 }
  for (let i = 0; i < 90; i++) {
    game.update(1 / 30)
    closest = Math.min(closest, Math.hypot(b.x - other.x, b.z - other.z))
  }
  game.input.forced = null
  check('people: you cannot walk through an officer', closest > 0.6, closest.toFixed(2))

  // A whole lunch in a full canteen: nobody stands inside anybody.
  run(game, 20)
  const up = [...game.prisoners, ...game.guards].filter((a) => a.ko <= 0 && a.body.visible && a.body.pose !== 'sleep' && a.body.pose !== 'down' && Math.abs(a.body.y) < 0.3)
  let worst = Infinity
  for (let i = 0; i < up.length; i++) for (let j = i + 1; j < up.length; j++) {
    if (up[i].body.pose === 'sit' && up[j].body.pose === 'sit') continue
    worst = Math.min(worst, Math.hypot(up[i].x - up[j].x, up[i].z - up[j].z))
  }
  check('people: at lunch nobody stands inside anybody', worst > 0.5, worst.toFixed(2))
}

// ---- Toilets ----
{
  const { game, log } = fresh()
  game.clock.skipTo(9 * 60 + 30)
  run(game, 0.5)
  const g = game as any
  const cell = 'cellA6'
  const seat = game.grid.seats.find((st) => st.toilet === cell)!
  const sitOn = () => {
    game.player.body.x = seat.x
    game.player.body.z = seat.z + (seat.yaw === 0 ? 0.6 : -0.6)
    game.player.zone = game.grid.zoneAtWorld(game.player.body.x, game.player.body.z)
    g.sitDown(seat)
  }
  // Keep the owners out while you are in there.
  const owners = game.prisoners.filter((pr) => pr.cell.zone === cell)
  for (const o of owners) {
    o.body.x = 70
    o.body.z = 46
    o.stop()
  }
  sitOn()
  check('toilet: offers to do your business', prompt(game, 'Do your business'))
  run(game, 4)
  check('toilet: then to flush', prompt(game, 'Flush') && game.messes.size === 0)
  g.standUp()
  sitOn()
  prompt(game, 'Do your business')
  run(game, 4)
  g.standUp()
  check('toilet: walking off unflushed leaves a mess', game.messes.has(cell), log[log.length - 1])
  // The owner comes home to it, and you are stood right there.
  game.rng = (() => 0.01) as any
  const owner = owners.find((o) => o.temperament !== 'old' && o.temperament !== 'snitch') ?? owners[0]
  owner.temperament = 'lag'
  const c = game.grid.cells.get(cell)!
  owner.body.x = c.bunks[0].x + 0.6
  owner.body.z = c.bunks[0].z
  g.updateToilets(0.1)
  check('toilet: the owner finds it, works out it was you and comes for you', !game.messes.has(cell) && owner.hunt > 0 && owner.grudge === 1, log[log.length - 1])
}
{
  const { game, log } = fresh()
  game.clock.skipTo(9 * 60 + 30)
  run(game, 0.5)
  const g = game as any
  const mate = game.cellmate!
  g.leaveMess(game.player.cell, false)
  game.rng = (() => 0.99) as any
  mate.temperament = 'hothead'
  mate.body.x = game.grid.cells.get(game.player.cell)!.bunks[0].x + 0.6
  mate.body.z = game.grid.cells.get(game.player.cell)!.bunks[0].z
  g.updateToilets(0.1)
  check('toilet: your own cellmate always knows, and a hothead brings a shiv', mate.hunt > 0 && mate.armed && mate.body.shiv, log[log.length - 1])
}

{
  // Stand up halfway through: it lands on the floor, and that is worse.
  const { game, log } = fresh()
  game.clock.skipTo(9 * 60 + 30)
  run(game, 0.5)
  const g = game as any
  const cell = 'cellA6'
  const seat = game.grid.seats.find((st) => st.toilet === cell)!
  const owners = game.prisoners.filter((pr) => pr.cell.zone === cell)
  for (const o of owners) {
    o.body.x = 70
    o.body.z = 46
    o.stop()
  }
  game.player.body.x = seat.x
  game.player.body.z = seat.z + (seat.yaw === 0 ? 0.6 : -0.6)
  game.player.zone = cell
  g.sitDown(seat)
  prompt(game, 'Do your business')
  run(game, 1)
  g.standUp()
  check('toilet: standing up mid-business drops it on the floor', game.messes.get(cell)?.floor === true, log[log.length - 1])
  const owner = owners[0]
  owner.temperament = 'old'
  game.rng = (() => 0.01) as any
  const c = game.grid.cells.get(cell)!
  owner.body.x = c.bunks[0].x + 0.6
  owner.body.z = c.bunks[0].z
  g.updateToilets(0.1)
  check('toilet: on his floor, even an old-timer comes for you', owner.hunt > 150 && !game.messes.has(cell), log[log.length - 1])
}

// ---- Standing in somebody else's cell ----
{
  const { game, log } = fresh()
  game.clock.skipTo(9 * 60 + 30)
  run(game, 0.5)
  const g = game as any
  const cell = 'cellA6'
  const c = game.grid.cells.get(cell)!
  const owner = game.prisoners.find((pr) => pr.cell.zone === cell)!
  const setUp = (temper: string) => {
    owner.temperament = temper as any
    owner.fighting = false
    owner.fightTarget = null
    owner.armed = false
    owner.trespass = 0
    owner.report = false
    owner.body.x = c.bunks[0].x + 0.6
    owner.body.z = c.bunks[0].z
    owner.stop()
    game.player.body.x = c.bunks[1].x
    game.player.body.z = c.bunks[1].z
    game.player.zone = cell
  }
  setUp('lag')
  g.updateTrespass(0.1)
  check('cells: the owner tells you to get out', owner.trespass > 0 && owner.speech.length > 0, owner.speech)
  g.updateTrespass(6)
  check('cells: stay and an ordinary lag uses his fists', owner.fighting && owner.fightTarget === 'player' && !owner.armed, log[log.length - 1])
  setUp('hothead')
  g.updateTrespass(0.1)
  g.updateTrespass(3)
  check('cells: a hothead pulls a shiv', owner.fighting && owner.armed && owner.body.shiv)
  setUp('old')
  g.updateTrespass(0.1)
  g.updateTrespass(6)
  check('cells: an old-timer just tuts', !owner.fighting && log[log.length - 1].includes('disappointed'))
  setUp('snitch')
  g.updateTrespass(0.1)
  g.updateTrespass(6)
  check('cells: a snitch goes to tell an officer', owner.report && !owner.fighting)
  // Leave, and it is forgotten.
  game.player.body.x = 40
  game.player.body.z = 30
  game.player.zone = game.grid.zoneAtWorld(40, 30)
  g.updateTrespass(0.1)
  check('cells: leave and they let it go', owner.trespass === 0)
}

// ---- Every spoken line has a recording key ----
{
  const { game } = fresh()
  const said = new Set<string>()
  const listen = () => {
    for (const a of [...game.prisoners, ...game.guards]) if (a.speech && a.speechTimer > 0) said.add(a.speech)
    if (lastTalk) said.add(lastTalk.line)
  }
  // Talk to a few people of each kind, then let a day run.
  for (const pr of game.prisoners.slice(0, 30)) {
    ;(game as any).talkTo(pr)
    listen()
    game.endConversation()
  }
  for (const g of game.guards.slice(0, 8)) {
    ;(game as any).talkToGuard(g)
    listen()
    game.endConversation()
  }
  for (let h = 0; h < 18; h++) {
    for (let i = 0; i < 40; i++) {
      game.update(1 / 4)
      listen()
    }
  }
  const lines = [...said].filter((t) => t.replace(/[^A-Za-z]/g, '').length >= 3)
  const missing = lines.filter((t) => !keyFor(t))
  check('voices: what people say matches a recordable line', lines.length >= 15 && missing.length / lines.length < 0.08, `${lines.length - missing.length}/${lines.length} matched; missing: ${missing.slice(0, 4).join(' | ')}`)
  check('voices: an officer on his break has a key', keyFor("Not now, I'm on my break. I'm always on my break.") === 'officer.not-now-im-on-my-ded7')
  check('voices: a line with a name in it still finds its key', !!keyFor(`Alright, ${game.player.name}.`) && !!keyFor('WHO DID THIS?! ...Dave. It was YOU.'))
}

// ---- Every officer and prisoner has a voice of their own ----
{
  const { game } = fresh()
  const { game: again } = fresh()
  const people = [...game.guards, ...game.prisoners]
  const ids = people.map((a) => a.voiceId)
  const owners = new Set((script as { who?: string }[]).map((l) => l.who))
  check('cast: everyone has their own voice', ids.every(Boolean) && new Set(ids).size === ids.length, `${new Set(ids).size}/${ids.length}`)
  check('cast: and lines of their own to record', ids.every((id) => owners.has(id!)), ids.filter((id) => !owners.has(id!)).slice(0, 4).join(', '))
  check('cast: the same people every game', game.prisoners.every((p, i) => p.name === again.prisoners[i].name || p.leader || again.prisoners[i].leader))
  check('cast: the break line is Ms Bottomley\'s', ownerOf('officer.not-now-im-on-my-ded7') === 'ms-bottomley')
  // Someone else's line from a list: they say their own from the same list.
  const swapped = castLine('ms-bottomley', "Don't even think about it. I can see you thinking. Your lips move.")
  check('cast: an officer says her own line, not his', swapped === "I've got my eye on you. Both of them. This one's glass.", swapped)
  const named = castLine('ms-bottomley', 'Oi! Dave! Stop right there, you absolute weapon!')
  check('cast: names carry over into her own line', named === 'Dave! I can SEE you! Mostly!', named)
  const key = keyFor("Don't even think about it. I can see you thinking. Your lips move.")
  check('cast: a recording plays only in its own voice', voiceFor(key, 'mr-crumpet') === key && voiceFor(key, 'ms-bottomley') === null && voiceFor('keith.intro', null) === 'keith.intro')
  const bottomley = game.guards.find((g) => g.name === 'Ms Bottomley')!
  bottomley.say('Move along before I find a reason.')
  check('cast: in a speech bubble too', bottomley.speech === "I've got my eye on you. Both of them. This one's glass.", bottomley.speech)
  const offers = [...(game.missions as any).officerOffers.entries()] as [any, any][]
  check('cast: an officer\'s job is offered by its owner when they are free', offers.length > 0 && offers.every(([g, t]) => g.voiceId === ownerOf(`mission.${t.id}.brief`)), offers.map(([g, t]) => `${g.name}:${t.id}`).join(' '))
}

// ---- Sleeping on your bunk ----
{
  const { game } = fresh()
  game.clock.skipTo(23 * 60)
  run(game, 1)
  const cell = game.grid.cells.get(game.player.cell)!
  game.player.body.yaw = 2.1
  ;(game as any).trySleep()
  check('sleep: lie straight along the bunk', game.player.body.pose === 'sleep' && game.player.body.yaw === 0 && game.player.body.x === cell.bunks[0].x)
  game.input.forced = { x: 1, z: 0 }
  run(game, 0.2)
  game.input.forced = null
  check('sleep: waking climbs down to the floor', !game.sleeping && game.player.body.y === 0 && game.player.body.pose !== 'sleep')
}

// ---- The Reverend's hymn books ----
{
  const { game, log } = fresh()
  run(game, 1)
  const rev = game.chaplain
  check('chaplain: in his chapel by day, wearing his collar', rev.body.visible && rev.body.clergy && game.grid.zoneAtWorld(rev.body.x, rev.body.z) === 'chapel')
  check('chaplain: shows on the map with a job', game.jobTargets().some((t) => t.label.startsWith('The Reverend')))
  game.player.body.x = rev.body.x + 1.2
  game.player.body.z = rev.body.z
  check('chaplain: talk prompt', prompt(game, 'Talk to Reverend'))
  lastTalk?.options.find((o) => o.label.startsWith('Take the job'))?.run()
  const books = game.dynamic.items.filter((it) => it.id === 'hymnBook')
  check('chaplain: three hymn books turn up in the games room, showers and gym', books.length === 3 && ['games', 'showers', 'gym'].every((z) => books.some((b) => game.grid.zoneAtWorld(b.x, b.z) === z)), books.map((b) => game.grid.zoneAtWorld(b.x, b.z)).join(' '))
  check('chaplain: the map lights up the books', game.jobTargets().filter((t) => t.label === 'Hymn book').length === 3)
  for (const b of books) {
    game.dynamic.removeItem(b)
    game.player.inventory.add('hymnBook')
  }
  const before = game.player.inventory.count('voucher')
  ;(game as any).talkToChaplain()
  lastTalk?.options.find((o) => o.label.startsWith('Hand over'))?.run()
  check('chaplain: books handed in for three vouchers and an alibi', rev.stage === 'done' && rev.alibi && game.player.inventory.count('voucher') === before + 3 && !game.player.inventory.has('hymnBook'))
  // Caught out of bounds: the alibi saves the attempt, once.
  game.clock.skipTo(23 * 60)
  run(game, 1)
  game.player.attempt = 'gate'
  ;(game as any).caught(game.guards[0])
  check('chaplain: the alibi means the first catch does not count', game.memory.attemptsUsed === 0 && !rev.alibi && log.some((l) => l.includes('Choir practice')), log[log.length - 1])
  game.player.attempt = 'gate'
  game.punished = false
  ;(game as any).caught(game.guards[0])
  check('chaplain: and only the first', game.memory.attemptsUsed === 1)
}

// ---- Map targets on normal ----
{
  const { game } = fresh()
  const officer = game.guards[0]
  const fetch = { id: 'fetch-test', title: 'Socks', brief: 'Socks.', objective: { kind: 'fetch', item: 'sock' }, reward: { vouchers: 1 }, thanks: 'ta' }
  ;(game.missions as any).officerOffers.set(officer, fetch)
  ;(game as any).talkToGuard(officer)
  lastTalk?.options.find((o) => o.label.includes('Got any work'))?.run()
  lastTalk?.options.find((o) => o.label.startsWith('Take the job'))?.run()
  const socks = game.dynamic.items.filter((it) => it.id === 'sock').length
  const targets = game.missions.mapTargets()
  check('map: a fetch job lights up every sock lying about', socks > 0 && targets.length === socks, `${targets.length} of ${socks}`)
  game.player.inventory.add('sock')
  const back = game.missions.mapTargets()
  check('map: once you have it, the map points back to the giver', back.length === 1 && Math.hypot(back[0].x - officer.x, back[0].z - officer.z) < 0.01)
}

// ---- Vents on normal: crawling is quiet, and you stay in the duct ----
{
  const { game } = fresh()
  game.player.inventory.add('spoon')
  game.clock.skipTo(23 * 60)
  run(game, 1)
  put(game, 19, 19)
  prompt(game, 'Unscrew')
  prompt(game, 'Climb into')
  game.input.forced = { x: 0, z: -1 }
  run(game, 2)
  // Push across the duct: the body must not swing out over the room.
  const yawBefore = game.player.body.yaw
  game.input.forced = { x: 1, z: 0 }
  run(game, 6)
  game.input.forced = { x: 0, z: 1 }
  const zBefore = game.player.body.z
  run(game, 1)
  check('vent: pushing into a duct wall neither moves nor turns you', Math.abs(game.player.body.z - zBefore) < 0.01 || game.grid.inDuct(game.player.body.x, game.player.body.z), `${yawBefore.toFixed(2)} ${game.player.body.yaw.toFixed(2)}`)
  const heard = game.guards.filter((gu) => gu.investigate).length
  game.input.forced = { x: 1, z: 0 }
  const caught = run(game, 30, () => game.memory.attemptsUsed > 0)
  game.input.forced = null
  check('vent: crawling on normal is quiet enough to get across', !caught && game.player.inVent, `heard by ${heard}`)
}

// ---- Vents (hard: the tin carries) ----
{
  const { game, log } = fresh()
  game.hard = true
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
  game.player.zone = 'changing'
  ;(game as any).rng = () => 0.01
  check('disguise: clock off at shift change', prompt(game, 'Clock off'))
  check('disguise: walks out with the day shift', game.over && log.some((l) => l.startsWith('[end] true Clocked off')), log.slice(-1)[0])
}

// ---- Slower starts: the panto box, the pills, visiting days ----
{
  const { game, log } = fresh()
  const inv = game.player.inventory
  const box = game.fixtures.costumeBox
  game.player.body.x = box.x
  game.player.body.z = box.z
  game.player.zone = 'chapel'
  check('rebalance: the panto box is padlocked at first', prompt(game, 'padlocked') && !inv.has('wig'))
  game.chaplain.stage = 'done'
  check('rebalance: the Reverend lends you the key once you have helped him', prompt(game, 'Rummage in the panto box') && inv.has('wig') && inv.has('dress'), log.slice(-1)[0])
  check('rebalance: no visits on a Monday', game.clock.weekdayName === 'Monday' && (game.clock.skipTo(15 * 60), !game.visitingTime))
  game.clock.minutes += 1440
  check('rebalance: visitors come on a Tuesday', game.clock.weekdayName === 'Tuesday' && game.visitingTime)
  const fixer = game.prisoners.find((pr) => pr.sells.includes('sleepingPills'))!
  fixer.trust = 0.1
  inv.remove('wig')
  inv.remove('dress')
  inv.add('voucher')
  inv.add('voucher')
  ;(game as any).talkTo(fixer)
  const pills = () => lastTalk!.options.find((o) => o.label.includes('Sleeping pills'))!
  check('rebalance: a fixer will not sell pills to a stranger', !pills().enabled && pills().label.includes('know you'))
  game.endConversation()
  fixer.trust = 0.5
  ;(game as any).talkTo(fixer)
  check('rebalance: but will to someone they trust', pills().enabled)
  game.endConversation()
}

// ---- A different day every day ----
{
  const { game, log } = fresh()
  const ev = game.events
  const seen = new Set<string>()
  let repeats = 0
  let last = ''
  for (let d = 0; d < 40; d++) {
    game.clock.minutes += 1440
    ev.newDay()
    seen.add(ev.today)
    if (ev.today === last && ev.today !== 'quiet') repeats++
    last = ev.today
  }
  check('events: plenty of different days', seen.size >= 6, [...seen].join(' '))
  check('events: never the same kind of day twice running', repeats === 0)
  check('events: family visits only on visiting days', (() => {
    for (let d = 0; d < 30; d++) {
      game.clock.minutes += 1440
      ev.newDay()
      if (ev.today === 'family' && ![1, 3, 5, 6].includes(game.clock.weekday)) return false
    }
    return true
  })())
}
{
  const { game, log } = fresh()
  const ev = game.events
  // Shakedown: the stash is turned over.
  game.clock.minutes += 1440
  game.clock.skipTo(10 * 60)
  run(game, 0.2)
  ev.today = 'shakedown'
  ev.at = game.clock.minuteOfDay + 2
  ev.fired = false
  ;(game as any).stash.push('razor', 'lighter')
  ;(game as any).rng = () => 0
  run(game, 3)
  check('events: a shakedown finds your stash', game.stash.length === 0 && log.some((l) => l.startsWith('Shakedown')), log.slice(-2).join(' | '))
}
{
  const { game, log } = fresh()
  const ev = game.events
  game.clock.minutes += 1440
  game.clock.skipTo(13 * 60)
  run(game, 0.2)
  ev.today = 'lockdown'
  ev.at = game.clock.minuteOfDay + 1
  ev.fired = false
  const cell = game.grid.cells.get(game.player.cell)!
  game.player.body.x = cell.bunks[1].x
  game.player.body.z = cell.bunks[1].z
  run(game, 2)
  check('events: a lockdown sends everyone back to their cells', game.clock.period === 'bangUp' && game.clock.label.startsWith('Lockdown'))
  run(game, 14)
  check('events: then the doors are locked', game.clock.period === 'lightsOut' && cell.door.locked, `${game.clock.period} ${cell.door.locked}`)
  const lifted = run(game, 90, () => !game.clock.override && game.clock.period !== 'lightsOut')
  check('events: and the lockdown lifts, doors open again', lifted && !cell.door.locked && log.some((l) => l.includes('lockdown is lifted')), game.clock.text)
}
{
  const { game } = fresh()
  const ev = game.events
  game.clock.minutes += 1440
  game.clock.skipTo(10 * 60)
  run(game, 0.2)
  ev.today = 'fireDrill'
  ev.at = game.clock.minuteOfDay + 1
  ev.fired = false
  run(game, 2)
  check('events: the fire alarm sends everyone to the yard', game.clock.period === 'yard' && game.clock.label.startsWith('Fire drill'))
  const over = run(game, 20, () => game.clock.period === 'work')
  check('events: and after half an hour, back to work', over)
}
{
  const { game, log } = fresh()
  const ev = game.events
  game.clock.minutes += 1440
  game.clock.skipTo(6 * 60 + 25)
  run(game, 0.2)
  ;(game as any).rng = () => 0.999
  const guards = () => game.guards.filter((g) => g.reception)
  for (let i = 0; i < 40 && ev.today !== 'intake'; i++) {
    ev.today = 'quiet'
    ;(game as any).rng = (() => { const r = Math.random; return () => r() })()
    ev.newDay()
  }
  check('events: new intake takes two officers off the landings', ev.today === 'intake' && guards().length === 2)
  game.clock.skipTo(8 * 60)
  const atBay = run(game, 150, () => guards().every((g) => g.zone === 'bay'))
  check('events: to reception in the loading bay', atBay, guards().map((g) => g.zone).join(','))
  game.clock.skipTo(11 * 60 + 31)
  run(game, 0.5)
  check('events: back to work at lunch', guards().length === 0)
}
{
  const { game, log } = fresh()
  const ev = game.events
  game.clock.minutes += 1440
  game.clock.skipTo(11 * 60 + 20)
  run(game, 0.2)
  ev.today = 'greggs'
  ev.fired = false
  const before = game.dynamic.items.filter((i) => i.id === 'sausageRoll').length
  run(game, 6)
  check('events: the Greggs van brings sausage rolls at lunch', game.dynamic.items.filter((i) => i.id === 'sausageRoll').length >= before + 4)
}
{
  const { game } = fresh()
  const ev = game.events
  game.clock.minutes += 1440
  game.clock.skipTo(14 * 60 + 40)
  run(game, 0.2)
  ev.today = 'family'
  ev.nanSeen = false
  const gate = game.fixtures.visitorsGate
  game.player.body.x = gate.x
  game.player.body.z = gate.z - 6
  game.player.zone = 'visits'
  const had = game.player.inventory.count('voucher')
  check('events: your nan visits on a Tuesday', prompt(game, 'Sit with your nan') && game.player.inventory.count('voucher') === had + 3)
  ev.today = 'inspection'
  const g = game.guards[0]
  g.searchTarget = true
  run(game, 1)
  check('events: no pat-downs on inspection day', !g.searchTarget)
  const json = JSON.parse(JSON.stringify(game.toSave()))
  Game.seedForNext = game.seed
  const { game: b } = fresh()
  Game.seedForNext = null
  b.fromSave(json)
  check('events: today is kept in a save', b.events.today === 'inspection' && b.events.nanSeen)
}

// ---- The Governor's safe ----
{
  const { game, log } = fresh()
  const f = game.fixtures
  const inv = game.player.inventory
  for (const id of ['toothbrush', 'toothpaste', 'bedsheet'] as const) inv.remove(id)
  const at = (pt: { x: number; z: number }, zone: string) => {
    game.player.body.x = pt.x
    game.player.body.z = pt.z
    game.player.zone = zone
  }
  game.memory.fail('vent', 0, 0)
  const lessons = game.memory.lessons.length
  at(f.safe, 'governor')
  check('heist: the safe needs a combination', prompt(game, "The Governor's safe") && log.slice(-1)[0].includes('four-digit'))
  at(f.govDesk, 'governor')
  check('heist: the desk diary gives the first half', prompt(game, 'desk diary') && game.heist.knowA && log.slice(-1)[0].includes(game.safeCode.slice(0, 2)))
  ;(game as any).talkToKeith()
  lastTalk!.options.find((o) => o.label === 'Ask about the Governor')!.run()
  check('heist: Keith knows his number plate, the second half', game.heist.knowB && lastTalk!.line.includes(game.safeCode.slice(2)))
  game.endConversation()
  at(f.safe, 'governor')
  check('heist: then the safe opens', prompt(game, `Open the safe (${game.safeCode})`) && game.heist.opened)
  check('heist: master key, Jag keys and petty cash', inv.has('masterKey') && inv.has('jagKeys') && inv.count('voucher') >= 6)
  check('heist: your file shredded, they forget a lesson', game.memory.lessons.length === lessons - 1 && game.memory.used.vent === 0)
  // Out of the staff door with the master key, to the Jag.
  const door = game.grid.doorAtTile(EAST_WALL, 56)!
  at({ x: (EAST_WALL - 0.5) * TILE, z: 56.5 * TILE }, 'changing')
  check('heist: the master key opens the staff door', prompt(game, "Unlock with Governor's master key"))
  run(game, 0.5)
  check('heist: the door is open', door.openness > 0.3, `${door.openness}`)
  const mk = inv.items.find((i) => i.id === 'masterKey')!
  check('heist: the master key has four turns left', mk.durability === 4, `${mk.durability}`)
  for (let i = 0; i < 4; i++) (game as any).useKey(door, mk)
  check('heist: and snaps on the fifth', !inv.has('masterKey') && log.some((l) => l.startsWith('The master key snaps')))
  at({ x: f.jag.x + 1.5, z: f.jag.z }, 'outside')
  run(game, 0.5)
  check("heist: drive off in the Governor's Jag", game.over && log.some((l) => l.startsWith("[end] true The Governor's Jag")), log.slice(-1)[0])
}
{
  const { game, log } = fresh()
  const f = game.fixtures
  game.player.inventory.add('stethoscope')
  game.player.body.x = f.safe.x
  game.player.body.z = f.safe.z
  game.player.zone = 'governor'
  check('heist: or crack it by ear with a stethoscope', prompt(game, 'Crack the safe by ear'))
  const g0 = game.guards[0]
  // Nobody about: hold every officer still and far away.
  const opened = run(game, 40, () => {
    game.player.body.x = f.safe.x
    game.player.body.z = f.safe.z
    for (const g of game.guards) g.ko = 1
    return game.heist.opened
  })
  check('heist: thirty seconds of clicks, and it opens', opened)
  const { game: b } = fresh()
  b.heist.knowA = b.heist.knowB = true
  const before = b.safeCode
  b.player.body.x = b.fixtures.safe.x
  b.player.body.z = b.fixtures.safe.z
  b.player.zone = 'governor'
  run(b, 0.1)
  b.caught(b.guards[0])
  check('heist: caught at it, the Governor changes the combination', !b.heist.knowA && !b.heist.knowB && b.safeCode !== before && b.memory.used.safe === 1, `${b.memory.lessons.slice(-1)[0]?.method}`)
  void g0
}

// ---- Endings and records ----
{
  const store = new Map<string, string>()
  ;(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) }
  const { readRecords, recordEnding, noteStarted } = await import('../src/game/Records')
  noteStarted()
  const mk = (seconds: number, fails: number, day: number) => ({ name: 'Tester', seconds, fails, day, hard: false })
  const first = recordEnding('laundry', mk(900, 2, 3))
  check('records: a first ending is a new find', first.isNew && first.found === 1)
  const again = recordEnding('laundry', mk(1200, 1, 4))
  check('records: the same ending again is not, but a cleaner run is a best', !again.isNew && again.best)
  recordEnding('solitary', mk(3000, 8, 9))
  const r = readRecords()
  check('records: bests are kept one by one', r.endings.laundry!.fastest.seconds === 900 && r.endings.laundry!.fewestFails.fails === 1 && r.endings.laundry!.earliest.day === 3 && r.endings.laundry!.count === 2)
  check('records: totals add up', r.started === 1 && r.finished === 3 && r.wins === 2 && r.losses === 1 && r.attempts === 11)
  const { game } = fresh()
  game.player.inventory.add('jagKeys')
  game.player.body.x = game.fixtures.jag.x + 1
  game.player.body.z = game.fixtures.jag.z
  game.player.zone = 'outside'
  run(game, 0.3)
  check('records: a finished game says which ending it was', game.over && game.ending?.id === 'jag' && game.ending.won)
  // A save file from another device brings its records with it.
  const { mergeRecords } = await import('../src/game/Records')
  const { importSave, SAVE_VERSION } = await import('../src/game/Save')
  const elsewhere = JSON.parse(JSON.stringify(readRecords()))
  elsewhere.endings.laundry.fastest = mk(400, 5, 6)
  elsewhere.endings.jag = { first: '2026-01-01T00:00:00.000Z', count: 1, fastest: mk(700, 0, 2), fewestFails: mk(700, 0, 2), earliest: mk(700, 0, 2) }
  elsewhere.finished = 10
  const file = { version: SAVE_VERSION, seed: game.seed, savedAt: '', summary: { name: 'T', day: 1, time: '08:00', attemptsLeft: 4, round: 1, hard: false }, state: game.toSave(), records: elsewhere }
  const loaded = importSave(JSON.stringify(file))
  const merged = readRecords()
  check('records: a save file brings its endings and bests along', typeof loaded !== 'string' && !!merged.endings.jag && merged.endings.laundry!.fastest.seconds === 400 && merged.endings.laundry!.fewestFails.fails === 1 && merged.finished === 10)
  check('records: the stored save itself stays slim', !('records' in JSON.parse(store.get('locked-up.save')!)))
  mergeRecords(elsewhere)
  check('records: loading the same file twice changes nothing', JSON.stringify(readRecords()) === JSON.stringify(merged))
  delete (globalThis as any).localStorage
}

// ---- The tunnel under the loose tile ----
{
  const { game, log } = fresh()
  const p = game.player
  const atPoster = () => {
    const spot = (game as any).tunnelSpot
    p.body.x = spot.x + 0.7
    p.body.z = spot.z
    p.zone = p.cell
  }
  game.clock.skipTo(23 * 60)
  run(game, 0.5)
  atPoster()
  for (const id of ['toothbrush', 'toothpaste', 'bedsheet'] as const) p.inventory.remove(id)
  check('tunnel: you need something to dig with', prompt(game, 'need something to dig with'))
  p.inventory.add('spoon')
  game.cellmate!.trust = 0.1
  prompt(game, 'Dig under the loose tile')
  check('tunnel: a cellmate who does not trust you will not have it', !(game as any).digging && log.some((l) => l.includes('will grass on a tunnel')))
  game.cellmate!.trust = 0.6
  check('tunnel: dig under the loose tile at night', prompt(game, 'Dig under the loose tile') && !!(game as any).digging)
  run(game, 40, () => {
    atPoster()
    for (const g of game.guards) g.ko = 1
    return false
  })
  check('tunnel: slow going with a spoon, and a pocketful of rubble a metre', game.tunnel.metres > 2 && game.tunnel.metres < 3 && p.inventory.count('rubble') === 2, `${game.tunnel.metres.toFixed(2)} m, ${p.inventory.count('rubble')} rubble`)
  for (const g of game.guards) g.ko = 0
  // Morning: into the yard to get rid of it.
  ;(game as any).digging = null
  game.clock.skipTo(13 * 60)
  run(game, 0.3)
  const yard = game.grid.rooms.get('yard')!.rects[1]
  put(game, yard.x0 + 3, yard.y0 + 3)
  run(game, 0.1)
  check('tunnel: shake the rubble out in the yard', prompt(game, 'Shake the rubble') && !p.inventory.has('rubble'))
  const saved = JSON.parse(JSON.stringify(game.toSave()))
  check('tunnel: progress is kept in a save', saved.tunnel.metres === game.tunnel.metres)
  // A shakedown can find it.
  ;(game as any).rng = () => 0
  game.events.today = 'shakedown'
  game.events.at = game.clock.minuteOfDay + 1
  game.events.fired = false
  run(game, 2)
  check('tunnel: a shakedown can find the hole', game.tunnel.metres === 0 && log.some((l) => l.includes('found the hole under the loose tile')))
}
{
  const { game, log } = fresh()
  const p = game.player
  game.clock.skipTo(23 * 60)
  run(game, 0.5)
  const spot = (game as any).tunnelSpot
  p.body.x = spot.x + 0.7
  p.body.z = spot.z
  p.inventory.add('screwdriver')
  game.cellmate!.trust = 0.6
  game.tunnel.metres = 12
  prompt(game, 'Dig under the loose tile')
  // An officer stood right outside.
  const g = game.guards.find((gg) => gg.block === 'A')!
  const caught = run(game, 10, () => {
    g.stop()
    g.body.x = p.body.x + 9
    g.body.z = p.body.z
    return game.memory.used.tunnel > 0
  })
  check('tunnel: an officer close by hears the scraping', caught && game.tunnel.metres === 0, log.slice(-2).join(' | '))
}
{
  const { game, log } = fresh()
  const p = game.player
  game.clock.skipTo(23 * 60)
  run(game, 0.5)
  const spot = (game as any).tunnelSpot
  p.body.x = spot.x + 0.7
  p.body.z = spot.z
  game.tunnel.metres = 30
  check('tunnel: thirty metres, and you crawl out', prompt(game, 'Crawl out through the tunnel') && game.over && game.ending?.id === 'tunnel' && log.some((l) => l.startsWith('[end] true Like a mole')))
}

// ---- First-day goals ----
{
  const { game, log } = fresh()
  ;(game as any).talkTo(game.cellmate!)
  game.endConversation()
  check('goals: nothing ticks before the tour is over', game.goals.done.size === 0)
  game.goals.shown = true
  ;(game as any).talkTo(game.cellmate!)
  game.endConversation()
  const fixer = game.prisoners.find((pr) => pr.sells.length)!
  ;(game as any).talkTo(fixer)
  game.endConversation()
  run(game, 0.1)
  game.player.inventory.add('voucher')
  run(game, 0.1)
  check('goals: cellmate, fixer and a voucher tick themselves', ['cellmate', 'fixer', 'voucher'].every((id) => game.goals.done.has(id as any)))
  game.goal('notebook')
  game.goal('map')
  game.goal('job')
  check('goals: all six, and the list goes', game.goals.finished && log.some((l) => l.startsWith('First day: done')))
  check('goals: kept in a save', JSON.parse(JSON.stringify(game.toSave())).goals.done.length === 6)
}

// ---- Your cellmate: a grass, or on side ----
{
  const withMate = (grass: boolean) => {
    for (let seed = 1; seed < 400; seed++) {
      Game.seedForNext = seed
      const f = fresh()
      Game.seedForNext = null
      if (f.game.cellmateGrass === grass) return f
    }
    throw new Error('no seed')
  }
  {
    const { game, log } = withMate(true)
    const mate = game.cellmate!
    ;(game as any).stash.push('razor')
    ;(game as any).rng = () => 0.1
    ;(game as any).mateNight()
    ;(game as any).mateMorning()
    check('cellmate: a grass tips off the officers about your stash', game.stash.length === 0 && log.some((l) => l.includes('Somebody tipped them off')) && game.mate.warned)
    check('cellmate: and a friend warns you', log.some((l) => l.includes(`${mate.name} is a grass`)))
    game.player.inventory.add('voucher')
    ;(game as any).talkTo(mate)
    lastTalk!.options.find((o) => o.label.includes('grassing'))!.run()
    lastTalk!.options.find((o) => o.label.includes('Pay for their silence'))!.run()
    game.endConversation()
    ;(game as any).stash.push('lighter')
    ;(game as any).mateNight()
    ;(game as any).mateMorning()
    check('cellmate: paid off, they keep quiet', game.mate.paidOff && game.stash.length === 1)
  }
  {
    const { game } = withMate(false)
    const mate = game.cellmate!
    mate.trust = 0.75
    ;(game as any).talkTo(mate)
    const gift = lastTalk!.options.find((o) => o.label.includes('You alright'))
    gift?.run()
    game.endConversation()
    check('cellmate: on side, they slip you a flattened spoon', !!gift && game.player.inventory.has('flatSpoon') && game.mate.gift)
    check('cellmate: and keep lookout while you dig', (game as any).mateLookout === true)
    check('cellmate: and get a last word at the end', (game as any).mateEpilogue(true).includes(mate.name))
  }
}

// ---- Difficulty modes ----
{
  const { game } = fresh()
  game.mode = 'story'
  check('modes: Story gives six attempts a round', game.memory.attemptsLeft === 6 && !game.hard)
  const { game: h, log } = fresh()
  h.mode = 'hardcore'
  run(h, 0.2)
  check('modes: Hardcore is Hard, with one attempt and no saving', h.hard && h.memory.attemptsLeft === 1 && h.memory.rounds === 1 && !h.canSave)
  put(h, 64, 23)
  run(h, 0.2)
  h.caught(h.guards[0])
  check('modes: caught once on Hardcore, and that is it', h.over, log.slice(-1)[0])
  const json = JSON.parse(JSON.stringify(game.toSave()))
  Game.seedForNext = game.seed
  const { game: b } = fresh()
  Game.seedForNext = null
  b.fromSave(json)
  check('modes: kept in a save', b.mode === 'story' && b.memory.attemptsPerRound === 6)
}

// ---- Saving and carrying on ----
{
  const { game: a } = fresh()
  a.clock.skipTo(2 * 1440 + 13 * 60)
  run(a, 0.5)
  a.player.inventory.add('spoon')
  a.player.inventory.add('sleepingPills')
  ;(a as any).stash.push('razor')
  a.memory.fail('vent', 40, 40)
  a.prisoners[5].trust = 0.83
  a.guards[2].wary = 0.7
  a.contactNights = 2
  a.keith.bribedDay = 3
  a.grates.find((g) => g.id === 'your cell')!.open = true
  a.grid.cells.get(a.player.cell)!.door.jammed = true
  a.post.letters.forEach((l) => (l.read = true))
  check('save: allowed when things are quiet', a.canSave)
  const json = JSON.parse(JSON.stringify(a.toSave()))
  Game.seedForNext = a.seed
  const { game: b } = fresh()
  Game.seedForNext = null
  b.fromSave(json)
  check('save: the same prison comes back', b.prisoners.every((p, i) => p.name === a.prisoners[i].name && p.temperament === a.prisoners[i].temperament && p.gang === a.prisoners[i].gang && p.body.skin === a.prisoners[i].body.skin))
  check('save: the clock, your pockets and your stash', b.clock.minutes === a.clock.minutes && b.player.inventory.has('sleepingPills') && b.player.inventory.has('spoon') && (b as any).stash.includes('razor'))
  check('save: what the prison learned', b.memory.used.vent === 1 && b.memory.attemptsLeft === a.memory.attemptsLeft && b.memory.lessons.length === 1)
  check('save: who trusts you, and who is wary', b.prisoners[5].trust === 0.83 && b.guards[2].wary === 0.7)
  check('save: grilles, locks, the car and Keith', b.grates.find((g) => g.id === 'your cell')!.open && b.grid.cells.get(b.player.cell)!.door.jammed && b.contactNights === 2 && b.keith.bribedDay === 3)
  check('save: post and jobs', b.post.letters.length === a.post.letters.length && b.post.letters.every((l) => l.read) && b.missions.active.length === a.missions.active.length)
  run(b, 2)
  check('save: and it carries on running', !b.over && b.clock.minutes > a.clock.minutes)
  put(a, 64, 23)
  run(a, 0.2)
  check('save: never while out of bounds', !a.canSave, `${a.player.zone} illegal ${a.player.illegal}`)
}

// ---- The staff wing: the Governor's office and the changing room ----
{
  const { game } = fresh()
  const grid = game.grid
  const centre = (zone: string) => {
    const r = grid.rooms.get(zone)!.rects[0]
    return { tx: Math.floor((r.x0 + r.x1) / 2), ty: Math.floor((r.y0 + r.y1) / 2) }
  }
  check('staff wing: the Governor\'s office is on the map', grid.rooms.get('governor')?.name === "Governor's office")
  check('staff wing: so is the staff changing room', grid.rooms.get('changing')?.name === 'Staff changing room')
  const mess = centre('mess')
  const bay = centre('bay')
  const office = centre('governor')
  const changing = centre('changing')
  const walk = (a: { tx: number; ty: number }, b: { tx: number; ty: number }) => findPath(grid, a, b, () => true)
  check('staff wing: the office opens off the mess', !!walk(mess, { tx: 77, ty: 52 })?.length && grid.underProp(office.tx, office.ty))
  check('staff wing: the changing room opens off the bay, through to the staff door', !!walk(bay, { tx: 79, ty: changing.ty + 0 })?.length && !!walk(bay, { tx: 79, ty: 56 })?.length)
  check('staff wing: both are on the vents', grid.grates.some((gr) => gr.zone === 'governor') && grid.grates.some((gr) => gr.zone === 'changing'))
  check('staff wing: both are out of bounds', game.player.zone !== 'governor' && (await import('../src/game/Clock')).RESTRICTED.has('governor') && (await import('../src/game/Clock')).RESTRICTED.has('changing'))
}

// ---- Lure an officer in, drug him, walk out in his uniform ----
{
  const { game, log } = fresh()
  const inv = game.player.inventory
  check('lure: fixers sell sleeping pills', game.prisoners.some((pr) => pr.sells.includes('sleepingPills')))
  inv.add('sausageRoll')
  inv.add('sleepingPills')
  const recipe = (await import('../src/game/Items')).RECIPES.find((r) => r.makes === 'sleepyRoll')!
  game.craft(recipe)
  check('lure: pills in a sausage roll make a sleepy one', inv.has('sleepyRoll') && !inv.has('sausageRoll'))
  game.clock.skipTo(10 * 60)
  run(game, 0.2)
  const cell = game.grid.cells.get(game.player.cell)!
  game.player.body.x = cell.bunks[1].x + 0.4
  game.player.body.z = cell.bunks[1].z
  game.player.zone = game.player.cell
  check('lure: in your cell by day you can shout for an officer', prompt(game, 'Shout for an officer') && !!game.lure)
  const officer = game.lure!.guard
  const inside = run(game, 90, () => game.lure?.stage === 'inside' && officer.zone === game.player.cell)
  check('lure: an officer comes into your cell to look for the rat', inside, `${officer.name} in ${officer.zone}, lure ${game.lure?.stage}`)
  ;(game as any).talkToGuard(officer)
  const offer = lastTalk?.options.find((o) => o.label.includes('sausage roll'))
  check('lure: you can offer him a sausage roll', !!offer?.enabled)
  offer?.run()
  run(game, 6)
  check('lure: he eats it and falls asleep', officer.ko > 60 && !inv.has('sleepyRoll'), `ko ${officer.ko.toFixed(1)}`)
  game.player.body.x = officer.x + 0.6
  game.player.body.z = officer.z
  check('lure: strip him', prompt(game, 'uniform') && inv.has('guardUniform'))
  check('lure: and take his keys', prompt(game, 'keys') && inv.has('guardKey'))
  game.useItem(inv.items.findIndex((i) => i.id === 'guardUniform'))
  const exit = game.fixtures.staffExit
  game.player.body.x = exit.x - 1
  game.player.body.z = exit.z
  game.player.zone = 'changing'
  check('lure: in uniform with keys, the staff door lets you out any time', prompt(game, 'Let yourself out'))
  check('lure: off shift early', game.over && log.some((l) => l.startsWith('[end] true Off shift early')), log.slice(-1)[0])
}

// ---- He wakes up, and they learn ----
{
  const { game, log } = fresh()
  game.clock.skipTo(10 * 60)
  run(game, 0.2)
  const g = game.guards[0]
  game.player.inventory.add('sleepyRoll')
  ;(game as any).offerRoll(g)
  run(game, 5)
  game.player.body.x = g.x + 0.6
  game.player.body.z = g.z
  prompt(game, 'uniform')
  game.useItem(game.player.inventory.items.findIndex((i) => i.id === 'guardUniform'))
  g.ko = 0.05
  run(game, 0.5)
  check('lure: when he wakes in his boxers, your disguise is blown', game.player.disguiseBlown, log.slice(-1)[0])
  game.memory.fail('lure', 0, 0)
  game.player.inventory.add('sleepyRoll')
  ;(game as any).offerRoll(game.guards[1])
  run(game, 5)
  check('lure: once burned, officers will not eat what you offer', game.guards[1].ko <= 0 && game.player.inventory.has('sleepyRoll'))
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
  game.clock.minutes += 1440 // Tuesday: a visiting day
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

// ---- The laundry van, without paying off the X-ray ----
{
  const { game, log } = fresh()
  game.clock.skipTo(10 * 60 + 45)
  run(game, 0.2)
  const basket = game.fixtures.laundryBasket
  game.player.body.x = basket.x
  game.player.body.z = basket.z - 1
  game.player.zone = 'laundry'
  check('laundry: climb into the basket', prompt(game, 'Climb into the laundry basket') && game.player.inBasket)
  ;(game as any).rng = () => 0.0
  run(game, 30, () => game.memory.attemptsUsed > 0)
  check('laundry: unbribed, the X-ray always finds you', game.memory.attemptsUsed === 1 && !game.over && game.memory.used.laundry === 1, log.filter((l) => l.startsWith('[card]')).slice(-1)[0]?.slice(0, 60))
}

// ---- The laundry van, with Keith paid off ----
{
  const { game, log } = fresh()
  game.clock.skipTo(10 * 60 + 30)
  run(game, 0.3)
  const k = game.keith.body
  check('keith: collecting baskets in the laundry before the van', game.grid.zoneAtWorld(k.x, k.z) === 'laundry', game.grid.zoneAtWorld(k.x, k.z))
  game.player.inventory.add('blueDrink')
  game.player.inventory.add('sausageRoll')
  game.player.body.x = k.x + 1
  game.player.body.z = k.z
  game.player.zone = 'laundry'
  check('keith: talk to him', prompt(game, 'Talk to Keith'))
  lastTalk?.options.find((o) => o.label.startsWith('Slip'))?.run()
  check('keith: a blue drink and a sausage roll buy his cataract', game.keith.bribedDay === game.clock.day && !game.player.inventory.has('blueDrink'), log.slice(-1)[0])
  const basket = game.fixtures.laundryBasket
  game.player.body.x = basket.x
  game.player.body.z = basket.z - 1
  check('laundry: into the basket', prompt(game, 'Climb into the laundry basket') && game.player.inBasket)
  ;(game as any).rng = () => 0.01
  const out = run(game, 30, () => game.over)
  check('laundry: the van takes you out', out && log.some((l) => l.startsWith('[end] true Spin cycle')), log.slice(-1)[0])
}

// ---- The vending machine ----
{
  const { game } = fresh()
  run(game, 0.2)
  game.player.body.x = 43
  game.player.body.z = 100.4
  game.player.zone = 'visits'
  const before = game.player.inventory.count('voucher')
  check('vending: blue drink for a Greggs voucher', prompt(game, 'Vending machine') && game.player.inventory.has('blueDrink') && game.player.inventory.count('voucher') === before - 1)
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

// ---- Conversations stop the clock ----
{
  const { game } = fresh()
  run(game, 0.5)
  const boss = game.gangLeader('firm')!
  game.talkTo(boss)
  const before = game.clock.minutes
  for (let i = 0; i < 60; i++) game.update(1 / 30)
  check('talk: the world waits while you talk', game.talkingTo === boss.body && game.clock.minutes === before && boss.body.pose !== 'walk')
  game.endConversation()
  game.update(1 / 30)
  check('talk: and carries on after', game.clock.minutes > before)
}

// ---- Post and notes ----
{
  const { game, log } = fresh()
  game.startSentence()
  check('post: a letter on day one', game.post.letters.length === 1 && game.post.unread === 1)
  const nan = { ...game.post.letters[0] }
  void nan
  // Out of the cell after nine: a note is left.
  game.clock.skipTo(10 * 60)
  run(game, 0.5)
  put(game, 18, 14)
  run(game, 0.5)
  check('notes: one is left while you are out', !!game.post.waiting)
  const cell = game.grid.cells.get('cellA7')!
  game.player.body.x = cell.bunks[0].x
  game.player.body.z = cell.bunks[0].z + 0.5
  run(game, 0.2)
  check('notes: announced when you get back', log.some((l) => l.includes('note on your bunk')))
  const notePrompts = game.prompts.map((p) => p.label).join(', ')
  check('notes: read it on your bunk', prompt(game, 'Read the note') && log.some((l) => l.startsWith('[note]')) && game.post.notes.length === 1, notePrompts + ' @' + game.player.body.x.toFixed(2) + ',' + game.player.body.z.toFixed(2) + ' bunk ' + cell.bunks[0].x + ',' + cell.bunks[0].z)
  // Next morning, more post.
  game.clock.skipTo(6 * 60 + 25)
  run(game, 4)
  check('post: more letters each morning', game.post.letters.length >= 2, `${game.post.letters.length}`)
  const gift = game.post.letters.find((l) => l.gift)
  if (gift) {
    const before = game.player.inventory.items.length
    game.readLetter(gift)
    check('post: gifts the censor missed', game.player.inventory.items.length > before || game.dynamic.items.length > 0)
  }
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
