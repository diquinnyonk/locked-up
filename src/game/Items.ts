import { HEX } from '../art/palette'

/**
 * Everything is a weapon or a tool. Every item has a `damage` (what it does
 * to someone in a fight) and a list of `uses` (what it does to a lock, a vent
 * or a wall). Contraband is what a guard confiscates on a search.
 */
export type ItemId =
  | 'toothbrush'
  | 'toothpaste'
  | 'soap'
  | 'spoon'
  | 'fork'
  | 'tray'
  | 'sock'
  | 'poolBall'
  | 'poolCue'
  | 'razor'
  | 'bedsheet'
  | 'mopHandle'
  | 'battery'
  | 'wire'
  | 'tape'
  | 'voucher'
  | 'magazine'
  | 'lighter'
  | 'dart'
  | 'bleach'
  | 'screwdriver'
  // Errands
  | 'biscuits'
  | 'teabags'
  | 'parcel'
  | 'letter'
  | 'glasses'
  | 'racingPost'
  | 'blueDrink'
  | 'sausageRoll'
  | 'hymnBook'
  // Disguises
  | 'guardUniform'
  | 'wig'
  | 'dress'
  | 'visitorDisguise'
  // Crafted
  | 'shiv'
  | 'sockCosh'
  | 'keyMould'
  | 'forgedKey'
  | 'guardKey'
  | 'rope'
  | 'grapple'
  | 'flatSpoon'
  | 'torch'
  | 'lockpick'
  | 'spear'
  | 'flag'

export type Use = 'jamLock' | 'openVent' | 'openDoor' | 'climb' | 'signal' | 'bribe' | 'froth' | 'mould' | 'heat' | 'distract' | 'disguise'

export interface ItemDef {
  id: ItemId
  name: string
  hex: number
  damage: number
  uses: Use[]
  contraband: boolean
  blurb: string
  /** Uses before it breaks, for keys and picks. */
  durability?: number
}

export const ITEMS: Record<ItemId, ItemDef> = {
  toothbrush: { id: 'toothbrush', name: 'Toothbrush', hex: HEX.plastic, damage: 1, uses: [], contraband: false, blurb: 'Snap the head off and it is half a shiv.' },
  toothpaste: { id: 'toothpaste', name: 'Toothpaste', hex: HEX.toothpaste, damage: 0, uses: ['jamLock'], contraband: false, blurb: 'Packed into a strike plate, it sets hard. The bolt never catches.' },
  soap: { id: 'soap', name: 'Bar of soap', hex: HEX.soap, damage: 1, uses: ['mould', 'froth'], contraband: false, blurb: 'Press a key into it for a mould. Or chew it and foam at the mouth.' },
  spoon: { id: 'spoon', name: 'Canteen spoon', hex: HEX.metal, damage: 1, uses: ['heat'], contraband: false, blurb: 'Melt plastic in it. Or grind it flat on the floor.' },
  fork: { id: 'fork', name: 'Plastic fork', hex: HEX.paper, damage: 1, uses: [], contraband: false, blurb: 'Bend the tines back and it is a hook.' },
  tray: { id: 'tray', name: 'Canteen tray', hex: HEX.steel, damage: 3, uses: [], contraband: false, blurb: 'A shield. Or a very loud weapon.' },
  sock: { id: 'sock', name: 'Sock', hex: HEX.cloth, damage: 0, uses: [], contraband: false, blurb: 'Put something heavy in it.' },
  poolBall: { id: 'poolBall', name: 'Pool ball', hex: HEX.clothesRed, damage: 2, uses: ['distract'], contraband: false, blurb: 'Throw it down a corridor and the guard looks.' },
  poolCue: { id: 'poolCue', name: 'Pool cue', hex: HEX.wood, damage: 4, uses: [], contraband: true, blurb: 'Reach.' },
  razor: { id: 'razor', name: 'Razor blade', hex: HEX.metal, damage: 3, uses: [], contraband: true, blurb: 'Out of a disposable razor in the showers.' },
  bedsheet: { id: 'bedsheet', name: 'Bedsheet', hex: HEX.cloth, damage: 0, uses: [], contraband: false, blurb: 'Two make a rope. One makes a flag.' },
  mopHandle: { id: 'mopHandle', name: 'Mop handle', hex: HEX.wood, damage: 3, uses: [], contraband: false, blurb: 'Long. Strong.' },
  battery: { id: 'battery', name: 'Batteries', hex: HEX.battery, damage: 1, uses: [], contraband: false, blurb: 'From the telly remote.' },
  wire: { id: 'wire', name: 'Copper wire', hex: HEX.clothesYellow, damage: 0, uses: [], contraband: true, blurb: 'Bend it into anything.' },
  tape: { id: 'tape', name: 'Gaffer tape', hex: HEX.steelDark, damage: 0, uses: [], contraband: false, blurb: 'Holds everything together.' },
  voucher: { id: 'voucher', name: 'Greggs voucher', hex: HEX.voucher, damage: 0, uses: ['bribe'], contraband: false, blurb: 'Good for one sausage roll at any branch. In Grim-on-the-Moor it is the only money that matters. Buys friends, buys silence.' },
  magazine: { id: 'magazine', name: 'Rolled magazine', hex: HEX.clothesYellow, damage: 1, uses: ['distract'], contraband: false, blurb: 'Roll it tight and tape it: it is a club.' },
  lighter: { id: 'lighter', name: 'Lighter', hex: HEX.clothesRed, damage: 0, uses: ['heat'], contraband: true, blurb: 'Melts plastic. Lights mattresses.' },
  dart: { id: 'dart', name: 'Dart', hex: HEX.metal, damage: 2, uses: [], contraband: true, blurb: 'From the games room board.' },
  bleach: { id: 'bleach', name: 'Bleach', hex: HEX.paper, damage: 2, uses: [], contraband: true, blurb: 'Laundry strength.' },
  screwdriver: { id: 'screwdriver', name: 'Screwdriver', hex: HEX.clothesRed, damage: 3, uses: ['openVent'], contraband: true, blurb: 'From the maintenance bench. Takes a vent cover off in seconds.' },

  biscuits: { id: 'biscuits', name: 'Custard creams', hex: HEX.chipsOrange, damage: 0, uses: ['bribe'], contraband: false, blurb: 'A whole packet. On a landing, this is wealth.' },
  teabags: { id: 'teabags', name: 'Proper teabags', hex: HEX.wood, damage: 0, uses: ['bribe'], contraband: false, blurb: 'Not the canteen dust. The real stuff. Grown men have wept.' },
  parcel: { id: 'parcel', name: 'Suspicious parcel', hex: HEX.basket, damage: 1, uses: [], contraband: true, blurb: 'Wrapped in a pillowcase. Smells of Lynx Africa and treason. Do not shake it.' },
  letter: { id: 'letter', name: 'Perfumed letter', hex: HEX.soap, damage: 0, uses: [], contraband: false, blurb: 'Lipstick kiss on the back. "To my Big Snuggle Bear". Oh dear.' },
  glasses: { id: 'glasses', name: 'Reading glasses', hex: HEX.steelDark, damage: 0, uses: [], contraband: false, blurb: 'Leopard print, on a beaded chain. Unmistakably an officer\'s.' },
  racingPost: { id: 'racingPost', name: 'The Racing Post', hex: HEX.clothesRed, damage: 1, uses: ['distract'], contraband: false, blurb: 'Confiscated, then lost. Three horses are circled in biro.' },

  blueDrink: { id: 'blueDrink', name: 'Blue drink', hex: HEX.stainedBlue, damage: 1, uses: ['bribe'], contraband: false, blurb: 'Two litres of something fizzy. Flavour: blue. Keith on the X-ray would sell his nan for one.' },
  sausageRoll: { id: 'sausageRoll', name: 'Sausage roll', hex: HEX.chipsOrange, damage: 0, uses: ['bribe'], contraband: false, blurb: 'Flaky, lukewarm, magnificent. Half of the laundry X-ray bribe.' },
  hymnBook: { id: 'hymnBook', name: 'Hymn book', hex: HEX.bookRed, damage: 1, uses: [], contraband: false, blurb: 'Hymns Ancient and Modern, property of HMP Grim-on-the-Moor chapel. Somebody has drawn a moustache on every bishop.' },
  guardUniform: { id: 'guardUniform', name: "Officer's uniform", hex: HEX.guardShirt, damage: 0, uses: ['disguise'], contraband: true, blurb: 'Shirt, tie, trousers, peaked cap. Slightly too big. Smells of Brut and disappointment. Wear it (Tab).' },
  wig: { id: 'wig', name: 'Panto wig', hex: HEX.hairBlonde, damage: 0, uses: [], contraband: false, blurb: 'Big, blonde and last worn by the chaplain as Widow Twankey in 2009.' },
  dress: { id: 'dress', name: 'Floral frock', hex: HEX.dress, damage: 0, uses: [], contraband: false, blurb: 'From the panto box. Size: generous. Pattern: alarming.' },
  visitorDisguise: { id: 'visitorDisguise', name: 'Visitor disguise', hex: HEX.dress, damage: 0, uses: ['disguise'], contraband: true, blurb: 'Wig, frock and a brave face. Wear it (Tab) in the visiting hall and leave with the visitors.' },

  shiv: { id: 'shiv', name: 'Shiv', hex: HEX.metal, damage: 6, uses: [], contraband: true, blurb: 'Toothbrush and a razor blade, melted together.' },
  sockCosh: { id: 'sockCosh', name: 'Sock cosh', hex: HEX.cloth, damage: 5, uses: [], contraband: true, blurb: 'A pool ball in a sock. Puts a man down.' },
  keyMould: { id: 'keyMould', name: 'Key mould', hex: HEX.soap, damage: 0, uses: [], contraband: true, blurb: 'A guard key, pressed into soap.' },
  forgedKey: { id: 'forgedKey', name: 'Homemade key', hex: HEX.plastic, damage: 0, uses: ['openDoor'], contraband: true, blurb: 'Melted plastic from a mould. Brittle: a few turns.', durability: 4 },
  guardKey: { id: 'guardKey', name: "Officer's keys", hex: HEX.gateYellow, damage: 0, uses: ['openDoor', 'mould'], contraband: true, blurb: 'The real thing. They will notice it is gone.', durability: 99 },
  rope: { id: 'rope', name: 'Bedsheet rope', hex: HEX.cloth, damage: 0, uses: [], contraband: true, blurb: 'Two sheets knotted end to end.' },
  grapple: { id: 'grapple', name: 'Grappling hook', hex: HEX.metal, damage: 2, uses: ['climb'], contraband: true, blurb: 'A rope and a bent hook. Over the wall.' },
  flatSpoon: { id: 'flatSpoon', name: 'Flattened spoon', hex: HEX.metal, damage: 2, uses: ['openVent'], contraband: true, blurb: 'Ground flat on concrete. Fits a vent screw.' },
  torch: { id: 'torch', name: 'Homemade torch', hex: HEX.torch, damage: 0, uses: ['signal'], contraband: true, blurb: 'Batteries, wire, a bulb from the telly. Flash it from the yard.' },
  lockpick: { id: 'lockpick', name: 'Lockpick', hex: HEX.clothesYellow, damage: 0, uses: ['openDoor'], contraband: true, blurb: 'Bent wire. Slow, quiet, unreliable.', durability: 2 },
  spear: { id: 'spear', name: 'Mop spear', hex: HEX.wood, damage: 7, uses: [], contraband: true, blurb: 'A mop handle with a shiv taped on.' },
  flag: { id: 'flag', name: 'Signal flag', hex: HEX.clothesRed, damage: 0, uses: ['signal'], contraband: true, blurb: 'A sheet with a red sock sewn on. Run it up the yard flagpole.' },
}

export interface Recipe {
  makes: ItemId
  needs: ItemId[]
  /** Tools that are used but not consumed. */
  tools?: ItemId[]
  where?: string
}

export const RECIPES: Recipe[] = [
  { makes: 'shiv', needs: ['toothbrush', 'razor'], tools: ['lighter'] },
  { makes: 'sockCosh', needs: ['sock', 'poolBall'] },
  { makes: 'keyMould', needs: ['soap'], tools: ['guardKey'] },
  { makes: 'forgedKey', needs: ['keyMould', 'fork'], tools: ['spoon', 'lighter'] },
  { makes: 'rope', needs: ['bedsheet', 'bedsheet'] },
  { makes: 'grapple', needs: ['rope', 'fork', 'tape'] },
  { makes: 'flatSpoon', needs: ['spoon'], where: 'Grind it on the yard concrete' },
  { makes: 'torch', needs: ['battery', 'wire', 'tape'] },
  { makes: 'lockpick', needs: ['wire'], tools: ['tape'] },
  { makes: 'spear', needs: ['mopHandle', 'shiv', 'tape'] },
  { makes: 'flag', needs: ['bedsheet', 'sock'] },
  { makes: 'visitorDisguise', needs: ['wig', 'dress'] },
]

export const INVENTORY_SLOTS = 8

/** "1 Greggs voucher", "3 Greggs vouchers". */
export function vouchers(n: number): string {
  return `${n} Greggs voucher${n === 1 ? '' : 's'}`
}

export class Inventory {
  readonly items: { id: ItemId; durability: number }[] = []

  has(id: ItemId, count = 1): boolean {
    return this.items.filter((i) => i.id === id).length >= count
  }

  count(id: ItemId): number {
    return this.items.filter((i) => i.id === id).length
  }

  get full(): boolean {
    return this.items.length >= INVENTORY_SLOTS
  }

  add(id: ItemId): boolean {
    if (this.full) return false
    this.items.push({ id, durability: ITEMS[id].durability ?? 1 })
    return true
  }

  remove(id: ItemId): boolean {
    const i = this.items.findIndex((it) => it.id === id)
    if (i < 0) return false
    this.items.splice(i, 1)
    return true
  }

  /** Best weapon carried, by damage. Fists are 1. */
  get weapon(): { id: ItemId | null; damage: number } {
    let best: { id: ItemId | null; damage: number } = { id: null, damage: 1 }
    for (const it of this.items) if (ITEMS[it.id].damage > best.damage) best = { id: it.id, damage: ITEMS[it.id].damage }
    return best
  }

  /** First carried item that can do this. */
  withUse(use: Use): { id: ItemId; durability: number } | undefined {
    return this.items.find((it) => ITEMS[it.id].uses.includes(use))
  }

  /** Wear a key or pick down; returns true if it broke. */
  wear(entry: { id: ItemId; durability: number }): boolean {
    entry.durability--
    if (entry.durability <= 0) {
      const i = this.items.indexOf(entry)
      if (i >= 0) this.items.splice(i, 1)
      return true
    }
    return false
  }

  /** A pat-down or a cell spin: everything contraband goes. */
  confiscate(): ItemId[] {
    const taken: ItemId[] = []
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (ITEMS[this.items[i].id].contraband) {
        taken.push(this.items[i].id)
        this.items.splice(i, 1)
      }
    }
    return taken
  }

  get contrabandCount(): number {
    return this.items.filter((i) => ITEMS[i.id].contraband).length
  }

  canCraft(recipe: Recipe): boolean {
    const pool = this.items.map((i) => i.id)
    for (const need of recipe.needs) {
      const k = pool.indexOf(need)
      if (k < 0) return false
      pool.splice(k, 1)
    }
    for (const tool of recipe.tools ?? []) if (!pool.includes(tool) && !recipe.needs.includes(tool) && !this.has(tool)) return false
    // Crafting frees slots, but the result needs one too.
    return this.items.length - recipe.needs.length + 1 <= INVENTORY_SLOTS
  }

  craft(recipe: Recipe): boolean {
    if (!this.canCraft(recipe)) return false
    for (const need of recipe.needs) this.remove(need)
    this.add(recipe.makes)
    return true
  }
}

/** Where loose items turn up, by room. Restocked each morning. */
export const SPAWNS: { zone: string; items: ItemId[] }[] = [
  { zone: 'showers', items: ['soap', 'razor', 'toothbrush', 'toothpaste', 'sock'] },
  { zone: 'laundry', items: ['bedsheet', 'bedsheet', 'sock', 'bleach', 'mopHandle', 'voucher'] },
  { zone: 'hub', items: ['spoon', 'fork', 'tray', 'spoon', 'fork', 'biscuits', 'sausageRoll'] },
  { zone: 'games', items: ['poolBall', 'poolCue', 'dart', 'battery', 'magazine', 'voucher'] },
  { zone: 'maint', items: ['screwdriver', 'wire', 'tape', 'lighter', 'tape'] },
  { zone: 'infirmary', items: ['tape', 'bleach', 'teabags'] },
  { zone: 'yard', items: ['voucher'] },
  { zone: 'blockA', items: ['magazine', 'mopHandle'] },
  { zone: 'chapel', items: ['wig', 'dress', 'bedsheet'] },
  { zone: 'mess', items: ['guardUniform', 'biscuits', 'teabags'] },
  { zone: 'library', items: ['magazine', 'battery'] },
  { zone: 'gym', items: ['sock', 'tape', 'blueDrink'] },
  { zone: 'bay', items: ['tape', 'wire'] },
]
