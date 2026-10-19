import { useEffect, useState } from 'react'
import type { LogEntry } from '@wapo/sdk'
import { Search, RefreshCw, Pause, Play, AlertTriangle } from 'lucide-react'
import { usePaged } from '../hooks/use-paged'
import {
  PageHeader,
  Empty,
  ErrorNotice,
  Loading,
  LoadMore,
} from '../components/ui'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { NativeSelect } from '../components/ui/native-select'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/table'
import { LogDetail } from '../components/log-detail'
import { useI18n } from '../app/i18n'
import { currentLocale } from '../lib/locale'
import { LogSource } from '../components/log-presentation'
import { logSources, logStatus } from '../lib/logs'

export function EventsPage() {
  const { t } = useI18n()
  const [source, setSource] = useState('')
  const [range, setRange] = useState('24h')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [errors, setErrors] = useState(false)
  const [live, setLive] = useState(true)
  const [selected, setSelected] = useState<LogEntry | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 300)

    return () => clearTimeout(timer)
  }, [search])
  const params = new URLSearchParams({ range })

  if (source) params.set('source', source)

  if (query) params.set('search', query)

  if (errors) params.set('errors_only', 'true')

  const logs = usePaged<LogEntry>(`/v1/logs?${params}`, live)
  const entries = [
    ...new Map(logs.items.map((item) => [item.id, item])).values(),
  ]

  return (
    <>
      <PageHeader
        readOnlyAction
        title="Observabilidad"
        description={t('events.description')}
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLive(!live)}
              aria-pressed={live}
            >
              {live ? <Pause /> : <Play />}
              {live ? 'Pausar' : 'Reanudar'}
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Actualizar registros"
              disabled={logs.isFetching}
              onClick={() => void logs.refetch()}
            >
              <RefreshCw className={logs.isFetching ? 'animate-spin' : ''} />
            </Button>
          </div>
        }
      />
      <div
        className="mb-4 flex flex-wrap gap-2"
        role="group"
        aria-label="Origen de registros"
      >
        {logSources.map((item) => (
          <Button
            key={item.id}
            size="sm"
            variant={source === item.id ? 'secondary' : 'outline'}
            aria-pressed={source === item.id}
            onClick={() => setSource(item.id)}
          >
            {item.color && (
              <span className={`size-2 rounded-full ${item.color}`} />
            )}
            {item.label}
          </Button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            aria-label={t('events.search')}
            placeholder={t('events.searchPlaceholder')}
            maxLength={200}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="w-40">
          <NativeSelect
            aria-label={t('events.period')}
            value={range}
            onChange={(event) => setRange(event.target.value)}
          >
            <option value="1h">Última hora</option>
            <option value="24h">Últimas 24 horas</option>
            <option value="7d">Últimos 7 días</option>
            <option value="30d">Últimos 30 días</option>
          </NativeSelect>
        </div>
        <Button
          variant={errors ? 'secondary' : 'outline'}
          aria-pressed={errors}
          onClick={() => setErrors(!errors)}
        >
          <AlertTriangle />
          {t('events.onlyErrors')}
        </Button>
      </div>
      <ErrorNotice error={logs.error} />
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead className="w-44">{t('events.time')}</TableHead>
              <TableHead className="w-28">{t('events.source')}</TableHead>
              <TableHead>{t('events.summary')}</TableHead>
              <TableHead>{t('events.detail')}</TableHead>
              <TableHead className="w-28">{t('events.duration')}</TableHead>
              <TableHead className="w-28 text-right">
                {t('common.status')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow
                key={entry.id}
                className="cursor-pointer"
                onClick={() => setSelected(entry)}
              >
                <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                  {new Date(entry.created_at).toLocaleString(currentLocale(), {
                    month: 'short',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </TableCell>
                <TableCell>
                  <LogSource source={entry.source} />
                </TableCell>
                <TableCell>
                  <button
                    className="max-w-96 truncate text-left text-sm font-medium text-foreground hover:underline"
                    onClick={(event) => {
                      event.stopPropagation()
                      setSelected(entry)
                    }}
                  >
                    {entry.summary}
                  </button>
                </TableCell>
                <TableCell>
                  <span
                    className="block max-w-80 truncate text-xs text-muted-foreground"
                    title={entry.details}
                  >
                    {entry.details || '-'}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {entry.duration_ms === null
                    ? '-'
                    : `${entry.duration_ms.toFixed(1)} ms`}
                </TableCell>
                <TableCell
                  className={`text-right font-mono text-xs whitespace-nowrap ${entry.is_error ? 'text-destructive' : 'text-muted-foreground'}`}
                >
                  {logStatus(entry)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {logs.isLoading && <Loading variant="table" />}
        {!logs.isLoading && !logs.error && !entries.length && (
          <Empty title={t('events.none')}>{t('noResults')}</Empty>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{entries.length} registros cargados</span>
        <span>{live ? 'Actualización cada 5 segundos' : 'En pausa'}</span>
      </div>
      <LoadMore
        available={logs.hasNextPage}
        busy={logs.isFetchingNextPage}
        load={() => void logs.fetchNextPage()}
      />
      {selected && (
        <LogDetail
          entry={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}
