/**
 * Builds the GitHub Pages site into pages/: the game at index.html and the
 * voice studio at recorder.html (a normal web page, so it may use the
 * microphone).
 *
 *   npm run pages
 */
import { execSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

execSync('npx tsx scripts/dialogue.ts', { stdio: 'inherit' })
execSync('npx vite build --base ./ --outDir pages --emptyOutDir', { stdio: 'inherit' })
const lines = readFileSync('dialogue/script.json', 'utf8')
const page = readFileSync('recorder/recorder.src.html', 'utf8').replace('__LINES__', JSON.stringify(JSON.parse(lines)).replace(/<\//g, '<\\/'))
writeFileSync('pages/recorder.html', page)
cpSync('recorder/recorder.js', 'pages/recorder.js')
mkdirSync('pages/vendor', { recursive: true })
cpSync('recorder/vendor', 'pages/vendor', { recursive: true })
writeFileSync('pages/.nojekyll', '')
console.log('pages/ ready: index.html (the game) and recorder.html (the voice studio)')
