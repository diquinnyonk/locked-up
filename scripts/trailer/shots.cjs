// The shots. `setup` and `tick` run in the page (they are sent as source),
// with `g` the game. Camera moves are { from, to, lookFrom, lookTo, fov }.
// World units: a tile is 2. The prison runs x 18..160, z 26..120.

const tile = (tx, ty, y = 0) => ({ x: (tx + 0.5) * 2, y, z: (ty + 0.5) * 2 })

// Common bits, in the page.
const common = `
  const S = window.__S = window.__S || {}
  S.g = window.__lockedUp.game
  S.calm = () => { const g = S.g; g.events.today = 'quiet'; g.events.at = -1; g.clock.override = null; g.alarm.active = false; g.riot.active = false; for (const gu of g.guards) { gu.chasing = false; gu.suspicion = 0 } g.player.attempt = null; g.player.illegal = 0; g.input.forced = null; g.input.padRun = false; g.player.sneaking = false; g.player.inVent = false; g.player.body.visible = true; g.player.inBasket = false; g.ui.hideCard(); g.ui.cardTimer = 0; g.ui.closePanels(); g.endConversation(); g.events.weather = 'clear'; if (g.player.disguise) g.toggleDisguise(g.player.disguise); }
  S.at = (min) => { S.g.clock.skipTo(min) }
  S.put = (x, z) => { const b = S.g.player.body; b.x = x; b.z = z; b.y = 0; S.g.player.zone = S.g.grid.zoneAtWorld(x, z) }
  S.home = () => { const c = S.g.grid.cells.get(S.g.player.cell); S.put(c.bunks[1].x, c.bunks[1].z) }
`

/** All the shots, by name. Each format picks and orders its own. */
const SHOTS = {
  aerial: {
    dur: 4,
    short: 3,
    setup: `S.calm(); S.at(20 * 60 + 40); S.home()`,
    cam: { from: { x: 92, y: 120, z: 230 }, to: { x: 88, y: 70, z: 150 }, lookFrom: { x: 88, y: 0, z: 80 }, lookTo: { x: 84, y: 0, z: 88 }, fov: 40 },
    caps: [{ at: 0.3, pos: 'mid', kick: 'HMP Grim-on-the-Moor', html: 'Can you <b>escape</b>?' }],
  },
  cell: {
    dur: 3.5,
    short: 2.5,
    setup: `S.calm(); S.at(6 * 60 + 27); S.home(); S.g.player.body.yaw = Math.PI`,
    caps: [{ at: 0.25, pos: 'low', html: 'You robbed a <b>Greggs</b>.' }],
  },
  landing: {
    dur: 3.5,
    short: 2.5,
    setup: `S.calm(); S.at(6 * 60 + 58); S.put(${tile(16, 14).x}, ${tile(16, 14).z})`,
    tick: `g.input.forced = t > 0.3 ? { x: 1, z: 0 } : null`,
    caps: [{ at: 0.2, pos: 'low', html: 'Now get <b>out</b>.' }],
  },
  yard: {
    dur: 4,
    short: 3,
    setup: `S.calm(); S.at(13 * 60); S.put(80, 100)`,
    cam: { from: { x: 44, y: 34, z: 128 }, to: { x: 104, y: 30, z: 132 }, lookFrom: { x: 76, y: 0, z: 96 }, lookTo: { x: 84, y: 0, z: 96 }, fov: 40 },
    caps: [{ at: 0.3, pos: 'low', kick: '4 wings · 4 firms', html: '80 prisoners. <b>16 officers.</b>' }],
  },
  sneak: {
    dur: 3.5,
    short: 2.5,
    setup: `S.calm(); S.at(9 * 60 + 30); S.put(${tile(33, 33).x}, ${tile(33, 33).z}); S.g.player.sneaking = true`,
    tick: `g.input.forced = { x: 1, z: 0 }; for (const gu of g.guards) gu.suspicion = Math.min(gu.suspicion, 0.4)`,
    caps: [{ at: 0.25, pos: 'low', html: 'They <b>see</b> you.' }],
  },
  chase: {
    dur: 3.5,
    short: 3,
    setup: `S.calm(); S.at(13 * 60 + 10); S.put(70, 104); const g = S.g; g.player.attempt = 'wall'; g.alarm.active = true; g.alarm.x = 70; g.alarm.z = 104; g.alarm.timer = 30; const near = g.guards.slice().sort((a, b) => a.distanceTo(70, 104) - b.distanceTo(70, 104)).slice(0, 4); for (const gu of near) { gu.chasing = true; gu.suspicion = 1; gu.lastSeen = { x: 70, z: 104, t: 0 }; gu.body.x = 70 + (Math.random() - 0.5) * 10; gu.body.z = 92 + Math.random() * 4 }`,
    tick: `g.input.forced = { x: 0.9, z: 0.45 }; g.input.padRun = true; g.alarm.active = true; for (const gu of g.guards) if (gu.chasing) { gu.lastSeen = { x: g.player.body.x, z: g.player.body.z, t: 0 } } if (g.player.health < 60) g.player.health = 100`,
    caps: [{ at: 0.2, pos: 'low', html: 'Get caught, and they <b>remember</b>.' }],
  },
  talk: {
    dur: 3.5,
    short: 3,
    setup: `S.calm(); S.at(15 * 60); const g = S.g; S.put(80, 47); const pr = g.prisoners.find((x) => x.sells.length) || g.prisoners[3]; S.pr = pr; pr.body.x = 82.4; pr.body.z = 47; S.focus = { x: 80, z: 47 }`,
    tick: `const pr = S.pr; pr.body.x = 82.4; pr.body.z = 47; pr.body.speed = 0; pr.body.pose = 'talk'; pr.body.yaw = -Math.PI / 2; g.player.body.yaw = Math.PI / 2; g.player.body.pose = 'stand'; if (t > 0.2 && t < 0.25) pr.say('Psst. Wire, tape, a lighter. Two Greggs vouchers.', 6)`,
    cam: { rel: true, from: { x: 1.6, y: 4.6, z: 6.4 }, to: { x: 1.3, y: 3.9, z: 5.2 }, lookFrom: { x: 1.2, y: 1.0, z: 0 }, lookTo: { x: 1.2, y: 1.1, z: 0 }, fov: 36 },
    caps: [{ at: 0.3, pos: 'low', html: 'Make friends. <b>Make deals.</b>' }],
  },
  riot: {
    dur: 3.5,
    short: 2.5,
    setup: `S.calm(); S.at(13 * 60 + 20); S.put(78, 98); const g = S.g; g.feuds.brawl(0); S.focus = { x: g.riot.x, z: g.riot.z }; g.player.body.x = g.riot.x + 3; g.player.body.z = g.riot.z + 3`,
    cam: { rel: true, from: { x: -18, y: 22, z: 24 }, to: { x: -4, y: 15, z: 20 }, lookFrom: { x: 0, y: 0, z: 0 }, lookTo: { x: 2, y: 0, z: 0 }, fov: 40 },
    caps: [{ at: 0.3, pos: 'low', html: 'Start a <b>riot</b>.' }],
  },
  vents: {
    dur: 3,
    short: 2.5,
    setup: `S.calm(); S.at(23 * 60 + 10); S.home(); const g = S.g; const gr = g.grid.grates.find((x) => x.id === 'A landing'); g.enterVent(gr); g.player.body.x += 4`,
    tick: `g.input.forced = { x: 1, z: 0 }; g.player.sneaking = false`,
    caps: [{ at: 0.25, pos: 'low', html: 'Crawl the <b>vents</b>.' }],
  },
  disguise: {
    dur: 3.5,
    short: 2.5,
    setup: `S.calm(); S.at(14 * 60 + 40); const g = S.g; S.put(${tile(15, 52).x}, ${tile(15, 52).z}); g.player.inventory.add('visitorDisguise'); g.toggleDisguise('visitor')`,
    tick: `g.input.forced = t < 1.6 ? { x: 0.15, z: 0.7 } : null`,
    caps: [{ at: 0.25, pos: 'low', html: 'Dress for the <b>occasion</b>.' }],
  },
  safe: {
    dur: 3.5,
    short: 2.5,
    setup: `S.calm(); S.at(12 * 60 + 40); const g = S.g; const f = g.fixtures.safe; S.put(f.x - 0.2, f.z - 1.0); g.player.body.yaw = 0; g.player.inventory.add('stethoscope'); g.startCracking()`,
    cam: { from: { x: 153, y: 13, z: 96 }, to: { x: 154.5, y: 10, z: 98.5 }, lookFrom: { x: 156.5, y: 0.6, z: 104.6 }, lookTo: { x: 156.5, y: 0.6, z: 104.8 }, fov: 38 },
    caps: [{ at: 0.25, pos: 'low', html: "Crack the Governor's <b>safe</b>." }],
  },
  engine: {
    dur: 3.5,
    short: 2.5,
    setup: `S.calm(); S.at(10 * 60); const g = S.g; g.events.today = 'fireDrill'; g.events.at = 10 * 60 - 8; g.events.fired = true; g.clock.override = { period: 'yard', label: 'Fire drill', until: g.clock.minutes + 30 }; S.put(${tile(55, 49.5).x}, ${tile(55, 49.5).z})`,
    cam: { from: { x: 88, y: 18, z: 116 }, to: { x: 96, y: 14, z: 112 }, lookFrom: { x: 104, y: 0, z: 99 }, lookTo: { x: 104, y: 0, z: 100 }, fov: 40 },
    tick: `g.input.forced = t > 0.4 && t < 1.6 ? { x: -0.6, z: 0 } : null`,
    caps: [{ at: 0.25, pos: 'low', html: 'Hitch a <b>ride</b>.' }],
  },
  ghost: {
    dur: 4,
    short: 3,
    setup: `S.calm(); S.at(23 * 60 + 20); const g = S.g; g.secret.announced = true; g.secret.stage = 'key'; S.put(${tile(15, 44.5).x}, ${tile(15, 44.5).z}); g.player.inVent = false`,
    cam: { from: { x: 38, y: 6, z: 92 }, to: { x: 32, y: 5, z: 91 }, lookFrom: { x: 25, y: 1.2, z: 90 }, lookTo: { x: 25, y: 1.4, z: 90 }, fov: 38 },
    tick: `g.input.forced = t > 0.5 && t < 2.3 ? { x: -0.5, z: 0 } : null; for (const gu of g.guards) gu.suspicion = 0`,
    caps: [{ at: 0.3, pos: 'low', kick: 'One sentence in ten', html: 'Some secrets <b>only come once</b>.' }],
  },
  car: {
    dur: 3.5,
    short: 3,
    setup: `S.calm(); S.at(23 * 60 + 40); const g = S.g; g.contactNights = 3; S.put(70, 124); g.player.zone = 'outside'`,
    cam: { from: { x: 64, y: 16, z: 150 }, to: { x: 74, y: 12, z: 146 }, lookFrom: { x: 76, y: 0, z: 128 }, lookTo: { x: 79, y: 0, z: 130 }, fov: 40 },
    tick: `g.input.forced = t < 1.5 ? { x: 0.7, z: 0.5 } : null; g.input.padRun = t < 1.5`,
    caps: [{ at: 0.25, pos: 'low', html: '<b>20</b> ways out.' }],
  },
  endcard: {
    dur: 5,
    short: 4.5,
    setup: `S.calm(); S.at(14 * 60)`,
    cam: { from: { x: 70, y: 90, z: 190 }, to: { x: 100, y: 80, z: 180 }, lookFrom: { x: 86, y: 0, z: 76 }, lookTo: { x: 90, y: 0, z: 76 }, fov: 40 },
    mark: false,
    end: `<h1>Locked<br>Up</h1><div class="tag">A UK prison break in your browser</div><div class="play">Play free</div><div class="url">diquinnyonk.github.io/locked-up</div><div class="small">Desktop · Phone · Controller</div>`,
    endAt: 0.15,
  },
}

module.exports = { SHOTS, common }
