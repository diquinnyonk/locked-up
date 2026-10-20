/**
 * Keyboard input, mapped by intent. Held keys for movement, queued presses
 * for actions so a tap between two frames is never lost. Typing into a text
 * box (your name, a phone call) is left alone.
 */
export type ActionKey =
  | 'interact'
  | 'secondary'
  | 'attack'
  | 'craft'
  | 'sneak'
  | 'sick'
  | 'riot'
  | 'froth'
  | 'map'
  | 'journal'
  | 'pause'
  | 'sleep'

const ACTIONS: Record<string, ActionKey> = {
  KeyE: 'interact',
  KeyR: 'secondary',
  KeyF: 'attack',
  Tab: 'craft',
  KeyI: 'craft',
  KeyC: 'sneak',
  KeyH: 'sick',
  KeyG: 'riot',
  KeyQ: 'froth',
  KeyM: 'map',
  KeyJ: 'journal',
  Escape: 'pause',
  KeyP: 'pause',
  KeyZ: 'sleep',
}

export class Input {
  private readonly held = new Set<string>()
  private readonly queued = new Set<ActionKey>()
  enabled = true
  /** Scripted movement for the headless test scenarios. */
  forced: { x: number; z: number } | null = null

  constructor() {
    window.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (e.code === 'Tab') e.preventDefault()
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
      this.held.add(e.code)
      const action = ACTIONS[e.code]
      if (action && !e.repeat) this.queued.add(action)
    })
    window.addEventListener('keyup', (e) => this.held.delete(e.code))
    window.addEventListener('blur', () => this.held.clear())
  }

  /** Movement on the ground plane: x east, z south. */
  get move(): { x: number; z: number } {
    if (this.forced) return this.forced
    if (!this.enabled) return { x: 0, z: 0 }
    let x = 0
    let z = 0
    if (this.held.has('KeyW') || this.held.has('ArrowUp')) z -= 1
    if (this.held.has('KeyS') || this.held.has('ArrowDown')) z += 1
    if (this.held.has('KeyA') || this.held.has('ArrowLeft')) x -= 1
    if (this.held.has('KeyD') || this.held.has('ArrowRight')) x += 1
    const l = Math.hypot(x, z)
    return l > 0 ? { x: x / l, z: z / l } : { x: 0, z: 0 }
  }

  get running(): boolean {
    return this.enabled && (this.held.has('ShiftLeft') || this.held.has('ShiftRight'))
  }

  /** Consumes a queued press. */
  take(action: ActionKey): boolean {
    if (!this.queued.has(action)) return false
    this.queued.delete(action)
    return this.enabled || action === 'pause' || action === 'craft' || action === 'journal' || action === 'map'
  }

  clear(): void {
    this.queued.clear()
  }
}
