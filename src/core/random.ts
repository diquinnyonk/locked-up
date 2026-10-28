/**
 * Randomness, in two kinds.
 *
 * Anything that changes what happens in the prison (who goes where, what a
 * search finds, how a ball comes off the rim) uses a seeded generator, so a
 * prison rolled from the same seed plays out the same: the daily challenge
 * is the same for everyone, and a run could be replayed from its inputs.
 * The game's own is `game.rng`; NPCs reach it as `world.rng`.
 *
 * Anything that only changes how it looks or sounds (rain, a hum's pitch,
 * when a mouth starts moving) uses `cosmetic`, which is not seeded and never
 * draws from the game's generator. `npm test` fails on a bare Math.random
 * anywhere else.
 */
export function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** For looks and sounds only: never for anything that changes play. */
export const cosmetic: () => number = () => Math.random()
