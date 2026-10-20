/**
 * Headless simulation: builds the whole prison and runs the behaviour trees
 * at a fixed timestep with no renderer, to check the regime actually moves
 * eighty prisoners and sixteen officers where they should be.
 *
 *   npx tsx scripts/sim.ts
 */
import { Scene } from 'three'
import { Game, type UiPort } from '../src/game/Game'

const log: string[] = []
const ui: UiPort = {
  toast: (t) => log.push(`toast: ${t}`),
  talk: () => {},
  phone: () => {},
  card: (t, b) => log.push(`card: ${t} / ${b}`),
  end: (w, t) => log.push(`END ${w} ${t}`),
  closePanels: () => {},
  panelOpen: false,
}
;(globalThis as unknown as { window: unknown }).window = globalThis
;(globalThis as unknown as { addEventListener: unknown }).addEventListener = () => {}

const game = new Game(new Scene(), ui, 'Tester')
const dt = 1 / 30
const zones = () => {
  const counts: Record<string, number> = {}
  for (const p of game.prisoners) {
    const z = p.zone.startsWith('cell') ? 'cells' : p.zone || '(door)'
    counts[z] = (counts[z] ?? 0) + 1
  }
  return counts
}
let lastPeriod = ''
const t0 = performance.now()
for (let i = 0; i < 30 * 60 * 14; i++) {
  game.update(dt)
  if (game.clock.period !== lastPeriod) {
    lastPeriod = game.clock.period
    console.log(game.clock.text, lastPeriod.padEnd(12), JSON.stringify(zones()))
    const guards: Record<string, number> = {}
    for (const g of game.guards) guards[g.thought] = (guards[g.thought] ?? 0) + 1
    console.log('   guards:', JSON.stringify(guards))
  }
}
console.log('sim ms per frame', ((performance.now() - t0) / (30 * 60 * 14)).toFixed(3))
console.log(log.slice(0, 40).join('\n'))
