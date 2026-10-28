/**
 * HMP Grim-on-the-Moor, as a tile grid.
 *
 * One tile is two metres. Everything that needs to know where things are -
 * collision, pathfinding, vision, the minimap, the mesh builder: reads this
 * one grid, so the walls you see are exactly the walls the guards walk round.
 *
 * The layout comes from the map file (maps/grim.json, see PrisonMap.ts);
 * the sketch below is a guide to it.
 *
 * Layout, north at the top:
 *
 *        [ Block A ][Showers][Laundry][ Block B ]
 *        [ landing ]=[ corridor N ]=[ landing ]
 *   [Solitary][Infirmary][  HUB / canteen  ][Games room][Maintenance]
 *        [ Block C ]=[ corridor S ]=[ Block D ]
 *              [        exercise yard        ] [mess][Governor]
 *                                              [bay ][changing]=staff door
 *   =========== perimeter wall ===== gatehouse ===
 *                   the road out
 */

import { MAP, type PrisonMap } from './PrisonMap'

/** How open a door must be to stand in it, or plan a route through it. */
export const DOOR_STAND = 0.7
/** How open a door must be to walk through it. */
export const DOOR_WALK = 0.6

export const TILE = 2
export const MAP_W = MAP.size.w
/** The east perimeter wall: the staff wing sits just inside it. */
export const EAST_WALL = MAP.perimeter.x1
export const MAP_H = MAP.size.h

export const enum Tile {
  Solid = 0,
  Floor = 1,
  Door = 2,
  Perimeter = 3,
  Outside = 4,
}

export type DoorKind = 'cell' | 'room' | 'gate' | 'secure' | 'perimeter'

export interface Door {
  id: number
  kind: DoorKind
  tx: number
  ty: number
  /** Runs along x (a door in a north or south wall) or along y. */
  axis: 'x' | 'y'
  /** 0 shut .. 1 fully open, animated. */
  openness: number
  /** Wants to be open this frame. Set by whoever is holding it. */
  held: boolean
  /** Locked doors only open for a key holder or a guard. */
  locked: boolean
  /** Toothpaste in the strike plate: it looks locked, it is not. */
  jammed: boolean
  /** For cell doors, the cell zone behind it. */
  cell: string | null
  zones: [string, string]
}

export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface Grate {
  id: string
  tx: number
  ty: number
  zone: string
  sealed: boolean
  /** Unscrewed and propped open: someone has been in. */
  open: boolean
}

export interface CellInfo {
  zone: string
  block: BlockId
  index: number
  rect: Rect
  door: Door
  bunks: { x: number; z: number }[]
}

export type BlockId = 'A' | 'B' | 'C' | 'D'

export const BLOCKS: BlockId[] = MAP.wings.map((w) => w.id as BlockId)

export interface Room {
  zone: string
  name: string
  rects: Rect[]
  outdoor?: boolean
  floor: string
}

/** The cell the player is put in. Block A, south landing, third along. */
export const PLAYER_CELL = MAP.playerCell

/** Where a wing's central officer is posted, out in the middle of the prison. */
export function wingPost(block: BlockId): { tx: number; ty: number } {
  const [tx, ty] = MAP.wings.find((w) => w.id === block)!.post
  return { tx, ty }
}

export class Grid {
  readonly tiles = new Uint8Array(MAP_W * MAP_H)
  readonly zoneOf: string[] = new Array(MAP_W * MAP_H).fill('')
  readonly doors: Door[] = []
  private readonly doorAt = new Map<number, Door>()
  readonly rooms = new Map<string, Room>()
  /** Somewhere to sit: a bench, a chair, a pew, a bunk edge. */
  readonly seats: { x: number; z: number; yaw: number; toilet?: string }[] = []
  /** Furniture nobody walks through, as world rectangles. */
  readonly props: { x0: number; z0: number; x1: number; z1: number; enter: boolean }[] = []
  /** Tiles whose middle a prop covers: paths go round them. */
  private readonly propTiles = new Set<number>()
  readonly cells = new Map<string, CellInfo>()
  readonly ducts: Rect[] = []
  readonly grates: Grate[] = []
  readonly blockGate = new Map<BlockId, Door>()
  /** Perimeter tiles a grappling hook can be thrown over: the yard's south wall. */
  readonly climbable: { tx: number; ty: number }[] = []

  constructor() {
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const { x0, y0, x1, y1 } = MAP.perimeter
        const inside = x > x0 && x < x1 && y > y0 && y < y1
        const ring = ((x === x0 || x === x1) && y >= y0 && y <= y1) || ((y === y0 || y === y1) && x >= x0 && x <= x1)
        this.tiles[y * MAP_W + x] = ring ? Tile.Perimeter : inside ? Tile.Solid : Tile.Outside
        if (!ring && !inside) this.zoneOf[y * MAP_W + x] = 'outside'
      }
    }
    this.build()
  }

  /** Lays out the map file: wings, rooms, doors, the climbable wall, the vents. */
  private build(): void {
    for (const w of MAP.wings) this.buildWing(w)
    for (const r of MAP.rooms) this.room(r.zone, r.name, r.rects.map(([x0, y0, x1, y1]) => ({ x0, y0, x1, y1 })), r.floor, r.outdoor)
    for (const d of MAP.doors) this.door(d.kind, d.at[0], d.at[1], d.axis, d.between)
    for (const c of MAP.climbable) {
      for (let y = c.from[1]; y <= c.to[1]; y++) for (let x = c.from[0]; x <= c.to[0]; x++) this.climbable.push({ tx: x, ty: y })
    }
    for (const [x0, y0, x1, y1] of MAP.ducts) this.ducts.push({ x0, y0, x1, y1 })
    for (const g of MAP.grates) this.grates.push({ id: g.id, tx: g.at[0], ty: g.at[1], zone: this.zone(g.at[0], g.at[1]), sealed: false, open: false })
  }

  /**
   * A wing: a landing with five cells either side, two to a cell. Mirrored
   * wings (B and D) are flipped east to west, so every gate faces the middle.
   */
  private buildWing(wing: PrisonMap['wings'][number]): void {
    const block = wing.id as BlockId
    const [ox, oy] = wing.origin
    const flip = wing.mirror
    const wx = (lx: number) => (flip ? ox + (23 - lx) : ox + lx)
    const span = (a: number, b: number): [number, number] => {
      const p = wx(a)
      const q = wx(b)
      return [Math.min(p, q), Math.max(p, q)]
    }

    const [sx0, sx1] = span(1, 22)
    this.room(`block${block}`, `${block} wing landing`, [{ x0: sx0, y0: oy + 5, x1: sx1, y1: oy + 7 }], 'floorLino')

    for (let i = 0; i < 10; i++) {
      const north = i < 5
      const col = i % 5
      const [cx0, cx1] = span(1 + col * 4, 3 + col * 4)
      const cy0 = north ? oy + 1 : oy + 9
      const zone = `cell${block}${i}`
      const rect = { x0: cx0, y0: cy0, x1: cx1, y1: cy0 + 2 }
      this.room(zone, `Cell ${block}${i + 1}`, [rect], 'floorCell')
      const door = this.door('cell', wx(2 + col * 4), north ? oy + 4 : oy + 8, 'x', [`block${block}`, zone])
      door.cell = zone
      door.locked = true
      // A bunk bed along the side wall (both sleep in it, one up, one down)
      // and a stool by the table. Matches the furniture in Build.ts.
      const x0 = cx0 * TILE
      const x1 = (cx1 + 1) * TILE
      const z0 = cy0 * TILE
      const z1 = (cy0 + 3) * TILE
      const doorNorth = !north
      const midZ = (z0 + z1) / 2
      const bunks = [
        { x: x0 + 0.8, z: midZ + (doorNorth ? 0.6 : -0.6) },
        { x: x1 - 1.0, z: doorNorth ? z1 - 1.3 : z0 + 1.3 },
      ]
      this.cells.set(zone, { zone, block, index: i, rect, door, bunks })
    }

    const gate = this.door('gate', wx(23), oy + 6, 'y', [`block${block}`, wing.corridor])
    this.blockGate.set(block, gate)
  }

  private room(zone: string, name: string, rects: Rect[], floor: string, outdoor = false): void {
    this.rooms.set(zone, { zone, name, rects, floor, outdoor })
    for (const r of rects) {
      for (let y = r.y0; y <= r.y1; y++) {
        for (let x = r.x0; x <= r.x1; x++) {
          this.tiles[y * MAP_W + x] = Tile.Floor
          this.zoneOf[y * MAP_W + x] = zone
        }
      }
    }
  }

  private door(kind: DoorKind, tx: number, ty: number, axis: 'x' | 'y', zones: [string, string]): Door {
    const door: Door = {
      id: this.doors.length,
      kind,
      tx,
      ty,
      axis,
      openness: 0,
      held: false,
      locked: kind !== 'room',
      jammed: false,
      cell: null,
      zones,
    }
    this.doors.push(door)
    this.doorAt.set(ty * MAP_W + tx, door)
    this.tiles[ty * MAP_W + tx] = Tile.Door
    this.zoneOf[ty * MAP_W + tx] = zones[0]
    return door
  }

  tile(tx: number, ty: number): Tile {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return Tile.Solid
    return this.tiles[ty * MAP_W + tx] as Tile
  }

  zone(tx: number, ty: number): string {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return ''
    return this.zoneOf[ty * MAP_W + tx]
  }

  zoneAtWorld(x: number, z: number): string {
    return this.zone(Math.floor(x / TILE), Math.floor(z / TILE))
  }

  doorAtTile(tx: number, ty: number): Door | undefined {
    return this.doorAt.get(ty * MAP_W + tx)
  }

  /**
   * Registers a solid piece of furniture centred on x/z. `nav` false keeps
   * small things against walls out of path planning: bodies still bump off
   * them, but they never close a route. `enter` marks a seat or a bed: the
   * one kind someone heading for it may step into.
   */
  addProp(x: number, z: number, w: number, d: number, nav = true, enter = false): void {
    const p = { x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2, enter }
    this.props.push(p)
    if (!nav) return
    for (let ty = Math.floor(p.z0 / TILE); ty <= Math.floor(p.z1 / TILE); ty++) {
      for (let tx = Math.floor(p.x0 / TILE); tx <= Math.floor(p.x1 / TILE); tx++) {
        // Blocked if the prop reaches the middle of the tile, where paths run.
        const cx = (tx + 0.5) * TILE
        const cz = (ty + 0.5) * TILE
        const m = 0.6
        if (p.x1 > cx - m && p.x0 < cx + m && p.z1 > cz - m && p.z0 < cz + m) this.propTiles.add(ty * MAP_W + tx)
      }
    }
  }

  /** Is this tile under a table, for path planning? */
  underProp(tx: number, ty: number): boolean {
    return this.propTiles.has(ty * MAP_W + tx)
  }

  /** `toilet` names the cell whose toilet this is. */
  addSeat(x: number, z: number, yaw: number, toilet?: string): void {
    this.seats.push({ x, z, yaw, toilet })
  }

  /**
   * Pushes a circle out of any prop it has walked into. `except` is where
   * the body is heading: a prop that holds that point (the bench it is about
   * to sit on, the bed it is about to lie in) lets it in.
   */
  pushOutOfProps(pos: { x: number; z: number }, r: number, except?: { x: number; z: number } | null): void {
    for (const p of this.props) {
      if (except && p.enter && except.x > p.x0 - 0.05 && except.x < p.x1 + 0.05 && except.z > p.z0 - 0.05 && except.z < p.z1 + 0.05) continue
      const nx = Math.max(p.x0, Math.min(pos.x, p.x1))
      const nz = Math.max(p.z0, Math.min(pos.z, p.z1))
      const dx = pos.x - nx
      const dz = pos.z - nz
      const d2 = dx * dx + dz * dz
      if (d2 >= r * r) continue
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2)
        pos.x = nx + (dx / d) * r
        pos.z = nz + (dz / d) * r
      } else {
        // Centre inside it: out by the nearest edge that has floor beyond
        // it, never into the wall it stands against.
        const ways = [
          { d: pos.x - p.x0, x: p.x0 - r, z: pos.z },
          { d: p.x1 - pos.x, x: p.x1 + r, z: pos.z },
          { d: pos.z - p.z0, x: pos.x, z: p.z0 - r },
          { d: p.z1 - pos.z, x: pos.x, z: p.z1 + r },
        ].sort((a, b) => a.d - b.d)
        const clear = (w: { x: number; z: number }) =>
          this.passable(Math.floor(w.x / TILE), Math.floor(w.z / TILE)) &&
          !this.props.some((q) => q !== p && w.x > q.x0 - r + 0.01 && w.x < q.x1 + r - 0.01 && w.z > q.z0 - r + 0.01 && w.z < q.z1 + r - 0.01)
        const out = ways.find(clear) ?? ways.find((w) => this.passable(Math.floor(w.x / TILE), Math.floor(w.z / TILE))) ?? ways[0]
        pos.x = out.x
        pos.z = out.z
      }
    }
  }

  /** Can a body stand in this tile right now? Doors count when open enough. */
  passable(tx: number, ty: number): boolean {
    const t = this.tile(tx, ty)
    if (t === Tile.Floor || t === Tile.Outside) return true
    if (t === Tile.Door) return (this.doorAt.get(ty * MAP_W + tx)?.openness ?? 0) > DOOR_STAND
    return false
  }

  /** Line of sight between two world points, stepping through tiles. Shut
   *  doors block it; cell doors have a hatch, gates are bars, so neither does. */
  sightClear(ax: number, az: number, bx: number, bz: number): boolean {
    const dx = bx - ax
    const dz = bz - az
    const length = Math.hypot(dx, dz)
    const steps = Math.ceil(length / (TILE * 0.4))
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      const tx = Math.floor((ax + dx * t) / TILE)
      const ty = Math.floor((az + dz * t) / TILE)
      const tile = this.tile(tx, ty)
      if (tile === Tile.Solid || tile === Tile.Perimeter) return false
      if (tile === Tile.Door) {
        const door = this.doorAt.get(ty * MAP_W + tx)
        if (door && door.openness < 0.5 && (door.kind === 'room' || door.kind === 'secure' || door.kind === 'perimeter')) return false
      }
    }
    return true
  }

  /**
   * How far a line of sight runs from a point in a direction before a wall
   * or a shut solid door stops it. Same rules as `sightClear`, so the sight
   * guide on the floor is exactly what the officers can see.
   */
  rayLength(x: number, z: number, angle: number, max: number): number {
    const dx = Math.sin(angle)
    const dz = Math.cos(angle)
    const step = 0.3
    for (let d = step; d < max; d += step) {
      const tx = Math.floor((x + dx * d) / TILE)
      const ty = Math.floor((z + dz * d) / TILE)
      const tile = this.tile(tx, ty)
      if (tile === Tile.Solid || tile === Tile.Perimeter) return d
      if (tile === Tile.Door) {
        const door = this.doorAt.get(ty * MAP_W + tx)
        if (door && door.openness < 0.5 && (door.kind === 'room' || door.kind === 'secure' || door.kind === 'perimeter')) return d
      }
    }
    return max
  }

  /** Is this world point inside the duct network? */
  inDuct(x: number, z: number): boolean {
    const fx = x / TILE - 0.5
    const fz = z / TILE - 0.5
    for (const d of this.ducts) {
      if (fx >= d.x0 - 0.32 && fx <= d.x1 + 0.32 && fz >= d.y0 - 0.32 && fz <= d.y1 + 0.32) return true
    }
    return false
  }

  roomName(zone: string): string {
    return this.rooms.get(zone)?.name ?? (zone === 'outside' ? 'Outside the wall' : '')
  }

  /** Random walkable tile in a zone, for NPCs choosing where to stand. */
  randomTileIn(zone: string, rng: () => number): { tx: number; ty: number } {
    const room = this.rooms.get(zone)
    if (!room) return { tx: 40, ty: 24 }
    // Never a spot under a canteen table.
    for (let tries = 0; ; tries++) {
      const r = room.rects[Math.floor(rng() * room.rects.length)]
      const t = {
        tx: r.x0 + Math.floor(rng() * (r.x1 - r.x0 + 1)),
        ty: r.y0 + Math.floor(rng() * (r.y1 - r.y0 + 1)),
      }
      if (!this.underProp(t.tx, t.ty) || tries > 8) return t
    }
  }
}

export function blockOfZone(zone: string): BlockId | null {
  const m = /^(?:cell|block)([ABCD])/.exec(zone)
  return m ? (m[1] as BlockId) : null
}

export function tileCentre(tx: number, ty: number): { x: number; z: number } {
  return { x: (tx + 0.5) * TILE, z: (ty + 0.5) * TILE }
}

export function worldToTile(x: number, z: number): { tx: number; ty: number } {
  return { tx: Math.floor(x / TILE), ty: Math.floor(z / TILE) }
}
