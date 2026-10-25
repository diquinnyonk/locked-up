/**
 * Writes every recordable line to dialogue/script.csv (key, speaker, line)
 * and dialogue/script.json, which the recording studio page reads and the
 * game uses to match a line on screen to its recording. Mission lines and
 * the named characters' lines have keys of their own; everything else is
 * found in the source by dialogue-scan.ts.
 *
 * Lines any officer or any prisoner might say are shared out, one owner to
 * a line, so every character has a voice of their own. Who owns what is
 * kept in dialogue/cast.json: new lines go to whoever has least to say, and
 * a line never changes hands once it has an owner (edit the file to move
 * one).
 *
 *   npm run dialogue
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { BOSS_JOBS, ERRANDS, OFFICER_JOBS, type Template } from '../src/game/Missions'
import { GANGS, GANG_IDS } from '../src/npc/Gangs'
import { LINES } from '../src/game/Lines'
import { OFFICER_NAMES, prisonerName, voiceSlug } from '../src/npc/names'
import { BLOCKS, Grid, PLAYER_CELL } from '../src/world/Grid'
import { lineKey, scanDialogue } from './dialogue-scan'

interface Row {
  key: string
  speaker: string
  line: string
  pool?: string
  who?: string
  group?: string
}
const rows: Row[] = []
const add = (key: string, speaker: string, line: string, pool?: string) => rows.push({ key, speaker, line, pool })
const job = (t: Template, speaker: string) => {
  add(`mission.${t.id}.brief`, speaker, t.brief)
  if (t.thanks) add(`mission.${t.id}.thanks`, speaker, t.thanks)
}
const bossSpeaker = (g: (typeof GANG_IDS)[number]) => `${GANGS[g].leaderNick} (boss of ${GANGS[g].name})`
for (const g of GANG_IDS) for (const t of BOSS_JOBS[g]) job(t, bossSpeaker(g))
for (const t of ERRANDS) job(t, 'Gang member')
for (const t of OFFICER_JOBS) job(t, 'Officer')
for (const [key, l] of Object.entries(LINES)) add(key, l.speaker, l.text)
// Everything else anyone says, found in the source.
const known = new Set(rows.map((r) => r.line))
for (const l of scanDialogue()) if (!known.has(l.line)) add(lineKey(l.speaker, l.line), l.speaker, l.line, l.pool)

// ---- The cast: everyone who can be given lines ----

interface Character { id: string; label: string; group: string }
const officers: Character[] = OFFICER_NAMES.map((name, i) => ({
  id: voiceSlug(name),
  label: `${name} (officer, ${BLOCKS[Math.floor(i / 4)]} wing ${['gate', 'landing', 'escort', 'central'][i % 4]})`,
  group: 'Officers',
}))
const prisoners: Character[] = []
{
  let index = 0
  for (const cell of new Grid().cells.values()) {
    for (let bunk = 0; bunk < 2; bunk++) {
      if (cell.zone === PLAYER_CELL && bunk === 1) continue
      const name = prisonerName(index++)
      const where = cell.zone === PLAYER_CELL ? 'your cellmate' : `cell ${cell.zone.replace(/^cell/, '')}`
      prisoners.push({ id: voiceSlug(name), label: `${name} (prisoner, ${where})`, group: 'Prisoners' })
    }
  }
}
const bosses: Character[] = GANG_IDS.map((g) => ({ id: voiceSlug(GANGS[g].leaderNick), label: bossSpeaker(g), group: 'Bosses' }))
const everyone = new Map([...officers, ...prisoners, ...bosses].map((c) => [c.id, c]))
if (everyone.size !== officers.length + prisoners.length + bosses.length) throw new Error('two characters share a voice id')

const CAST_FILE = 'dialogue/cast.json'
const cast: Record<string, string> = existsSync(CAST_FILE) ? JSON.parse(readFileSync(CAST_FILE, 'utf8')) : { 'officer.not-now-im-on-my-ded7': 'ms-bottomley' }
const unit = (key: string) => key.replace(/^(mission\.[^.]+)\..*$/, '$1')
const ownerOfUnit = new Map<string, string>()
for (const r of rows) if (cast[r.key] && everyone.has(cast[r.key])) ownerOfUnit.set(unit(r.key), cast[r.key])

// Who may be given each kind of line. Job givers' small talk goes to the
// people who actually hand out jobs.
const errandOwners = () => ERRANDS.map((t) => ownerOfUnit.get(`mission.${t.id}`)).filter(Boolean) as string[]
const officerJobOwners = () => OFFICER_JOBS.map((t) => ownerOfUnit.get(`mission.${t.id}`)).filter(Boolean) as string[]
const candidates = (speaker: string): Character[] | null => {
  if (speaker === 'Officer') return officers
  if (speaker === 'Prisoner') return [...prisoners, ...bosses]
  if (speaker === 'Gang member') return prisoners
  if (speaker.startsWith('Job giver')) return [...new Set([...officerJobOwners(), ...errandOwners(), ...bosses.map((b) => b.id)])].map((id) => everyone.get(id)!)
  return null
}
const fixed = new Map(GANG_IDS.map((g) => [bossSpeaker(g), voiceSlug(GANGS[g].leaderNick)]))

const shared = new Set<string>()
const load = new Map<string, number>()
for (const r of rows) {
  const o = ownerOfUnit.get(unit(r.key))
  if (o) load.set(o, (load.get(o) ?? 0) + 1)
}
const hash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
// Missions first (job givers' lines depend on who owns them), then the rest.
const order = [...rows].sort((a, b) => Number(!a.key.startsWith('mission.')) - Number(!b.key.startsWith('mission.')) || Number(a.speaker.startsWith('Job')) - Number(b.speaker.startsWith('Job')))
for (const r of order) {
  if (fixed.has(r.speaker)) {
    r.who = fixed.get(r.speaker)
    continue
  }
  const pick = candidates(r.speaker)
  if (!pick) continue
  const u = unit(r.key)
  let owner = ownerOfUnit.get(u)
  if (!owner || !pick.some((c) => c.id === owner)) {
    // Spread each list of alternatives across different people, and give
    // the line to whoever has least to say so far.
    const inPool = new Set(r.pool ? rows.filter((o) => o.pool === r.pool && o.who).map((o) => o.who) : [])
    const best = [...pick].sort((a, b) => Number(inPool.has(a.id)) - Number(inPool.has(b.id)) || (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0) || hash(a.id + u) - hash(b.id + u))[0]
    owner = best.id
    ownerOfUnit.set(u, owner)
    load.set(owner, (load.get(owner) ?? 0) + 1)
  }
  r.who = owner
  shared.add(r.key)
}
for (const r of rows) {
  const c = r.who ? everyone.get(r.who) : undefined
  if (c) {
    r.speaker = c.label
    r.group = c.group
  } else r.group = 'Named characters'
}

// ---- Write it all out ----

const header = ['key', 'speaker', 'line']
const csv = [header, ...rows.map((r) => [r.key, r.speaker, r.line])].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n') + '\n'
mkdirSync('dialogue', { recursive: true })
writeFileSync('dialogue/script.csv', csv)
// The same script for the recording studio page and the game.
writeFileSync('dialogue/script.json', JSON.stringify(rows.map(({ key, speaker, line, who, pool, group }) => ({ key, speaker, line, ...(who ? { who } : {}), ...(pool ? { pool } : {}), group })), null, 1) + '\n')
const owned = Object.fromEntries(rows.filter((r) => shared.has(r.key)).map((r) => [r.key, r.who!]).sort(([a], [b]) => a.localeCompare(b)))
writeFileSync(CAST_FILE, JSON.stringify(owned, null, 1) + '\n')
const voices = new Set(rows.map((r) => r.who).filter(Boolean))
console.log(`${rows.length} lines written to dialogue/script.csv, shared between ${voices.size} voices`)
