/**
 * Finds every line somebody says in the game's source, so the script for
 * the voice studio never misses one. It reads the code (with the oxc parser
 * that ships with the build tools) and follows each spoken line back to its
 * strings: conversation lines (ui.talk), speech bubbles (say), officers'
 * warnings (warn) and ambient chatter (.speech), including lines picked at
 * random from a list, built in a helper, or handed in as an argument.
 *
 * Names and other parts filled in at runtime become {placeholders}; the
 * game matches a shown line back to its template to find the recording.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { parseAst } = require('rolldown/parseAst') as { parseAst: (code: string, opts: { lang: string }) => Node }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any

export interface ScannedLine {
  speaker: string
  line: string
  where: string
}

const FILES = ['src/game/Game.ts', 'src/game/Missions.ts', 'src/npc/Guard.ts', 'src/npc/Prisoner.ts']

export function scanDialogue(): ScannedLine[] {
  const out: ScannedLine[] = []
  for (const file of FILES) out.push(...scanFile(file))
  // One entry per line of text.
  const seen = new Set<string>()
  return out.filter((l) => {
    const k = l.line
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function scanFile(file: string): ScannedLine[] {
  const src = readFileSync(file, 'utf8')
  const ast = parseAst(src, { lang: 'ts' })
  const text = (n: Node) => src.slice(n.start, n.end)
  const parents = new Map<Node, Node>()
  const all: Node[] = []
  const walk = (n: Node, parent: Node | null) => {
    if (!n || typeof n.type !== 'string') return
    if (parent) parents.set(n, parent)
    all.push(n)
    for (const k of Object.keys(n)) {
      if (k === 'parent') continue
      const v = n[k]
      if (Array.isArray(v)) for (const c of v) walk(c, n)
      else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v, n)
    }
  }
  walk(ast, null)

  const isFn = (n: Node) => ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(n.type)
  const enclosingFn = (n: Node): Node | null => {
    for (let p = parents.get(n); p; p = parents.get(p)) if (isFn(p)) return p
    return null
  }
  const methodName = (fn: Node | null): string => {
    if (!fn) return ''
    const p = parents.get(fn)
    if (p?.type === 'MethodDefinition' || p?.type === 'Property') return p.key?.name ?? ''
    if (fn.id?.name) return fn.id.name
    if (p?.type === 'VariableDeclarator') return p.id?.name ?? ''
    return ''
  }
  const fnsByName = new Map<string, Node>()
  for (const n of all) {
    if (isFn(n)) {
      const name = methodName(n)
      if (name && !fnsByName.has(name)) fnsByName.set(name, n)
    }
  }

  const placeholder = (expr: Node): string => {
    const t = text(expr)
    if (/(^|\.)player\.name$|^p\.name$|^name$/.test(t)) return '{name}'
    if (/wing/.test(t)) return '{wing}'
    if (/colleague/.test(t)) return '{officer}'
    if (/\.name$/.test(t)) return '{someone}'
    return '{thing}'
  }

  /** Every string an expression can produce, as templates. */
  const collect = (n: Node, depth = 0): string[] => {
    if (!n || depth > 14) return []
    switch (n.type) {
      case 'Literal':
        return typeof n.value === 'string' ? [n.value] : []
      case 'TemplateLiteral': {
        let variants = ['']
        n.quasis.forEach((q: Node, i: number) => {
          variants = variants.map((v) => v + (q.value.cooked ?? q.value.raw))
          const e = n.expressions[i]
          if (!e) return
          const inner = e.type === 'ConditionalExpression' ? collect(e, depth + 1) : []
          const fill = inner.length && inner.length <= 4 ? inner : [placeholder(e)]
          variants = variants.flatMap((v) => fill.map((f) => v + f))
        })
        return variants
      }
      case 'BinaryExpression': {
        if (n.operator !== '+') return []
        const l = collect(n.left, depth + 1)
        const r = collect(n.right, depth + 1)
        const L = l.length ? l : [placeholder(n.left)]
        const R = r.length ? r : [placeholder(n.right)]
        if (!l.length && !r.length) return []
        return L.flatMap((a) => R.map((b) => a + b))
      }
      case 'ConditionalExpression':
        return [...collect(n.consequent, depth + 1), ...collect(n.alternate, depth + 1)]
      case 'LogicalExpression':
        return [...collect(n.left, depth + 1), ...collect(n.right, depth + 1)]
      case 'ArrayExpression':
        return n.elements.flatMap((e: Node) => collect(e, depth + 1))
      case 'TSAsExpression':
      case 'ParenthesizedExpression':
      case 'TSNonNullExpression':
        return collect(n.expression, depth + 1)
      case 'MemberExpression':
        // list[Math.floor(rng() * list.length)]
        if (n.computed) return collect(n.object, depth + 1)
        return []
      case 'CallExpression': {
        const callee = n.callee
        const name = callee.type === 'Identifier' ? callee.name : callee.type === 'MemberExpression' && !callee.computed ? callee.property.name : ''
        if (name === 'pick' || name === 'pick2') return collect(n.arguments[1], depth + 1)
        // A helper that returns the line: follow its returns.
        const fn = fnsByName.get(name)
        if (fn && ['gossip', 'firmsGossip', 'cellmateTip'].includes(name)) return returnsOf(fn, depth + 1)
        return []
      }
      case 'Identifier':
        return resolve(n, depth + 1)
      default:
        return []
    }
  }

  const returnsOf = (fn: Node, depth: number): string[] => {
    const res: string[] = []
    for (const r of all) {
      if (r.type !== 'ReturnStatement' || !r.argument || enclosingFn(r) !== fn) continue
      res.push(...collect(r.argument, depth))
    }
    // Lists declared in the helper and indexed on the way out.
    for (const d of all) {
      if (d.type === 'VariableDeclarator' && enclosingFn(d) === fn && d.init?.type === 'ArrayExpression') res.push(...collect(d.init, depth))
    }
    return res
  }

  /** A name: a local holding the line, or a parameter it was handed. */
  const resolve = (id: Node, depth: number): string[] => {
    const fn = enclosingFn(id)
    const res: string[] = []
    for (const d of all) {
      if (d.type === 'VariableDeclarator' && d.id?.name === id.name && enclosingFn(d) === fn && d.init) res.push(...collect(d.init, depth))
    }
    if (res.length || !fn) return res
    const index = (fn.params ?? []).findIndex((p: Node) => (p.type === 'TSParameterProperty' ? p.parameter : p).name === id.name || (p.left?.name === id.name))
    if (index < 0) return res
    const name = methodName(fn)
    for (const c of all) {
      if (c.type !== 'CallExpression') continue
      const callee = c.callee
      const cname = callee.type === 'MemberExpression' && !callee.computed ? callee.property.name : callee.type === 'Identifier' ? callee.name : ''
      if (cname === name && c.arguments[index]) res.push(...collect(c.arguments[index], depth))
    }
    return res
  }

  const officerish = /^(by|g|officer|under|seen|best|guard|this\.escort|p\.escortedBy|this|gu)$/
  const prisonerish = /^(owner|owners\[0\]|pr|near|s|mate|p|victim|target)$/
  const speakerOfSay = (receiver: string): string => {
    if (file.endsWith('Guard.ts')) return 'Officer'
    if (file.endsWith('Prisoner.ts')) return 'Prisoner'
    const r = receiver.replace(/\?$/, '')
    if (officerish.test(r)) return 'Officer'
    if (prisonerish.test(r)) return 'Prisoner'
    return 'Prisoner'
  }
  const speakerOfTalk = (title: string, where: string): string | null => {
    if (/^'|^"/.test(title)) return null // a thing, not a person (the stash brick)
    if (where === 'talkToChaplain') return 'Reverend Clive Bunting (chaplain)'
    if (/k\.name/.test(title)) return 'Keith (X-ray operator)'
    if (/^g\.name/.test(title)) return 'Officer'
    if (/giverName|nameOf/.test(title)) return 'Job giver (officer or prisoner)'
    return 'Prisoner'
  }

  const lines: ScannedLine[] = []
  const add = (speaker: string, templates: string[], where: string) => {
    for (const t of templates) {
      const line = t.trim()
      if (line.replace(/\{\w+\}/g, '').replace(/[^A-Za-z]/g, '').length < 3) continue
      lines.push({ speaker, line, where: `${file.split('/').pop()} ${where}`.trim() })
    }
  }
  for (const n of all) {
    if (n.type === 'AssignmentExpression' && n.left?.type === 'MemberExpression' && n.left.property?.name === 'speech') {
      const who = text(n.left.object)
      if (who === 'r' || who === 'k') add(who === 'r' ? 'Reverend Clive Bunting (chaplain)' : 'Keith (X-ray operator)', collect(n.right), methodName(enclosingFn(n)))
      continue
    }
    if (n.type !== 'CallExpression' || n.callee.type !== 'MemberExpression' || n.callee.computed) continue
    const prop = n.callee.property.name
    const where = methodName(enclosingFn(n))
    if (prop === 'say') {
      const receiver = text(n.callee.object)
      // Game.say(body, text) is the wrapper; anything else is agent.say(text).
      if (receiver === 'this' && file.endsWith('Game.ts')) continue
      add(speakerOfSay(receiver), collect(n.arguments[0]), where)
    } else if (prop === 'talk' && /ui$/.test(text(n.callee.object))) {
      const lineArg = n.arguments[1]
      // Already keyed lines (missions, Keith, the Reverend) are listed separately.
      if (!lineArg || /LINES\[|\.brief$|\.thanks$|\.answer$/.test(text(lineArg))) continue
      const speaker = speakerOfTalk(text(n.arguments[0]), where)
      if (speaker) add(speaker, collect(lineArg), where)
    } else if (prop === 'warn') {
      add('Officer', collect(n.arguments[1]), where)
    }
  }
  return lines
}

/** A stable key for a line: who says it, its first words and a short hash. */
export function lineKey(speaker: string, line: string): string {
  const group = speaker.toLowerCase().startsWith('officer') ? 'officer' : speaker.toLowerCase().startsWith('prisoner') ? 'prisoner' : speaker.toLowerCase().startsWith('job') ? 'giver' : speaker.split(' ')[0].toLowerCase()
  const words = line
    .replace(/\{\w+\}/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .join('-')
  let h = 2166136261
  for (let i = 0; i < line.length; i++) h = Math.imul(h ^ line.charCodeAt(i), 16777619)
  return `${group}.${words || 'line'}-${(h >>> 0).toString(36).slice(0, 4)}`
}
