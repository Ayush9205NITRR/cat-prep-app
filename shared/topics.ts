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
