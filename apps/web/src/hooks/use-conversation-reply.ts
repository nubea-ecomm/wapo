import {
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query'
import type { Conversation, Message, Page } from '@nubea-ecomm/wapo-sdk'
import { useSession } from '../app/session-context'

export function useConversationReply(id: string) {
  const { client, session } = useSession()
  const cache = useQueryClient()
  const path = `/v1/conversations/${encodeURIComponent(id)}/messages`
  const queryKey = [session?.id, path, 'pages']

  return useMutation({
    mutationFn: ({
      text,
      payload,
      key,
    }: {
      text?: string
      payload?: Record<string, unknown>
      key: string
    }) =>
      payload
        ? client.request<{ data: Message }>('POST', path, { payload }, key)
        : client.reply(id, text || '', key),
    onMutate: () => cache.cancelQueries({ queryKey }),
    onSuccess: async ({ data: message }) => {
      // A polling response started before the send must not replace the newly
      // accepted message. Insert it immediately instead of waiting for polling.
      await cache.cancelQueries({ queryKey })
      cache.setQueryData<InfiniteData<Page<Message>>>(queryKey, (old) => {
        if (!old) return { pages: [{ data: [message] }], pageParams: [''] }

        if (
          old.pages.some((page) =>
            page.data.some((item) => item.id === message.id),
          )
        )
          return old

        return {
          ...old,
          pages: old.pages.map((page, index) =>
            index === 0 ? { ...page, data: [message, ...page.data] } : page,
          ),
        }
      })
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
              data: page.data.map((conversation) =>
                conversation.id === id ||
                conversation.id === message.conversation_id
                  ? {
                      ...conversation,
                      last_message: message,
                      updated_at: message.timestamp,
                    }
                  : conversation,
              ),
            })),
          },
      )
      void cache.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === session?.id &&
          String(query.queryKey[1]).startsWith('/v1/conversations'),
      })
    },
  })
}
