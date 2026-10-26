import type { ActionKey, Input } from './Input'

/**
 * A game controller, through the Gamepad API (standard mapping: Xbox and
 * PlayStation pads alike). In play the left stick walks, the right trigger
 * runs and the face buttons do what E, F, R and Tab do. Whenever a menu,
 * card or panel is up, the pad drives that instead: the stick or d-pad moves
 * between buttons, A presses one and B backs out.
 */
const PLAY: Partial<Record<number, ActionKey>> = {
  0: 'interact', // A
  1: 'attack', // B
  2: 'secondary', // X
  3: 'craft', // Y: pockets
  4: 'map', // LB
  5: 'journal', // RB: the Notebook
  6: 'sneak', // LT
  8: 'map', // Back / View
  9: 'pause', // Start / Menu
  12: 'sick', // d-pad up
  13: 'sleep', // d-pad down
  14: 'froth', // d-pad left
  15: 'riot', // d-pad right
}
const DEAD = 0.25

/** The buttons, in the order the help page lists them. */
export const PAD_HELP: [string, string][] = [
  ['Left stick', 'Walk'],
  ['RT', 'Run (hold)'],
  ['LT', 'Sneak'],
  ['A', 'Use, talk, pick up'],
  ['X', 'The other thing (R)'],
  ['B', 'Fight'],
  ['Y', 'Pockets'],
  ['RB', 'Notebook'],
  ['LB or View', 'Big map'],
  ['Start', 'Pause'],
  ['D-pad', 'Sick, sleep, soap, kick off'],
  ['In menus', 'Stick or d-pad to move, A to press, B to go back'],
]

export class Pad {
  private was: boolean[] = []
  /** Stick direction last frame in a menu, so a held stick steps once. */
  private stepHeld = ''
  private stepRepeat = 0
  connected = false
  /** Called the first time a pad does anything. */
  onFirstUse: (() => void) | null = null
  private used = false

  constructor(private readonly input: Input) {
    addEventListener('gamepadconnected', () => (this.connected = true))
    addEventListener('gamepaddisconnected', () => {
      this.connected = !!this.pad()
      if (!this.connected) {
        this.input.padMove = null
        this.input.padRun = false
      }
    })
  }

  private pad(): Gamepad | null {
    const pads = navigator.getGamepads?.() ?? []
    for (const p of pads) if (p && p.connected) return p
    return null
  }

  /** Every frame. `menu` says whether the pad should drive the page. */
  poll(delta: number, menu: boolean): void {
    const p = this.pad()
    if (!p) return
    const down = p.buttons.map((b) => b.pressed || b.value > 0.5)
    const pressed = (i: number) => down[i] && !this.was[i]
    let lx = p.axes[0] ?? 0
    let ly = p.axes[1] ?? 0
    if (Math.hypot(lx, ly) < DEAD) lx = ly = 0
    if (!this.used && (down.some(Boolean) || lx || ly)) {
      this.used = true
      this.onFirstUse?.()
    }
    if (menu) {
      this.input.padMove = null
      this.input.padRun = false
      const dir = down[12] || ly < -0.6 ? 'up' : down[13] || ly > 0.6 ? 'down' : down[14] || lx < -0.6 ? 'left' : down[15] || lx > 0.6 ? 'right' : ''
      if (dir && dir === this.stepHeld) {
        this.stepRepeat -= delta
        if (this.stepRepeat <= 0) {
          this.stepRepeat = 0.16
          step(dir)
        }
      } else if (dir) {
        this.stepRepeat = 0.4
        step(dir)
      }
      this.stepHeld = dir
      if (pressed(0)) activate()
      if (pressed(1) || pressed(9)) key('Escape')
      // Shoulders flip tabs, where a panel has them.
      if (pressed(4) || pressed(5)) tab(pressed(5) ? 1 : -1)
    } else {
      this.stepHeld = ''
      // The ground is laid out east-west, north-south, like the stick.
      const l = Math.hypot(lx, ly)
      this.input.padMove = l ? { x: lx / Math.max(1, l), z: ly / Math.max(1, l) } : null
      this.input.padRun = down[7] ?? false
      // Any button clears an information card, as any key does.
      if (down.some((d, i) => d && !this.was[i])) key('Unidentified')
      for (const [i, action] of Object.entries(PLAY)) if (pressed(Number(i))) this.input.press(action!)
    }
    this.was = down
  }
}

/** What the pad can move between: the topmost dialog's buttons, or the page's. */
function focusables(): HTMLElement[] {
  const visible = (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'
  }
  const scopes = [...document.querySelectorAll<HTMLElement>('#panel.show, #end.show, #story:not([hidden]), #tour, [aria-modal="true"]')].filter(visible)
  const scope = scopes[scopes.length - 1] ?? document.body
  return [...scope.querySelectorAll<HTMLElement>('button, a[href], input, select, summary, [tabindex]:not([tabindex="-1"])')].filter(
    (el) => !(el as HTMLButtonElement).disabled && !el.closest('[hidden]') && visible(el),
  )
}

/** Moves focus to the nearest control in that direction. */
function step(dir: 'up' | 'down' | 'left' | 'right'): void {
  const all = focusables()
  if (!all.length) return
  const cur = document.activeElement as HTMLElement | null
  if (!cur || !all.includes(cur)) {
    all[0].focus()
    return
  }
  // A slider takes left and right for itself.
  if (cur instanceof HTMLInputElement && cur.type === 'range' && (dir === 'left' || dir === 'right')) {
    cur.stepUp(dir === 'right' ? 1 : -1)
    cur.dispatchEvent(new Event('input', { bubbles: true }))
    return
  }
  const a = cur.getBoundingClientRect()
  const ax = a.left + a.width / 2
  const ay = a.top + a.height / 2
  const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir]
  let best: HTMLElement | null = null
  let bestScore = Infinity
  for (const el of all) {
    if (el === cur) continue
    const r = el.getBoundingClientRect()
    const ox = r.left + r.width / 2 - ax
    const oy = r.top + r.height / 2 - ay
    const along = ox * dx + oy * dy
    if (along <= 4) continue
    // Sideways, how far apart the two are edge to edge (none if they overlap).
    const across = dy ? Math.max(0, r.left - a.right, a.left - r.right) : Math.max(0, r.top - a.bottom, a.top - r.bottom)
    const score = along + across * 2.5
    if (score < bestScore) (bestScore = score), (best = el)
  }
  // Nothing further that way: wrap round, top to bottom.
  if (!best && (dir === 'down' || dir === 'up')) best = dir === 'down' ? all[0] : all[all.length - 1]
  best?.focus()
  best?.scrollIntoView({ block: 'nearest' })
}

function activate(): void {
  const el = document.activeElement as HTMLElement | null
  if (!el || el === document.body || !focusables().includes(el)) {
    focusables()[0]?.focus()
    return
  }
  if (el instanceof HTMLInputElement && (el.type === 'text' || el.type === '')) return
  el.click()
}

function key(code: string): void {
  dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }))
  dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }))
}

/** The next or previous tab in a tabbed panel. */
function tab(d: number): void {
  const tabs = [...document.querySelectorAll<HTMLElement>('#panel.show .tabs button')]
  if (!tabs.length) return
  const i = tabs.findIndex((t) => t.classList.contains('on'))
  tabs[(i + d + tabs.length) % tabs.length].click()
  // The panel redraws; focus the tab that is on now.
  document.querySelector<HTMLElement>('#panel.show .tabs button.on')?.focus()
}
