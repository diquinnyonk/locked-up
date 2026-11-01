/**
 * Builds the published site into pages/ (Netlify, locked-up.netlify.app,
 * and the gh-pages branch): the website at index.html, the game at play/,
 * and the voice studio at recorder.html (a normal web page, so it may use
 * the microphone).
 *
 *   npm run pages
 */
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

execSync('npx tsx scripts/dialogue.ts', { stdio: 'inherit' })
rmSync('pages', { recursive: true, force: true })
// The game, in its own folder. Everything it loads is relative (voices/ too).
execSync('npx vite build --base ./ --outDir pages/play --emptyOutDir', { stdio: 'inherit' })
// Each line with how often players hear it (npm run heard), for the
// studio's "most heard first" order.
const heard = JSON.parse(readFileSync('dialogue/heard.json', 'utf8'))
const lines = JSON.parse(readFileSync('dialogue/script.json', 'utf8')).map((l) => (heard[l.key] ? { ...l, heard: heard[l.key] } : l))
const page = readFileSync('recorder/recorder.src.html', 'utf8').replace('__LINES__', JSON.stringify(lines).replace(/<\//g, '<\\/'))
  // A new name for the script whenever it changes, so phones never keep an old copy.
  .replace('src="recorder.js"', `src="recorder.js?v=${createHash('sha1').update(readFileSync('recorder/recorder.js')).digest('hex').slice(0, 8)}"`)
writeFileSync('pages/recorder.html', page)
cpSync('recorder/recorder.js', 'pages/recorder.js')
mkdirSync('pages/vendor', { recursive: true })
cpSync('recorder/vendor', 'pages/vendor', { recursive: true })
// The website is the front page: one static page and its pictures (the
// game's own frames).
cpSync('site', 'pages', { recursive: true })
// Where the website used to live: send people to the front page.
mkdirSync('pages/site', { recursive: true })
writeFileSync('pages/site/index.html', '<!doctype html><meta charset="utf-8"><title>Locked Up</title><meta http-equiv="refresh" content="0; url=../"><a href="../">Locked Up</a>\n')
writeFileSync('pages/_redirects', '/site /  301\n/site/* /  301\n')
// Netlify publishing the built branch as it is: nothing to build.
writeFileSync('pages/netlify.toml', '[build]\n  publish = "."\n  command = ""\n')
writeFileSync('pages/.nojekyll', '')
console.log('pages/ ready: index.html (the website), play/ (the game) and recorder.html (the voice studio)')
