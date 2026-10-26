/**
 * Every ending you have found, and your best runs, kept in this browser's
 * localStorage apart from the saved game: finishing a sentence clears the
 * save, never the records.
 */
export type EndingId = 'curtain' | 'bakeoff' | 'celebrity' | 'royal' | 'greylady' | 'bins' | 'hospital' | 'court' | 'papers' | 'fireEngine' | 'glider' | 'escape' | 'tunnel' | 'jag' | 'staffDoor' | 'guardDisguise' | 'visitorDisguise' | 'laundry' | 'solitary' | 'gang'

export const ENDINGS: { id: EndingId; title: string; won: boolean; hint: string; secret?: boolean }[] = [
  { id: 'escape', title: 'Free', won: true, hint: 'Somebody waiting on the road, and a way over or through the wall.' },
  { id: 'tunnel', title: 'Like a mole', won: true, hint: 'Some escapes take weeks. Is that tile by your bunk loose?' },
  { id: 'jag', title: "The Governor's Jag", won: true, hint: 'The Governor keeps more than paperwork in his office.' },
  { id: 'staffDoor', title: 'Off shift early', won: true, hint: 'Officers have uniforms and keys. Officers also like sausage rolls.' },
  { id: 'guardDisguise', title: 'Clocked off', won: true, hint: 'Staff go home at shift change. Do you look like staff?' },
  { id: 'visitorDisguise', title: 'Gone with the visitors', won: true, hint: "The Reverend's panto box, and an afternoon with the visitors." },
  { id: 'laundry', title: 'Spin cycle', won: true, hint: 'Everything in the laundry leaves on a van, past an X-ray man with a sweet tooth.' },
  { id: 'bins', title: 'Wheelie good', won: true, hint: 'Thursday is bin day. The bins leave. So could you.' },
  { id: 'hospital', title: 'Nil by mouth', won: true, hint: 'Healthcare cannot fix everything. Some things need a real hospital, if you know your symptoms.' },
  { id: 'court', title: 'Case dismissed', won: true, hint: 'Everyone deserves their day in court. Take something small in your shoe.' },
  { id: 'papers', title: 'Paper trail', won: true, hint: 'Release papers only need the right form, the right stamp and the right signature.' },
  { id: 'fireEngine', title: 'Blue lights', won: true, hint: 'A fire drill brings a fire engine into the yard.' },
  { id: 'glider', title: 'Gone with the wind', won: true, hint: 'Two bedsheets, a mop handle, and a proper gale.' },
  { id: 'curtain', title: 'Curtain call', won: true, hint: 'Only some sentences have it.', secret: true },
  { id: 'bakeoff', title: 'Star baker', won: true, hint: 'Only some sentences have it.', secret: true },
  { id: 'celebrity', title: 'Body double', won: true, hint: 'Only some sentences have it.', secret: true },
  { id: 'royal', title: 'By royal appointment', won: true, hint: 'Only some sentences have it.', secret: true },
  { id: 'greylady', title: 'The Grey Lady', won: true, hint: 'Only some sentences have it.', secret: true },
  { id: 'solitary', title: 'Segregation. Indefinitely.', won: false, hint: 'Use up every attempt.' },
  { id: 'gang', title: 'A firm got you', won: false, hint: 'Make a firm hate you, then run out of road.' },
]

export interface Run {
  name: string
  /** Real seconds played. */
  seconds: number
  /** Failed attempts along the way. */
  fails: number
  day: number
  hard: boolean
  mode?: string
}

export interface EndingRecord {
  first: string
  count: number
  /** Each best on its own: the fastest run, the cleanest, the earliest. */
  fastest: Run
  fewestFails: Run
  earliest: Run
}

export interface DailyResult {
  met: boolean
  day: number
  fails: number
  seconds: number
  tries: number
}

export interface Records {
  version: 1
  /** Achievements by id: when each was first earned. */
  achievements?: Record<string, string>
  /** Daily challenges by date: the best try. */
  daily?: Record<string, DailyResult>
  endings: Partial<Record<EndingId, EndingRecord>>
  started: number
  finished: number
  wins: number
  losses: number
  attempts: number
  days: number
  seconds: number
}

const KEY = 'locked-up.records'

const empty = (): Records => ({ version: 1, endings: {}, started: 0, finished: 0, wins: 0, losses: 0, attempts: 0, days: 0, seconds: 0 })

export function readRecords(): Records {
  try {
    const raw = localStorage.getItem(KEY)
    const r = raw ? (JSON.parse(raw) as Records) : null
    return r && r.version === 1 ? { ...empty(), ...r } : empty()
  } catch {
    return empty()
  }
}

export function writeRecords(r: Records): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(r))
  } catch {
    // Private browsing: records live only as long as the page.
  }
}

/** A new sentence begun. */
export function noteStarted(): void {
  const r = readRecords()
  r.started++
  writeRecords(r)
}

/** A sentence over: file it, and say whether this ending is a new find. */
export function recordEnding(id: EndingId, run: Run): { isNew: boolean; found: number; best: boolean; secret: boolean } {
  const r = readRecords()
  const def = ENDINGS.find((e) => e.id === id)!
  r.finished++
  if (def.won) r.wins++
  else r.losses++
  r.attempts += run.fails
  r.days += run.day
  r.seconds += run.seconds
  const had = r.endings[id]
  let best = false
  if (!had) r.endings[id] = { first: new Date().toISOString(), count: 1, fastest: run, fewestFails: run, earliest: run }
  else {
    had.count++
    if (run.seconds < had.fastest.seconds) (had.fastest = run), (best = true)
    if (run.fails < had.fewestFails.fails) (had.fewestFails = run), (best = true)
    if (run.day < had.earliest.day) (had.earliest = run), (best = true)
  }
  writeRecords(r)
  return { isNew: !had, found: ENDINGS.filter((e) => !e.secret && r.endings[e.id]).length, best, secret: !!def.secret }
}

/** A daily challenge run over: keep the best of the day's tries. */
export function recordDaily(date: string, r: Omit<DailyResult, 'tries'>): { best: boolean } {
  const all = readRecords()
  const daily = (all.daily ??= {})
  const had = daily[date]
  const better = !had || (r.met && !had.met) || (r.met === had.met && (r.day < had.day || (r.day === had.day && r.seconds < had.seconds)))
  daily[date] = better ? { ...r, tries: (had?.tries ?? 0) + 1 } : { ...had, tries: had.tries + 1 }
  writeRecords(all)
  return { best: better }
}

/** "12m 05s", "1h 03m". */
export function duration(seconds: number): string {
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(ss).padStart(2, '0')}s`
}

/**
 * Folds records from a save file into this browser's. Merging the same file
 * twice changes nothing: counts and totals take the larger, each best the
 * better, the first find the earlier.
 */
export function mergeRecords(incoming: unknown): boolean {
  const inc = incoming as Records | null
  if (!inc || typeof inc !== 'object' || inc.version !== 1 || typeof inc.endings !== 'object') return false
  const r = readRecords()
  for (const k of ['started', 'finished', 'wins', 'losses', 'attempts', 'days', 'seconds'] as const) {
    if (typeof inc[k] === 'number') r[k] = Math.max(r[k], inc[k])
  }
  for (const e of ENDINGS) {
    const theirs = inc.endings[e.id]
    if (!theirs) continue
    const mine = r.endings[e.id]
    if (!mine) {
      r.endings[e.id] = theirs
      continue
    }
    mine.count = Math.max(mine.count, theirs.count)
    if (theirs.first < mine.first) mine.first = theirs.first
    if (theirs.fastest.seconds < mine.fastest.seconds) mine.fastest = theirs.fastest
    if (theirs.fewestFails.fails < mine.fewestFails.fails) mine.fewestFails = theirs.fewestFails
    if (theirs.earliest.day < mine.earliest.day) mine.earliest = theirs.earliest
  }
  for (const [date, theirs] of Object.entries(inc.daily ?? {})) {
    const mine = (r.daily ??= {})[date]
    if (!mine || (theirs.met && !mine.met) || (theirs.met === mine.met && theirs.day < mine.day)) r.daily[date] = { ...theirs, tries: Math.max(theirs.tries, mine?.tries ?? 0) }
  }
  for (const [id, when] of Object.entries(inc.achievements ?? {})) {
    const mine = (r.achievements ??= {})[id]
    if (!mine || when < mine) r.achievements[id] = when
  }
  writeRecords(r)
  return true
}
