/**
 * First-day goals: a short checklist on the HUD once the tour is over, so a
 * new arrival knows where to start. Each one ticks itself when you do it,
 * and the list goes when they are all done (or after day two).
 */
export type GoalId = 'cellmate' | 'notebook' | 'map' | 'fixer' | 'voucher' | 'job'

export const GOALS: { id: GoalId; text: string; hint: string }[] = [
  { id: 'cellmate', text: 'Talk to your cellmate', hint: 'Walk up to them and press E.' },
  { id: 'notebook', text: 'Open your Notebook', hint: 'J, or the Menu button.' },
  { id: 'map', text: 'Look at the big map', hint: 'M, or tap the map.' },
  { id: 'fixer', text: 'Find a fixer', hint: 'Talk to people on the landings: fixers sell things for Greggs vouchers.' },
  { id: 'voucher', text: 'Get hold of another Greggs voucher', hint: 'Work a laundry shift, or find one lying about.' },
  { id: 'job', text: 'Take a job from someone', hint: 'Look for "(has a job)" or "(wants a word)" when you talk.' },
]

export class Goals {
  readonly done = new Set<GoalId>()
  /** Shown once the tour and the welcome are out of the way. */
  shown = false
  /** All done and announced, or stood down after day two. */
  finished = false

  /** Ticks a goal; returns true when that finished the list. */
  tick(id: GoalId): boolean {
    if (this.finished || this.done.has(id)) return false
    this.done.add(id)
    if (this.done.size === GOALS.length) {
      this.finished = true
      return true
    }
    return false
  }

  toSave() {
    return { done: [...this.done], shown: this.shown, finished: this.finished }
  }

  fromSave(s: Partial<ReturnType<Goals['toSave']>> | undefined): void {
    if (!s) return
    for (const id of s.done ?? []) this.done.add(id)
    this.shown = s.shown ?? false
    this.finished = s.finished ?? false
  }
}
