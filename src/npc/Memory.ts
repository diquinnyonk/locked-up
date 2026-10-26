/**
 * What the prison learns from you.
 *
 * Every failed attempt is written here, with how you got out and where you
 * were caught. The officers' trees read these numbers directly: a method that
 * has been used against them gets harder each time, the spots where you were
 * caught join the patrol routes, and the phone line is listened to more
 * closely. Individual officers and prisoners keep their own memories on top
 * (see `Guard.wary`, `Prisoner.trust` and `Prisoner.grudge`).
 *
 * You get four attempts. When they are gone the whole prison resets its
 * routine and gives you four more, but it does not forget. Lose those as
 * well and it is over.
 */
import { GANGS, GANG_IDS, type GangId, type GangState } from './Gangs'

export type Method = 'key' | 'toothpaste' | 'sick' | 'riot' | 'vent' | 'wall' | 'gate' | 'guardDisguise' | 'visitorDisguise' | 'laundry' | 'lure'

export const METHOD_NAMES: Record<Method, string> = {
  key: 'Stolen or forged key',
  toothpaste: 'Toothpaste in the lock',
  sick: 'Faked sickness',
  riot: 'Riot as cover',
  vent: 'The vents',
  wall: 'Over the wall',
  gate: 'Through a gate',
  guardDisguise: 'Dressed as an officer',
  visitorDisguise: 'Dressed as a visitor',
  laundry: 'In the laundry van',
  lure: 'An officer lured into your cell',
}

export const ATTEMPTS_PER_ROUND = 4
export const ROUNDS = 2

export interface Lesson {
  method: Method
  text: string
}

export class PrisonMemory {
  round = 1
  attemptsUsed = 0
  readonly used: Record<Method, number> = { key: 0, toothpaste: 0, sick: 0, riot: 0, vent: 0, wall: 0, gate: 0, guardDisguise: 0, visitorDisguise: 0, laundry: 0, lure: 0 }
  readonly hotspots: { x: number; z: number; weight: number }[] = []
  /** Calls flagged by the wiretap; each makes the next listener stricter. */
  phoneFlags = 0
  /** Each firm's view of you. */
  readonly gangs: Record<GangId, GangState> = {
    firm: { hostility: 0, backingUntil: -1, paid: 0, favours: 0 },
    crows: { hostility: 0, backingUntil: -1, paid: 0, favours: 0 },
    lions: { hostility: 0, backingUntil: -1, paid: 0, favours: 0 },
    northern: { hostility: 0, backingUntil: -1, paid: 0, favours: 0 },
  }
  /** Keys reported missing. */
  keysLost = 0
  readonly lessons: Lesson[] = []

  /** The firm that hates you most, and how much. Decides the gang ending. */
  get worstGang(): { id: GangId; hostility: number } {
    let id: GangId = 'firm'
    for (const g of GANG_IDS) if (this.gangs[g].hostility > this.gangs[id].hostility) id = g
    return { id, hostility: this.gangs[id].hostility }
  }

  get gangHostility(): number {
    return this.worstGang.hostility
  }

  annoy(gang: GangId, amount: number): void {
    const g = this.gangs[gang]
    g.hostility = Math.max(0, Math.min(1, g.hostility + amount))
  }

  /**
   * Greggs vouchers a firm wants to back a riot. Goes up with every riot the
   * officers have already put down, and every time you have come back.
   */
  bribePrice(gang: GangId): number {
    const g = this.gangs[gang]
    return Math.max(1, 4 + this.used.riot * 2 + g.paid * 2 - g.favours * 2)
  }

  /** Pay a firm: they back you for two days, and their rival takes it badly. */
  pay(gang: GangId, now: number): void {
    const g = this.gangs[gang]
    g.paid++
    g.favours = 0
    g.backingUntil = now + 2 * 1440
    this.annoy(gang, -0.15)
    this.annoy(GANGS[gang].rival, 0.15)
  }

  backing(gang: GangId, now: number): boolean {
    return this.gangs[gang].backingUntil > now
  }

  get attemptsLeft(): number {
    return ATTEMPTS_PER_ROUND - this.attemptsUsed
  }

  get totalFailures(): number {
    return (this.round - 1) * ATTEMPTS_PER_ROUND + this.attemptsUsed
  }

  /**
   * Records a failed attempt. Returns 'round' when this used the last attempt
   * of the first round, and 'over' when it used the last one of all.
   */
  fail(method: Method, x: number, z: number): 'continue' | 'round' | 'over' {
    this.used[method]++
    this.attemptsUsed++
    const near = this.hotspots.find((h) => Math.hypot(h.x - x, h.z - z) < 8)
    if (near) near.weight++
    else this.hotspots.push({ x, z, weight: 1 })
    this.lessons.push({ method, text: lessonFor(method, this.used[method]) })
    if (this.attemptsUsed >= ATTEMPTS_PER_ROUND) {
      if (this.round >= ROUNDS) return 'over'
      this.round++
      this.attemptsUsed = 0
      return 'round'
    }
    return 'continue'
  }

  // ---- Knobs the behaviour trees read ----

  /** All officers see a little further every time you fail. */
  get visionScale(): number {
    return 1 + Math.min(0.5, this.totalFailures * 0.07)
  }

  /** Chance a lift from an officer's belt goes unnoticed. */
  get pickpocketChance(): number {
    return Math.max(0.15, 0.85 - this.used.key * 0.28)
  }

  /** Chance the night officer checks each lock by hand at bang-up. */
  get lockCheckChance(): number {
    return Math.min(0.95, this.used.toothpaste * 0.45)
  }

  /** Officers sent to a sick call. */
  get sickResponders(): number {
    return this.used.sick >= 1 ? 2 : 1
  }

  /** Once fooled, the nurse wants to see real symptoms: foam at the mouth. */
  get sickNeedsFroth(): boolean {
    return this.used.sick >= 1
  }

  /** After two fakes they stop coming at night at all. */
  get sickIgnored(): boolean {
    return this.used.sick >= 3
  }

  /** Friends needed to kick off a landing. */
  get riotSupportNeeded(): number {
    return 2 + this.used.riot * 2
  }

  /** Gate officers stay put during a riot once they have been burned by one. */
  get gatesHeldInRiot(): boolean {
    return this.used.riot >= 1
  }

  /** Officers stop under grates to listen; noise carries further. */
  get ventListening(): number {
    return Math.min(1, this.used.vent * 0.5)
  }

  /** Officers walk the wall at night once someone has gone over it. */
  get wallPatrol(): boolean {
    return this.used.wall >= 1
  }

  /** How quickly officers see through a disguise up close. */
  disguiseRecognition(kind: 'guard' | 'visitor'): number {
    return 1 + this.used[kind === 'guard' ? 'guardDisguise' : 'visitorDisguise'] * 0.8
  }

  /** Once an officer has been drugged, none of them eats what a prisoner offers. */
  get foodRefused(): boolean {
    return this.used.lure >= 1
  }

  /** Twice, and nobody comes when you shout from your cell. */
  get lureIgnored(): boolean {
    return this.used.lure >= 2
  }

  /** Odds of walking out of a silly exit without anyone looking twice. */
  sillyExitChance(method: 'guardDisguise' | 'visitorDisguise' | 'laundry'): number {
    return Math.max(0.1, 0.8 - this.used[method] * 0.3)
  }

  /** Blue drinks and sausage rolls the X-ray operator wants to look away. */
  get xrayBribe(): number {
    return 1 + this.used.laundry
  }

  /** The wiretap's vocabulary grows with every flagged call. */
  get phoneStrictness(): number {
    return Math.min(3, this.phoneFlags + Math.floor(this.totalFailures / 3))
  }
}

function lessonFor(method: Method, times: number): string {
  switch (method) {
    case 'key':
      return times === 1 ? 'Officers now keep a hand on their key chains.' : 'Keys are clipped on short chains. Lifting them is nearly impossible.'
    case 'toothpaste':
      return times === 1 ? 'The night officer now tries each cell door at bang-up.' : 'Every lock is checked by hand. Every night.'
    case 'sick':
      return times === 1 ? 'Healthcare wants real symptoms now, and sends two officers.' : 'Night sick calls are ignored unless you are frothing.'
    case 'riot':
      return times === 1
        ? 'Gate officers no longer leave their posts in a disturbance, and the firms want more Greggs vouchers to risk it again.'
        : 'They need a bigger crowd to lose control now, and the firms charge double.'
    case 'vent':
      return 'Officers stop under vent grilles to listen.'
    case 'wall':
      return 'A dog handler walks the perimeter at night.'
    case 'gate':
      return 'Gate officers double-check who is behind them.'
    case 'guardDisguise':
      return times === 1 ? 'Officers now count heads at shift change. And moustaches.' : 'Staff must show a warrant card at the gate. Mr Crumpet has lost his twice already.'
    case 'visitorDisguise':
      return times === 1 ? 'Visitors are counted in and out, and stubble earns a second look.' : 'Every visitor is now asked their own birthday on the way out. Most get it right.'
    case 'lure':
      return times === 1 ? 'Officers will not eat anything a prisoner hands them, and they keep their backs to the wall in a cell.' : 'Nobody comes when you shout from your cell. Not even for a rat.'
    case 'laundry':
      return times === 1
        ? 'Keith on the X-ray has been sacked. His replacement wants two of everything.'
        : "The new X-ray operator wants three of everything, and he's watching the screen."
  }
}
