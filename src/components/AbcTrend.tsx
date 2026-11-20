import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { MockSummary } from '../api'

/** A / B / C wrong answers across recent full & sectional mocks (oldest → newest). */
export default function AbcTrend({ mocks }: { mocks: MockSummary[] }) {
  const data = mocks.filter((m) => m.source === 'mock').slice(0, 10).reverse()
    .map((m) => ({ name: m.name.length > 14 ? m.name.slice(0, 13) + '…' : m.name, full: m.name, A: m.abc.A, B: m.abc.B, C: m.abc.C }))
  if (data.length < 2) return <p className="text-[12.5px] text-gray-500">Needs two reviewed mocks. Tap A/B/C in each mock’s review to see the trend.</p>
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ left: -24, right: 12, top: 6 }}>
        <CartesianGrid vertical={false} stroke="#F3F4F6" />
        <XAxis dataKey="name" tick={{ fontSize: 10.5, fill: '#6B7280' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
        <Tooltip labelFormatter={(_l: any, p: any) => p?.[0]?.payload.full ?? _l} contentStyle={{ fontSize: 12, borderRadius: 10 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
        <Line dataKey="A" name="A · Comprehension" stroke="#6366F1" strokeWidth={2} dot={{ r: 3 }} />
        <Line dataKey="B" name="B · Optimal approach" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }} />
        <Line dataKey="C" name="C · Careless" stroke="#EF4444" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}
