// Preset wheels (PLAN §6.10), shared by the web app, landing pages, CLI and MCP.
// Every name here is invented for Whirlpick (synthetic data only); the country list and the
// truth-or-dare prompts are written by us.
import { toHex, utf8 } from './bytes.js';
import { WhirlError } from './errors.js';
import { H } from './hash.js';
import { normaliseEntries } from './labels.js';
import { createProject, createWheel } from './project.js';
import type { EntryIn, Preset, WhirlProject } from './types.js';

/** The synthetic first names used across presets, fixtures, goldens and screenshots. */
export const SYNTHETIC_NAMES = [
  'Ada', 'Grace', 'Linus', 'Margaret', 'Priya', 'Tomas', 'Amara', 'Kenji', 'Sofia', 'Mateo',
  'Zara', 'Oskar', 'Lena', 'Ravi', 'Nadia', 'Felix', 'Imani', 'Hugo', 'Mei', 'Omar',
  'Ines', 'Theo', 'Yara', 'Idris', 'Elsa', 'Kofi', 'Noor', 'Arlo', 'Freya', 'Jonah',
  'Leila', 'Bruno', 'Anika', 'Dario', 'Suki', 'Emeka',
] as const;

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export const COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda', 'Argentina', 'Armenia', 'Australia', 'Austria',
  'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan',
  'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi', 'Cabo Verde', 'Cambodia',
  'Cameroon', 'Canada', 'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros', 'Congo', 'Costa Rica',
  "Côte d'Ivoire", 'Croatia', 'Cuba', 'Cyprus', 'Czechia', 'DR Congo', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic',
  'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia', 'Fiji', 'Finland',
  'France', 'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Guinea',
  'Guinea-Bissau', 'Guyana', 'Haiti', 'Honduras', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq',
  'Ireland', 'Israel', 'Italy', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kiribati', 'Kuwait',
  'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg',
  'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Marshall Islands', 'Mauritania', 'Mauritius', 'Mexico',
  'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar', 'Namibia', 'Nauru',
  'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Korea', 'North Macedonia', 'Norway', 'Oman',
  'Pakistan', 'Palau', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal', 'Qatar',
  'Romania', 'Russia', 'Rwanda', 'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Samoa', 'San Marino', 'São Tomé and Príncipe', 'Saudi Arabia',
  'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia', 'South Africa',
  'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria', 'Tajikistan',
  'Tanzania', 'Thailand', 'Timor-Leste', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia', 'Türkiye', 'Turkmenistan', 'Tuvalu',
  'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan', 'Vanuatu', 'Venezuela', 'Vietnam',
  'Yemen', 'Zambia', 'Zimbabwe',
  // UN observer states
  'Vatican City', 'Palestine',
] as const;

const FOOD = [
  'Tacos', 'Ramen', 'Margherita pizza', 'Pad thai', 'Falafel wrap', 'Sushi', 'Chickpea curry', 'Burgers', 'Pho', 'Lasagne',
  'Bibimbap', 'Fish and chips', 'Burrito bowl', 'Dumplings', 'Shakshuka', 'Caesar salad', 'Paella', 'Butter chicken', 'Mac and cheese', 'Poke bowl',
];

const CHORES = ['Dishes', 'Vacuuming', 'Bins out', 'Bathroom', 'Laundry', 'Groceries', 'Mopping', 'Dusting', 'Plants', 'Recycling'];

/** Family-friendly prompts shown after the Truth / Dare spin (written by us). */
export const TRUTH_OR_DARE_PROMPTS: Record<string, string[]> = {
  Truth: [
    'What is the funniest thing that happened to you this year?',
    'Which song do you secretly know every word of?',
    'What was your favourite toy as a small child?',
    'If you could swap lives with anyone here for a day, who would it be?',
    'What is the strangest food you have ever tried?',
    'What is one thing on your bucket list?',
    'What was your most embarrassing moment at school?',
    'Which fictional character would you want as a best friend?',
    'What is a small thing that always makes your day better?',
    'What talent do you wish you had?',
  ],
  Dare: [
    'Speak in a pirate voice until your next turn.',
    'Do your best impression of someone in the room (kindly).',
    'Balance a spoon on your nose for ten seconds.',
    'Sing the chorus of any song, loudly.',
    'Do ten star jumps.',
    'Tell a joke. If nobody laughs, tell another.',
    'Walk like a penguin to the door and back.',
    'Say the alphabet backwards as fast as you can.',
    'Hold a plank for twenty seconds.',
    'Invent a dance move and teach it to the group.',
  ],
};

const SKILLED: EntryIn[] = SYNTHETIC_NAMES.slice(0, 16).map((label, i) => ({ label, tags: [String((i % 3) + 1)] }));

export const PRESETS: Preset[] = [
  { id: 'blank', title: 'Blank wheel', entries: [], settings: {} },
  { id: 'names-sample', title: 'Name picker', slug: 'random-name-picker', entries: SYNTHETIC_NAMES.slice(0, 12).slice(), settings: { title: "Who's next?" } },
  { id: 'yes-no', title: 'Yes or no', slug: 'yes-or-no-wheel', entries: ['Yes', 'No'], settings: { title: 'Yes or no?' } },
  { id: 'yes-no-maybe', title: 'Yes, no or maybe', entries: ['Yes', 'No', 'Maybe'], settings: { title: 'Yes, no or maybe?' } },
  { id: 'coin', title: 'Coin flip', entries: ['Heads', 'Tails'], settings: { title: 'Heads or tails?' } },
  { id: 'numbers-1-10', title: 'Numbers 1–10', slug: 'random-number-wheel', entries: range(1, 10).map(String), settings: { title: 'Pick a number' } },
  { id: 'numbers-1-100', title: 'Numbers 1–100', entries: range(1, 100).map(String), settings: { title: 'Pick a number' } },
  { id: 'numbers', title: 'Number range', entries: range(1, 10).map(String), settings: { title: 'Pick a number' } },
  { id: 'letters', title: 'Letters A–Z', slug: 'letter-wheel', entries: range(65, 90).map((c) => String.fromCharCode(c)), settings: { title: 'Pick a letter' } },
  { id: 'food', title: 'What should I eat?', slug: 'what-should-i-eat-wheel', entries: FOOD, settings: { title: 'What should I eat?' } },
  { id: 'truth-or-dare', title: 'Truth or dare', slug: 'truth-or-dare-wheel', entries: ['Truth', 'Dare'], settings: { title: 'Truth or dare?' }, prompts: TRUTH_OR_DARE_PROMPTS },
  { id: 'decision', title: 'Decision wheel', slug: 'decision-wheel', entries: ['Option A', 'Option B', 'Option C', 'Option D'], settings: { title: 'Decide for me' } },
  { id: 'chores', title: 'Chore wheel', slug: 'chore-wheel', entries: CHORES, settings: { title: 'Chores this week', mode: 'elimination' } },
  { id: 'countries', title: 'Country wheel', slug: 'country-wheel', entries: COUNTRIES.slice(), settings: { title: 'Pick a country' } },
  { id: 'raffle-sample', title: 'Raffle draw', slug: 'raffle-winner-picker', entries: range(1, 30).map((n) => `Ticket ${String(n).padStart(3, '0')}`), settings: { title: 'Raffle draw', mode: 'multi', multi: { count: 3 }, fairDraw: true } },
  { id: 'class-sample', title: 'Class list', slug: 'classroom-name-picker', entries: SYNTHETIC_NAMES.slice(0, 24).slice(), settings: { title: 'Class 4B', mode: 'elimination' } },
  { id: 'teams-sample', title: 'Team generator', slug: 'random-team-generator', entries: SKILLED, settings: { title: 'Make teams', mode: 'teams', teams: { by: 'count', count: 4, balance: true } } },
  { id: 'order-sample', title: 'Presentation order', slug: 'list-randomizer', entries: SYNTHETIC_NAMES.slice(0, 8).slice(), settings: { title: 'Presentation order', mode: 'multi', multi: { count: 'all', reveal: 'instant' } } },
];

export const MAX_NUMBER_VALUES = 1000;

/** A preset by id; `numbers` takes {min, max} (≤ 1000 values). Throws PRESET_PARAMS_INVALID / ENTRY_LIMIT. */
export function presetById(id: string, params: Record<string, string> = {}): Preset | undefined {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) return undefined;
  if (id !== 'numbers' || (params.min === undefined && params.max === undefined)) return p;
  const min = Number(params.min ?? 1);
  const max = Number(params.max ?? 10);
  if (!Number.isInteger(min) || !Number.isInteger(max) || min > max || Math.abs(min) > 1e9 || Math.abs(max) > 1e9) {
    throw new WhirlError('PRESET_PARAMS_INVALID', 'numbers needs whole-number min ≤ max.', { min: params.min, max: params.max });
  }
  if (max - min + 1 > MAX_NUMBER_VALUES) throw new WhirlError('ENTRY_LIMIT', `A number wheel can have at most ${MAX_NUMBER_VALUES} values (${min}–${max} is ${max - min + 1}).`, { min, max });
  return { ...p, title: `Numbers ${min}–${max}`, entries: range(min, max).map(String) };
}

/** Stable ids for preset entries so preset projects are byte-for-byte reproducible. */
function stableId(prefix: string, key: string): string {
  const h = toHex(H(utf8(`whirlpick-preset:${key}`)));
  return `${prefix}_${h.slice(0, 8)}`;
}

/** A preset as a one-wheel whirl-v1 project (stable ids; `now` fixes the timestamps). */
export function presetProject(p: Preset, opts: { now?: string; generator?: string } = {}): WhirlProject {
  const withIds = p.entries.map((e, i) => ({ ...(typeof e === 'string' ? { label: e } : e), id: stableId('e', `${p.id}:${i}`) }));
  const { entries } = normaliseEntries(withIds);
  const wheel = createWheel(entries, { id: stableId('w', p.id), name: p.title, settings: p.settings });
  return createProject([wheel], { ...(opts.now ? { now: opts.now } : {}), ...(opts.generator ? { generator: opts.generator } : {}) });
}
