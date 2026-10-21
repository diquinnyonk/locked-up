/**
 * Writes every recordable line to dialogue/script.csv: key, speaker, line.
 *
 *   npm run dialogue
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { BOSS_JOBS, ERRANDS, OFFICER_JOBS, type Template } from '../src/game/Missions'
import { GANGS, GANG_IDS } from '../src/npc/Gangs'

const rows: string[][] = [['key', 'speaker', 'line']]
const add = (key: string, speaker: string, line: string) => rows.push([key, speaker, line])
const job = (t: Template, speaker: string) => {
  add(`mission.${t.id}.brief`, speaker, t.brief)
  if (t.thanks) add(`mission.${t.id}.thanks`, speaker, t.thanks)
}
for (const g of GANG_IDS) for (const t of BOSS_JOBS[g]) job(t, `${GANGS[g].leaderNick} (boss of ${GANGS[g].name})`)
for (const t of ERRANDS) job(t, 'Gang member')
for (const t of OFFICER_JOBS) job(t, 'Officer')

const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n') + '\n'
mkdirSync('dialogue', { recursive: true })
writeFileSync('dialogue/script.csv', csv)
console.log(`${rows.length - 1} lines written to dialogue/script.csv`)
