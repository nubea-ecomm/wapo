import { Skeleton } from './ui/skeleton'

export function ConversationListSkeleton({
  rows = 7,
  decorative = false,
}: {
  rows?: number
  decorative?: boolean
}) {
  return (
    <div
      className="conversation-list-skeleton"
      role={decorative ? undefined : 'status'}
      aria-label={decorative ? undefined : 'Cargando conversaciones'}
      aria-busy={decorative ? undefined : true}
    >
      {Array.from({ length: rows }, (_, index) => (
        <div
          className="conversation-preview conversation-preview-skeleton"
          key={index}
          aria-hidden="true"
        >
          <Skeleton className="conversation-skeleton-avatar" />
          <div className="conversation-preview-body">
            <div className="conversation-preview-heading">
              <Skeleton
                className="conversation-skeleton-name"
                style={{ width: `${48 + (index % 3) * 8}%` }}
              />
              <Skeleton className="conversation-skeleton-time" />
            </div>
            <div className="conversation-preview-text">
              <Skeleton
                className="conversation-skeleton-preview"
                style={{ width: `${70 + (index % 2) * 15}%` }}
              />
            </div>
            <div className="conversation-meta">
              <Skeleton className="conversation-skeleton-assignee" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
