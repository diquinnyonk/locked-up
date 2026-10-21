/**
 * The firms of HMP Blackmoor.
 *
 * Every wing has a gang that runs it, plus a couple of their rivals'
 * soldiers living among them. Nobody kicks off on a wing without the gang
 * that runs it saying so, and the gang only says so when it has been paid.
 * Paying one firm offends its rival, and every riot that gets their lads
 * cuffed makes the next one cost more.
 */
export type GangId = 'firm' | 'crows' | 'lions' | 'northern'

export interface GangDef {
  id: GangId
  name: string
  /** The wing it runs. */
  wing: 'A' | 'B' | 'C' | 'D'
  /** Its colour: worn as the top of every member. */
  hex: number
  rival: GangId
  blurb: string
  /** What the leader is called on the landing. */
  leaderNick: string
}

export const GANGS: Record<GangId, GangDef> = {
  firm: {
    id: 'firm',
    name: 'The Firm',
    wing: 'A',
    hex: 0x8e2b3a,
    rival: 'crows',
    blurb: 'Old-school East End faces in maroon. They run the Greggs vouchers on A wing and expect to be asked first.',
    leaderNick: 'Uncle',
  },
  crows: {
    id: 'crows',
    name: 'The Crows',
    wing: 'B',
    hex: 0x2d3f66,
    rival: 'firm',
    blurb: 'Young, loud and in navy. They hate the Firm more than they hate the screws.',
    leaderNick: 'Kingy',
  },
  lions: {
    id: 'lions',
    name: 'Red Lions',
    wing: 'C',
    hex: 0xb5473f,
    rival: 'northern',
    blurb: 'Football lads off the terraces, in red. Always up for a ruck, never for a plan.',
    leaderNick: 'Skip',
  },
  northern: {
    id: 'northern',
    name: 'The Northern Mob',
    wing: 'D',
    hex: 0xc9a13b,
    rival: 'lions',
    blurb: 'Quiet heavies in mustard. They do business, and they never forget a debt.',
    leaderNick: 'The Accountant',
  },
}

export const GANG_IDS = Object.keys(GANGS) as GangId[]

export function gangOfWing(wing: string): GangId {
  return GANG_IDS.find((g) => GANGS[g].wing === wing) ?? 'firm'
}

export interface GangState {
  /** 0..1: how badly they want you hurt. */
  hostility: number
  /** Game minute their backing runs out. */
  backingUntil: number
  /** Times you have paid them. */
  paid: number
  /** Jobs done for them since you last paid: each knocks the price down. */
  favours: number
}
