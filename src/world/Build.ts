import {
  type BufferGeometry,
  Group,
  Mesh,
  PlaneGeometry,
} from 'three'
import { HEX } from '../art/palette'
import { paint, mergePainted } from '../art/paint'
import { toon } from '../art/toonMaterial'
import { type Place, ball, bandedBox, box, cyl, ring } from '../art/shapes'
import { SOLID_LAYER } from '../render/CelPipeline'
import { type Grid, MAP_H, MAP_W, PLAYER_CELL, type Rect, TILE, Tile } from './Grid'
import { type AnnexFixtures, detailPass, furnishAnnexes } from './Furnish'
import { registerSolids } from './Solids'

export const WALL_H = 2.6
export const PERIMETER_H = 5.2

/** Floor paint per room type, from palette keys named on the room. */
const FLOOR: Record<string, number> = {
  floorLino: HEX.floorLino,
  floorCell: HEX.floorCell,
  floorTile: HEX.floorTile,
  floorWood: HEX.floorWood,
  floorCanteen: HEX.floorCanteen,
  floorLaundry: HEX.floorLaundry,
  floorInfirmary: HEX.floorInfirmary,
  floorSolitary: HEX.floorSolitary,
  floorMaint: HEX.floorMaint,
  floorGym: HEX.floorGym,
  floorCarpet: HEX.floorCarpet,
  yardTarmac: HEX.yardTarmac,
}

/** Interactive fixtures the game needs to find again after building. */
export interface Fixtures extends AnnexFixtures {
  phones: { x: number; z: number }[]
  flagpole: { x: number; z: number }
  benches: { x: number; z: number; zone: string }[]
  poolTable: { x: number; z: number }
  showerHeads: { x: number; z: number }[]
  washers: { x: number; z: number }[]
  infirmaryBeds: { x: number; z: number }[]
  workbench: { x: number; z: number }
  solitaryBed: { x: number; z: number }
  road: { x: number; z: number }
}

/**
 * Builds the static prison: walls, floors, perimeter, furniture. All of it is
 * merged into a few geometries sharing one vertex-tinted toon material.
 */
export function buildPrison(grid: Grid): { group: Group; fixtures: Fixtures } {
  const group = new Group()
  const statics: BufferGeometry[] = []
  const add = (...g: BufferGeometry[]) => statics.push(...g)
  const at = (tx: number, ty: number, y = 0, ry = 0): Place => ({ x: (tx + 0.5) * TILE, y, z: (ty + 0.5) * TILE, ry })

  // ---- Ground outside the wall: grass, a road, a verge and some trees ----
  const ground = new PlaneGeometry(MAP_W * TILE + 120, MAP_H * TILE + 120)
  ground.rotateX(-Math.PI / 2)
  ground.translate((MAP_W * TILE) / 2, -0.05, (MAP_H * TILE) / 2)
  add(paint(ground, HEX.outsideGrass))
  add(box(MAP_W * TILE + 120, 0.04, 7, { x: (MAP_W * TILE) / 2, y: -0.04, z: 66 * TILE }, HEX.road))
  for (let x = -40; x < MAP_W * TILE + 40; x += 8) add(box(3, 0.05, 0.3, { x, y: -0.03, z: 66 * TILE }, HEX.yardLines))
  for (let i = 0; i < 26; i++) {
    const x = -20 + i * 7.3 + ((i * 37) % 5)
    const z = 69.5 * TILE + ((i * 13) % 4)
    tree(add, x, z, 1 + ((i * 7) % 3) * 0.2)
  }
  for (let i = 0; i < 12; i++) tree(add, 2 * TILE + ((i * 17) % 5), 10 + i * 9, 1.1)
  for (let i = 0; i < 12; i++) tree(add, 77 * TILE + ((i * 11) % 5), 14 + i * 9, 1.0)

  // ---- Floors, one painted quad per tile, with a faint chequer ----
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const t = grid.tile(tx, ty)
      if (t !== Tile.Floor && t !== Tile.Door) continue
      const zone = grid.zone(tx, ty)
      const room = grid.rooms.get(zone)
      let hex = FLOOR[room?.floor ?? 'floorLino'] ?? HEX.floorLino
      if (t === Tile.Door) hex = HEX.steelDark
      const checker = (tx + ty) % 2 === 0
      const q = new PlaneGeometry(TILE, TILE)
      q.rotateX(-Math.PI / 2)
      q.translate((tx + 0.5) * TILE, 0, (ty + 0.5) * TILE)
      add(paint(q, checker && zone !== 'yard' ? shadeHex(hex, 0.95) : hex))
    }
  }

  // ---- Walls: greedy runs of solid tiles along each row ----
  for (let ty = 0; ty < MAP_H; ty++) {
    let tx = 0
    while (tx < MAP_W) {
      if (grid.tile(tx, ty) !== Tile.Solid || !insideFootprint(tx, ty)) {
        tx++
        continue
      }
      const exterior = touchesOutdoor(grid, tx, ty)
      let end = tx
      while (end + 1 < MAP_W && grid.tile(end + 1, ty) === Tile.Solid && insideFootprint(end + 1, ty) && touchesOutdoor(grid, end + 1, ty) === exterior) end++
      const w = (end - tx + 1) * TILE
      const place = { x: (tx + (end - tx + 1) / 2) * TILE, y: 0, z: (ty + 0.5) * TILE }
      if (exterior) add(...bandedBox(w, TILE, place, [[0.5, HEX.brickShade], [WALL_H, HEX.brick]], HEX.steelDark))
      else add(...bandedBox(w, TILE, place, [[1.15, HEX.wallGreen], [1.25, HEX.ink], [WALL_H, HEX.wallCream]], HEX.steelDark))
      tx = end + 1
    }
  }

  // ---- Perimeter: tall brick, a coping stone, razor wire coiled along the top ----
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      if (grid.tile(tx, ty) !== Tile.Perimeter) continue
      add(...bandedBox(TILE, TILE, at(tx, ty), [[0.6, HEX.brickShade], [PERIMETER_H - 0.3, HEX.brick], [PERIMETER_H, HEX.wallCream]], HEX.wallCream))
      const horizontal = ty === 5 || ty === 59
      add(ring(0.45, 0.04, { ...at(tx, ty, PERIMETER_H + 0.35), ry: horizontal ? 0 : Math.PI / 2 }, HEX.wire, 0))
      if ((tx + ty) % 7 === 0) add(cyl(0.12, 0.14, 2.2, at(tx, ty, PERIMETER_H), HEX.steel, 6))
    }
  }
  // Floodlight masts at the yard corners.
  for (const [tx, ty] of [[24, 57], [55, 57], [24, 42], [55, 42]] as const) {
    add(cyl(0.15, 0.2, 7, at(tx, ty), HEX.steel, 6))
    add(box(1.2, 0.5, 0.6, at(tx, ty, 7), HEX.steelDark))
  }

  const annex = furnishAnnexes(add)
  detailPass(add, grid)
  const fixtures: Fixtures = {
    ...annex,
    phones: [],
    flagpole: { x: 0, z: 0 },
    benches: [],
    poolTable: { x: 0, z: 0 },
    showerHeads: [],
    washers: [],
    infirmaryBeds: [],
    workbench: { x: 0, z: 0 },
    solitaryBed: { x: 0, z: 0 },
    road: { x: 40 * TILE, z: 66 * TILE },
  }

  // ---- Cells ----
  for (const cell of grid.cells.values()) furnishCell(add, cell.rect, cell.bunks, cell.door.ty < cell.rect.y0, cell.zone === PLAYER_CELL)

  // ---- Showers: a tiled partition and a row of heads on the back wall ----
  for (let i = 0; i < 5; i++) {
    const p = at(33.5 + i * 1.1, 8, 0)
    p.z -= 0.6
    add(cyl(0.05, 0.05, 1.9, p, HEX.metal, 6))
    add(cyl(0.18, 0.1, 0.12, { ...p, y: 1.9 }, HEX.metal, 8))
    fixtures.showerHeads.push({ x: p.x, z: p.z + 0.8 })
    if (i < 4) add(box(0.12, 1.8, 1.6, { x: p.x + 1.1, y: 0, z: p.z + 0.6 }, HEX.floorTile))
  }
  add(cyl(0.25, 0.25, 0.02, at(36, 10), HEX.steelDark, 10))
  add(box(3.4, 0.45, 0.6, at(34.2, 11, 0), HEX.wood))

  // ---- Laundry: a bank of machines, a folding table, baskets ----
  for (let i = 0; i < 6; i++) {
    const p = at(41 + i, 8)
    p.z -= 0.3
    add(box(1.5, 1.5, 1.3, p, HEX.washer))
    add(ring(0.42, 0.07, { ...p, y: 0.8, z: p.z + 0.66 }, HEX.steelDark, 0))
    add(ball(0.36, { ...p, y: 0.8, z: p.z + 0.66 }, HEX.window, 1, 1, 0.12))
    fixtures.washers.push({ x: p.x, z: p.z + 1.2 })
  }
  table(add, at(43.5, 9.9), 4.6, 1.4, HEX.tableTop)
  for (const tx of [41, 46]) add(cyl(0.55, 0.45, 0.9, at(tx, 11), HEX.basket, 10))

  // ---- Hub: canteen tables, servery, phones on the wall, officers' desk ----
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 2; col++) {
      const p = at(36.5 + col * 6, 19.5 + row * 3.2)
      table(add, p, 4.4, 1.6, HEX.tableTop)
      for (const side of [-1, 1]) {
        add(box(4.4, 0.45, 0.45, { x: p.x, y: 0, z: p.z + side * 1.25 }, HEX.steel))
        fixtures.benches.push({ x: p.x, z: p.z + side * 1.25, zone: 'hub' })
      }
    }
  }
  add(...bandedBox(14, 1.2, at(39.5, 29.3), [[1.0, HEX.steel], [1.1, HEX.metal]], HEX.metal))
  for (let i = 0; i < 4; i++) add(box(1.2, 0.18, 0.8, { ...at(37 + i * 2, 29.3, 1.1) }, i % 2 ? HEX.chipsOrange : HEX.peas))
  for (const tx of [44.6, 45.3]) {
    const p = at(tx, 17)
    p.z -= 0.75
    add(box(0.55, 0.9, 0.3, { ...p, y: 1.1 }, HEX.phone))
    add(box(0.16, 0.45, 0.14, { x: p.x + 0.18, y: 1.35, z: p.z + 0.22 }, HEX.ink))
    add(box(0.9, 0.06, 0.5, { ...p, y: 2.1, z: p.z + 0.2 }, HEX.steelDark))
    fixtures.phones.push({ x: p.x, z: p.z + 1.2 })
  }
  add(box(2.6, 1.0, 1.2, at(35, 17.6), HEX.wood))
  add(box(0.9, 0.5, 0.06, { ...at(35, 17.6, 1.0) }, HEX.tv))

  // ---- Healthcare: beds behind curtains, a drugs cabinet, a desk ----
  for (let i = 0; i < 4; i++) {
    const p = at(21.5 + i * 2.6, 22.6)
    add(box(1.1, 0.55, 2.2, p, HEX.steel))
    add(box(1.0, 0.18, 2.1, { ...p, y: 0.55 }, HEX.porcelain))
    add(box(0.8, 0.12, 0.45, { ...p, y: 0.73, z: p.z - 0.75 }, HEX.paper))
    add(box(0.06, 1.9, 2.4, { ...p, x: p.x + 1.1 }, HEX.window))
    fixtures.infirmaryBeds.push({ x: p.x, z: p.z })
  }
  add(box(1.6, 2.0, 0.6, at(31, 22, 0), HEX.paper))
  add(box(0.08, 0.5, 0.5, { ...at(31, 22, 1.2), z: (22.5) * TILE + 0.3 }, HEX.doorRed))
  table(add, at(28.5, 25), 2.4, 1.2, HEX.wood)

  // ---- Segregation: a concrete plinth bed and a steel toilet ----
  add(box(1.3, 0.5, 2.4, at(10, 22.8), HEX.wallShade))
  fixtures.solitaryBed = { x: at(10, 22.8).x, z: at(10, 22.8).z }
  add(cyl(0.3, 0.25, 0.5, at(13, 22.3), HEX.metal))
  for (let tx = 14; tx <= 18; tx++) add(cyl(0.05, 0.05, WALL_H, at(tx, 23.5), HEX.steel, 6))

  // ---- Games room: pool table, darts, telly, table tennis ----
  const pool = at(50, 23.5)
  fixtures.poolTable = { x: pool.x, z: pool.z }
  add(box(4.2, 0.8, 2.4, pool, HEX.wood))
  add(box(3.8, 0.06, 2.0, { ...pool, y: 0.8 }, HEX.pool))
  for (let i = 0; i < 6; i++) add(ball(0.09, { x: pool.x - 0.8 + i * 0.32, y: 0.92, z: pool.z + ((i * 7) % 3) * 0.2 - 0.2 }, [HEX.clothesRed, HEX.clothesYellow, HEX.ink, HEX.paper][i % 4]))
  const ping = at(55, 24)
  table(add, ping, 3, 1.6, HEX.pool)
  add(box(0.05, 0.18, 1.6, { ...ping, y: 0.82 }, HEX.paper))
  add(box(2.4, 1.0, 0.9, at(57.5, 22.2), HEX.tv))
  add(box(2.2, 1.3, 0.14, { ...at(57.5, 22.2, 1.05), z: at(57.5, 22.2).z + 0.2 }, HEX.ink))
  add(box(2.8, 0.6, 1.0, at(57.5, 24.8), HEX.mattress))
  add(box(2.8, 0.7, 0.3, { ...at(57.5, 24.8), z: at(57.5, 24.8).z + 0.5 }, HEX.mattress))
  add(ball(0.45, { ...at(48, 22, 1.6), z: at(48, 22).z - 0.9 }, HEX.paper, 1, 1, 0.1))
  add(ball(0.2, { ...at(48, 22, 1.6), z: at(48, 22).z - 0.85 }, HEX.clothesRed, 1, 1, 0.1))

  // ---- Maintenance: workbench, shelving, a generator ----
  const bench = at(64, 22)
  bench.z -= 0.3
  fixtures.workbench = { x: bench.x, z: bench.z + 1.3 }
  table(add, bench, 6, 1.3, HEX.wood)
  add(box(0.6, 0.35, 0.4, { ...bench, y: 0.9, x: bench.x - 1.6 }, HEX.clothesRed))
  for (let i = 0; i < 3; i++) add(box(1.8, 0.08, 0.7, at(69.5, 23 + i * 0.01, 0.6 + i * 0.6), HEX.steel))
  add(box(0.08, 2.1, 0.7, { ...at(69.5, 23), x: at(69.5, 23).x - 0.9 }, HEX.steel))
  add(box(2.0, 1.3, 1.4, at(61, 25), HEX.clothesYellow))

  // ---- Yard: court markings, a hoop, benches, weights, the flagpole ----
  // A running track round the edge of the yard.
  for (const [x0, z0, x1, z1] of [[24, 42, 55, 42], [24, 57, 55, 57], [24, 42, 24, 57], [55, 42, 55, 57]]) {
    add(box(Math.abs(x1 - x0) * TILE + 0.25, 0.02, Math.abs(z1 - z0) * TILE + 0.25, { x: ((x0 + x1) / 2 + 0.5) * TILE, y: 0.005, z: ((z0 + z1) / 2 + 0.5) * TILE }, HEX.yardLines))
  }
  const court = at(33, 49)
  add(box(20, 0.02, 0.2, { ...court, z: court.z - 7 }, HEX.yardLines))
  add(box(20, 0.02, 0.2, { ...court, z: court.z + 7 }, HEX.yardLines))
  add(box(0.2, 0.02, 14, { ...court, x: court.x - 10 }, HEX.yardLines))
  add(box(0.2, 0.02, 14, { ...court, x: court.x + 10 }, HEX.yardLines))
  add(ring(2.2, 0.08, { ...court, y: 0.01 }, HEX.yardLines, Math.PI / 2))
  add(cyl(0.12, 0.12, 3.4, { ...court, x: court.x - 9.6 }, HEX.steel, 6))
  add(box(0.1, 1.1, 1.8, { ...court, x: court.x - 9.4, y: 3.0 }, HEX.paper))
  add(ring(0.35, 0.04, { ...court, x: court.x - 8.9, y: 3.1 }, HEX.hoop, Math.PI / 2))
  const grass = new PlaneGeometry(11 * TILE, 7 * TILE)
  grass.rotateX(-Math.PI / 2)
  grass.translate(49 * TILE, 0.012, 53 * TILE)
  add(paint(grass, HEX.yardGrass))
  for (const [tx, ty] of [[40, 44], [46, 44], [27, 56], [33, 56], [51, 46], [44, 56]] as const) {
    add(box(3.4, 0.5, 0.7, at(tx, ty), HEX.wood))
    fixtures.benches.push({ x: at(tx, ty).x, z: at(tx, ty).z, zone: 'yard' })
  }
  add(box(1.5, 0.6, 0.5, at(44, 52), HEX.steelDark))
  add(box(2.2, 0.08, 0.08, at(44, 52, 1.0), HEX.metal))
  for (const s of [-1, 1]) add(cyl(0.3, 0.3, 0.12, { ...at(44, 52, 0.94), x: at(44, 52).x + s * 0.9 }, HEX.ink, 10))
  const pole = at(27, 57)
  fixtures.flagpole = { x: pole.x, z: pole.z }
  add(cyl(0.08, 0.1, 6.5, pole, HEX.metal, 8))
  add(ball(0.18, { ...pole, y: 6.6 }, HEX.gateYellow))

  // ---- Gatehouse beyond the perimeter gate ----
  add(...bandedBox(6, 4, at(64, 62.5), [[2.8, HEX.brick]], HEX.steelDark))
  add(box(1.6, 0.9, 0.1, { ...at(64, 62.5, 1.4), z: at(64, 62.5).z - 2.02 }, HEX.window))

  registerSolids(grid)

  const merged = mergePainted(statics)
  const mesh = new Mesh(merged, toon(0xffffff, { tinted: true }))
  mesh.layers.enable(SOLID_LAYER)
  mesh.matrixAutoUpdate = false
  group.add(mesh)

  return { group, fixtures }
}

function insideFootprint(tx: number, ty: number): boolean {
  return tx > 5 && tx < 74 && ty > 5 && ty < 59
}

/** A wall that faces the yard or the outside world is brick, not paint. */
function touchesOutdoor(grid: Grid, tx: number, ty: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const zone = grid.zone(tx + dx, ty + dy)
      if (zone === 'yard') return true
      if (grid.tile(tx + dx, ty + dy) === Tile.Perimeter) return true
    }
  }
  return false
}

function shadeHex(hex: number, k: number): number {
  const r = Math.round(((hex >> 16) & 255) * k)
  const g = Math.round(((hex >> 8) & 255) * k)
  const b = Math.round((hex & 255) * k)
  return (r << 16) | (g << 8) | b
}

function table(add: (...g: BufferGeometry[]) => void, p: Place, w: number, d: number, top: number): void {
  add(box(w, 0.08, d, { ...p, y: 0.78 }, top))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(0.1, 0.78, 0.1, { x: p.x + sx * (w / 2 - 0.15), y: 0, z: p.z + sz * (d / 2 - 0.15) }, HEX.steel))
}

function tree(add: (...g: BufferGeometry[]) => void, x: number, z: number, s: number): void {
  add(cyl(0.18 * s, 0.24 * s, 1.6 * s, { x, y: 0, z }, HEX.wood, 6))
  add(ball(1.3 * s, { x, y: 2.2 * s, z }, HEX.outsideGrass, 1, 0.9, 1))
  add(ball(0.9 * s, { x: x + 0.5 * s, y: 3.0 * s, z: z - 0.3 * s }, HEX.yardGrass, 1, 0.9, 1))
}

/**
 * Two to a cell: a steel bunk bed along the back wall, a toilet and a sink by
 * the door, a little table and a window high in the back wall. The player's
 * cell has a vent grille low on the wall that maintenance forgot.
 */
function furnishCell(add: (...g: BufferGeometry[]) => void, rect: Rect, _bunks: { x: number; z: number }[], doorNorth: boolean, isPlayer: boolean): void {
  const x0 = rect.x0 * TILE
  const x1 = (rect.x1 + 1) * TILE
  const z0 = rect.y0 * TILE
  const z1 = (rect.y1 + 1) * TILE
  const back = doorNorth ? z1 - 0.6 : z0 + 0.6
  const front = doorNorth ? z0 + 0.5 : z1 - 0.5
  const bunkX = x0 + 0.75

  // Bunk bed against the left wall, running front to back.
  const midZ = (z0 + z1) / 2
  for (const y of [0.45, 1.55]) {
    add(box(1.1, 0.12, 2.6, { x: bunkX + 0.05, y, z: midZ + (doorNorth ? 0.6 : -0.6) }, HEX.bunk))
    add(box(1.0, 0.14, 2.5, { x: bunkX + 0.05, y: y + 0.12, z: midZ + (doorNorth ? 0.6 : -0.6) }, HEX.mattress))
    add(box(0.9, 0.08, 1.2, { x: bunkX + 0.05, y: y + 0.26, z: midZ + (doorNorth ? 1.2 : -1.2) }, HEX.blanket))
  }
  for (const dz of [-1.25, 1.25]) {
    for (const dx of [-0.5, 0.6]) add(box(0.08, 1.8, 0.08, { x: bunkX + dx, y: 0, z: midZ + (doorNorth ? 0.6 : -0.6) + dz }, HEX.bunk))
  }

  // Toilet and sink by the door on the right.
  add(cyl(0.26, 0.2, 0.42, { x: x1 - 0.5, y: 0, z: front + (doorNorth ? 0.4 : -0.4) }, HEX.porcelain, 10))
  add(box(0.5, 0.35, 0.2, { x: x1 - 0.5, y: 0.35, z: front + (doorNorth ? 0.15 : -0.15) }, HEX.porcelain))
  add(box(0.5, 0.15, 0.4, { x: x1 - 0.3, y: 0.85, z: midZ }, HEX.porcelain))
  // Table and a stool.
  add(box(0.9, 0.06, 0.6, { x: x1 - 0.55, y: 0.72, z: back + (doorNorth ? -0.2 : 0.2) }, HEX.wood))
  add(box(0.08, 0.72, 0.5, { x: x1 - 0.2, y: 0, z: back + (doorNorth ? -0.2 : 0.2) }, HEX.wood))
  add(cyl(0.2, 0.2, 0.45, { x: x1 - 1.0, y: 0, z: back + (doorNorth ? -0.7 : 0.7) }, HEX.wood, 8))
  // Window slot in the back wall, emissive enough to glow at night.
  add(box(1.2, 0.5, 0.12, { x: (x0 + x1) / 2, y: 1.7, z: doorNorth ? z1 + 0.02 : z0 - 0.02 }, HEX.window))

  if (isPlayer) {
    // The vent: low on the back wall in the corner, behind the table.
    const vx = x1 - 0.6
    const vz = doorNorth ? z1 - 0.12 : z0 + 0.12
    add(box(0.9, 0.6, 0.06, { x: vx, y: 0.15, z: vz }, HEX.vent))
    for (let i = 0; i < 4; i++) add(box(0.8, 0.04, 0.08, { x: vx, y: 0.24 + i * 0.12, z: vz + (doorNorth ? -0.03 : 0.03) }, HEX.steelDark))
  }
}
