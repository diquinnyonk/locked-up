/**
 * A small behaviour tree.
 *
 * Every person in the prison, guard or prisoner, runs one of these. Trees are
 * built once per NPC type out of closures over a context object, and ticked a
 * few times a second (staggered so ninety-odd trees never all tick in the same
 * frame). Leaves return a status; composites decide what runs next.
 *
 * `running` is memoryless here on purpose: a tree re-evaluates from the root
 * every tick, so a guard walking a patrol notices you the instant you step
 * into view rather than finishing the leg first. Actions that need to carry
 * on across ticks keep their own state on the NPC.
 */
export type Status = 'success' | 'failure' | 'running'

export interface Node<C> {
  readonly name: string
  tick(ctx: C): Status
}

export class Selector<C> implements Node<C> {
  constructor(readonly name: string, private readonly children: Node<C>[]) {}
  tick(ctx: C): Status {
    for (const child of this.children) {
      const s = child.tick(ctx)
      if (s !== 'failure') return s
    }
    return 'failure'
  }
}

export class Sequence<C> implements Node<C> {
  constructor(readonly name: string, private readonly children: Node<C>[]) {}
  tick(ctx: C): Status {
    for (const child of this.children) {
      const s = child.tick(ctx)
      if (s !== 'success') return s
    }
    return 'success'
  }
}

export class Condition<C> implements Node<C> {
  constructor(readonly name: string, private readonly test: (ctx: C) => boolean) {}
  tick(ctx: C): Status {
    return this.test(ctx) ? 'success' : 'failure'
  }
}

export class Action<C> implements Node<C> {
  constructor(readonly name: string, private readonly run: (ctx: C) => Status) {}
  tick(ctx: C): Status {
    return this.run(ctx)
  }
}

export class Inverter<C> implements Node<C> {
  constructor(readonly name: string, private readonly child: Node<C>) {}
  tick(ctx: C): Status {
    const s = this.child.tick(ctx)
    return s === 'success' ? 'failure' : s === 'failure' ? 'success' : s
  }
}

/** Succeeds whatever the child does, for optional side steps. */
export class Succeeder<C> implements Node<C> {
  constructor(readonly name: string, private readonly child: Node<C>) {}
  tick(ctx: C): Status {
    this.child.tick(ctx)
    return 'success'
  }
}

/** Picks a child by weight each time it is entered. Used for idle variety. */
export class RandomSelector<C> implements Node<C> {
  constructor(readonly name: string, private readonly children: [number, Node<C>][], private readonly rng: () => number) {}
  tick(ctx: C): Status {
    const total = this.children.reduce((s, [w]) => s + w, 0)
    let r = this.rng() * total
    for (const [w, child] of this.children) {
      r -= w
      if (r <= 0) return child.tick(ctx)
    }
    return this.children[this.children.length - 1][1].tick(ctx)
  }
}

/** Tiny DSL so trees read top-down like the diagrams. */
export const bt = {
  select: <C>(name: string, ...children: Node<C>[]) => new Selector<C>(name, children),
  sequence: <C>(name: string, ...children: Node<C>[]) => new Sequence<C>(name, children),
  when: <C>(name: string, test: (ctx: C) => boolean) => new Condition<C>(name, test),
  act: <C>(name: string, run: (ctx: C) => Status) => new Action<C>(name, run),
  not: <C>(name: string, child: Node<C>) => new Inverter<C>(name, child),
  always: <C>(name: string, child: Node<C>) => new Succeeder<C>(name, child),
}

/**
 * Records which leaf actually ran on the last tick, so the debug overlay can
 * show what each NPC is thinking.
 */
export function traced<C extends { thought: string }>(name: string, run: (ctx: C) => Status): Action<C> {
  return new Action<C>(name, (ctx) => {
    const s = run(ctx)
    if (s !== 'failure') ctx.thought = name
    return s
  })
}
