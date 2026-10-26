import type { Game } from './Game'

/**
 * Saved games, kept in this browser's localStorage: one slot, written
 * whenever things are quiet (never mid-escape) and read on the title screen.
 *
 * A save holds the seed the prison was built from, so the same eighty
 * prisoners come back with the same faces, tempers and firms, and on top of
 * that everything that has happened since: the clock, your pockets and
 * stash, what the prison has learned, who trusts you, jobs, post, loose
 * items, open grilles and jammed locks. Chases, riots and conversations are
 * never in progress in a save.
 */
export const SAVE_KEY = 'locked-up.save'
export const SAVE_VERSION = 1

export type SaveState = ReturnType<Game['toSave']>

export interface SaveFile {
  version: number
  seed: number
  savedAt: string
  summary: { name: string; day: number; time: string; attemptsLeft: number; round: number; hard: boolean }
  state: SaveState
}

export function readSave(): SaveFile | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const file = JSON.parse(raw) as SaveFile
    return file && file.version === SAVE_VERSION && file.state ? file : null
  } catch {
    return null
  }
}

export function writeSave(game: Game): boolean {
  if (!game.canSave) return false
  try {
    const m = game.clock.minuteOfDay
    const file: SaveFile = {
      version: SAVE_VERSION,
      seed: game.seed,
      savedAt: new Date().toISOString(),
      summary: {
        name: game.player.name,
        day: game.clock.day,
        time: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`,
        attemptsLeft: game.memory.attemptsLeft,
        round: game.memory.round,
        hard: game.hard,
      },
      state: game.toSave(),
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(file))
    return true
  } catch {
    // Storage full or blocked (private browsing): play on without saving.
    return false
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    // Nothing to clear.
  }
}
