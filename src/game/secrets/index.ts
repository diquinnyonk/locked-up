import type { Game } from '../Game'
import { Play } from '../Play'
import { BakeOff } from './BakeOff'
import { Celebrity } from './Celebrity'
import { GreyLady } from './GreyLady'
import { Royal } from './Royal'
import type { Secret, SecretId } from './Secret'

export function makeSecret(id: SecretId, game: Game): Secret {
  switch (id) {
    case 'play':
      return new Play(game)
    case 'bakeoff':
      return new BakeOff(game)
    case 'celebrity':
      return new Celebrity(game)
    case 'royal':
      return new Royal(game)
    case 'greylady':
      return new GreyLady(game)
  }
}
