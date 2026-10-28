/** Constants and small helpers shared by the Game and its feature modules. */
export const PLAYER_SPEED = 3.2
export const RUN_SPEED = 5.4
export const SNEAK_SPEED = 1.6
export const CRAWL_SPEED = 2.0
export function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}


export const WALL_TOP = 2.75
/** The player's body, for walking into walls, furniture and people. */
export const PLAYER_RADIUS = 0.34
/** How far apart two people stand to talk. */
/** Metres from under your bunk to the allotments beyond the wall. */
export const TUNNEL_LENGTH = 30
/** How far your cellmate must trust you before they will sleep over a tunnel. */
export const TUNNEL_TRUST = 0.4
export const TUNNEL_MILESTONES: Record<number, string> = {
  5: 'Five metres. Down through the floor and into the old foundations.',
  10: 'Ten metres. You break into an old Victorian drain. It smells like the canteen.',
  15: 'Halfway. Somewhere above you, the yard. You can hear the flagpole halyard tapping.',
  20: 'Twenty metres. The drain narrows. You are under the yard now.',
  25: 'Twenty-five metres. Footings of the outer wall. You go under them.',
  30: 'Thirty metres. Cold air, and the smell of compost. You are under the allotments beyond the wall. Crawl out tonight.',
}

/** How much a fixer must trust you before selling sleeping pills. */
export const PILLS_TRUST = 0.4
export const TALK_GAP = 1.9


export function pick2<T>(rng: () => number, list: T[]): T {
  return list[Math.floor(rng() * list.length)]
}

/** Where the Reverend's three stolen hymn books turned up. */
export const HYMN_SPOTS: { zone: string; where: string }[] = [
  { zone: 'games', where: 'levelling the pool table in the games room' },
  { zone: 'showers', where: 'being used as a soap dish in the showers' },
  { zone: 'gym', where: 'propping up the bench press in the gym' },
]
