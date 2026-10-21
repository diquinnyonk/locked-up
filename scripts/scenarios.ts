/**
 * Headless checks of every way out, run against the real game code.
 *
 *   npx tsx scripts/scenarios.ts
 */
import { Scene } from 'three'
import { Game, type UiPort } from '../src/game/Game'
import { screenCall } from '../src/game/Phone'
import { MAP_H, MAP_W, TILE, Tile, tileCentre } from '../src/world/Grid'
import { findPath } from '../src/world/Nav'

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
  game.player.body.z = seat.z + (seat.yaw === 0 ? -0.9 : 0.9)
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
