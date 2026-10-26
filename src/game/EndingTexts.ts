import type { EndingId } from './Records'

/**
 * The end-screen story for the newer ways out: the everyday routes and the
 * secret missions. `name` is the player's, `tally` the day-and-attempts line.
 */
export function endingStory(id: EndingId, name: string, tally: string): { title: string; text: string } | null {
  switch (id) {
    case 'bins':
      return {
        title: 'Wheelie good',
        text: `The bin lorry tips ${name} into its belly with forty bags of cold chips and a mattress. Twenty minutes later, at the tip outside Grimsby, a man in a hi-vis vest watches a prisoner climb out of the landfill and says, "Not the first, pal."\n${tally}\nThursdays are now known in the Governor's office as Black Thursdays.`,
      }
    case 'hospital':
      return {
        title: 'Nil by mouth',
        text: `The ambulance takes ${name} to Grimsby General with a textbook case of appendicitis. While the escorting officer queues for a vending machine coffee, the patient in bay four goes to the toilet and leaves by its window, still in a paper gown.\n${tally}\nThe surgeon writes "remarkable recovery" on the notes.`,
      }
    case 'court':
      return {
        title: 'Case dismissed',
        text: `Somewhere on the A1, the court van stops at a services so the driver can buy a pasty. By the time he is back, the cuffs are on the seat and ${name} is on a coach to Skegness.\n${tally}\nThe magistrate, informed, says she had a feeling about that one.`,
      }
    case 'papers':
      return {
        title: 'Paper trail',
        text: `The officer at the discharge desk reads the form twice, admires the stamp, says "Lovely signature, the Governor's," and buzzes ${name} through three gates and out into the car park with a bin bag of their own clothes.\n${tally}\nThe Governor is still insisting he never signed it. Nobody believes him: it is better than his usual one.`,
      }
    case 'fireEngine':
      return {
        title: 'Blue lights',
        text: `The fire engine rolls out of the gate with its lights going for no reason at all, and ${name} rides out curled in a locker between the hoses. At the station they climb out and help coil a hose, and nobody asks.\n${tally}\nWatch Manager Dobbs has been given a stern talking-to and a framed photograph of the incident.`,
      }
    case 'glider':
      return {
        title: 'Gone with the wind',
        text: `${name} runs at the yard wall, jumps, and the gale does the rest. Two bedsheets and a mop handle carry them over the razor wire, over the car park and a long way across the moor, until they land in a field of very surprised sheep.\n${tally}\nThe Bugle's headline: BEDSHEET BANDIT FLIES THE NEST.`,
      }
    case 'curtain':
      return {
        title: 'Curtain call',
        text: `The gaolers heave the sack into the props crate to thunderous applause from six officers in the front pew. At eleven the Grimsby Rep's van rumbles out of the gate with the scenery, a papier-mâché Château d'If, and ${name}, who climbs out at a lay-by on the A1 still wearing the Abbé Faria's beard.\n${tally}\nThe Governor's review in the Bugle calls the corpse "utterly convincing, then strangely absent for the curtain call".`,
      }
    case 'bakeoff':
      return {
        title: 'Star baker',
        text: `The crew pack the cameras into their flight cases, and one flight case is heavier than it was. At the studio in Leeds a runner opens it and ${name} climbs out, waves, and walks off through the green room with a tray of cupcakes.\n${tally}\nThe episode airs anyway. Dame Prudence calls the sausage roll "criminally good".`,
      }
    case 'celebrity':
      return {
        title: 'Body double',
        text: `${name} walks out of the gate in Gavin Crumble's coat and sunglasses, into a scrum of photographers, signs three autographs and gets into his car. The driver takes them to a hotel in Leeds. Gavin, meanwhile, is explaining to the night officer that he is famous.\n${tally}\nGavin's memoir, Doing Time, is out in the spring. You are chapter eleven.`,
      }
    case 'royal':
      return {
        title: 'By royal appointment',
        text: `The florist's van leaves with the giant arrangement from the gym, now slightly heavier and smelling of lilies and Brut. ${name} climbs out in a car park in Lincoln and is mistaken for a very tired florist.\n${tally}\nThe Duke has written to the Governor to say what a delightful morning it was, and that the flowers were particularly lively.`,
      }
    case 'greylady':
      return {
        title: 'The Grey Lady',
        text: `The flagstone lifts. Steps go down into the dark, and the old key opens a door nobody has opened since 1887. ${name} follows a cold draught, and for a while something grey walks just ahead, until the Victorian sewer comes out into the river below the moor. Nobody is there when you look back.\n${tally}\nThe chaplain has asked for the crypt to be bricked up again. Quickly.`,
      }
  }
  return null
}
