import type { Game } from '../Game'
import { ITEMS, type ItemId, RECIPES, type Recipe } from '../Items'

/**
 * Crafting, dropping and using what is in your pockets (called by the UI).
 */
export class Pockets {
  constructor(private readonly game: Game) {}

  craftable(recipe: Recipe): boolean {
    if (recipe.makes === 'flatSpoon' && this.game.player.zone !== 'yard') return false
    return this.game.player.inventory.canCraft(recipe)
  }

  craft(recipe: Recipe): void {
    if (!this.craftable(recipe)) return
    this.game.player.inventory.craft(recipe)
    this.game.dodgyTimer = 5
    this.game.toast(`Made: ${ITEMS[recipe.makes].name}. ${ITEMS[recipe.makes].blurb}`, 'good')
  }

  craftNamed(id: ItemId): void {
    const r = RECIPES.find((rr) => rr.makes === id)
    if (r && this.craftable(r)) this.craft(r)
  }

  drop(index: number): void {
    const it = this.game.player.inventory.items[index]
    if (!it) return
    this.game.player.inventory.items.splice(index, 1)
    this.game.dynamic.spawnItem(it.id, this.game.player.body.x, this.game.player.body.z + 0.6, this.game.player.zone)
  }

  useItem(index: number): void {
    const it = this.game.player.inventory.items[index]
    if (!it) return
    if (it.id === 'guardUniform' || it.id === 'visitorDisguise') this.game.sillyExits.toggleDisguise(it.id === 'guardUniform' ? 'guard' : 'visitor')
    else if (it.id === 'soap') this.game.actions.chewSoap()
    else if (ITEMS[it.id].uses.includes('distract')) {
      // Throw it ahead: officers go and look.
      const b = this.game.player.body
      const x = b.x + Math.sin(b.yaw) * 7
      const z = b.z + Math.cos(b.yaw) * 7
      this.game.player.inventory.items.splice(index, 1)
      this.game.dynamic.spawnItem(it.id, x, z, this.game.grid.zoneAtWorld(x, z))
      this.game.emit({ x, z, radius: 12, kind: 'throw' })
      this.game.toast('Clatter. Heads turn.', 'neutral')
    } else this.game.toast(ITEMS[it.id].blurb, 'neutral')
  }
}
