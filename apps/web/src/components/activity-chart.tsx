import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from './ui/chart'
export interface ActivityPoint {
  day: string
  outbound: number
  inbound: number
  failed?: number
}
const config = {
  outbound: { label: 'Enviados', color: 'var(--chart-1)' },
  inbound: { label: 'Recibidos', color: 'var(--chart-2)' },
  failed: { label: 'Fallidos', color: 'var(--destructive)' },
} satisfies ChartConfig
export function ActivityChart({
  series,
  outboundLabel = 'Enviados',
}: {
  series: ActivityPoint[]
  outboundLabel?: string
}) {
  return (
    <div
      role="img"
      aria-label={`Mensajes ${outboundLabel.toLowerCase()} y recibidos por día en el período seleccionado`}
    >
      <ChartContainer
        config={{ ...config, outbound: { ...config.outbound, label: outboundLabel } }}
        className="h-[260px] w-full aspect-auto"
      >
        <LineChart
          accessibilityLayer
          data={series}
          margin={{ top: 12, right: 12, left: -20, bottom: 0 }}
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            minTickGap={35}
            tickMargin={12}
            tickFormatter={(value: string) => value.slice(5).replace('-', '/')}
          />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} />
          <ChartTooltip
            content={<ChartTooltipContent labelFormatter={(label) => `${label} / UTC`} />}
          />
          <Line
            dataKey="outbound"
            type="linear"
            stroke="var(--color-outbound)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="inbound"
            type="linear"
            stroke="var(--color-inbound)"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
          />
          {series.some((point) => (point.failed || 0) > 0) && (
            <Line
              dataKey="failed"
              type="linear"
              stroke="var(--color-failed)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          )}
          <ChartLegend content={<ChartLegendContent />} />
        </LineChart>
      </ChartContainer>
    </div>
  )
}
