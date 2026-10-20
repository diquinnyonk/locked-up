/**
 * The phones in the canteen. Every call is recorded and a duty officer
 * listens in, so you cannot say *when*. Anything that gives away a time,
 * a day or the plan gets the call cut and you on a list.
 *
 * What gets flagged grows each time a call is flagged (and as you fail), so
 * a phrase that slipped through on day one will not slip through later.
 */
const LEVELS: RegExp[][] = [
  [
    /\bescap/i,
    /\bbreak(ing)?\s*(me\s*)?out\b/i,
    /\bbust(ing)?\s*(me\s*)?out\b/i,
    /\bget\s*me\s*out\b/i,
    /\btonight\b/i,
    /\btomorrow\b/i,
    /\bmidnight\b/i,
    /\bo'?clock\b/i,
    /\b\d{1,2}\s*(:|\.)\s*\d{2}\b/,
    /\b\d{1,2}\s*(am|pm)\b/i,
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    /\bgetaway\b/i,
    /\bover\s*the\s*wall\b/i,
  ],
  [
    /\btonite\b/i,
    /\b2nite\b/i,
    /\bwhen\b/i,
    /\bwall\b/i,
    /\bcar\b/i,
    /\bvan\b/i,
    /\bpick\s*(me\s*)?up\b/i,
    /\brun(ning)?\b/i,
    /\bkey(s)?\b/i,
    /\bvent(s)?\b/i,
  ],
  [/\bsoon\b/i, /\blater\b/i, /\bnight\b/i, /\bwait(ing)?\b/i, /\bout(side)?\b/i, /\broad\b/i, /\bengine\b/i],
  [/\bready\b/i, /\bsignal\b/i, /\bplan\b/i, /\bdark\b/i, /\bgate\b/i, /\bfree\b/i],
]

export interface CallResult {
  ok: boolean
  /** The word or phrase that gave you away. */
  flagged: string | null
  reply: string
}

export function screenCall(message: string, strictness: number): CallResult {
  const text = message.trim()
  if (text.split(/\s+/).filter(Boolean).length < 3) {
    return { ok: false, flagged: null, reply: "Hello? You there? Say something proper, the credit's running." }
  }
  for (let level = 0; level <= Math.min(strictness, LEVELS.length - 1); level++) {
    for (const re of LEVELS[level]) {
      const m = re.exec(text)
      if (m) return { ok: false, flagged: m[0], reply: '*click* ...the line goes dead.' }
    }
  }
  return {
    ok: true,
    flagged: null,
    reply: pickReply(text),
  }
}

function pickReply(text: string): string {
  const replies = [
    "Say no more, bruv. I'll be parked up by the road with the lights off every night this week. Flash me if you need me sooner.",
    "Got it. Nan says she'll keep the kettle on. I'll do the night drives like we said. Love you, idiot.",
    "Understood. I'll sit on the road out back each night. Wave a red rag in the yard if it's on.",
  ]
  return replies[text.length % replies.length]
}
