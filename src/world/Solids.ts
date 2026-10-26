import { type Grid, TILE } from './Grid'

/**
 * Everything in the prison you cannot walk through, and everything you can
 * sit on. Footprints match the furniture built in Build.ts and Furnish.ts:
 * tables, chairs, benches, pews, bunks, washing machines, gym kit, the pool
 * table, the van. Paths go round them and bodies bump off them.
 *
 * Seats face the way you sit: yaw 0 looks toward +z, PI toward -z.
 */
const at = (tx: number, ty: number) => ({ x: (tx + 0.5) * TILE, z: (ty + 0.5) * TILE })

export function registerSolids(grid: Grid): void {
  const solid = (x: number, z: number, w: number, d: number, nav = true) => grid.addProp(x, z, w, d, nav)
  /** A bed: solid, but someone lying down in it may step in. */
  const bed = (x: number, z: number, w: number, d: number) => grid.addProp(x, z, w, d, true, true)
  /** A bench or sofa: solid, with seats spaced along its length. */
  const bench = (x: number, z: number, w: number, d: number, yaw: number, seats: number, alongX = true) => {
    grid.addProp(x, z, w, d, true, true)
    const len = alongX ? w : d
    for (let i = 0; i < seats; i++) {
      const o = seats === 1 ? 0 : -len / 2 + (len / seats) * (i + 0.5)
      grid.addSeat(alongX ? x + o : x, alongX ? z : z + o, yaw)
    }
  }

  // ---- Cells: bunk, toilet, table and stool ----
  for (const cell of grid.cells.values()) {
    const { rect } = cell
    const doorNorth = cell.door.ty < rect.y0
    const x0 = rect.x0 * TILE
    const x1 = (rect.x1 + 1) * TILE
    const z0 = rect.y0 * TILE
    const z1 = (rect.y1 + 1) * TILE
    const back = doorNorth ? z1 - 0.6 : z0 + 0.6
    const front = doorNorth ? z0 + 0.5 : z1 - 0.5
    const midZ = (z0 + z1) / 2
    const bunkX = x0 + 0.75
    bed(bunkX + 0.05, midZ + (doorNorth ? 0.6 : -0.6), 1.1, 2.6)
    grid.addSeat(cell.bunks[0].x + 0.55, cell.bunks[0].z, Math.PI / 2)
    // The toilet: you can sit on it, so it is a seat you may step into.
    const s = doorNorth ? 1 : -1
    grid.addProp(x1 - 0.62, front - s * 0.05, 0.82, 0.95, false, true)
    grid.addSeat(x1 - 0.62, front + s * 0.12, doorNorth ? 0 : Math.PI, cell.zone)
    solid(x1 - 0.55, back + (doorNorth ? -0.2 : 0.2), 0.9, 0.6, false)
    grid.addSeat(cell.bunks[1].x, cell.bunks[1].z, -Math.PI / 2)
  }

  // ---- Showers: partitions, and the bench to sit on ----
  for (let i = 0; i < 4; i++) {
    const p = at(33.5 + i * 1.1, 8)
    solid(p.x + 1.1, p.z - 0.6 + 0.6, 0.14, 1.6, false)
  }
  bench(at(34.2, 11).x, at(34.2, 11).z, 3.4, 0.6, Math.PI, 3)

  // ---- Laundry: machines, the folding table, baskets ----
  for (let i = 0; i < 6; i++) {
    const p = at(41 + i, 8)
    solid(p.x, p.z - 0.3, 1.5, 1.3)
  }
  solid(at(43.5, 9.9).x, at(43.5, 9.9).z, 4.6, 1.4)
  for (const tx of [41, 46]) solid(at(tx, 11).x, at(tx, 11).z, 1.1, 1.1)

  // ---- Canteen: six long tables with a bench either side, the servery,
  //      the officers' desk ----
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 2; col++) {
      const p = at(36.5 + col * 6, 19.5 + row * 3.2)
      solid(p.x, p.z, 4.4, 1.6)
      bench(p.x, p.z - 1.25, 4.4, 0.45, 0, 3)
      bench(p.x, p.z + 1.25, 4.4, 0.45, Math.PI, 3)
    }
  }
  solid(at(39.5, 29.3).x, at(39.5, 29.3).z, 14, 1.2)
  solid(at(35, 17.6).x, at(35, 17.6).z, 2.6, 1.2)

  // ---- Healthcare ----
  for (let i = 0; i < 4; i++) {
    const p = at(21.5 + i * 2.6, 22.6)
    bed(p.x, p.z, 1.1, 2.2)
    solid(p.x + 1.1, p.z, 0.08, 2.4, false)
  }
  solid(at(31, 22).x, at(31, 22).z, 1.6, 0.6, false)
  solid(at(28.5, 25).x, at(28.5, 25).z, 2.4, 1.2)

  // ---- Segregation ----
  bed(at(10, 22.8).x, at(10, 22.8).z, 1.3, 2.4)
  solid(at(13, 22.3).x, at(13, 22.3).z, 0.6, 0.6, false)

  // ---- Games room: pool, table tennis, the telly and its sofa ----
  solid(at(50, 23.5).x, at(50, 23.5).z, 4.2, 2.4)
  solid(at(55, 24).x, at(55, 24).z, 3, 1.6)
  solid(at(57.5, 22.2).x, at(57.5, 22.2).z, 2.4, 0.9, false)
  bench(at(57.5, 24.8).x, at(57.5, 24.8).z + 0.15, 2.8, 1.2, Math.PI, 3)

  // ---- Maintenance ----
  solid(at(64, 22).x, at(64, 22).z - 0.3, 6, 1.3)
  solid(at(69.5, 23).x, at(69.5, 23).z, 1.8, 0.7, false)
  solid(at(61, 25).x, at(61, 25).z, 2.0, 1.4)

  // ---- Yard: benches, the weights bench, the flagpole and the hoop ----
  for (const [tx, ty] of [[40, 44], [46, 44], [27, 56], [33, 56], [51, 46], [44, 56]] as const) bench(at(tx, ty).x, at(tx, ty).z, 3.4, 0.7, 0, 2)
  bench(at(44, 52).x, at(44, 52).z, 2.2, 0.6, 0, 1)
  solid(at(27, 57).x, at(27, 57).z, 0.3, 0.3, false)
  solid(at(33, 49).x - 9.6, at(33, 49).z, 0.3, 0.3, false)

  // ---- Chapel: altar, pews, organ, the panto box ----
  solid(at(10.6, 44).x, at(10.6, 44).z, 0.9, 2.6)
  for (let row = 0; row < 4; row++) {
    for (const side of [-1, 1]) {
      const p = at(13.5 + row * 2, 44 + side * 1.4)
      bench(p.x + 0.05, p.z, 0.65, 2.6, -Math.PI / 2, 2, false)
    }
  }
  solid(at(11, 42.3).x, at(11, 42.3).z, 1.6, 0.7, false)
  solid(at(20.6, 46.3).x, at(20.6, 46.3).z, 1.3, 0.8, false)

  // ---- Visiting hall: tables and chairs, the vending machine, the desk ----
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 2; col++) {
      const p = at(13 + col * 5, 51 + row * 2.6)
      solid(p.x, p.z, 1.4, 0.9)
      bench(p.x, p.z - 0.9, 0.5, 0.5, 0, 1)
      bench(p.x, p.z + 0.9, 0.5, 0.5, Math.PI, 1)
    }
  }
  solid(at(21, 49.2).x, at(21, 49.2).z, 1.0, 0.8, false)
  solid(at(20.5, 57.5).x, at(20.5, 57.5).z, 1.6, 0.7, false)

  // ---- Gym: benches, the rack, the punchbag, the treadmill ----
  for (let i = 0; i < 3; i++) {
    const b = at(60 + i * 3, 43.5)
    bench(b.x, b.z, 0.5, 1.6, Math.PI / 2, 1, false)
    solid(b.x, b.z - 0.6, 1.4, 0.14, false)
  }
  solid(at(68, 42.2).x, at(68, 42.2).z, 2, 0.5, false)
  solid(at(67.5, 45.5).x - 0.3, at(67.5, 45.5).z, 1.0, 0.5, false)
  solid(at(62, 45.8).x, at(62, 45.8).z, 0.8, 1.8)

  // ---- Library: shelves, the reading table and its two chairs ----
  solid(at(60.5, 49).x, 49 * TILE + 0.3 + 0.225, 4.6, 0.45, false)
  const read = at(61, 51.5)
  solid(read.x, read.z, 2.2, 1.1)
  bench(read.x - 0.6, read.z - 0.8, 0.5, 0.5, 0, 1)
  bench(read.x + 0.6, read.z + 0.8, 0.5, 0.5, Math.PI, 1)

  // ---- Officers' mess ----
  bench(at(67, 51.3).x, at(67, 51.3).z + 0.1, 3.2, 1.15, Math.PI, 3)
  solid(at(68.5, 49.2).x, at(68.5, 49.2).z, 2.2, 0.6, false)
  solid(at(65.4, 49.2).x, at(65.4, 49.2).z, 0.8, 0.7, false)
  solid(at(65.2, 51.5).x, at(65.2, 51.5).z, 0.4, 1.6, false)
  solid(at(67, 50.5).x, at(67, 50.5).z, 2.2, 0.8)

  // ---- Governor's office: the desk and its three chairs, the cabinets,
  //      the safe, the yucca ----
  const desk = at(75, 50.6)
  solid(desk.x, desk.z, 3.0, 1.3)
  bench(desk.x, desk.z - 1.1, 0.5, 0.5, 0, 1)
  bench(desk.x - 0.8, desk.z + 1.2, 0.5, 0.5, Math.PI, 1)
  bench(desk.x + 0.8, desk.z + 1.2, 0.5, 0.5, Math.PI, 1)
  solid(at(72.5, 49.25).x, at(72.5, 49.25).z, 2.7, 0.6, false)
  solid(at(78.6, 52.4).x, at(78.6, 52.4).z, 0.8, 0.7, false)
  solid(at(78.6, 49.4).x, at(78.6, 49.4).z, 0.5, 0.5, false)

  // ---- Staff changing room: lockers both sides, the bench down the middle ----
  solid(at(74.4, 54).x, 54 * TILE + 0.35, 7, 0.6, false)
  solid(at(74.4, 58).x, 59 * TILE - 0.35, 7, 0.6, false)
  bench(at(75, 55.2).x, at(75, 55.2).z, 5.2, 0.5, 0, 4)

  // ---- Loading bay: the van, cages, pallets, the X-ray ----
  solid(at(64, 56.3).x, at(64, 56.3).z + 0.55, 2.3, 5.7)
  for (let i = 0; i < 3; i++) solid(at(60 + i * 1.2, 54.6).x, at(60 + i * 1.2, 54.6).z, 1.0, 1.0, false)
  for (let i = 0; i < 2; i++) solid(at(68.5, 54.6 + i * 1.4).x, at(68.5, 54.6 + i * 1.4).z, 1.2, 1.2, false)
  solid(at(61, 57).x, at(61, 57).z, 2.6, 1.3)
}
