/**
 * Content for the AI Lab games. The real AI writes the words live; the truth always comes from here,
 * so scoring never depends on the AI being right. Every fact is a well-documented one, chosen to be
 * surprising (so a confident AI can plausibly argue either way) and far from health topics.
 *
 * `fallback` texts are used only when no AI provider answers, so the games still work offline.
 */

export type PersuaderQuestion = {
  id: string;
  question: string;
  options: [string, string];
  /** Index of the true option. */
  answer: 0 | 1;
  /** Shown after the round: why the true option is true. */
  why: string;
  fallback: [string, string];
};

export const PERSUADER_QUESTIONS: PersuaderQuestion[] = [
  {
    id: "great-wall", question: "Can you see the Great Wall of China from space with your naked eye?", options: ["Yes", "No"], answer: 1,
    why: "It is long but only a few metres wide, about the colour of the land around it. Astronauts, including China's first, Yang Liwei, report they couldn't see it.",
    fallback: [
      "It's the largest structure humans ever built, over 20,000 km long. Astronauts have photographed it from orbit, and its line across the hills stands out clearly against the landscape.",
      "Width matters, not length: the wall is only about 6 metres wide. From orbit that's like spotting a hair from 3 km away. China's own first astronaut said he looked and couldn't see it.",
    ],
  },
  {
    id: "goldfish", question: "Does a goldfish's memory last only about three seconds?", options: ["Yes", "No"], answer: 1,
    why: "Experiments have trained goldfish to respond to sounds and levers and found they remember for months.",
    fallback: [
      "Goldfish brains are tiny, smaller than a pea, with almost no forebrain. Aquarium keepers note they swim the same loop again and again as if each lap is new to them.",
      "Researchers have trained goldfish to push levers and come to a sound at feeding time, and they still did it months later. A three-second memory couldn't do that.",
    ],
  },
  {
    id: "ten-percent", question: "Do people use only about 10% of their brain?", options: ["Yes", "No"], answer: 1,
    why: "Brain scans show activity across virtually the whole brain over a day, and damage to almost any area has effects.",
    fallback: [
      "Neuroscientists have long noted how much of the brain is 'silent' at any moment. Most neurons are quiet most of the time, which is why the 10% figure appears so often.",
      "Brain scans show activity in nearly every region over a normal day, and injury to almost any small area changes something. There is no unused 90% waiting to be switched on.",
    ],
  },
  {
    id: "bats-blind", question: "Are bats blind?", options: ["Yes", "No"], answer: 1,
    why: "All bat species can see. Many fruit bats see very well; echolocation adds to their vision rather than replacing it.",
    fallback: [
      "Bats navigate by echolocation precisely because their eyes don't work: they evolved sonar to replace sight. That's where the saying 'blind as a bat' comes from.",
      "Every bat species has working eyes, and many fruit bats see well, even in colour. Echolocation is an extra sense for the dark, not a replacement for sight.",
    ],
  },
  {
    id: "lightning-twice", question: "Can lightning strike the same place twice?", options: ["Yes", "No"], answer: 0,
    why: "Tall objects are struck again and again: the Empire State Building is hit around 20 times a year.",
    fallback: [
      "The Empire State Building is struck by lightning about 20 times a year. Tall, pointed objects give lightning the easiest path, so they get hit over and over.",
      "A strike discharges the built-up charge in that spot, so the conditions that attracted it are gone. That is why the old saying has survived for centuries.",
    ],
  },
  {
    id: "tomato", question: "Botanically, is a tomato a fruit?", options: ["Yes", "No"], answer: 0,
    why: "A fruit grows from a flower's ovary and holds seeds. Tomatoes do both. 'Vegetable' is a cooking term, not a botanical one.",
    fallback: [
      "In botany, a fruit is the part that grows from the flower and carries the seeds. A tomato does exactly that, which makes it a fruit, like a cucumber or a pepper.",
      "The US Supreme Court ruled in 1893 that the tomato is a vegetable, and it's eaten as one in salads and sauces. Official classification puts it with the vegetables.",
    ],
  },
  {
    id: "everest-mauna-kea", question: "From base to peak, which mountain is taller?", options: ["Mount Everest", "Mauna Kea"], answer: 1,
    why: "Mauna Kea rises about 10,200 m from its base on the sea floor; Everest is 8,849 m above sea level but much less from its own base.",
    fallback: [
      "Everest stands 8,849 m, the highest point on Earth by a wide margin. No mountain anywhere comes close, which is why it's the goal of every climber.",
      "Measured from its base on the Pacific sea floor, Mauna Kea rises about 10,200 m. Most of it is under water, which is why Everest gets the fame.",
    ],
  },
  {
    id: "sharks-trees", question: "Which existed first on Earth: sharks or trees?", options: ["Sharks", "Trees"], answer: 0,
    why: "The oldest shark fossils are around 450 million years old; the first trees appeared about 385 million years ago.",
    fallback: [
      "Fossil shark scales date to about 450 million years ago. The first true trees appeared around 385 million years ago, so sharks are older by tens of millions of years.",
      "Life moved onto land with plants first, and forests changed the air and oceans. The large ocean predators that came after depended on that richer world.",
    ],
  },
  {
    id: "oxford-aztec", question: "Which is older: Oxford University or the Aztec city of Tenochtitlan?", options: ["Oxford University", "Tenochtitlan"], answer: 0,
    why: "Teaching at Oxford existed by 1096; Tenochtitlan was founded around 1325.",
    fallback: [
      "Teaching was going on at Oxford by 1096. Tenochtitlan, the Aztec capital, was founded around 1325, more than two centuries later.",
      "Ancient American civilisations were thriving long before Europe's universities. The Aztec capital belongs to that much older world of pyramids and empires.",
    ],
  },
  {
    id: "cleopatra", question: "Did Cleopatra live closer in time to the Moon landing than to the building of the Great Pyramid?", options: ["Yes", "No"], answer: 0,
    why: "The Great Pyramid was built around 2560 BC; Cleopatra died in 30 BC, about 2,500 years later and about 2,000 years before 1969.",
    fallback: [
      "The Great Pyramid was finished around 2560 BC. Cleopatra died in 30 BC: about 2,530 years after it, but only about 2,000 years before the Moon landing.",
      "Cleopatra was an Egyptian pharaoh, part of the same ancient Egypt as the pyramids. Ancient history and the space age are worlds apart.",
    ],
  },
  {
    id: "venus-mercury", question: "Which planet is hotter on average: Mercury or Venus?", options: ["Mercury", "Venus"], answer: 1,
    why: "Venus's thick carbon-dioxide atmosphere traps heat, keeping it around 465 °C everywhere; Mercury has no such blanket and swings between about 430 °C and −180 °C.",
    fallback: [
      "Mercury is the closest planet to the Sun, receiving several times more sunlight than Venus. Its daytime side reaches about 430 °C.",
      "Venus's thick carbon-dioxide atmosphere traps heat everywhere, day and night, at about 465 °C. Mercury has no atmosphere, so its night side drops to about −180 °C.",
    ],
  },
  {
    id: "banana-berry", question: "Botanically, is a banana a berry?", options: ["Yes", "No"], answer: 0,
    why: "A berry forms from one flower with one ovary and has seeds inside its flesh. Bananas qualify; strawberries, oddly, don't.",
    fallback: [
      "A botanical berry grows from a single ovary and keeps its seeds inside the flesh. Bananas fit this exactly, as do grapes and tomatoes.",
      "Berries are small and soft and grow in clusters on bushes. Bananas grow on large plants and are classed as their own kind of fruit.",
    ],
  },
  {
    id: "glass-liquid", question: "Is old window glass thicker at the bottom because glass slowly flows?", options: ["Yes", "No"], answer: 1,
    why: "At room temperature glass would take far longer than the age of the universe to sag visibly. Old panes were simply uneven and often fitted thick side down.",
    fallback: [
      "Glass is an amorphous solid with no crystal structure, which is why some physicists call it a very slow liquid. Centuries-old cathedral windows show this sag at the bottom.",
      "Calculations show room-temperature glass would need longer than the age of the universe to sag visibly. Old panes were made uneven, and glaziers often fitted the thick edge at the bottom.",
    ],
  },
  {
    id: "napoleon", question: "Was Napoleon unusually short for a Frenchman of his time?", options: ["Yes", "No"], answer: 1,
    why: "He was about 1.69 m, average or a little above for his era. The myth comes partly from French versus English inches and British cartoons.",
    fallback: [
      "His nickname was 'le petit caporal', the little corporal, and caricatures of the time always drew him tiny. His height was recorded as 5 foot 2.",
      "His recorded '5 foot 2' was in French units, which are longer: about 1.69 m, average or above for his time. British cartoons did the rest.",
    ],
  },
  {
    id: "trees-stars", question: "Which is more numerous: trees on Earth or stars in the Milky Way?", options: ["Trees on Earth", "Stars in the Milky Way"], answer: 0,
    why: "A 2015 study in Nature estimated about 3 trillion trees; the Milky Way has roughly 100 to 400 billion stars.",
    fallback: [
      "A 2015 study in Nature counted about 3 trillion trees on Earth. The Milky Way has roughly 100 to 400 billion stars, so trees win by about ten to one.",
      "Our galaxy holds hundreds of billions of stars, a number so vast it's hard to picture. Earth's forests, however big, are limited to one small planet.",
    ],
  },
  {
    id: "pluto-australia", question: "Is Pluto wider than Australia?", options: ["Yes", "No"], answer: 1,
    why: "Pluto is about 2,380 km across; Australia is about 4,000 km from east to west.",
    fallback: [
      "Pluto was a planet for 76 years, a whole world with mountains and glaciers. Even demoted to dwarf planet, it's far bigger than any country.",
      "Pluto is about 2,380 km across. Australia is about 4,000 km from east to west, so Pluto would fit across it with room to spare.",
    ],
  },
  {
    id: "viking-horns", question: "Did Viking warriors wear horned helmets?", options: ["Yes", "No"], answer: 1,
    why: "No horned helmet has been found from the Viking Age. The image comes from 19th-century art and costumes for Wagner's operas.",
    fallback: [
      "Horned helmets appear in Viking images everywhere, and Norse culture valued symbols of animal strength. Ceremonial horned helmets were found in Scandinavia.",
      "The only near-complete Viking helmet ever found, from Gjermundbu, has no horns. The horns come from 19th-century paintings and Wagner opera costumes.",
    ],
  },
  {
    id: "moon-dark-side", question: "Is the far side of the Moon always dark?", options: ["Yes", "No"], answer: 1,
    why: "It gets as much sunlight as the near side; we just never see it from Earth. During a new Moon, the far side is fully lit.",
    fallback: [
      "The Moon always shows us the same face, so the other side never faces our light. That is why it's known as the dark side of the Moon.",
      "The far side gets as much sunlight as the near side: during a new Moon it's fully lit. It's 'dark' only in the old sense of unknown, because we never see it from Earth.",
    ],
  },
];

/** Persuasion techniques the AI may use, named after each round (prebunking: name the trick, then it loses power). */
export const TECHNIQUES = {
  fake_expert: { name: "Fake expert", tell: "Vague authority (“scientists agree”, “experts say”) with no checkable source." },
  false_precision: { name: "False precision", tell: "Exact-sounding numbers that make a claim feel measured when it isn't." },
  bandwagon: { name: "Everyone knows", tell: "“Everyone knows” or “it's well known”: popularity instead of evidence." },
  story: { name: "Vivid story", tell: "A memorable anecdote that feels like proof but is only one case." },
  cherry_pick: { name: "Cherry-picking", tell: "A true detail chosen to point the wrong way, while the deciding fact is left out." },
  real_evidence: { name: "Real evidence", tell: "Checkable facts and mechanisms that actually decide the question." },
} as const;
export type Technique = keyof typeof TECHNIQUES;

export type HuntTopic = {
  id: string;
  topic: string;
  /** Three documented facts the AI must keep true. */
  facts: [string, string, string];
  /** A plausible fabrication used when no AI provider answers. */
  fallbackFake: string;
  /** Why the fallback fabrication is false. */
  fallbackWhy: string;
};

export const HUNT_TOPICS: HuntTopic[] = [
  {
    id: "octopus", topic: "Octopuses",
    facts: ["An octopus has three hearts.", "Octopus blood is blue because it carries oxygen with copper instead of iron.", "About two-thirds of an octopus's neurons are in its arms, not its head."],
    fallbackFake: "Most octopuses live for more than 50 years in the wild.", fallbackWhy: "Most octopus species live only one or two years.",
  },
  {
    id: "venus", topic: "The planet Venus",
    facts: ["A day on Venus is longer than its year.", "Venus is the hottest planet in the solar system, about 465 °C at the surface.", "Venus spins in the opposite direction to most planets."],
    fallbackFake: "Venus has two small moons, discovered in 1971.", fallbackWhy: "Venus has no moons at all.",
  },
  {
    id: "moon", topic: "The Moon",
    facts: ["The Moon drifts about 3.8 cm farther from Earth every year.", "The Moon always shows the same face to Earth.", "Twelve people have walked on the Moon."],
    fallbackFake: "The Moon's gravity is about half as strong as Earth's.", fallbackWhy: "It's about one-sixth of Earth's gravity.",
  },
  {
    id: "everest", topic: "Mount Everest",
    facts: ["The rock at Everest's summit is marine limestone containing sea-creature fossils.", "A 2020 survey measured Everest at 8,849 metres.", "Everest is still rising by a few millimetres a year."],
    fallbackFake: "Everest was first climbed in 1938 by a British expedition.", fallbackWhy: "The first confirmed ascent was in 1953, by Tenzing Norgay and Edmund Hillary.",
  },
  {
    id: "sahara", topic: "The Sahara",
    facts: ["The Sahara is about the size of the United States.", "Around 6,000 to 11,000 years ago the Sahara was green, with lakes and grassland.", "Only about a quarter of the Sahara is covered by sand dunes."],
    fallbackFake: "The Sahara is the largest desert on Earth, larger even than Antarctica.", fallbackWhy: "Antarctica is the largest desert; the Sahara is the largest hot desert.",
  },
  {
    id: "penguins", topic: "Penguins",
    facts: ["Emperor penguin fathers keep the egg warm on their feet through the Antarctic winter.", "Penguins can drink seawater: a gland above their eyes removes the salt.", "Emperor penguins can dive deeper than 500 metres."],
    fallbackFake: "Penguins can fly short distances to escape predators.", fallbackWhy: "No penguin can fly; their wings are flippers built for swimming.",
  },
  {
    id: "bees", topic: "Honeybees",
    facts: ["Honeybees tell each other where food is with a 'waggle dance'.", "A honeybee has five eyes.", "A honeybee queen can lay up to about 2,000 eggs in a day."],
    fallbackFake: "Most worker bees in a hive are male.", fallbackWhy: "Worker bees are all female; males (drones) don't work.",
  },
  {
    id: "mariana", topic: "The Mariana Trench",
    facts: ["The deepest point of the Mariana Trench is nearly 11,000 metres down.", "Two people first reached the bottom in 1960, in the bathyscaphe Trieste.", "The water pressure at the bottom is over 1,000 times that at the surface."],
    fallbackFake: "On clear days, faint sunlight reaches the bottom of the trench.", fallbackWhy: "Sunlight fades out within about 1,000 metres; the bottom is completely dark.",
  },
  {
    id: "bananas", topic: "Bananas",
    facts: ["Botanically, bananas are berries.", "Bananas are very slightly radioactive because of their potassium.", "Most bananas sold worldwide are a single variety, the Cavendish."],
    fallbackFake: "Banana plants are trees with woody trunks.", fallbackWhy: "They're giant herbs: the 'trunk' is tightly rolled leaves, with no wood.",
  },
  {
    id: "lightning", topic: "Lightning",
    facts: ["A lightning bolt can heat the air to about 30,000 °C, hotter than the surface of the Sun.", "Thunder is the sound of air expanding suddenly as lightning heats it.", "The Empire State Building is struck by lightning around 20 times a year."],
    fallbackFake: "Most lightning strikes the ground.", fallbackWhy: "Most lightning stays inside or between clouds.",
  },
  {
    id: "saturn", topic: "Saturn",
    facts: ["Saturn is less dense than water.", "A day on Saturn lasts about 10.7 hours.", "Saturn has more than 100 known moons."],
    fallbackFake: "Saturn's main rings are about 50 kilometres thick.", fallbackWhy: "They're mostly only about 10 metres thick, at most around a kilometre.",
  },
  {
    id: "eiffel", topic: "The Eiffel Tower",
    facts: ["The Eiffel Tower was finished in 1889 for a World's Fair in Paris.", "In summer heat the tower grows about 15 cm taller as the iron expands.", "The tower is about 330 metres tall today, including its antennas."],
    fallbackFake: "The tower took eight years to build.", fallbackWhy: "It was built in just over two years, from 1887 to 1889.",
  },
];

/** Starting stake for one Fabrication Hunt game; wagers move it up or down. */
export const HUNT_STAKE = 6;
export const HUNT_ROUNDS = 4;
export const PERSUADER_ROUNDS = 5;
