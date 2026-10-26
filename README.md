# Locked Up

A UK prison break in the browser. WebGL2 and three.js, no external assets. Every
mesh, colour and sound is generated in code. It is drawn in the same cel style as
Windward (`seagull-game`): a quantised toon ramp, a shadow side tinted toward a
cool shade colour rather than black, Fresnel rims, inverted-hull ink outlines on
every person, and screen-space ink lines (a Roberts cross over a normal and depth
prepass) on the building, all from one palette in `src/art/palette.ts`.

```bash
npm install
npm run dev        # play
npm test           # headless checks of every escape route
npm run sim        # headless day of the regime, printed by period
```

Type your name on the title screen, pick a difficulty, and you are booked in to
HMP Grim-on-the-Moor, cell A8, with one cellmate.

- **Normal**: every officer's sight is drawn on the floor. The wide fan is how
  far they see ahead, cut off by walls and shut doors, and it shrinks while you
  sneak. The small ring behind them is how close you can creep before they
  notice you anyway. It turns red as they get suspicious.
- **Hard**: no sight guide, no officers on the map, and they spot you a quarter
  faster.

## How you got here

A short, skippable intro: you robbed a Greggs (a steak bake, four sausage
rolls and a festive bake), which in Grim-on-the-Moor, under the Pastry Protection Act
of 1987, is worse than murder. Everyone inside knows your name. Prisoners and
officers call you the Greggs Bandit.

## The Governor's safe

The Governor's office, off the officers' mess, has a heavy old safe with a
four-digit dial. It is out of bounds, so get in through the vents or the mess.

- **The combination:** the first two digits are his mother's birthday, circled
  in the desk diary on his desk. The last two are the number on his Jag's
  private plate: ask Keith about the Governor. The Notebook keeps what you know.
- **Or crack it by ear** with the stethoscope from healthcare: thirty seconds
  of standing still at the dial, and every few seconds a click that carries.
- **Inside:** the Governor's master key (opens every door, the outer gates
  included, never wears out and is never missed), the keys to his Jag, six
  Greggs vouchers of petty cash, and your file. You shred the file, and the
  prison forgets the last thing it learned about you.
- **The Jag** is parked in the staff car park just outside the staff door in
  the changing room. Let yourself out with the master key and drive away: a
  new ending, "The Governor's Jag", no car signal needed.
- **Caught in the office**, the Governor changes the combination, and from
  then on an officer looks into his office every hour.

## Every day is different

Day one is a Monday, and the HUD shows the weekday. Each morning at unlock
the prison decides what kind of day it is (`src/game/Events.ts`), says so in
a toast, and keeps it at the top of the Notebook. Never the same twice running:

| Day | What happens |
| --- | --- |
| Quiet | Nothing out of the ordinary. |
| Shakedown | At some point officers spin every cell on your wing. Your stash may be found, and if you are on the landing you get patted down. |
| Lockdown | A fight in the showers. Everyone back to their cells for twenty minutes, then doors locked for two and a half hours. You can sleep through it. |
| Inspection | HM Inspector visits. No pat-downs all day, but officers see further. |
| New intake | Two landing officers from other wings are stuck in reception in the loading bay until lunch. |
| Greggs delivery | Sausage rolls and vouchers on the canteen counter at lunch. |
| Fire drill | The alarm goes and everyone is herded into the yard for half an hour. |
| Your nan visits | Visiting days only. Sit with her in the visiting hall for three Greggs vouchers. |

## Slower starts

The quickest exits used to work on day one. Now:

- The wig and frock are in the chapel's panto box, padlocked until you have
  done the Reverend's errand; he lends you the key.
- Visitors only come on Tuesdays, Thursdays and weekends.
- For your first two days every officer knows your new face: disguises are
  seen through two and a half times faster, and the disguise exits are half
  as likely to work.
- Fixers only sell sleeping pills to prisoners they trust (gift them a voucher
  or two first).

## Saving

The game saves itself in the browser's localStorage (`src/game/Save.ts`): every
twenty seconds whenever things are quiet, and when you leave the page. It
never saves mid-escape, mid-chase, in a riot or mid-conversation, so a save
always loads into a calm moment. The Notebook has a **Save now** button and
says when it last saved. On the title screen, **Carry on** picks up where you
left off; starting a new sentence replaces the save, and so does reaching an
ending.

A save keeps the seed the prison was rolled from, so the same prisoners come
back with the same faces, tempers and firms, plus the clock, your pockets and
stash, what the prison has learned, trust and grudges, jobs, post, loose
items, open grilles and jammed locks. Saves stay on that device and browser,
but **Download save** in the Notebook keeps one as a `.json` file, and **Load a
save file** (in the Notebook, or on the title screen) brings one back, on this
device or another. Loading checks the file is a Locked Up save from this
version, then restarts the page to rebuild that prison.

## Your first day: the tour

The first time you play, the game stops before day one for a walk round the
screen (`src/ui/Tour.ts`): moving, doing things, the clock and the regime,
being noticed, jobs, the map, your pockets, the Notebook and its pages,
nights, and talking. Each card points at the part of the screen it is about,
with the keys on a keyboard or the button names on a phone. It can be
skipped, and it is remembered on the device so it only shows once. The
Notebook has a **How to play** page listing every control, with a button to
take the tour again.

## Post, and the notes on your bunk

The post comes round every morning at unlock: a letter from home most days,
two on a good one, each opened and stamped by the censor. Mum is disappointed,
Nan sends postal orders (Greggs vouchers) and a scarf that got confiscated as "a
potential rope", your brother keeps driving the back roads "for his nerves",
your ex has kept the George Foreman grill, and a well-known high street bakery
writes about your loyalty points. Some letters carry something the censor
missed, and a few carry a hint if you read between the lines.

Once a day, while you are out, someone leaves a note on your bunk. Every note
is a true clue to a way out: the rusty vent, Keith's weakness for a blue
drink, the panto box, the shift change, the Firm's prices, the toothpaste. The
paper gets fancier as they go on: lined paper, then cream, then headed paper
with half a crest, then a compliments slip. At the end, whichever way it ends,
a letter on headed paper explains: Governor Rupert Pettigrew wrote them all.
He runs Grim-on-the-Moor as a test of itself, leaves a clue, watches who takes it,
and welds shut whatever they find.

Letters and notes are kept in the notebook under Post.

## Talking to people

Talk to anyone and the camera cuts to over your shoulder, framing their face
while they speak and gesture, with the dialogue as subtitles along the bottom
and a close button for thumbs. The prison waits while you talk.

Job lines carry stable keys for voice recording. `npm run dialogue` writes the
full script to `dialogue/script.csv` (key, speaker, line). Put each recording
in `public/voices/<key>.mp3` and add the key to `VOICE_LINES` in
`src/audio/Voice.ts`; from then on it plays when the line comes up.

## The notebook

`J`, `Tab` or the Menu button opens the notebook, in four tabs:

- **Main mission**: escape HMP Grim-on-the-Moor, as a checklist that ticks itself as
  you get ready (a key, toothpaste in the lock, a paid firm, a car outside, a
  grappling hook, a disguise, Keith paid off).
- **Jobs**: your side missions and who has work going today.
- **Pockets**: inventory and crafting.
- **Post**: letters from home as envelopes, and the notes left on your bunk.
- **Notes**: your record, every way out, the firms, and what the prison has
  learned.

The interface is the prison's own paperwork: the notebook is a prison-issue
exercise book, letters are sheets stamped by the censor, bunk notes are torn
scraps, and conversations run as film subtitles. Titles are set in Rokkitt,
text in Literata.

Your pockets sit along the bottom of the screen as eight slots, each showing
the actual thing you are carrying, drawn from the same little model you
picked up off the floor. Contraband carries a red stamp. Loose items lie
still where they were dropped, at whatever angle they fell.

## The chaplain

The **Reverend Clive Bunting** stands behind the altar in the chapel all day
(black shirt, dog collar, wooden cross) and has lunch in the canteen with
the lads, because he believes in it. He runs the panto and the choir, and he
has one job for you: **The Missing Hymn Books**. Three have been nicked: one
is levelling the pool table in the games room, one is a soap dish in the
showers, one is propping up the bench press in the gym. Bring all three back
for three Greggs vouchers from the collection plate, and his favour: the
next time an officer has you by the collar, he swears blind you were at
choir practice and it does not count as an attempt. He can lie once. Twice
is a habit.

## Sitting down, and furniture

Every table, chair, bench, pew, sofa, bunk, washing machine, bit of gym kit,
the pool table, the X-ray and the van are solid: you walk round them, and so
does everyone else, officers included. Paths are planned round them, so
nobody cuts through the canteen tables any more. Stand by any bench, chair,
pew, sofa or the edge of your bunk and press `E` to sit down; move to get
up. Nobody sleeps off the side of their bunk either.

People are solid too. You bump off prisoners and officers instead of walking
through them (they are heavier than you, so you cannot just barge a man out
of a doorway), and they jostle each other the same way. Anyone sitting, in
the middle of a conversation, or rooted to their post like Keith and the
Reverend does not budge at all.

## Toilets, and other people's cells

Every cell has a proper toilet. Sit on one (`E`), do your business (`R`),
and then either flush (`R`) or stand up and walk off. Leave it unflushed
and it sits there stinking, green fumes and all, until the man whose cell
it is comes home. He goes spare. Whether he works out it was you depends
on whether anyone saw you go in, whether you are hanging about nearby when
he finds it, and how often it has happened before; your own cellmate always
knows. If he knows, he comes for you (with a shiv if he is a hothead or in
a firm), across the prison if need be; an old-timer just never forgives
you, and a snitch tells an officer. If he does not know, the nearest poor
soul gets the blame and the fists.

Stand up halfway through and it drops out of you onto his floor, squashing
with a splat in front of the bowl. That is worse: he is more likely to work
out it was you, hunts you for longer, is twice as likely to bring a shiv,
and even the old boys and the grasses come for you themselves.

Standing in somebody else's cell while he is there gets you told to leave.
Stay, and it depends on the man: an old-timer tuts and threatens to write
to his MP, a snitch goes to tell an officer, an ordinary lag or a fixer
uses his fists, a firm man uses his fists or, if he is the boss or already
has it in for you, a shiv, and a hothead gives you about two seconds before
the shiv comes out. A shiv hits three times as hard as a fist. Leave and
it is forgotten.

## How people move

Everyone is a rigged, animated character: the **KayKit Adventurers** pack by
Kay Lousberg (CC0, free for any use), stripped down by `tools/people.py` to
one 41-bone skeleton, four heads (long hair, short hair, bald with a beard,
a blond quiff), two tops (a tunic and a vest), arms, legs and the 18
animations the prison uses. The fantasy costumes are gone: every vertex
carries a colour role (skin, hair, top, trim, trousers, shoes, belt), so the
same tunic is a grey prison sweatshirt on one man, an officer's white shirt
on the next and the chaplain's black on a third, and no textures ship.

What someone is doing picks the clip, with a short blend between: idle,
walk (sped up or slowed to match their pace), run, a fight of jabs, crosses
and the odd kick, falling down, lying on a bunk, sitting on a bench, a
cheer, picking things up, using the phone. The pack has no crawl, so the
vents get a hand-made hands-and-knees pose laid onto the skeleton each
frame. Officers' caps and ties, the chaplain's dog collar, moustaches and
visitors' skirts are small meshes riding on the head, chest and hip bones.
People far from you animate in steps to spare a phone the work, though they
still move every frame.

To rebuild the character data from the pack:

```
git clone https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0
python3 tools/people.py KayKit-Character-Pack-Adventures-1.0/addons/kaykit_character_pack_adventures/Characters/gltf
```

`npm run dev` then `/poses.html` shows every pose side by side (`?t=0.4`
freezes a moment, `?cam=side` looks from the side, `?pose=crawl` shows one,
`?old=1` shows the jointed figures the game falls back to and the tests use).

## The map

The minimap sits top right with your cell number on the card beside it.
Click it, press `M` or use the Bigger map button to open it full size, with
labels, the ducts and a key. Keith on the X-ray is always the blue square.
On normal, whatever your jobs need lights up as a pulsing gold ring, on the
map and as a gold chevron in the world: the thing to fetch, the person to see,
the room to sniff round, or the person to go back to once it is done. Hard
mode shows none of it.

## Money

The currency is the **Greggs voucher**: good for one sausage roll at any
branch, and in Grim-on-the-Moor the only money that matters. You earn them folding
sheets in the laundry, from jobs, and from Nan. They buy riots, favours,
fixers' stock and blue drink.

## The prison

- **Four wings (A–D)**: ten cells each, two prisoners to a cell, so 20 per wing
  (you are one of A's). Each wing has a landing and a yellow security gate.
- **Sixteen officers**, four per wing: one on the wing gate, one walking the
  landing (and nights), one who follows the wing to work, meals and the yard,
  and one posted on a central gate.
- **Corridors and gates.** Only officers can open a gate. By day the officer on
  it lets you through toward wherever the regime sends you, and nowhere else.
- Showers, laundry, the canteen with its payphones, healthcare, segregation,
  the games room, maintenance (behind a red door), and the **exercise yard**
  against the perimeter wall. The road out is on the other side.

The day runs to a timetable: unlock, breakfast, work, lunch, yard, association,
tea, evening association, bang-up, lights out. One real second is two prison
minutes, and you can sleep (Z) through the night.

## Getting out of your cell

| Method | How |
| --- | --- |
| **Steal a key** | Get behind an officer and lift their keys (R), or knock one down and take them. They notice at the next shift change, so press a mould into soap first and make a copy. |
| **Toothpaste** | By day, stand in your open doorway and pack the strike plate (R). At lights out the door shuts but never locks. Ease it open (E). |
| **Fake sickness** | Behind your door at night, press H. An officer walks you to healthcare and waits by the door. Slip away, take the vent, or knock them out. |
| **Riot** | Pay the boss of the firm that runs your wing (see below), then press G. At night the landing goes up and the officers open the cells to pull out ringleaders. By day your lot start swinging and officers leave gates swinging behind them. Mates won over with Greggs vouchers add to the numbers. |
| **The vent** | Your cell has a grille the guards forgot. The screws are rusted enough for a spoon. |

The **vents** connect every room except the cells, plus your own. They are tin.
On normal a steady crawl is quiet and only a scramble (running) carries far;
on hard every knee on the tin is heard, and running brings officers to the
nearest grille. Get caught in there and they weld your cell vent shut.

## Getting out of the prison

Over the yard wall with a grappling hook, or through the gatehouse gate with a
key. Before you go, someone has to be waiting on the road:

- **The phone.** Type what you say to your brother. An officer listens, so never
  say *when* or *how*. "Tonight", times, days and "escape" get the call cut, and
  every flagged call teaches the listener more words. A clean call means a car
  waits on the road for the next three nights.
- **The flag.** A bedsheet and a red sock, run up the yard flagpole by day: the
  car comes that night.
- **A torch.** Batteries, wire and tape, flashed out of your cell window at night.

Reach the car to win. Get over the wall with nobody waiting and the dog unit
finds you.

## Silly ways out

Three escapes that need no car, no wall and no dignity. Each is a single roll
at the exit, and each one that gets rumbled makes it harder next time.

| Way out | You need | When and where |
| --- | --- | --- |
| **Dressed as an officer** | A spare uniform from the officers' mess, or the one off an officer you have knocked out (he is left in his vest and pink boxers until morning) | Wear it (Tab) and doors open for you. Clock off through the staff door in the changing room (off the loading bay) at shift change, 20:45 to 21:20, or at any hour if you also have an officer's keys. Mrs Battenberg gives you a lift and talks about her cats. |
| **Dressed as a visitor** | The panto wig and floral frock from the chapel's costume box, made into a visitor disguise | Wear it in the visiting hall (14:30 to 15:45) and shuffle out of the visitors' gate with everyone else at 15:30. Big Dave's nan offers you a Werther's Original. |
| **The laundry van** | A blue drink (the vending machine in the visiting hall, 1 Greggs voucher) and a sausage roll (the canteen), to bribe Keith on the X-ray | Every basket goes through Keith's X-ray in the loading bay on its way to the van, and unbribed he always spots you ("That basket's got a skeleton in it. A WALKING skeleton."). Find him having a cuppa in the canteen at breakfast or lunch, or collecting baskets in the laundry from 10:00, and pay him off. Then climb into the big basket by the laundry door before 11:00, and the van takes you to a laundrette in Wolverhampton. |

**The officer in your cell.** Buy sleeping pills from a fixer (2 Greggs
vouchers) and mash them into a sausage roll from the canteen. By day, in your
own cell, press H to shout for an officer ("Guv! There's a rat in here the
size of a dog!"). He comes in and has a good look round with his back half
turned: talk to him and offer the sleepy sausage roll, or cosh him while he
is not looking. He sleeps for hours. Take his uniform (E) and his keys (R),
put the uniform on, and walk to the staff changing room off the loading bay.
In uniform with keys, the staff door lets you out at any hour ("Off shift
early"); without keys it only opens at shift change. When he wakes up in your
cell in his vest and boxers, every officer hears about the stranger in
uniform and your disguise is blown. Get caught and officers stop eating what
prisoners offer them; do it twice and nobody comes when you shout.

A disguise holds at a distance, but an officer who gets a good look at you up
close for long enough sees through it ("Madam, you appear to have a beard"),
and the HUD shows how close you are to being rumbled. Prisoners comment on
your outfit, and snitches tell the officers. After a failure, officers count
moustaches at shift change and visitors get counted in and out. If you are
caught in the laundry even after paying Keith, he is sacked; Brenda replaces
him and wants two of everything, then Clive, who wants three.

## New rooms

The yard is smaller now, with an annex down each side:

- **Chapel**: pews, an organ, stained glass and the Christmas panto costume box.
- **Visiting hall**: tables with blue chairs, a vending machine and a play corner.
  Visitors arrive at 14:30 and leave at 15:30, and some prisoners sit with them.
- **Gym**: weight benches, a dumbbell rack, a punchbag and a treadmill.
- **Library**: shelves of paperbacks and a QUIET sign.
- **Officers' mess** (restricted): a sofa, a kettle, the biscuit tin and a rack
  of spare uniforms.
- **Loading bay** (restricted): the laundry van, laundry cages and the vehicle gate.
- **Governor's office** (restricted, off the mess): a desk the size of a car, a
  leather chair, filing cabinets, a safe, a portrait of the Governor and a
  dying yucca.
- **Staff changing room** (restricted, off the loading bay): lockers, a bench
  and the staff door out to the car park.

The staff wing sits in a strip added along the east wall.

All eight are on the vent network. Prisoners use the gym, library and chapel at
association and yard time.

## The look

People have jointed limbs (knees and elbows bend as they walk, sit and fight),
a neck, ears, eye whites, a belt and buckle, and vary in height and build.
Officers have a collar, tie, epaulettes, a radio, pockets and a badge on the
peaked cap. Visitors have skirts and long hair. Rooms carry posters, shelves,
radiators, notice boards, extinguishers, CCTV, and plates and mugs on the
canteen tables. The colour pass is multisampled for smoother edges.

## The firms

Nobody kicks off a landing without the gang that runs it, and they only do it
for Greggs vouchers. Each wing has a home firm of five, one of them the boss, plus a
soldier from its rival. Members wear the firm's colour.

| Firm | Runs | Colour | Rival | |
| --- | --- | --- | --- | --- |
| **The Firm** | A wing | maroon | The Crows | Old-school East End faces. They run the Greggs vouchers on A and expect to be asked first. |
| **The Crows** | B wing | navy | The Firm | Young and loud. They hate the Firm more than the screws. |
| **Red Lions** | C wing | red | The Northern Mob | Football lads off the terraces. Always up for a ruck, never for a plan. |
| **The Northern Mob** | D wing | mustard | Red Lions | Quiet heavies who do business and never forget a debt. |

Talk to a boss to pay them. Their backing lasts two days. The price starts at
4 Greggs vouchers and goes up every time you pay them again, and every time a riot of
yours has been put down. Paying a firm offends its rival. Hitting their lads,
or getting them cuffed in a riot they were not paid for, makes them hostile. Past
a point their boss will not deal with you at all, and their soldiers come for
you when no officer is near. If you lose both rounds, the firm that hates you
most decides how it ends.

## Jobs

People want things doing. Look for **(has a job)** or **(wants a word)** when
you go to talk to someone. You can have three jobs on at once, and you hand each
one back to whoever set it. The HUD lists them under your details, and so does
the journal.

**The gang bosses** each have three jobs, in order. Every one done lowers that
gang's riot price, cools their hostility and makes their lads like you. Jobs that
hit their rival make the rival angrier.

| Boss | Jobs |
| --- | --- |
| The Firm | *Soap Opera* (a bar of soap, definitely not for a key mould), *Return to Sender* (dump a parcel that smells of Lynx Africa and treason on the Crows' landing), *A Quiet Word* (flatten the Crow who said Uncle's mum's trifle was shop-bought) |
| The Crows | *The Great Pool Ball Robbery* (not the black one, that's bad luck innit), *Crowtax* (three Greggs vouchers, a tax they are very proud of naming), *Bovver on A Wing* (they are not pigeons) |
| Red Lions | *Away Day* (sing at the flagpole during yard), *Half-Time Oranges* (a canteen tray, which is a goalpost if you squint), *Derby Day* (they did not bottle it, they tactically retreated) |
| The Northern Mob | *The Sock Audit* (two socks short, the books must balance), *Debt Collection* (three Twixes and an apology), *Tea, Proper* (liberate the real teabags from healthcare) |

**Gang members** run small errands, a few each day: a toothbrush (it was used for
grout), custard creams, or a perfumed letter to someone on another wing ("if
anyone asks, it's from your nan").

**Officers**: every morning three random officers want something done quietly:

- *A Racing Certainty*: find their confiscated Racing Post in the games room
  (Lord Biscuitwick, each way).
- *The Custard Crisis*: the officers' biscuit tin is empty and it's only Tuesday.
- *Specs Appeal*: leopard-print reading glasses lost in the yard. Do not laugh.
- *Who's Brewing Hooch?*: sniff around a cell. The lads in it will know it was
  you, and so will their gang.
- *The Quiet Shift*: no warnings for three hours, for the sake of their bunions.
- *Fantasy Football*: find out who a gang boss picked as captain (it's his nan).

Officers pay in Greggs vouchers, in going easier on you, or in a **blind eye**: the next
time that officer catches you out of bounds, he studies the ceiling instead.
Fail a job, or let it run out, and the gang or the officer takes it personally.

The officers are Mr Higginbottom, Ms Bottomley, Mr Crumpet, Mrs Thistlethwaite,
Mr Pickles, Ms Doubleday, Mr Snodgrass, Mr Wellbeloved, Ms Puddifoot, Mr Gristle,
Mrs Battenberg, Mr Sidebottom, Mr Featherstonehaugh, Ms Clutterbuck,
Mr Ramsbottom and Mrs Shufflebotham, and every one of them has a bad knee.

## Everything is a weapon or a tool

Every item has a damage value and a use. Toothbrushes and razor blades make a
shiv. A pool ball in a sock is a cosh. Two bedsheets make a rope, and a rope, a
fork and gaffer tape make a grappling hook. Soap takes a key mould, and a fork
melted into the mould with a lighter and a spoon makes a homemade key. A spoon
ground flat on the yard concrete undoes vent screws. A mop handle with a shiv
taped on is a spear. Pool balls and magazines can be thrown to pull an officer's
attention. Contraband goes on a pat-down. A loose brick in your cell stashes four
items, and they do not always find it.

Fixers on the wings sell razors, lighters, wire, tape, batteries and screwdrivers
for Greggs vouchers. You earn Greggs vouchers working laundry shifts.

## Behaviour trees, and what the prison learns

Every NPC runs a behaviour tree (`src/npc/BehaviourTree.ts`), ticked six times a
second and staggered across frames.

- **Officers** (`src/npc/Guard.ts`): knocked out → chase → riot → noticed
  something → sick call → pat-down → investigate a noise → lock checks → bang-up
  → listen at vents → duty (post, landing or escort).
- **Prisoners** (`src/npc/Prisoner.ts`): knocked out → cuffed → fighting → night
  riot → brawl nearby → gang hunting you → frightened → snitching → lights out →
  the regime.

You have **four attempts**. Being somewhere you cannot explain (out of your cell
at night, in the vents, in maintenance, on the wall) is only out of bounds
until an officer **sees** you there. Then the attempt is under way. Get back
behind your own door before they catch you and it does not count. Get caught and the
attempt is spent, contraband goes, you do a night in segregation, and
`PrisonMemory` (`src/npc/Memory.ts`) records how you did it and where:

- **Keys** lifted: officers guard their chains, and lifting gets harder each time.
- **Toothpaste** found: the night officer tries every door at bang-up.
- **Sick calls** faked: healthcare wants to see you frothing (chew soap, Q) and
  sends two officers. Fake it often enough and nobody comes.
- **Riots**: gate officers stop leaving their posts, and you need more backers.
- **Vents**: officers stand under grilles and listen, and hear further.
- **The wall**: an officer walks the yard at night.
- Where you were caught joins the landing patrol routes, everyone sees a little
  further each time, and the phone listener's vocabulary grows.

Each firm remembers too, and so do individual people. An officer you fooled or hurt watches you harder
and will not fall for the same thing twice. Prisoners keep trust and grudges.
Snitches who see a report pay off report more readily. Gang members hold the
riots that got them cuffed against you, and their grudge sets the prison-wide
gang hostility. Ask anyone what they have heard and they will tell you what
the officers have learned.

When the four attempts are gone, the count resets for a second round, and the
prison keeps everything it learned. **Exhaust both rounds and it is over**:
segregation indefinitely or, if a firm hates you enough, they get to you first.

## Controls

| Key | Action |
| --- | --- |
| `WASD` / arrows | Move |
| `Shift` | Run (loud) |
| `C` | Sneak (slow, quiet, harder to spot) |
| `E` | Use / talk / pick up |
| `R` | Alternate action: lift keys, toothpaste, stash, torch |
| `F` | Fight (your best weapon is used automatically) |
| `Tab` / `I` | Pockets and crafting |
| `Q` | Chew soap |
| `H` | In your cell: shout an officer in by day, fake sick at night |
| `G` | Kick off a riot |
| `Z` | Sleep through the night |
| `J` | Journal: every way out, and what they have learned |
| `M` | Big map, with the ducts, labels and your job targets |
| `Esc` | Pause |

## Layout of the code

```
src/
  art/        palette, toon ramp and material, ink outlines, painted primitives
  shaders/    toon shader (Windward's, plus a shared day/night world tint)
  render/     cel post pipeline, the instanced crowd
  world/      tile grid and layout, A* and collision, static build, moving parts
  npc/        behaviour trees, officers, prisoners, the prison's memory
  game/       the regime clock, doors, items and recipes, the phone, the game
  ui/         HUD, minimap, panels, speech bubbles
  audio/      synthesised sound
scripts/      headless simulation and scenario checks
```

## Recording the dialogue

`recorder.html` on the project's GitHub Pages site is the voice studio: every
spoken line with a Record button that uses the phone's microphone (the
browser's own MediaRecorder), trims the silence, encodes an MP3 with lamejs
and keeps each take on the device in IndexedDB until you are done. **Download
all takes** bundles them with JSZip as `voices/<key>.mp3`, ready for
`public/voices/`. `npm run pages` builds the site into `pages/` (the game at
`index.html`, the studio at `recorder.html`); it is published from the
`gh-pages` branch.

Every officer and every prisoner has a voice of their own. Prisoners keep
the same name and bunk from game to game (`src/npc/names.ts`), and the boss
of each firm always speaks as the boss. Lines any officer or any prisoner
might say are shared out, one owner to a line, in `dialogue/cast.json`:
`npm run dialogue` gives new lines to whoever has least to say and never
moves a line that already has an owner (edit the file to move one). When
somebody is about to say a line from a list of alternatives, they say one of
their own from that list instead (`src/audio/cast.ts`), and a recording only
plays in the mouth of the character it belongs to. An officer's job is
offered by the officer whose job it is, and an errand by its owner, so the
brief is in their voice. The studio lists the lines by character, with a
picker to do one voice at a time.

## Credits

Characters and animations: KayKit Character Pack: Adventurers 1.0 by Kay
Lousberg (kaylousberg.itch.io), CC0. The voice studio uses lamejs (LGPL-3.0,
shipped unmodified as `recorder/vendor/lame.min.js`) and JSZip (MIT).
Everything else in the repository is made for this game.
