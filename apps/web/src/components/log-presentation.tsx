import { logSources } from '../lib/logs'
import { Badge } from './ui/badge'
export function LogSource({ source }: { source: string }) {
  const item = logSources.find((item) => item.id === source)
  return (
    <Badge variant="outline" className="gap-1.5 font-normal">
      <span className={`size-1.5 rounded-full ${item?.color || 'bg-neutral-500'}`} />
      {item?.label || source}
    </Badge>
  )
}
