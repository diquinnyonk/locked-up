import type { Game } from './Game'
import { type Records, mergeRecords, readRecords } from './Records'

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
  /** Endings and records, in a downloaded file only: merged in on loading. */
  records?: Records
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

/** The save as a file to keep, with your endings and records: locked-up-quinn-day-3.json. */
export function downloadSave(file: SaveFile): void {
  const blob = new Blob([JSON.stringify({ ...file, records: readRecords() }, null, 1)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  const who = file.summary.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'prisoner'
  a.download = `locked-up-${who}-day-${file.summary.day}.json`
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 60000)
}

/**
 * Checks a save file someone has picked and, if it is one, makes it the
 * saved game. Returns what was wrong with it otherwise.
 */
export function importSave(text: string): SaveFile | string {
  let file: SaveFile
  try {
    file = JSON.parse(text) as SaveFile
  } catch {
    return 'That file is not a Locked Up save: it is not JSON.'
  }
  if (!file || typeof file !== 'object' || typeof file.seed !== 'number' || !file.state || !file.summary) return 'That file is not a Locked Up save.'
  if (file.version !== SAVE_VERSION) return `That save is from a different version of the game (${file.version}), and cannot be loaded.`
  const { records, ...save } = file
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save))
  } catch {
    return 'This browser will not let the game store the save (private browsing, or storage full).'
  }
  // The endings found elsewhere join the ones found here.
  if (records) mergeRecords(records)
  return save
}

/** Asks for a .json file and imports it. Calls back with the result. */
export function pickSaveFile(done: (result: SaveFile | string) => void): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json,.json'
  input.onchange = () => {
    const f = input.files?.[0]
    if (!f) return
    f.text().then((t) => done(importSave(t)), () => done('That file could not be read.'))
  }
  input.click()
}
