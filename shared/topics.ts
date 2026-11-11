// Copied from the Game Changer repo (app/src/schema.js): 7 areas, 38 topics.
export const SCHEMA = {
  Arithmetic: [
    'TSD - Circular Tracks',
    'TSD - Boats & Streams',
    'TSD - Relative Speed',
    'Percentages - Successive Change',
    'Averages',
    'Ratio & Proportion',
    'Time & Work',
    'Simple & Compound Interest',
    'Profit & Loss',
    'Mixtures & Alligations',
  ],
  Algebra: [
    'Linear Equations',
    'Quadratic Equations',
    'Functions & Graphs',
    'Inequalities',
    'Logarithms',
    'Progressions (AP/GP)',
  ],
  Geometry: ['Circles', 'Triangles', 'Mensuration - 3D', 'Coordinate Geometry', 'Polygons'],
  'Number System': ['LCM & HCF', 'Divisibility Rules', 'Remainders & Cyclicity', 'Factors & Multiples'],
  'Modern Math': ['Permutation & Combination', 'Probability', 'Set Theory', 'Data Sufficiency'],
  'Data Interpretation': ['Tables', 'Bar Graphs', 'Line Graphs', 'Caselets', 'Pie Charts'],
  Verbal: ['Reading Comprehension', 'Para Jumbles', 'Critical Reasoning', 'Vocabulary'],
} as const

export type Area = keyof typeof SCHEMA
export type Topic = (typeof SCHEMA)[Area][number]

export const AREAS = Object.keys(SCHEMA) as Area[]
export const TOPICS = Object.values(SCHEMA).flat() as unknown as [Topic, ...Topic[]]

export function areaOf(topic: string): Area | undefined {
  return AREAS.find((a) => (SCHEMA[a] as readonly string[]).includes(topic))
}

// ---------- Sections (FIXES round 1, Fix 1): Section → Area → Topic ----------
// Same 38 topics. Data Sufficiency sits in DILR (the schema lists it under Modern Math).
// VARC's "areas" are its four topics.
export const SECTIONS = {
  Quant: {
    Arithmetic: SCHEMA.Arithmetic,
    Algebra: SCHEMA.Algebra,
    Geometry: SCHEMA.Geometry,
    'Number System': SCHEMA['Number System'],
    'Modern Math': SCHEMA['Modern Math'].filter((t) => t !== 'Data Sufficiency'),
  },
  VARC: {
    'Reading Comprehension': ['Reading Comprehension'],
    'Para Jumbles': ['Para Jumbles'],
    'Critical Reasoning': ['Critical Reasoning'],
    Vocabulary: ['Vocabulary'],
  },
  DILR: {
    'Data Interpretation': SCHEMA['Data Interpretation'],
    'Data Sufficiency': ['Data Sufficiency'],
  },
} as const satisfies Record<string, Record<string, readonly string[]>>

export type Section = keyof typeof SECTIONS
export const SECTION_NAMES = Object.keys(SECTIONS) as [Section, ...Section[]]

export function sectionOf(topic: string): Section | undefined {
  return SECTION_NAMES.find((s) => Object.values(SECTIONS[s]).some((ts) => (ts as readonly string[]).includes(topic)))
}
/** The section area a topic belongs to (e.g. 'Data Sufficiency' → 'Data Sufficiency' in DILR). */
export function sectionAreaOf(topic: string): string | undefined {
  const s = sectionOf(topic)
  return s && Object.entries(SECTIONS[s]).find(([, ts]) => (ts as readonly string[]).includes(topic))?.[0]
}
export function topicsIn(scope: { section?: string; area?: string; topic?: string }): string[] {
  if (scope.topic) return TOPICS.includes(scope.topic as Topic) ? [scope.topic] : []
  const secs = scope.section ? [scope.section as Section] : SECTION_NAMES
  return secs.flatMap((s) => Object.entries(SECTIONS[s] ?? {}).filter(([a]) => !scope.area || a === scope.area).flatMap(([, ts]) => [...ts]))
}
/** The section most rows belong to (save_mock without `section`). */
export function majoritySection(topics: string[]): Section {
  const n = new Map<Section, number>()
  for (const t of topics) { const s = sectionOf(t); if (s) n.set(s, (n.get(s) ?? 0) + 1) }
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Quant'
}
