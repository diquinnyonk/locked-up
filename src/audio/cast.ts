import script from '../../dialogue/script.json'
import { keyFor } from './lineKeys'
import { cosmetic } from '../core/random'

/**
 * Who says what. Every line an officer or a prisoner might say belongs to
 * one of them (dialogue/cast.json, shared out by npm run dialogue), so each
 * character can be given a voice of their own. When somebody is about to say
 * a line from a list of alternatives, they say one of their own from that
 * list instead; and a recording only plays in the mouth of the character it
 * was recorded for.
 */
interface Entry {
  key: string
  line: string
  who?: string
  pool?: string
}
const entries = script as Entry[]
const byKey = new Map(entries.map((e) => [e.key, e]))
const pools = new Map<string, Entry[]>()
for (const e of entries) if (e.pool && e.who) (pools.get(e.pool) ?? pools.set(e.pool, []).get(e.pool)!).push(e)

const slotNames = (line: string) => [...line.matchAll(/\{(\w+)\}/g)].map((m) => m[1])

/** What filled each {slot} of a template in the line as shown. */
function slotsIn(template: string, text: string): Map<string, string> | null {
  const re = template.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{\w+\}/g, '(.+?)')
  const m = new RegExp(`^${re}$`, 's').exec(text)
  if (!m) return null
  const out = new Map<string, string>()
  slotNames(template).forEach((name, i) => out.set(name, m[i + 1]))
  return out
}

/** The character a line belongs to, if it belongs to one. */
export function ownerOf(key: string | null): string | null {
  return (key && byKey.get(key)?.who) || null
}

/**
 * The line `who` actually says when the game asks them to say `text`: their
 * own alternative from the same list when the line belongs to somebody else
 * and they have one, otherwise the line as it was.
 */
export function castLine(who: string | null, text: string, random: () => number = cosmetic): string {
  if (!who) return text
  const key = keyFor(text)
  const entry = key ? byKey.get(key) : undefined
  if (!entry?.who || entry.who === who || !entry.pool) return text
  const filled = slotsIn(entry.line, text.trim())
  if (!filled) return text
  const mine = (pools.get(entry.pool) ?? []).filter((e) => e.who === who && slotNames(e.line).every((s) => filled.has(s)))
  if (!mine.length) return text
  const pick = mine[Math.floor(random() * mine.length)]
  return pick.line.replace(/\{(\w+)\}/g, (_m, s: string) => filled.get(s) ?? '')
}

/** The recording to play for `who` saying the line `key`: none if it is someone else's. */
export function voiceFor(key: string | null, who: string | null): string | null {
  const owner = ownerOf(key)
  return owner && owner !== who ? null : key
}
