type MetaStatusError = {
  code?: number | string
  title?: string
  message?: string
}

// Meta reports why a message failed on its status; keep the first error so
// support can tell a payment issue from an invalid recipient at a glance.
export function failureReason(statuses: unknown): string {
  if (!Array.isArray(statuses)) return ''

  for (const status of statuses) {
    const errors = (status as { errors?: MetaStatusError[] })?.errors

    if (Array.isArray(errors) && errors[0]) {
      const { code, title, message } = errors[0]
      const text = message || title || ''

      return [code, text].filter(Boolean).join(' · ')
    }
  }

  return ''
}
