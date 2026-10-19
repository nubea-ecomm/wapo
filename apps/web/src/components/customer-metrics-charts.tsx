import { BarChart, Bar, CartesianGrid, XAxis, YAxis } from 'recharts'
import type { CustomerMetricsData } from './customer-metrics'
import { ActivityChart } from './activity-chart'
import { Panel, Empty } from './ui'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from './ui/chart'
export default function CustomerMetricsCharts({
  data,
}: {
  data: CustomerMetricsData
}) {
  const types = [
    { name: 'Dedicada', count: data.connection_types.dedicated },
    { name: 'Coexistence', count: data.connection_types.coexistence },
    { name: 'Sin clasificar', count: data.connection_types.unknown },
  ]
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Panel title="Mensajes por día">
        <ActivityChart
          series={data.series}
          outboundLabel="Salientes"
        />
      </Panel>
      <Panel title="Tipos de conexión">
        {data.connections ? (
          <div
            role="img"
            aria-label="Conexiones dedicadas y Coexistence"
          >
            <ChartContainer
              config={{
                count: { label: 'Conexiones', color: 'var(--chart-1)' },
              }}
              className="h-[260px] w-full aspect-auto"
            >
              <BarChart
                accessibilityLayer
                layout="vertical"
                data={types}
                margin={{ left: 0, right: 20, top: 20, bottom: 20 }}
              >
                <CartesianGrid horizontal={false} />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={100}
                  axisLine={false}
                  tickLine={false}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="count"
                  fill="var(--color-count)"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={24}
                  isAnimationActive={false}
                />
              </BarChart>
            </ChartContainer>
          </div>
        ) : (
          <Empty title="Sin conexiones" />
        )}
      </Panel>
    </div>
  )
}
