import { useState } from 'react'
import { Bell, Mail, Save } from 'lucide-react'
import { Switch } from 'radix-ui'
import type { NotificationSettings } from '@nubea-ecomm/wapo-sdk'
import { permissions } from '../app/permissions'
import { useI18n } from '../app/i18n'
import { useSession } from '../app/session-context'
import { useAction, useApi } from '../hooks/use-api'
import { Button } from './ui/button'
import { ErrorNotice, Field, Loading, Panel } from './ui'
import { RecipientInput } from './recipient-input'

export function NotificationSettingsPanel() {
  const { session } = useSession()
  const query = useApi<{ data: NotificationSettings }>(
    '/v1/notification-settings',
  )
  const { t } = useI18n()

  if (!session?.tenantId)
    return (
      <Panel title={t('notifications.title')}>
        <p className="muted">{t('settings.noneSelected')}</p>
      </Panel>
    )

  if (query.isLoading)
    return (
      <Panel title={t('notifications.title')}>
        <Loading variant="settings" />
      </Panel>
    )

  if (!query.data) return <ErrorNotice error={query.error} />

  return (
    <NotificationForm
      key={`${session.id}:${session.tenantId}`}
      initial={query.data.data}
    />
  )
}

function NotificationForm({ initial }: { initial: NotificationSettings }) {
  const { client, session } = useSession()
  const { t } = useI18n()
  const canManage = permissions(session).canManageProject
  const [settings, setSettings] = useState(initial)
  const [saved, setSaved] = useState(false)
  const save = useAction(async () => {
    const response = await client.updateNotificationSettings({
      recipients: settings.recipients,
      whatsapp_disconnected: settings.whatsapp_disconnected,
      customer_needs_attention: settings.customer_needs_attention,
      daily_stats: settings.daily_stats,
      weekly_stats: settings.weekly_stats,
    })

    setSettings(response.data)
    setSaved(true)
  })
  const options: Array<{
    key: keyof Pick<
      NotificationSettings,
      | 'whatsapp_disconnected'
      | 'customer_needs_attention'
      | 'daily_stats'
      | 'weekly_stats'
    >
    title: string
    description: string
  }> = [
    {
      key: 'whatsapp_disconnected',
      title: t('notifications.whatsappDisconnected'),
      description: t('notifications.whatsappDisconnectedDescription'),
    },
    {
      key: 'customer_needs_attention',
      title: t('notifications.customerAttention'),
      description: t('notifications.customerAttentionDescription'),
    },
    {
      key: 'daily_stats',
      title: t('notifications.dailyStats'),
      description: t('notifications.dailyStatsDescription'),
    },
    {
      key: 'weekly_stats',
      title: t('notifications.weeklyStats'),
      description: t('notifications.weeklyStatsDescription'),
    },
  ]

  return (
    <form
      className="grid max-w-3xl gap-5"
      onSubmit={(event) => {
        event.preventDefault()

        if (canManage) save.mutate()
      }}
    >
      <fieldset
        disabled={!canManage || save.isPending}
        className="grid gap-5"
      >
        <Panel title={t('notifications.delivery')}>
          <div className="mb-4 flex items-start gap-3">
            <Mail className="mt-0.5 size-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {t('notifications.deliveryDescription')}
            </p>
          </div>
          <Field
            label={t('notifications.recipients')}
            hint={t('notifications.recipientsHint')}
          >
            <RecipientInput
              value={settings.recipients}
              suggestions={settings.project_users}
              onChange={(recipients) => {
                setSettings((current) => ({ ...current, recipients }))
                setSaved(false)
              }}
            />
          </Field>
          {!initial.smtp_configured && (
            <div
              className="notice mt-4"
              role="status"
            >
              <Bell size={16} /> {t('notifications.smtpMissing')}
            </div>
          )}
        </Panel>
        <Panel title={t('notifications.events')}>
          <div className="divide-y">
            {options.map((option) => (
              <div
                key={option.key}
                className="flex items-center justify-between gap-5 py-4 first:pt-0 last:pb-0"
              >
                <div>
                  <label
                    htmlFor={`notification-${option.key}`}
                    className="text-sm font-medium"
                  >
                    {option.title}
                  </label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {option.description}
                  </p>
                </div>
                <Switch.Root
                  id={`notification-${option.key}`}
                  checked={settings[option.key]}
                  onCheckedChange={(checked) => {
                    setSettings((current) => ({
                      ...current,
                      [option.key]: checked,
                    }))
                    setSaved(false)
                  }}
                  className="inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-input p-0.5 transition-colors data-[state=checked]:bg-primary focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <Switch.Thumb className="block size-4 rounded-full bg-background shadow-sm transition-transform data-[state=checked]:translate-x-4" />
                </Switch.Root>
              </div>
            ))}
          </div>
        </Panel>
      </fieldset>
      <ErrorNotice error={save.error} />
      <div className="flex items-center justify-between gap-3">
        <p
          className="text-xs text-muted-foreground"
          role="status"
        >
          {save.isPending
            ? t('saving')
            : saved
              ? t('notifications.saved')
              : t('notifications.utcHint')}
        </p>
        {canManage && (
          <Button disabled={save.isPending}>
            <Save /> {save.isPending ? t('saving') : t('save')}
          </Button>
        )}
      </div>
    </form>
  )
}
