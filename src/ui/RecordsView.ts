import { ACHIEVEMENTS } from '../game/Achievements'
import { ENDINGS, type Records, duration, readRecords } from '../game/Records'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/**
 * Every ending, found or not, and the totals. Found endings show your best
 * runs; the rest show a nudge, never the answer.
 */
export function recordsHtml(r: Records): string {
  const found = ENDINGS.filter((e) => r.endings[e.id]).length
  const cards = ENDINGS.map((e) => {
    const rec = r.endings[e.id]
    if (!rec) {
      return `<li class="ending missing"><span class="kind">${e.won ? 'Escape' : 'Defeat'}</span><b>Not found yet</b><p>${esc(e.hint)}</p></li>`
    }
    const first = new Date(rec.first).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    return `<li class="ending found ${e.won ? 'win' : 'loss'}"><span class="kind">${e.won ? 'Escape' : 'Defeat'}</span><b>${esc(e.title)}</b>
      <p>${rec.count === 1 ? 'Once' : `${rec.count} times`}, first on ${esc(first)}.</p>
      <dl>
        <dt>Fastest</dt><dd>${duration(rec.fastest.seconds)}</dd>
        <dt>Earliest</dt><dd>day ${rec.earliest.day}</dd>
        <dt>Fewest failed attempts</dt><dd>${rec.fewestFails.fails}</dd>
      </dl></li>`
  }).join('')
  const totals: [string, string][] = [
    ['Sentences started', String(r.started)],
    ['Sentences finished', String(r.finished)],
    ['Escapes', String(r.wins)],
    ['Defeats', String(r.losses)],
    ['Failed attempts', String(r.attempts)],
    ['Days served', String(r.days)],
    ['Time inside', duration(r.seconds)],
  ]
  return `<div class="records">
    <p class="found"><b>${found} of ${ENDINGS.length}</b> endings found.</p>
    <ul class="endings">${cards}</ul>
    ${achievementsHtml(r)}
    ${dailyHtml(r)}
    <h3>Totals</h3>
    <dl class="totals">${totals.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
  </div>`
}

/** The full-screen records sheet, from the title screen or the end screen. */
export function showRecords(): void {
  let el = document.getElementById('records')
  if (!el) {
    el = document.createElement('div')
    el.id = 'records'
    document.body.append(el)
  }
  el.hidden = false
  el.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="records-title"><button type="button" class="close ghost" aria-label="Close">×</button><h2 id="records-title">Endings and records</h2>${recordsHtml(readRecords())}</div>`
  const close = () => {
    el!.hidden = true
    removeEventListener('keydown', onKey, true)
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Escape') {
      e.stopPropagation()
      close()
    }
  }
  addEventListener('keydown', onKey, true)
  ;(el.querySelector('.close') as HTMLButtonElement).onclick = close
  el.onclick = (e) => {
    if (e.target === el) close()
  }
  ;(el.querySelector('.close') as HTMLButtonElement).focus()
}

function achievementsHtml(r: Records): string {
  const got = r.achievements ?? {}
  const n = ACHIEVEMENTS.filter((a) => got[a.id]).length
  return `<h3>Achievements</h3><p class="found"><b>${n} of ${ACHIEVEMENTS.length}</b> earned.</p><ul class="achievements">${ACHIEVEMENTS.map(
    (a) => `<li class="${got[a.id] ? 'got' : ''}"><b>${esc(a.title)}</b>${esc(a.text)}</li>`,
  ).join('')}</ul>`
}

function dailyHtml(r: Records): string {
  const days = Object.entries(r.daily ?? {}).sort(([a], [b]) => b.localeCompare(a)).slice(0, 7)
  if (!days.length) return ''
  const done = Object.values(r.daily ?? {}).filter((d) => d.met).length
  return `<h3>Daily challenges</h3><p class="found"><b>${done}</b> done.</p><dl class="totals">${days
    .map(([date, d]) => `<dt>${esc(date)}</dt><dd>${d.met ? 'Done' : 'Not yet'}, day ${d.day}, ${d.tries} tr${d.tries === 1 ? 'y' : 'ies'}</dd>`)
    .join('')}</dl>`
}
