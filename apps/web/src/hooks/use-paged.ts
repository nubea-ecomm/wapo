import { useInfiniteQuery } from '@tanstack/react-query'
import type { Page } from '@wapo/sdk'
import { useSession } from '../app/session-context'
export function usePaged<T>(path: string, poll = false) {
  const { session, client } = useSession()
  const result = useInfiniteQuery({
    queryKey: [session?.id, path, 'pages'],
    initialPageParam: '',
    queryFn: ({ pageParam }) =>
      client.request<Page<T>>(
        'GET',
        `${path}${pageParam ? `${path.includes('?') ? '&' : '?'}after=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    getNextPageParam: (page) =>
      page.meta?.after || page.paging?.cursors.after || undefined,
    enabled: Boolean(session?.tenantId),
    refetchInterval: poll ? 5000 : false,
    retry: false,
  })
  return { ...result, items: result.data?.pages.flatMap((page) => page.data) || [] }
}
