// A CAT-style basic calculator (immediate execution, like the on-screen one in the exam). Pure, no eval.
export interface Calc { display: string; acc: number | null; op: Op | null; fresh: boolean; memory: number }
export type Op = '+' | '−' | '×' | '÷'
export const initCalc = (): Calc => ({ display: '0', acc: null, op: null, fresh: true, memory: 0 })

const fmt = (n: number) => (!isFinite(n) ? 'Error' : String(Number(n.toPrecision(12))))
const num = (c: Calc) => Number(c.display) || 0
const apply = (a: number, op: Op, b: number) => (op === '+' ? a + b : op === '−' ? a - b : op === '×' ? a * b : a / b)

export function press(c: Calc, key: string): Calc {
  if (c.display === 'Error' && key !== 'C') return c
  if (/^[0-9]$/.test(key)) return { ...c, display: c.fresh || c.display === '0' ? key : (c.display.length < 16 ? c.display + key : c.display), fresh: false }
  switch (key) {
    case '.': return c.fresh ? { ...c, display: '0.', fresh: false } : c.display.includes('.') ? c : { ...c, display: c.display + '.' }
    case '←': return c.fresh ? c : { ...c, display: c.display.length > 1 ? c.display.slice(0, -1) : '0' }
    case 'C': return { ...initCalc(), memory: c.memory }
    case '±': return { ...c, display: fmt(-num(c)) }
    case '√': return { ...c, display: num(c) < 0 ? 'Error' : fmt(Math.sqrt(num(c))), fresh: true }
    case '1/x': return { ...c, display: fmt(1 / num(c)), fresh: true }
    case '%': return { ...c, display: fmt(c.acc !== null ? (c.acc * num(c)) / 100 : num(c) / 100), fresh: true }
    case '+': case '−': case '×': case '÷': {
      const acc = c.acc !== null && c.op && !c.fresh ? apply(c.acc, c.op, num(c)) : num(c)
      return { ...c, acc, op: key, display: fmt(acc), fresh: true }
    }
    case '=': return c.acc === null || !c.op ? { ...c, fresh: true } : { ...c, display: fmt(apply(c.acc, c.op, num(c))), acc: null, op: null, fresh: true }
    case 'MC': return { ...c, memory: 0 }
    case 'MR': return { ...c, display: fmt(c.memory), fresh: true }
    case 'MS': return { ...c, memory: num(c), fresh: true }
    case 'M+': return { ...c, memory: c.memory + num(c), fresh: true }
    case 'M−': return { ...c, memory: c.memory - num(c), fresh: true }
  }
  return c
}
