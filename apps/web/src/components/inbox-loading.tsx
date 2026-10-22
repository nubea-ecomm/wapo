import { Skeleton } from './ui/skeleton'
import { ConversationListSkeleton } from './conversation-list-skeleton'
import { ChatLoader } from './chat-loader'

export function InboxLoading({ selected = false }: { selected?: boolean }) {
  return (
    <div
      className={`inbox inbox-skeleton ${selected ? 'has-selection' : ''}`}
      data-skeleton="inbox"
      aria-busy="true"
    >
      <section
        className="conversation-list"
        aria-label="Cargando lista de chats"
      >
        <div className="inbox-list-header">
          <div className="inbox-loading-title">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="size-8 rounded-md" />
          </div>
          <Skeleton className="h-9 w-full rounded-md" />
          <div className="inbox-filters">
            <Skeleton className="h-8 rounded-md" />
            <Skeleton className="h-8 rounded-md" />
          </div>
          <Skeleton className="h-8 w-full rounded-md" />
        </div>
        <div className="conversation-results">
          <ConversationListSkeleton />
        </div>
      </section>
      <section className="thread-panel">
        <ChatLoader full />
      </section>
    </div>
  )
}
