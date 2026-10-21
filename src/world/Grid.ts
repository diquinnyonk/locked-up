/**
 * HMP Blackmoor, as a tile grid.
 *
 * One tile is two metres. Everything that needs to know where things are -
 * collision, pathfinding, vision, the minimap, the mesh builder: reads this
 * one grid, so the walls you see are exactly the walls the guards walk round.
 *
 * Layout, north at the top:
 *
 *        [ Block A ][Showers][Laundry][ Block B ]
 *        [ landing ]=[ corridor N ]=[ landing ]
 *   [Solitary][Infirmary][  HUB / canteen  ][Games room][Maintenance]
 *        [ Block C ]=[ corridor S ]=[ Block D ]
 *              [        exercise yard        ]
 *   =========== perimeter wall ===== gatehouse ===
 *                   the road out
 */

export const TILE = 2
export const MAP_W = 80
export const MAP_H = 72

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

export const BLOCKS: BlockId[] = ['A', 'B', 'C', 'D']

export interface Room {
  zone: string
  name: string
  rects: Rect[]
  outdoor?: boolean
  floor: string
}

/** The cell the player is put in. Block A, south landing, third along. */
export const PLAYER_CELL = 'cellA7'

export class Grid {
  readonly tiles = new Uint8Array(MAP_W * MAP_H)
  readonly zoneOf: string[] = new Array(MAP_W * MAP_H).fill('')
  readonly doors: Door[] = []
  private readonly doorAt = new Map<number, Door>()
  readonly rooms = new Map<string, Room>()
  /** Somewhere to sit: a bench, a chair, a pew, a bunk edge. */
  readonly seats: { x: number; z: number; yaw: number }[] = []
  /** Furniture nobody walks through, as world rectangles. */
  readonly props: { x0: number; z0: number; x1: number; z1: number }[] = []
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
        const inside = x > 5 && x < 74 && y > 5 && y < 59
        const ring = (x === 5 || x === 74) && y >= 5 && y <= 59 || (y === 5 || y === 59) && x >= 5 && x <= 74
        this.tiles[y * MAP_W + x] = ring ? Tile.Perimeter : inside ? Tile.Solid : Tile.Outside
        if (!ring && !inside) this.zoneOf[y * MAP_W + x] = 'outside'
      }
    }
    this.build()
  }

  private build(): void {
    for (const block of BLOCKS) this.buildBlock(block)

    this.room('corridorN', 'North corridor', [{ x0: 32, y0: 13, x1: 47, y1: 15 }], 'floorLino')
    this.room('corridorS', 'South corridor', [{ x0: 32, y0: 32, x1: 47, y1: 34 }], 'floorLino')
    this.room('showers', 'Showers', [{ x0: 33, y0: 8, x1: 38, y1: 11 }], 'floorTile')
    this.room('laundry', 'Laundry', [{ x0: 41, y0: 8, x1: 46, y1: 11 }], 'floorLaundry')
    this.room('hub', 'Canteen & phones', [{ x0: 34, y0: 17, x1: 45, y1: 30 }], 'floorCanteen')
    this.room('infirmary', 'Healthcare', [{ x0: 20, y0: 22, x1: 32, y1: 25 }], 'floorInfirmary')
    this.room('solitary', 'Segregation', [{ x0: 9, y0: 22, x1: 18, y1: 25 }], 'floorSolitary')
    this.room('games', 'Games room', [{ x0: 47, y0: 22, x1: 58, y1: 25 }], 'floorWood')
    this.room('maint', 'Maintenance', [{ x0: 60, y0: 22, x1: 70, y1: 25 }], 'floorMaint')
    this.room(
      'yard',
      'Exercise yard',
      [
        { x0: 33, y0: 36, x1: 46, y1: 41 },
        { x0: 23, y0: 41, x1: 56, y1: 58 },
      ],
      'yardTarmac',
      true,
    )
    // The annexes either side of the yard.
    this.room('chapel', 'Chapel', [{ x0: 10, y0: 42, x1: 21, y1: 46 }], 'floorWood')
    this.room('visits', 'Visiting hall', [{ x0: 10, y0: 49, x1: 21, y1: 58 }], 'floorCanteen')
    this.room('gym', 'Gym', [{ x0: 58, y0: 42, x1: 69, y1: 46 }], 'floorGym')
    this.room('library', 'Library', [{ x0: 58, y0: 49, x1: 63, y1: 52 }], 'floorWood')
    this.room('mess', "Officers' mess", [{ x0: 65, y0: 49, x1: 69, y1: 52 }], 'floorCarpet')
    this.room('bay', 'Loading bay', [{ x0: 58, y0: 54, x1: 69, y1: 58 }], 'floorMaint')

    this.door('room', 36, 12, 'x', ['corridorN', 'showers'])
    this.door('room', 43, 12, 'x', ['corridorN', 'laundry'])
    this.door('gate', 39, 16, 'x', ['corridorN', 'hub'])
    this.door('gate', 39, 31, 'x', ['hub', 'corridorS'])
    this.door('gate', 39, 35, 'x', ['corridorS', 'yard'])
    this.door('room', 33, 24, 'y', ['hub', 'infirmary'])
    this.door('secure', 19, 24, 'y', ['infirmary', 'solitary'])
    this.door('room', 46, 24, 'y', ['hub', 'games'])
    this.door('secure', 59, 23, 'y', ['games', 'maint'])
    this.door('room', 22, 44, 'y', ['yard', 'chapel'])
    this.door('room', 22, 53, 'y', ['yard', 'visits'])
    this.door('room', 57, 44, 'y', ['yard', 'gym'])
    this.door('room', 57, 50, 'y', ['yard', 'library'])
    this.door('secure', 67, 53, 'x', ['bay', 'mess'])
    this.door('secure', 57, 56, 'y', ['yard', 'bay'])
    // The staff exit from the loading bay, and the visitors' gate.
    this.door('perimeter', 64, 59, 'x', ['bay', 'outside'])
    this.door('perimeter', 15, 59, 'x', ['visits', 'outside'])

    for (let x = 24; x <= 55; x++) this.climbable.push({ tx: x, ty: 59 })

    // The vents. One-tile crawlspaces above the ceilings, so walls do not
    // matter to them: only the duct rectangles do.
    const duct = (x0: number, y0: number, x1: number, y1: number) => this.ducts.push({ x0, y0, x1, y1 })
    duct(10, 14, 69, 14)
    duct(10, 33, 69, 33)
    duct(40, 14, 40, 33)
    duct(12, 24, 40, 24)
    duct(40, 24, 68, 24)
    duct(36, 9, 36, 14)
    duct(44, 9, 44, 14)
    duct(19, 14, 19, 19)
    duct(16, 33, 16, 52)
    duct(63, 33, 63, 56)
    duct(63, 51, 67, 51)

    const grate = (id: string, tx: number, ty: number) =>
      this.grates.push({ id, tx, ty, zone: this.zone(tx, ty), sealed: false, open: false })
    grate('your cell', 19, 19)
    grate('A landing', 12, 14)
    grate('B landing', 68, 14)
    grate('north corridor', 34, 14)
    grate('showers', 36, 9)
    grate('laundry', 44, 9)
    grate('canteen', 40, 20)
    grate('healthcare', 24, 24)
    grate('games room', 52, 24)
    grate('maintenance', 66, 24)
    grate('south corridor', 44, 33)
    grate('C landing', 12, 33)
    grate('D landing', 68, 33)
    grate('chapel', 16, 44)
    grate('visiting hall', 16, 52)
    grate('gym', 63, 44)
    grate('library', 63, 50)
    grate("officers' mess", 67, 51)
    grate('loading bay', 63, 56)
  }

  /**
   * A landing: a spine corridor with five cells either side, two to a cell.
   * B and D are mirror images of A and C, so every gate faces the middle.
   */
  private buildBlock(block: BlockId): void {
    const ox = block === 'A' || block === 'C' ? 8 : 48
    const oy = block === 'A' || block === 'B' ? 8 : 27
    const flip = block === 'B' || block === 'D'
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

    const gate = this.door('gate', wx(23), oy + 6, 'y', [`block${block}`, block === 'A' || block === 'B' ? 'corridorN' : 'corridorS'])
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
   * them, but they never close a route.
   */
  addProp(x: number, z: number, w: number, d: number, nav = true): void {
    const p = { x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 }
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

  addSeat(x: number, z: number, yaw: number): void {
    this.seats.push({ x, z, yaw })
  }

  /**
   * Pushes a circle out of any prop it has walked into. `except` is where
   * the body is heading: a prop that holds that point (the bench it is about
   * to sit on, the bed it is about to lie in) lets it in.
   */
  pushOutOfProps(pos: { x: number; z: number }, r: number, except?: { x: number; z: number } | null): void {
    for (const p of this.props) {
      if (except && except.x > p.x0 - 0.05 && except.x < p.x1 + 0.05 && except.z > p.z0 - 0.05 && except.z < p.z1 + 0.05) continue
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
    if (t === Tile.Door) return (this.doorAt.get(ty * MAP_W + tx)?.openness ?? 0) > 0.7
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
