import { Badge } from './ui/badge'
import { useI18n, type MessageKey } from '../app/i18n'

const statusKeys: Record<string, MessageKey> = {
  active: 'status.active',
  connected: 'status.connected',
  healthy: 'status.healthy',
  approved: 'status.approved',
  pending: 'status.pending',
  failed: 'status.failed',
  expired: 'status.expired',
  warning: 'status.warning',
  revoked: 'status.revoked',
  inactive: 'status.inactive',
  closed: 'status.closed',
  delivered: 'status.delivered',
  read: 'status.read',
  completed: 'status.completed',
  used: 'status.used',
  pass: 'status.pass',
  configured: 'status.configured',
  onboarding: 'status.onboarding',
  processing: 'status.processing',
  queued: 'status.queued',
  sent: 'status.sent',
  received: 'status.received',
  retrying: 'status.retrying',
  paused: 'status.paused',
  credential_expired: 'status.credentialExpired',
  rejected: 'status.rejected',
  disabled: 'status.disabled',
  onboarding_failed: 'status.onboardingFailed',
  error: 'status.error',
  suspended: 'status.suspended',
  disconnected: 'status.disconnected',
  cancelled: 'status.cancelled',
  unknown: 'status.unknown',
}
const positive = new Set([
  'active',
  'connected',
  'healthy',
  'approved',
  'delivered',
  'read',
  'completed',
  'used',
  'pass',
  'configured',
])
const progress = new Set([
  'onboarding',
  'processing',
  'queued',
  'sent',
  'received',
])
const caution = new Set(['pending', 'retrying', 'warning', 'paused'])
const danger = new Set([
  'credential_expired',
  'failed',
  'rejected',
  'disabled',
  'expired',
  'onboarding_failed',
  'error',
  'suspended',
  'revoked',
  'inactive',
])

function statusClass(value: string) {
  if (positive.has(value))
    return 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'

  if (progress.has(value))
    return 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300'

  if (caution.has(value))
    return 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'

  if (danger.has(value))
    return 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300'

  return 'border-border bg-muted/40 text-muted-foreground'
}

export function Status({ value, label }: { value: string; label?: string }) {
  const { t } = useI18n()
  const normalized = value.toLowerCase()

  return (
    <Badge
      variant="outline"
      className={statusClass(normalized)}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label ||
        (statusKeys[normalized]
          ? t(statusKeys[normalized])
          : value.replaceAll('_', ' '))}
    </Badge>
  )
}
