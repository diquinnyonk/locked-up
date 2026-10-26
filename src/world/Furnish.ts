import type { BufferGeometry } from 'three'
import { HEX } from '../art/palette'
import { type Place, ball, box, cyl, cylX, ring } from '../art/shapes'
import { EAST_WALL, type Grid, PLAYER_CELL, TILE } from './Grid'
import { WALL_H } from './Build'

/**
 * The annexes round the yard, and a detail pass over everywhere else:
 * radiators, posters, extinguishers, cameras, cups on the canteen tables,
 * books on the shelves. None of it is interactive; all of it is there so a
 * room reads as a room from a camera twenty metres up.
 */
type Add = (...g: BufferGeometry[]) => void

export interface AnnexFixtures {
  visitTables: { x: number; z: number }[]
  costumeBox: { x: number; z: number }
  uniformRack: { x: number; z: number }
  laundryBasket: { x: number; z: number }
  van: { x: number; z: number }
  staffExit: { x: number; z: number }
  visitorsGate: { x: number; z: number }
  pews: { x: number; z: number }[]
  xray: { x: number; z: number }
  altar: { x: number; z: number }
  govDesk: { x: number; z: number }
  safe: { x: number; z: number }
  jag: { x: number; z: number }
}

const at = (tx: number, ty: number, y = 0, ry = 0): Place => ({ x: (tx + 0.5) * TILE, y, z: (ty + 0.5) * TILE, ry })

function chair(add: Add, x: number, z: number, facing: number, hex: number): void {
  add(box(0.5, 0.06, 0.5, { x, y: 0.45, z }, hex))
  add(box(0.5, 0.5, 0.06, { x: x - Math.sin(facing) * 0.24, y: 0.5, z: z - Math.cos(facing) * 0.24, ry: facing }, hex))
  for (const sx of [-0.2, 0.2]) for (const sz of [-0.2, 0.2]) add(cyl(0.025, 0.025, 0.45, { x: x + sx, y: 0, z: z + sz }, HEX.steelDark, 6))
}

function shelfOfBooks(add: Add, x: number, z: number, width: number, facingSouth: boolean, seed: number): void {
  const colours = [HEX.bookRed, HEX.bookGreen, HEX.bookBlue, HEX.bookOchre, HEX.paper, HEX.clothesYellow]
  add(box(width, 2.0, 0.45, { x, y: 0, z }, HEX.wood))
  for (let shelf = 0; shelf < 4; shelf++) {
    let bx = x - width / 2 + 0.08
    let i = 0
    while (bx < x + width / 2 - 0.12) {
      const w = 0.06 + ((seed + i * 7 + shelf * 13) % 5) * 0.015
      const h = 0.28 + ((seed + i * 3 + shelf) % 4) * 0.035
      add(box(w, h, 0.3, { x: bx + w / 2, y: 0.1 + shelf * 0.47, z: z + (facingSouth ? 0.06 : -0.06) }, colours[(seed + i + shelf * 2) % colours.length]))
      bx += w + 0.01
      i++
    }
  }
}

export function furnishAnnexes(add: Add): AnnexFixtures {
  const f: AnnexFixtures = {
    visitTables: [],
    costumeBox: { x: 0, z: 0 },
    uniformRack: { x: 0, z: 0 },
    laundryBasket: { x: 0, z: 0 },
    van: { x: 0, z: 0 },
    staffExit: { x: (EAST_WALL - 0.5) * TILE, z: (56 + 0.5) * TILE },
    visitorsGate: { x: (15 + 0.5) * TILE, z: (58 + 0.5) * TILE },
    pews: [],
    xray: { x: 0, z: 0 },
    altar: { x: 0, z: 0 },
    govDesk: { x: 0, z: 0 },
    safe: { x: 0, z: 0 },
    jag: { x: 0, z: 0 },
  }

  // ---- Chapel: pews facing an altar, stained glass, an organ, and the
  //      Christmas panto costume box nobody has opened since 2009 ----
  const altar = at(10.6, 44)
  f.altar = { x: altar.x, z: altar.z }
  add(box(0.9, 0.95, 2.6, altar, HEX.wood), box(1.0, 0.04, 2.7, { ...altar, y: 0.95 }, HEX.altarCloth))
  add(box(0.08, 1.2, 0.12, { x: 20.6, y: 1.3, z: 89 }, HEX.stainedGold), box(0.08, 0.12, 0.6, { x: 20.6, y: 2.05, z: 89 }, HEX.stainedGold))
  add(cyl(0.05, 0.05, 0.35, { ...altar, y: 0.99, z: altar.z - 0.9 }, HEX.paper, 8), ball(0.05, { ...altar, y: 1.4, z: altar.z - 0.9 }, HEX.fire))
  add(cyl(0.05, 0.05, 0.35, { ...altar, y: 0.99, z: altar.z + 0.9 }, HEX.paper, 8), ball(0.05, { ...altar, y: 1.4, z: altar.z + 0.9 }, HEX.fire))
  // Stained glass in the north wall.
  for (let i = 0; i < 4; i++) {
    const x = (12 + i * 2.6 + 0.5) * TILE
    const panes = [HEX.stainedRed, HEX.stainedBlue, HEX.stainedGold]
    for (let k = 0; k < 3; k++) add(box(0.36, 0.7, 0.08, { x: x - 0.4 + k * 0.4, y: 1.0, z: 42 * TILE + 0.03 }, panes[(i + k) % 3]))
    add(box(1.3, 0.08, 0.1, { x, y: 1.72, z: 42 * TILE + 0.04 }, HEX.steelDark))
  }
  for (let row = 0; row < 4; row++) {
    for (const side of [-1, 1]) {
      const p = at(13.5 + row * 2, 44 + side * 1.4)
      add(box(0.5, 0.45, 2.6, p, HEX.pew), box(0.12, 0.55, 2.6, { ...p, x: p.x + 0.3, y: 0.45 }, HEX.pew))
      f.pews.push({ x: p.x, z: p.z })
    }
  }
  const organ = at(11, 42.3)
  add(box(1.6, 1.0, 0.7, organ, HEX.wood), box(1.5, 0.05, 0.3, { ...organ, y: 0.85, z: organ.z + 0.3 }, HEX.paper))
  for (let i = 0; i < 7; i++) add(cyl(0.05, 0.05, 0.9 + (i % 4) * 0.2, { x: organ.x - 0.6 + i * 0.2, y: 1.0, z: organ.z - 0.2 }, HEX.metal, 8))
  const trunk = at(20.6, 46.3)
  f.costumeBox = { x: trunk.x, z: trunk.z - 0.8 }
  add(box(1.3, 0.7, 0.8, trunk, HEX.wood), box(1.36, 0.1, 0.86, { ...trunk, y: 0.7 }, HEX.gateYellow))
  add(ring(0.25, 0.07, { ...trunk, y: 0.82, x: trunk.x - 0.2 }, HEX.boa, Math.PI / 2.4), ball(0.18, { ...trunk, y: 0.85, x: trunk.x + 0.35 }, HEX.hairBlonde, 1, 0.7, 1))

  // ---- Visiting hall: low tables, blue chairs, a vending machine that has
  //      been out of Twix since the Blair government ----
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 2; col++) {
      const p = at(13 + col * 5, 51 + row * 2.6)
      add(box(1.4, 0.06, 0.9, { ...p, y: 0.55 }, HEX.tableTop), cyl(0.08, 0.12, 0.55, p, HEX.steel, 10))
      chair(add, p.x, p.z - 0.9, 0, HEX.chairBlue)
      chair(add, p.x, p.z + 0.9, Math.PI, HEX.player)
      f.visitTables.push({ x: p.x, z: p.z })
    }
  }
  const vend = at(21, 49.2)
  add(box(1.0, 1.9, 0.8, vend, HEX.vending), box(0.7, 1.1, 0.06, { ...vend, y: 0.6, z: vend.z + 0.41 }, HEX.window))
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) add(box(0.14, 0.14, 0.1, { x: vend.x - 0.2 + c * 0.2, y: 0.72 + r * 0.25, z: vend.z + 0.36 }, [HEX.clothesRed, HEX.clothesYellow, HEX.bookBlue][(r + c) % 3]))
  const play = at(11.5, 57)
  add(box(3, 0.03, 2, { ...play, y: 0.01 }, HEX.clothesYellow))
  add(box(0.3, 0.3, 0.3, { ...play, x: play.x - 0.6 }, HEX.clothesRed), box(0.3, 0.3, 0.3, { ...play, x: play.x + 0.2, y: 0 }, HEX.bookBlue), ball(0.18, { ...play, y: 0.18, x: play.x + 0.8 }, HEX.peas))
  add(box(1.6, 0.9, 0.7, at(20.5, 57.5), HEX.wood))

  // ---- Gym: benches, a dumbbell rack, a punchbag, a treadmill that
  //      squeaks in B flat ----
  for (let i = 0; i < 3; i++) {
    const b = at(60 + i * 3, 43.5)
    add(box(0.4, 0.45, 1.6, b, HEX.mattress), box(0.06, 1.3, 0.06, { ...b, x: b.x - 0.6, z: b.z - 0.6 }, HEX.steelDark), box(0.06, 1.3, 0.06, { ...b, x: b.x + 0.6, z: b.z - 0.6 }, HEX.steelDark))
    add(cylX(0.025, 1.8, { ...b, y: 1.3, z: b.z - 0.6 }, HEX.metal, 8))
    for (const s of [-1, 1]) add(cylX(0.22, 0.08, { x: b.x + s * 0.75, y: 1.3, z: b.z - 0.6 }, HEX.ink, 16))
  }
  const rack = at(68, 42.2)
  add(box(2, 0.7, 0.5, rack, HEX.steelDark))
  for (let i = 0; i < 6; i++) add(cyl(0.07, 0.07, 0.3, { x: rack.x - 0.8 + i * 0.32, y: 0.72, z: rack.z }, HEX.ink, 10))
  const bagFrame = at(67.5, 45.5)
  add(box(0.08, 2.4, 0.08, { ...bagFrame, x: bagFrame.x - 0.6 }, HEX.steel), box(1.3, 0.08, 0.08, { ...bagFrame, y: 2.35 }, HEX.steel))
  add(cyl(0.25, 0.25, 1.1, { ...bagFrame, y: 0.9 }, HEX.punchbag, 16))
  const tread = at(62, 45.8)
  add(box(0.8, 0.2, 1.8, tread, HEX.ink), box(0.7, 1.1, 0.08, { ...tread, z: tread.z - 0.85 }, HEX.steelDark))
  add(box(4, 0.02, 2, { ...at(65, 44.5), y: 0.01 }, HEX.mat))

  // ---- Library: shelves of paperbacks, a reading table, a QUIET sign ----
  shelfOfBooks(add, at(60.5, 49).x, 49 * TILE + 0.3, 4.6, true, 3)
  shelfOfBooks(add, at(58, 51).x + 0.2, at(58, 51).z, 0.5, true, 9)
  const read = at(61, 51.5)
  add(box(2.2, 0.06, 1.1, { ...read, y: 0.75 }, HEX.wood), cyl(0.08, 0.1, 0.75, read, HEX.steel, 10))
  chair(add, read.x - 0.6, read.z - 0.8, 0, HEX.wood)
  chair(add, read.x + 0.6, read.z + 0.8, Math.PI, HEX.wood)
  add(box(0.5, 0.35, 0.4, { ...read, y: 0.81, x: read.x + 0.4 }, HEX.bookRed))
  add(box(1.2, 0.4, 0.06, { x: at(62, 49).x, y: 2.2, z: 49 * TILE + 0.03 }, HEX.paper), box(0.9, 0.12, 0.07, { x: at(62, 49).x, y: 2.22, z: 49 * TILE + 0.04 }, HEX.ink))

  // ---- Officers' mess: a sofa that has seen things, a kettle, a biscuit
  //      tin, a fridge with a note on it, and a rack of spare uniforms ----
  const sofa = at(67, 51.3)
  add(box(3, 0.45, 0.9, sofa, HEX.sofa), box(3, 0.6, 0.25, { ...sofa, y: 0.45, z: sofa.z + 0.35 }, HEX.sofa))
  for (const s of [-1, 1]) add(box(0.25, 0.65, 0.9, { ...sofa, x: sofa.x + s * 1.5 }, HEX.sofa))
  const counter = at(68.5, 49.2)
  add(box(2.2, 0.9, 0.6, counter, HEX.wood), box(2.2, 0.04, 0.62, { ...counter, y: 0.9 }, HEX.paper))
  add(cyl(0.12, 0.14, 0.26, { ...counter, y: 0.94, x: counter.x - 0.6 }, HEX.metal, 14), cyl(0.15, 0.15, 0.12, { ...counter, y: 0.94, x: counter.x + 0.1 }, HEX.clothesRed, 16))
  for (let i = 0; i < 3; i++) add(cyl(0.05, 0.045, 0.1, { ...counter, y: 0.94, x: counter.x + 0.5 + i * 0.14 }, [HEX.paper, HEX.bookBlue, HEX.clothesYellow][i], 10))
  const fridge = at(65.4, 49.2)
  add(box(0.8, 1.8, 0.7, fridge, HEX.fridge), box(0.25, 0.2, 0.02, { ...fridge, y: 1.3, z: fridge.z + 0.36 }, HEX.clothesYellow))
  const rackU = at(65.2, 51.5)
  f.uniformRack = { x: rackU.x + 0.8, z: rackU.z }
  add(box(0.06, 1.8, 1.6, rackU, HEX.steel), box(0.06, 0.06, 1.6, { ...rackU, y: 1.75, x: rackU.x + 0.2 }, HEX.metal))
  for (let i = 0; i < 3; i++) add(box(0.25, 0.9, 0.5, { x: rackU.x + 0.2, y: 0.8, z: rackU.z - 0.5 + i * 0.5 }, i === 1 ? HEX.guardTrousers : HEX.guardShirt))
  add(box(2.2, 0.06, 0.8, { x: at(67, 50.5).x, y: 0.6, z: at(67, 50.5).z }, HEX.wood))

  // ---- Loading bay: the laundry van, cages, pallets, a roller shutter ----
  const van = at(64, 56.3)
  f.van = { x: van.x, z: van.z }
  add(box(2.2, 1.9, 4.6, { ...van, y: 0.35 }, HEX.van), box(2.22, 0.3, 4.62, { ...van, y: 1.0 }, HEX.vanStripe))
  add(box(2.1, 0.8, 1.2, { ...van, y: 0.35, z: van.z + 2.8 }, HEX.van), box(1.9, 0.5, 0.06, { ...van, y: 0.75, z: van.z + 3.4 }, HEX.window))
  for (const sx of [-1, 1]) for (const sz of [-1.5, 2.6]) add(cylX(0.38, 0.3, { x: van.x + sx * 1.05, y: 0.38, z: van.z + sz }, HEX.ink, 18))
  for (let i = 0; i < 3; i++) {
    const c = at(60 + i * 1.2, 54.6)
    add(box(1.0, 1.4, 1.0, c, HEX.cage), box(0.9, 0.8, 0.9, { ...c, y: 0.1 }, HEX.cloth))
  }
  for (let i = 0; i < 2; i++) add(box(1.2, 0.15, 1.2, at(68.5, 54.6 + i * 1.4), HEX.pallet), box(1.0, 0.8, 1.0, at(68.5, 54.6 + i * 1.4, 0.15), HEX.basket))
  add(box(2, 0.4, 0.3, { ...at(64, 58.6), y: WALL_H - 0.2 }, HEX.steelDark))

  // The X-ray: a tunnel on a conveyor with a monitor on a stand. Every
  // basket goes through it on the way to the van.
  const xr = at(61, 57)
  f.xray = { x: xr.x + 1.8, z: xr.z }
  add(box(2.4, 0.5, 1.2, { ...xr, y: 0 }, HEX.steelDark), box(2.6, 0.08, 1.0, { ...xr, y: 0.5 }, HEX.ink))
  add(box(1.3, 1.4, 1.3, { ...xr, y: 0.55 }, HEX.paper), box(1.32, 0.6, 1.0, { ...xr, y: 0.6 }, HEX.ink))
  add(box(0.08, 0.6, 1.34, { ...xr, x: xr.x - 0.66, y: 0.55 }, HEX.clothesYellow), box(0.08, 0.6, 1.34, { ...xr, x: xr.x + 0.66, y: 0.55 }, HEX.clothesYellow))
  add(cyl(0.04, 0.04, 1.2, { x: xr.x + 1.4, y: 0, z: xr.z - 0.5 }, HEX.steel, 8), box(0.7, 0.5, 0.08, { x: xr.x + 1.4, y: 1.2, z: xr.z - 0.48 }, HEX.tv), box(0.6, 0.4, 0.02, { x: xr.x + 1.4, y: 1.25, z: xr.z - 0.43 }, HEX.stainedBlue))
  add(cyl(0.12, 0.1, 0.2, { x: xr.x + 1.0, y: 0.58, z: xr.z + 0.45 }, HEX.paper, 12))

  // ---- The Governor's office: a desk the size of a car, a leather chair,
  //      filing cabinets, a portrait of the Governor, a safe and a dying
  //      yucca ----
  const desk = at(75, 50.6)
  f.govDesk = { x: desk.x, z: desk.z - 0.9 }
  add(box(3.0, 0.78, 1.3, desk, HEX.wood), box(2.6, 0.03, 1.0, { ...desk, y: 0.78 }, HEX.bookGreen))
  add(box(0.5, 0.04, 0.35, { ...desk, y: 0.81, x: desk.x - 0.7 }, HEX.paper), box(0.35, 0.25, 0.04, { ...desk, y: 0.81, x: desk.x + 0.8, z: desk.z - 0.3 }, HEX.stainedGold))
  add(cyl(0.05, 0.05, 0.12, { ...desk, y: 0.81, x: desk.x + 0.2 }, HEX.porcelain, 10))
  chair(add, desk.x, desk.z - 1.1, 0, HEX.bookRed)
  chair(add, desk.x - 0.8, desk.z + 1.2, Math.PI, HEX.steel)
  chair(add, desk.x + 0.8, desk.z + 1.2, Math.PI, HEX.steel)
  for (let i = 0; i < 3; i++) {
    const c = at(71.6 + i * 0.9, 49.25)
    add(box(0.8, 1.4, 0.6, c, HEX.steel))
    for (let d = 0; d < 3; d++) add(box(0.5, 0.05, 0.02, { ...c, y: 0.3 + d * 0.42, z: c.z + 0.31 }, HEX.steelDark))
  }
  const portrait = { x: at(75, 49).x, z: 49 * TILE + 0.04 }
  add(box(1.0, 1.2, 0.05, { ...portrait, y: 1.3 }, HEX.stainedGold), box(0.8, 1.0, 0.06, { ...portrait, y: 1.4 }, HEX.guardTrousers), ball(0.18, { x: portrait.x, y: 2.05, z: portrait.z + 0.04 }, HEX.skin))
  const safe = at(78.6, 52.4)
  f.safe = { x: safe.x - 0.9, z: safe.z - 0.3 }
  add(box(0.8, 0.9, 0.7, safe, HEX.steelDark), cyl(0.08, 0.08, 0.04, { x: safe.x, y: 0.55, z: safe.z - 0.37 }, HEX.stainedGold, 12))
  const yucca = at(78.6, 49.4)
  add(cyl(0.22, 0.18, 0.45, yucca, HEX.bookRed, 12), cyl(0.04, 0.05, 0.9, { ...yucca, y: 0.45 }, HEX.wood, 6))
  for (let i = 0; i < 5; i++) add(box(0.06, 0.5, 0.14, { x: yucca.x + Math.sin(i * 1.3) * 0.15, y: 1.2, z: yucca.z + Math.cos(i * 1.3) * 0.15, ry: i }, i % 2 ? HEX.peas : HEX.clothesYellow))

  // ---- Staff changing room: lockers both sides, a bench down the middle,
  //      a coat hook with a hi-vis, and the staff door out ----
  for (let i = 0; i < 7; i++) {
    for (const [ty, face] of [[54, 1], [58, 0]] as const) {
      const l = at(71.4 + i * 1.0, ty)
      const z = face ? ty * TILE + 0.35 : (ty + 1) * TILE - 0.35
      add(box(0.9, 1.9, 0.6, { x: l.x, y: 0, z }, i % 3 === 1 ? HEX.bookBlue : HEX.steel))
      add(box(0.06, 0.25, 0.03, { x: l.x + 0.3, y: 1.0, z: z + (face ? 0.31 : -0.31) }, HEX.steelDark))
      for (let v = 0; v < 3; v++) add(box(0.5, 0.03, 0.02, { x: l.x, y: 1.55 + v * 0.07, z: z + (face ? 0.31 : -0.31) }, HEX.steelDark))
    }
  }
  const bench = at(75, 55.2)
  add(box(5.2, 0.08, 0.5, { ...bench, y: 0.42 }, HEX.wood))
  for (const dx of [-2.2, 0, 2.2]) add(box(0.08, 0.42, 0.4, { ...bench, x: bench.x + dx }, HEX.steelDark))
  add(box(0.5, 0.7, 0.05, { x: (EAST_WALL - 0.04) * TILE - 0.03, y: 1.2, z: at(79, 55).z, ry: Math.PI / 2 }, HEX.clothesYellow))
  add(box(0.06, 0.4, 0.5, { x: (EAST_WALL) * TILE - 0.05, y: 1.6, z: at(79, 57.4).z }, HEX.paper))

  // ---- The staff car park outside the staff door, and the Governor's
  //      green Jaguar with the private plate ----
  const park = at(EAST_WALL + 2.5, 55)
  add(box(4.6, 0.03, 9, { ...park, y: -0.01 }, HEX.road))
  for (let i = 0; i < 3; i++) add(box(0.12, 0.031, 2.6, { x: park.x - 2.2 + i * 2.2, y: 0, z: park.z - 3 }, HEX.yardLines))
  const jag = at(EAST_WALL + 2.5, 53.6)
  f.jag = { x: jag.x, z: jag.z }
  add(box(1.8, 0.7, 4.4, { ...jag, y: 0.3 }, HEX.bookGreen), box(1.6, 0.5, 2.2, { ...jag, y: 0.95, z: jag.z + 0.2 }, HEX.bookGreen))
  add(box(1.5, 0.42, 0.06, { ...jag, y: 1.0, z: jag.z + 1.31 }, HEX.window), box(1.5, 0.4, 0.06, { ...jag, y: 1.0, z: jag.z - 0.91 }, HEX.window))
  add(box(0.6, 0.14, 0.04, { ...jag, y: 0.45, z: jag.z + 2.21 }, HEX.paper), box(0.12, 0.08, 0.2, { ...jag, y: 1.0, z: jag.z + 2.1 }, HEX.stainedGold))
  for (const sx of [-1, 1]) for (const sz of [-1.4, 1.4]) add(cylX(0.34, 0.26, { x: jag.x + sx * 0.88, y: 0.34, z: jag.z + sz }, HEX.ink, 16))

  // The laundry basket you can climb into, by the laundry door.
  f.laundryBasket = { x: at(46, 11).x, z: at(46, 11).z }
  return f
}

/** Small things everywhere that make the rooms read as lived in. */
export function detailPass(add: Add, grid: Grid): void {
  // Posters and a shelf in every cell; a radiator under the window.
  let n = 0
  for (const cell of grid.cells.values()) {
    const doorNorth = cell.door.ty < cell.rect.y0
    const x0 = cell.rect.x0 * TILE
    const x1 = (cell.rect.x1 + 1) * TILE
    const back = doorNorth ? (cell.rect.y1 + 1) * TILE - 0.04 : cell.rect.y0 * TILE + 0.04
    const posters = [HEX.clothesRed, HEX.bookBlue, HEX.clothesYellow, HEX.peas, HEX.boa]
    add(box(0.55, 0.75, 0.03, { x: x0 + 2.4, y: 1.0, z: back }, posters[n % posters.length]))
    add(box(0.4, 0.3, 0.035, { x: x0 + 2.4, y: 1.3, z: back + (doorNorth ? -0.01 : 0.01) }, HEX.paper))
    add(box(1.0, 0.05, 0.25, { x: x1 - 0.7, y: 1.5, z: back + (doorNorth ? -0.13 : 0.13) }, HEX.wood))
    add(box(0.14, 0.2, 0.14, { x: x1 - 0.9, y: 1.55, z: back + (doorNorth ? -0.13 : 0.13) }, HEX.toothpaste), cyl(0.05, 0.05, 0.16, { x: x1 - 0.55, y: 1.55, z: back + (doorNorth ? -0.13 : 0.13) }, HEX.clothesRed, 10))
    add(box(1.0, 0.45, 0.1, { x: (x0 + x1) / 2 + 0.6, y: 0.3, z: back + (doorNorth ? -0.06 : 0.06) }, HEX.paper))
    for (let k = 0; k < 6; k++) add(box(0.04, 0.42, 0.12, { x: (x0 + x1) / 2 + 0.2 + k * 0.16, y: 0.31, z: back + (doorNorth ? -0.07 : 0.07) }, HEX.wallShade))
    if (cell.zone !== PLAYER_CELL) add(box(0.4, 0.05, 0.3, { x: x1 - 0.55, y: 0.78, z: back + (doorNorth ? -0.5 : 0.5) }, n % 2 ? HEX.paper : HEX.bookRed))
    n++
  }

  // Extinguishers and CCTV by every gate.
  for (const door of grid.doors) {
    if (door.kind !== 'gate' && door.kind !== 'secure') continue
    const c = { x: (door.tx + 0.5) * TILE, z: (door.ty + 0.5) * TILE }
    const off = door.axis === 'x' ? { x: 1.25, z: 0.0 } : { x: 0, z: 1.25 }
    add(cyl(0.12, 0.12, 0.5, { x: c.x + off.x, y: 0.2, z: c.z + off.z + (door.axis === 'x' ? 1.1 : 0) }, HEX.extinguisher, 12))
    add(box(0.25, 0.18, 0.4, { x: c.x - off.x, y: WALL_H - 0.3, z: c.z - off.z }, HEX.paper), ball(0.07, { x: c.x - off.x, y: WALL_H - 0.24, z: c.z - off.z + 0.22 }, HEX.ink))
  }

  // Canteen: trays, plates and mugs left on the tables.
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 2; col++) {
      const p = at(36.5 + col * 6, 19.5 + row * 3.2)
      for (let k = 0; k < 4; k++) {
        const x = p.x - 1.6 + k * 1.05
        const z = p.z + (k % 2 ? 0.4 : -0.4)
        add(box(0.55, 0.03, 0.4, { x, y: 0.86, z }, HEX.steel), cyl(0.14, 0.12, 0.03, { x, y: 0.89, z }, HEX.paper, 16))
        add(ball(0.07, { x: x + 0.05, y: 0.93, z }, k % 2 ? HEX.peas : HEX.chipsOrange, 1, 0.5, 1))
        add(cyl(0.05, 0.045, 0.1, { x: x + 0.22, y: 0.86, z: z + 0.1 }, HEX.paper, 12))
      }
    }
  }
  // Notice boards on the landings and the canteen.
  for (const [tx, ty] of [[14, 13], [55, 13], [14, 32], [55, 32], [36, 17]] as const) {
    const c = at(tx, ty)
    add(box(1.6, 1.0, 0.05, { x: c.x, y: 1.2, z: ty * TILE + 0.03 }, HEX.wood))
    for (let k = 0; k < 4; k++) add(box(0.3, 0.38, 0.06, { x: c.x - 0.55 + k * 0.36, y: 1.35 - (k % 2) * 0.2, z: ty * TILE + 0.04 }, [HEX.paper, HEX.clothesYellow, HEX.paper, HEX.toothpaste][k]))
  }
  // Laundry: pipes along the back wall and folded piles on the table.
  add(cylX(0.07, 12, { x: at(43.5, 8).x, y: 2.1, z: 8 * TILE + 0.12 }, HEX.metal, 10))
  add(cylX(0.05, 12, { x: at(43.5, 8).x, y: 1.85, z: 8 * TILE + 0.12 }, HEX.steel, 10))
  for (let k = 0; k < 4; k++) add(box(0.5, 0.18 + (k % 2) * 0.12, 0.4, { x: at(43.5, 9.9).x - 1.6 + k * 1.1, y: 0.82, z: at(43.5, 9.9).z }, k % 2 ? HEX.cloth : HEX.paper))
  // Healthcare: posters about hand-washing and a set of scales.
  add(box(0.6, 0.8, 0.03, { x: at(26, 22).x, y: 1.3, z: 22 * TILE + 0.03 }, HEX.toothpaste), box(0.6, 0.8, 0.03, { x: at(28, 22).x, y: 1.3, z: 22 * TILE + 0.03 }, HEX.peas))
  add(box(0.5, 0.06, 0.5, { ...at(30, 25), y: 0 }, HEX.paper), box(0.06, 1.3, 0.06, { ...at(30, 25), z: at(30, 25).z + 0.22 }, HEX.steel))
  // Games room: beanbags and a shelf of board games with pieces missing.
  for (let k = 0; k < 3; k++) add(ball(0.45, { ...at(53 + k * 1.1, 25.2), y: 0.3 }, [HEX.clothesRed, HEX.bookBlue, HEX.peas][k], 1, 0.6, 1))
  for (let k = 0; k < 5; k++) add(box(0.6, 0.08, 0.45, { x: at(53, 22).x - 1 + k * 0.05, y: 0.8 + k * 0.09, z: 22 * TILE + 0.35 }, [HEX.clothesRed, HEX.clothesYellow, HEX.bookGreen, HEX.bookBlue, HEX.paper][k]))
}
