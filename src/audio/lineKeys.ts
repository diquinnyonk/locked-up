import script from '../../dialogue/script.json'

/**
 * Finds the recording key for a line as it appears on screen. Lines are
 * matched against the script (dialogue/script.json, from npm run dialogue):
 * exactly, or as a template where {name}, {someone} and the like stand for
 * whatever the game filled in.
 */
const exact = new Map<string, string>()
const patterns: [RegExp, string][] = []
for (const { key, line } of script as { key: string; line: string }[]) {
  if (/\{\w+\}/.test(line)) {
    const re = line.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{\w+\}/g, '(.+?)')
    patterns.push([new RegExp(`^${re}$`, 's'), key])
  } else exact.set(line, key)
}
const cache = new Map<string, string | null>()

export function keyFor(text: string): string | null {
  const t = text.trim()
  if (exact.has(t)) return exact.get(t)!
  if (cache.has(t)) return cache.get(t)!
  const hit = patterns.find(([re]) => re.test(t))?.[1] ?? null
  cache.set(t, hit)
  return hit
}
