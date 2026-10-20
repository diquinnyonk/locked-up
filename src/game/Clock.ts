/**
 * The regime. A UK prison day runs to a timetable, and so does this one:
 * everything: where people go, which doors stand open, how much the guards
 * can see: is decided by what time it is.
 *
 * One real second is two prison minutes, so a day is twelve minutes. Lights
 * out can be slept through at speed.
 */

export type Period =
  | 'lightsOut'
  | 'unlock'
  | 'breakfast'
  | 'work'
  | 'lunch'
  | 'yard'
  | 'association'
  | 'dinner'
  | 'evening'
  | 'bangUp'

interface Slot {
  from: number
  period: Period
  label: string
}

/** Minutes past midnight each period begins. */
const TIMETABLE: Slot[] = [
  { from: 0, period: 'lightsOut', label: 'Lights out' },
  { from: 6 * 60 + 30, period: 'unlock', label: 'Unlock & roll call' },
  { from: 7 * 60, period: 'breakfast', label: 'Breakfast' },
  { from: 8 * 60, period: 'work', label: 'Work: laundry & cleaning' },
  { from: 11 * 60 + 30, period: 'lunch', label: 'Lunch' },
  { from: 12 * 60 + 30, period: 'yard', label: 'Exercise yard' },
  { from: 14 * 60 + 30, period: 'association', label: 'Association' },
  { from: 17 * 60, period: 'dinner', label: 'Tea' },
  { from: 18 * 60, period: 'evening', label: 'Evening association' },
  { from: 21 * 60, period: 'bangUp', label: 'Bang-up: back to your cell' },
  { from: 21 * 60 + 40, period: 'lightsOut', label: 'Lights out' },
]

export const MINUTES_PER_SECOND = 2

export class Clock {
  /** Minutes since the start of day one. */
  minutes = 8 * 60 - 20
  /** Multiplier while sleeping through the night. */
  speed = 1

  update(delta: number): void {
    this.minutes += delta * MINUTES_PER_SECOND * this.speed
  }

  get day(): number {
    return Math.floor(this.minutes / 1440) + 1
  }

  get minuteOfDay(): number {
    return ((this.minutes % 1440) + 1440) % 1440
  }

  get slot(): Slot {
    const m = this.minuteOfDay
    let current = TIMETABLE[0]
    for (const s of TIMETABLE) if (m >= s.from) current = s
    return current
  }

  get period(): Period {
    return this.slot.period
  }

  get label(): string {
    return this.slot.label
  }

  /** The next period change, for the HUD. */
  get next(): { label: string; in: number } {
    const m = this.minuteOfDay
    for (const s of TIMETABLE) if (s.from > m) return { label: s.label, in: s.from - m }
    return { label: TIMETABLE[1].label, in: 1440 - m + TIMETABLE[1].from }
  }

  get text(): string {
    const m = this.minuteOfDay
    const h = Math.floor(m / 60)
    const mm = Math.floor(m % 60)
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
  }

  /** Doors locked, everyone in their cell. */
  get locked(): boolean {
    return this.period === 'lightsOut'
  }

  /** 0 full day .. 1 deep night, eased through dusk and dawn. */
  get darkness(): number {
    const m = this.minuteOfDay
    const h = m / 60
    if (h >= 22 || h < 5) return 1
    if (h >= 19.5) return (h - 19.5) / 2.5
    if (h < 7) return 1 - (h - 5) / 2
    return 0
  }

  /** Skip ahead to a given minute of the day (wrapping into tomorrow). */
  skipTo(minuteOfDay: number): void {
    const m = this.minuteOfDay
    const ahead = minuteOfDay >= m ? minuteOfDay - m : 1440 - m + minuteOfDay
    this.minutes += ahead
  }
}

/** Where prisoners may be during each period, beyond their own cell. */
export function allowedZones(period: Period, block: string): Set<string> {
  const own = `block${block}`
  const corridor = block === 'A' || block === 'B' ? 'corridorN' : 'corridorS'
  const base = [own]
  switch (period) {
    case 'lightsOut':
      return new Set()
    case 'unlock':
      return new Set(base)
    case 'bangUp':
      return new Set([...base, corridor, 'corridorN', 'corridorS', 'hub', 'yard', 'games', 'showers', 'laundry', 'chapel', 'gym', 'library', 'visits'])
    case 'breakfast':
    case 'lunch':
    case 'dinner':
      return new Set([...base, corridor, 'hub', 'corridorN', 'corridorS'])
    case 'work':
      return new Set([...base, corridor, 'corridorN', 'hub', 'laundry', 'showers'])
    case 'yard':
      return new Set([...base, corridor, 'corridorN', 'corridorS', 'hub', 'yard', 'gym'])
    case 'association':
    case 'evening':
      return new Set([...base, corridor, 'corridorN', 'corridorS', 'hub', 'games', 'showers', 'yard', 'chapel', 'gym', 'library', 'visits'])
  }
}

/** Places nobody is allowed without an officer, at any hour. */
export const RESTRICTED = new Set(['maint', 'solitary', 'outside', 'mess', 'bay'])
