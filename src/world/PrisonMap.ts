import grim from './maps/grim.json'

/**
 * A prison's layout as data, in tiles (a tile is 2 m across). Grid builds
 * the walkable world from this; Build, Furnish and Solids dress it. A second
 * prison, or a wing moved, is a new or edited map file, not new code.
 *
 * Coordinates are [tx, ty]; rectangles are [x0, y0, x1, y1], inclusive.
 */
export interface PrisonMap {
  name: string
  about?: string
  size: { w: number; h: number }
  /** The outer wall: a ring of perimeter tiles. Inside it is solid until a room says otherwise. */
  perimeter: { x0: number; y0: number; x1: number; y1: number }
  /** The cell zone the player starts in. */
  playerCell: string
  /**
   * Cell wings. Each is the same 24 by 13 tile footprint from its origin: a
   * landing with five cells either side and a gate at the end into
   * `corridor`. A mirrored wing has its gate on the west side. `post` is
   * where the wing's fourth officer stands in the middle of the prison.
   */
  wings: { id: string; origin: [number, number]; mirror: boolean; corridor: string; post: [number, number] }[]
  rooms: { zone: string; name: string; floor: string; rects: [number, number, number, number][]; outdoor?: boolean }[]
  /** A door sits in a wall tile between two zones; `axis` is the way you walk through it. */
  doors: { kind: 'room' | 'gate' | 'secure' | 'perimeter'; at: [number, number]; axis: 'x' | 'y'; between: [string, string] }[]
  /** Runs of perimeter a grappling hook can be thrown over. */
  climbable: { from: [number, number]; to: [number, number] }[]
  /** Crawlspaces above the ceilings, as [x0, y0, x1, y1]. Walls do not matter to them. */
  ducts: [number, number, number, number][]
  /** The ways into the ducts, named for where they are. */
  grates: { id: string; at: [number, number] }[]
}

export const MAP = grim as PrisonMap
