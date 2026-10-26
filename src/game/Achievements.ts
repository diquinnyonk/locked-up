import { ENDINGS, type EndingId, readRecords, writeRecords } from './Records'

/**
 * Little badges for doing something memorable, kept with the records so they
 * outlive any one sentence. Some unlock as they happen (game.achieve), the
 * rest when a sentence ends (achieveAtEnd).
 */
export type AchievementId =
  | 'sausage'
  | 'knockout'
  | 'dressed'
  | 'safe'
  | 'riot'
  | 'stir'
  | 'peace'
  | 'nan'
  | 'governor'
  | 'settled'
  | 'out'
  | 'clean'
  | 'early'
  | 'hardcore'
  | 'daily'
  | 'houdini'
  | 'everything'

export const ACHIEVEMENTS: { id: AchievementId; title: string; text: string }[] = [
  { id: 'settled', title: 'Settled in', text: 'Tick off every first-day goal.' },
  { id: 'nan', title: "Nan's favourite", text: 'Sit with your nan at visits.' },
  { id: 'governor', title: 'Tea with the Governor', text: 'Say hello to Rupert Pettigrew in person.' },
  { id: 'sausage', title: 'Sausage roll diplomacy', text: 'Send an officer to sleep with a sleepy sausage roll.' },
  { id: 'knockout', title: 'Lights out, guv', text: 'Knock an officer out cold.' },
  { id: 'dressed', title: 'Dressed for work', text: "Take an officer's uniform." },
  { id: 'safe', title: 'Safecracker', text: "Open the Governor's safe." },
  { id: 'stir', title: 'Stirrer', text: 'Tell a firm their rivals are planning something.' },
  { id: 'peace', title: 'Peacemaker', text: 'Broker a truce between two firms.' },
  { id: 'riot', title: 'Riot act', text: 'Start a riot.' },
  { id: 'out', title: 'Out', text: 'Escape, any way at all.' },
  { id: 'clean', title: 'Clean sheet', text: 'Escape without a single failed attempt.' },
  { id: 'early', title: 'Early bird', text: 'Escape by the end of day two.' },
  { id: 'hardcore', title: 'Hardcore hero', text: 'Escape on Hardcore.' },
  { id: 'daily', title: 'Daily grind', text: 'Beat a daily challenge.' },
  { id: 'houdini', title: 'Houdini', text: 'Find every way out.' },
  { id: 'everything', title: 'Completionist', text: 'Find every ending, good and bad.' },
]

/** Files an achievement; returns its definition if it is new. */
export function unlock(id: AchievementId): (typeof ACHIEVEMENTS)[number] | null {
  const r = readRecords()
  const got = (r.achievements ??= {})
  if (got[id]) return null
  got[id] = new Date().toISOString()
  writeRecords(r)
  return ACHIEVEMENTS.find((a) => a.id === id)!
}

/** Everything a finished sentence earns, once the ending is filed. */
export function achieveAtEnd(run: { won: boolean; fails: number; day: number; mode?: string; dailyMet: boolean }): AchievementId[] {
  const found = new Set(Object.keys(readRecords().endings) as EndingId[])
  const ids: AchievementId[] = []
  if (run.won) ids.push('out')
  if (run.won && run.fails === 0) ids.push('clean')
  if (run.won && run.day <= 2) ids.push('early')
  if (run.won && run.mode === 'hardcore') ids.push('hardcore')
  if (run.dailyMet) ids.push('daily')
  if (ENDINGS.filter((e) => e.won).every((e) => found.has(e.id))) ids.push('houdini')
  if (ENDINGS.every((e) => found.has(e.id))) ids.push('everything')
  return ids.filter((id) => unlock(id))
}
