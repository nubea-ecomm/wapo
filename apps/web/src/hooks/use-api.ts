import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../app/session-context'

export function useApi<T>(
  path: string,
  options: { admin?: boolean; poll?: boolean | number; enabled?: boolean } = {},
) {
  const { session, client, admin } = useSession()

  return useQuery({
    queryKey: [session?.id, path],
    queryFn: () => (options.admin ? admin : client).request<T>('GET', path),
    enabled: Boolean(
      session &&
      (options.admin || session.tenantId) &&
      options.enabled !== false,
    ),
    refetchInterval:
      typeof options.poll === 'number'
        ? options.poll
        : options.poll
          ? 5000
          : false,
    refetchOnWindowFocus: Boolean(options.poll),
  })
}

export function useAction<TInput = void, TResult = unknown>(
  operation: (input: TInput) => Promise<TResult>,
) {
  const queryClient = useQueryClient()
  const { session } = useSession()

  return useMutation({
    mutationFn: operation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [session?.id] }),
  })
}
