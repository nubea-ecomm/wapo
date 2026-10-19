import { Skeleton } from './ui/skeleton'

export type SkeletonVariant =
  'list' | 'table' | 'cards' | 'chart' | 'thread' | 'settings' | 'inbox' | 'overview'

export function ContentSkeleton({
  variant = 'list',
  rows = 4,
  decorative = false,
}: {
  variant?: SkeletonVariant
  rows?: number
  decorative?: boolean
}) {
  return (
    <div
      role={decorative ? undefined : 'status'}
      aria-label={decorative ? undefined : 'Cargando contenido'}
      aria-hidden={decorative || undefined}
      aria-busy={decorative ? undefined : true}
      data-skeleton={variant}
      className="w-full"
    >
      {!decorative && <span className="sr-only">Cargando…</span>}
      {variant === 'table' ? (
        <TableSkeleton rows={rows} />
      ) : variant === 'cards' ? (
        <CardsSkeleton />
      ) : variant === 'chart' ? (
        <ChartSkeleton />
      ) : variant === 'thread' ? (
        <ThreadSkeleton />
      ) : variant === 'settings' ? (
        <SettingsSkeleton />
      ) : variant === 'inbox' ? (
        <InboxSkeleton />
      ) : variant === 'overview' ? (
        <OverviewSkeleton />
      ) : (
        <ListSkeleton rows={rows} />
      )}
    </div>
  )
}

export function RouteSkeleton({ path }: { path: string }) {
  const variant: SkeletonVariant =
    path === '/'
      ? 'overview'
      : path.startsWith('/inbox')
        ? 'inbox'
        : path === '/connections'
          ? 'cards'
          : path.startsWith('/settings') ||
              path.startsWith('/customers/') ||
              path.startsWith('/connections/')
            ? 'settings'
            : 'table'
  return (
    <div role="status" aria-label="Cargando pantalla" aria-busy="true" className="w-full">
      <span className="sr-only">Cargando pantalla…</span>
      <div className="mb-7 flex items-start justify-between gap-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-3 w-64 max-w-[70vw]" />
        </div>
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>
      <ContentSkeleton variant={variant} decorative />
    </div>
  )
}

function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="grid grid-cols-[minmax(170px,2fr)_minmax(110px,1fr)_minmax(90px,1fr)_40px] gap-4 border-b bg-muted/30 px-4 py-3">
        {[42, 28, 36, 8].map((width, index) => (
          <Skeleton key={index} className="h-2.5" style={{ width }} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="grid min-h-16 grid-cols-[minmax(170px,2fr)_minmax(110px,1fr)_minmax(90px,1fr)_40px] items-center gap-4 border-b px-4 py-3 last:border-0"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="size-8 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-32 max-w-full" />
              <Skeleton className="h-2.5 w-24 max-w-[80%]" />
            </div>
          </div>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="ml-auto size-7 rounded-md" />
        </div>
      ))}
    </div>
  )
}

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="flex min-h-16 items-center gap-3 border-b py-3 last:border-0"
        >
          <Skeleton className="size-9 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-36 max-w-[70%]" />
            <Skeleton className="h-2.5 w-24 max-w-[55%]" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  )
}

function CardsSkeleton() {
  return (
    <div className="connection-grid">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="rounded-lg border p-5">
          <div className="mb-6 flex items-center justify-between">
            <Skeleton className="size-9 rounded-md" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="mb-2 h-4 w-36" />
          <Skeleton className="mb-6 h-3 w-28" />
          <div className="grid grid-cols-[80px_1fr] gap-x-4 gap-y-3 border-t pt-4">
            {[0, 1, 2].map((row) => (
              <div className="contents" key={row}>
                <Skeleton className="h-2.5 w-14" />
                <Skeleton className="h-2.5 w-24" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function ChartSkeleton() {
  return (
    <div className="relative h-[260px] border-b border-l px-5 pb-5 pt-8">
      <div className="absolute inset-x-0 top-1/4 border-t border-dashed" />
      <div className="absolute inset-x-0 top-1/2 border-t border-dashed" />
      <div className="absolute inset-x-0 top-3/4 border-t border-dashed" />
      <div className="flex h-full items-end gap-3">
        {[38, 62, 46, 78, 58, 88, 52, 70].map((height, index) => (
          <Skeleton
            key={index}
            className="min-w-2 flex-1 rounded-t-sm rounded-b-none"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
    </div>
  )
}

function ThreadSkeleton() {
  return (
    <div className="flex min-h-96 flex-col p-5">
      <div className="mb-8 flex items-center gap-3 border-b pb-4">
        <Skeleton className="size-9 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-2.5 w-20" />
        </div>
      </div>
      <div className="flex flex-col gap-5">
        {[60, 48, 68, 42].map((width, index) => (
          <div
            key={index}
            className={index % 2 ? 'self-end' : ''}
            style={{ width: `${width}%` }}
          >
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className={`mt-2 h-2 w-12 ${index % 2 ? 'ml-auto' : ''}`} />
          </div>
        ))}
      </div>
      <Skeleton className="mt-auto h-16 w-full rounded-lg" />
    </div>
  )
}

function SettingsSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.6fr)]">
      <div className="space-y-5 rounded-lg border p-5">
        <div className="space-y-2 border-b pb-4">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-64 max-w-full" />
        </div>
        {[0, 1, 2].map((index) => (
          <div className="space-y-2" key={index}>
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        ))}
        <Skeleton className="ml-auto h-9 w-28 rounded-md" />
      </div>
      <div className="space-y-4 rounded-lg border p-5">
        <Skeleton className="size-14 rounded-lg" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    </div>
  )
}

function InboxSkeleton() {
  return (
    <div className="inbox overflow-hidden">
      <section className="conversation-list">
        <div className="inbox-tools">
          <Skeleton className="h-9 flex-1 rounded-md" />
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
        <ListSkeleton rows={5} />
      </section>
      <section className="thread-panel">
        <ThreadSkeleton />
      </section>
    </div>
  )
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="space-y-3 rounded-lg border p-4" key={index}>
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-2.5 w-24" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border p-5">
        <Skeleton className="mb-2 h-4 w-36" />
        <Skeleton className="mb-6 h-3 w-52" />
        <ChartSkeleton />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((column) => (
          <div className="rounded-lg border p-5" key={column}>
            <Skeleton className="mb-4 h-4 w-32" />
            <ListSkeleton rows={3} />
          </div>
        ))}
      </div>
    </div>
  )
}
