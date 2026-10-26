/**
 * How often each recordable line is heard in a real game, so the voice
 * studio can put the busiest lines first. Plays a few headless sentences as
 * an idle player who follows their cellmate about (the regime takes them
 * where a player would be) and now and then chats to whoever is nearby,
 * counting every line said within earshot and every line said to them.
 * Writes dialogue/heard.json: key -> times heard per in-game day.
 *
 *   npm run heard
 */
import { writeFileSync } from 'node:fs'
import { Scene } from 'three'
import { castLine } from '../src/audio/cast'
import { keyFor } from '../src/audio/lineKeys'
import { Game, type UiPort } from '../src/game/Game'
import { Agent } from '../src/npc/Agent'

const GAMES = 4
const DAYS = 3
const EARSHOT = 22
const dt = 1 / 15

;(globalThis as unknown as { window: unknown }).window = globalThis
;(globalThis as unknown as { addEventListener: unknown }).addEventListener = () => {}

const counts = new Map<string, number>()
const hear = (text: string) => {
  const key = keyFor(text)
  if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
}

let game: Game
let lastTalk: { line: string; options: { enabled: boolean; run: () => void }[] } | null = null

// Every line an officer or prisoner starts saying, if the player is near.
const say = Agent.prototype.say
Agent.prototype.say = function (this: Agent, text: string, seconds?: number) {
  const fresh = text !== (this as unknown as { asked: string }).asked || this.speechTimer <= 0
  say.call(this, text, seconds)
  const p = game?.player.body
  if (fresh && p && Math.hypot(this.x - p.x, this.z - p.z) < EARSHOT) hear(this.speech)
}

const ui: UiPort = {
  toast: () => {},
  talk: (_title, line, options) => {
    const who = game.voiceOf(game.talkingTo)
    const said = castLine(who, line)
    hear(said)
    lastTalk = { line: said, options }
  },
  phone: () => {},
  card: () => {},
  end: () => {},
  closePanels: () => {},
  panelOpen: false,
}

let days = 0
for (let n = 0; n < GAMES; n++) {
  Game.seedForNext = 1000 + n * 7919
  game = new Game(new Scene(), ui, 'Listener')
  game.clock.minutes = 8 * 60 - 20
  game.startSentence()
  const g = game as unknown as { talkTo(p: unknown): void; talkToGuard(gd: unknown): void }
  // The Governor, Keith and the Reverend talk in bubbles of their own.
  const others = [game.keith, game.chaplain, game.governor]
  const was = others.map(() => 0)
  let chat = 20
  const startDay = game.clock.day
  while (game.clock.day < startDay + DAYS && !game.over) {
    const mate = game.cellmate
    if (mate && !game.talkingTo) {
      game.player.body.x = mate.x + 0.8
      game.player.body.z = mate.z
    }
    game.update(dt)
    others.forEach((o, i) => {
      if (o.speechTimer > was[i] && o.body.visible && Math.hypot(o.body.x - game.player.body.x, o.body.z - game.player.body.z) < EARSHOT) hear(o.speech)
      was[i] = o.speechTimer
    })
    chat -= dt
    if (chat <= 0 && !game.clock.locked) {
      chat = 25 + game.rng() * 30
      const p = game.player.body
      const near = [...game.prisoners, ...game.guards].filter((a) => a.ko <= 0 && Math.hypot(a.x - p.x, a.z - p.z) < 14)
      const who = near[Math.floor(game.rng() * near.length)]
      if (who) {
        if (game.guards.includes(who as never)) g.talkToGuard(who)
        else g.talkTo(who)
        // Sometimes take them up on whatever they offer.
        const opt = lastTalk?.options.filter((o) => o.enabled) ?? []
        if (opt.length && game.rng() < 0.3) opt[Math.floor(game.rng() * opt.length)].run()
        game.endConversation()
      }
    }
  }
  days += game.clock.day - startDay
  console.log(`game ${n + 1}: ${game.clock.day - startDay} days, ${counts.size} lines heard so far`)
}

const perDay = Object.fromEntries([...counts].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round((v / days) * 10) / 10]))
writeFileSync('dialogue/heard.json', JSON.stringify(perDay, null, 1) + '\n')
console.log(`dialogue/heard.json: ${counts.size} lines heard over ${days} days`)
console.log(Object.entries(perDay).slice(0, 15).map(([k, v]) => `${v.toString().padStart(6)}  ${k}`).join('\n'))
