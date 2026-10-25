/**
 * Writes every recordable line to dialogue/script.csv (key, speaker, line)
 * and dialogue/script.json, which the recording studio page reads and the
 * game uses to match a line on screen to its recording. Mission lines and
 * the named characters' lines have keys of their own; everything else is
 * found in the source by dialogue-scan.ts.
 *
 *   npm run dialogue
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { BOSS_JOBS, ERRANDS, OFFICER_JOBS, type Template } from '../src/game/Missions'
import { GANGS, GANG_IDS } from '../src/npc/Gangs'
import { LINES } from '../src/game/Lines'
import { lineKey, scanDialogue } from './dialogue-scan'

const rows: string[][] = [['key', 'speaker', 'line']]
const add = (key: string, speaker: string, line: string) => rows.push([key, speaker, line])
const job = (t: Template, speaker: string) => {
  add(`mission.${t.id}.brief`, speaker, t.brief)
  if (t.thanks) add(`mission.${t.id}.thanks`, speaker, t.thanks)
}
for (const g of GANG_IDS) for (const t of BOSS_JOBS[g]) job(t, `${GANGS[g].leaderNick} (boss of ${GANGS[g].name})`)
for (const t of ERRANDS) job(t, 'Gang member')
for (const t of OFFICER_JOBS) job(t, 'Officer')
for (const [key, l] of Object.entries(LINES)) add(key, l.speaker, l.text)
// Everything else anyone says, found in the source.
const known = new Set(rows.map((r) => r[2]))
for (const l of scanDialogue()) if (!known.has(l.line)) add(lineKey(l.speaker, l.line), l.speaker, l.line)

const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n') + '\n'
mkdirSync('dialogue', { recursive: true })
writeFileSync('dialogue/script.csv', csv)
// The same script for the recording studio page.
writeFileSync('dialogue/script.json', JSON.stringify(rows.slice(1).map(([key, speaker, line]) => ({ key, speaker, line })), null, 1) + '\n')
console.log(`${rows.length - 1} lines written to dialogue/script.csv`)
