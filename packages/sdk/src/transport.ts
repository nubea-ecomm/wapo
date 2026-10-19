import type { ClientOptions } from './types.js'

export class WapoError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    const message =
      typeof body === 'object' && body !== null && 'error' in body
        ? (body.error as { message?: string })?.message
        : undefined

    super(message || `Wapo API returned HTTP ${status}`)
    this.name = 'WapoError'
  }
}

export class Transport {
  private baseUrl: string
  constructor(private options: ClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
  }
  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    if (
      !path.startsWith('/') ||
      path.startsWith('//') ||
      path.includes('://') ||
      path.includes('\\')
    )
      throw new Error('Expected a relative API path')

    const response = await (this.options.fetch ?? globalThis.fetch)(
      `${this.baseUrl}${path}`,
      {
        method,
        headers: {
          'X-API-Key': this.options.apiKey,
          'Content-Type': 'application/json',
          ...(this.options.tenantId
            ? { 'X-Tenant-ID': this.options.tenantId }
            : {}),
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 35_000),
        redirect: 'error',
      },
    )
    const data: unknown =
      response.status === 204 ? undefined : await response.json()

    if (!response.ok) throw new WapoError(response.status, data)

    return data as T
  }
}
