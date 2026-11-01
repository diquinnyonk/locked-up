/**
 * Which art style the game is drawn in. `cel` is the original: hard bands,
 * ink lines, institutional paint. `ghibli` is an exploration in the manner of
 * hand-painted animated films: lush greens, soft light, pale violet shadows,
 * sepia line, cloud shadows drifting over the yard and a painted-paper finish.
 *
 * Chosen with ?style=cel or ?style=ghibli. Headless runs (tests, the
 * simulation) have no address and always get `cel`.
 */
export type ArtStyle = 'cel' | 'ghibli'

function pick(): ArtStyle {
  if (typeof location === 'undefined' || typeof location.search !== 'string') return 'cel'
  const asked = new URLSearchParams(location.search).get('style')
  return asked === 'cel' ? 'cel' : 'ghibli'
}

export const STYLE: ArtStyle = pick()
export const GHIBLI = STYLE === 'ghibli'
