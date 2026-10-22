import { useEffect, useRef } from 'react'
import { useQueryClient, type InfiniteData } from '@tanstack/react-query'
import type { Conversation, Page } from '@nubea-ecomm/wapo-sdk'
import { useSession } from '../app/session-context'

export function useConversationRead(
  id: string,
  conversation: Conversation | undefined,
  loaded: boolean,
  refreshedAt: number,
) {
  const { client, session } = useSession()
  const cache = useQueryClient()
  const busy = useRef(false)
  const marked = useRef('')
  const message = conversation?.last_inbound_message_id

  useEffect(() => {
    const mark = async () => {
      if (
        !loaded ||
        !message ||
        !conversation?.has_unread ||
        busy.current ||
        marked.current === message ||
        document.visibilityState !== 'visible' ||
        !document.hasFocus()
      )
        return

      busy.current = true

      try {
        const result = await client.request<{ data: Conversation }>(
          'POST',
          `/v1/conversations/${encodeURIComponent(id)}/read`,
          { message_id: message },
        )

        marked.current = message
        const update = (item: Conversation) =>
          (item.id === id || item.id === result.data.id) &&
          item.last_inbound_message_id === message
            ? { ...item, has_unread: result.data.has_unread }
            : item

        cache.setQueryData<{ data: Conversation }>(
          [session?.id, `/v1/conversations/${encodeURIComponent(id)}`],
          (old) => old && { data: update(old.data) },
        )
        cache.setQueriesData<InfiniteData<Page<Conversation>>>(
          {
            predicate: (query) =>
              query.queryKey[0] === session?.id &&
              query.queryKey[2] === 'pages' &&
              /^\/v1\/conversations(?:\?|$)/.test(String(query.queryKey[1])),
          },
          (old) =>
            old && {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                data: page.data.map(update),
              })),
            },
        )
      } catch {
        /* The next successful poll retries the local read marker. */
      } finally {
        busy.current = false
      }
    }

    void mark()
    window.addEventListener('focus', mark)
    document.addEventListener('visibilitychange', mark)

    return () => {
      window.removeEventListener('focus', mark)
      document.removeEventListener('visibilitychange', mark)
    }
  }, [
    id,
    message,
    conversation?.has_unread,
    loaded,
    refreshedAt,
    client,
    session?.id,
    cache,
  ])
}
