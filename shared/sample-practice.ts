// Demo-account practice questions and a sample note (seed only).
type Q = [topic: string, difficulty: 'easy' | 'medium' | 'hard', text: string, options: string[], correct: number, ideal: number,
  type: [string, string, string, number], approach: [string, string, string, number], notes: string, hints: string[]]

const QS: Q[] = [
  ['Time & Work', 'easy', 'A can finish a job in 10 days and B in 15 days. In how many days can they finish it together?', ['5', '6', '7.5', '12.5'], 1, 60,
    ['Combined work rate', 'Work and wages', 'Pipes and cisterns with a leak', 0], ['Take total work = LCM(10, 15) = 30 units', 'Average the two times', 'Try each option', 0],
    'Work = 30 units. A = 3/day, B = 2/day. Together 5/day → 6 days.', ['Make the total work a number both days divide.', 'LCM of 10 and 15 is 30 units.']],
  ['Time & Work', 'medium', 'A can finish a job in 12 days and B in 18 days. They work together for 4 days, then A leaves. How many more days does B take?', ['6', '7', '8', '9'], 2, 120,
    ['Work done together, then one leaves', 'Work and wages', 'Pipes and cisterns', 0], ['Use the LCM of days as total work', 'Use fractions per day', 'Try each option', 0],
    'Total 36 units. A = 3/day, B = 2/day. 4 days together = 20. Left 16 ÷ 2 = 8 days.', ['Find what is done in the first 4 days.', '36 units: together they do 5 a day.']],
  ['Time & Work', 'hard', '12 men can finish a job in 10 days. After 4 days, 4 more men join. How many days in total does the job take?', ['8', '8.5', '9', '9.5'], 1, 150,
    ['Man-days with a change in workforce', 'Efficiency comparison of men and women', 'Work and wages', 0], ['Count man-days: 120 total', 'Ratio of men', 'Try each option', 0],
    'Total 120 man-days. 4 days × 12 = 48. Left 72 ÷ 16 = 4.5 days. Total 8.5.', ['Work = men × days.', 'After 4 days, 72 man-days are left for 16 men.']],
  ['Probability', 'easy', 'A fair coin is tossed 3 times. What is the probability of exactly 2 heads?', ['1/8', '1/4', '3/8', '1/2'], 2, 60,
    ['Binomial: exactly k successes', 'At least one success', 'Conditional probability', 0], ['3C2 ÷ 2³', 'List all 8 outcomes', 'Use complements', 0],
    '3C2 = 3 ways out of 8: 3/8.', ['How many ways can 2 of the 3 tosses be heads?']],
  ['Probability', 'medium', 'Two dice are thrown. What is the probability that the sum is 8?', ['1/9', '5/36', '1/6', '7/36'], 1, 90,
    ['Sum of two dice', 'At least one six', 'Conditional probability', 0], ['Count pairs: (2,6), (3,5), (4,4), (5,3), (6,2)', 'Use a formula for sums', 'Simulate', 0],
    'Five favourable pairs out of 36: 5/36.', ['List the pairs that add to 8.', 'Remember (4,4) counts once.']],
  ['Probability', 'hard', 'A bag has 4 red and 6 blue balls. Two are drawn without replacement. What is the probability both are red?', ['2/15', '4/25', '1/5', '6/25'], 0, 120,
    ['Drawing without replacement', 'Drawing with replacement', 'Expected value', 0], ['4C2 ÷ 10C2', '(4/10)²', 'Complement of no red', 0],
    '4C2 = 6, 10C2 = 45 → 6/45 = 2/15.', ['The second draw has one less ball.', 'Count pairs: 4C2 out of 10C2.']],
]

export const SAMPLE_PRACTICE = QS.map(([topic, difficulty, text, options, correct_index, ideal_seconds, t, a, solution_notes, hints]) => ({
  topic, difficulty, text, options, correct_index, ideal_seconds,
  type_options: t.slice(0, 3) as string[], type_answer: t[3],
  approach_options: a.slice(0, 3) as string[], approach_answer: a[3],
  solution_notes, hints, source: 'Sample set',
}))

export const SAMPLE_NOTE = {
  topic: 'Time & Work',
  title: 'Sample — Time & Work: the LCM method',
  summary:
    'Treat the whole job as a number of units that every given time divides: the LCM of the days. Each person’s rate is then a whole number of units per day, so adding rates, removing a worker, or adding a leak becomes simple addition and subtraction. For groups of people, count man-days: the job needs the same man-days however the work is split.',
  formulas: ['Total work = LCM(days of each worker)', 'Rate = total work ÷ days', 'Time together = total work ÷ (sum of rates)', 'Men₁ × Days₁ = Men₂ × Days₂ (same job)'],
  flashcards: [
    { front: 'Why use the LCM of the days as total work?', back: 'Every worker’s rate becomes a whole number of units per day.' },
    { front: 'A does a job in 10 days, B in 15. Total work and rates?', back: '30 units. A = 3/day, B = 2/day.' },
    { front: 'How do you handle a worker who leaves after some days?', back: 'Subtract the work done together, then divide what is left by the remaining rate.' },
    { front: 'What stays the same for one job across different teams?', back: 'Man-days: men × days.' },
    { front: '12 men take 10 days. How many man-days is the job?', back: '120 man-days.' },
    { front: 'A pipe fills in 6 h, a leak empties in 12 h. Net rate with LCM 12?', back: '+2 − 1 = 1 unit/h → 12 hours.' },
  ],
  source: 'Sample note',
}
