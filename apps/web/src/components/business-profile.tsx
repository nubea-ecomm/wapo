import { useState } from 'react'
import { Save } from 'lucide-react'
import type {
  BusinessProfile as Profile,
  BusinessProfileInput,
} from '@nubea-ecomm/wapo-sdk'
import { permissions } from '../app/permissions'
import { useI18n } from '../app/i18n'
import { useSession } from '../app/session-context'
import { useAction, useApi } from '../hooks/use-api'
import { Button } from './ui/button'
import { ErrorNotice, Loading, Panel } from './ui'
import { BusinessProfileFields } from './business-profile-fields'

export function BusinessProfile({ connectionId }: { connectionId: string }) {
  const { t } = useI18n()
  const query = useApi<{ data: Profile }>(
    `/v1/connections/${encodeURIComponent(connectionId)}/business-profile`,
  )

  if (query.isLoading)
    return (
      <Panel title={t('businessProfile.title')}>
        <Loading variant="settings" />
      </Panel>
    )

  if (!query.data) return <ErrorNotice error={query.error} />

  return (
    <BusinessProfileForm
      key={JSON.stringify(query.data.data)}
      connectionId={connectionId}
      initial={query.data.data}
    />
  )
}

function BusinessProfileForm({
  connectionId,
  initial,
}: {
  connectionId: string
  initial: Profile
}) {
  const { client, session } = useSession()
  const { t } = useI18n()
  const canWrite = permissions(session).canWrite
  const [baseline, setBaseline] = useState(initial)
  const [profile, setProfile] = useState(initial)
  const [websiteOne, setWebsiteOne] = useState(initial.websites?.[0] || '')
  const [websiteTwo, setWebsiteTwo] = useState(initial.websites?.[1] || '')
  const [saved, setSaved] = useState(false)
  const input = profilePatch(baseline, profile, websiteOne, websiteTwo)
  const changed = Object.keys(input).length > 0
  const save = useAction(async () => {
    const response = await client.updateBusinessProfile(connectionId, input)

    setBaseline(response.data)
    setProfile(response.data)
    setWebsiteOne(response.data.websites?.[0] || '')
    setWebsiteTwo(response.data.websites?.[1] || '')
    setSaved(true)
  })

  function update(patch: Partial<Profile>) {
    setProfile((current) => ({ ...current, ...patch }))
    setSaved(false)
  }

  return (
    <form
      className="grid max-w-3xl gap-5"
      onSubmit={(event) => {
        event.preventDefault()

        if (canWrite) save.mutate()
      }}
    >
      <fieldset
        disabled={!canWrite || save.isPending}
        className="grid gap-5"
      >
        <BusinessProfileFields
          profile={profile}
          update={update}
          websiteOne={websiteOne}
          websiteTwo={websiteTwo}
          updateWebsite={(index, value) => {
            if (index === 0) setWebsiteOne(value)
            else setWebsiteTwo(value)

            setSaved(false)
          }}
        />
      </fieldset>
      <ErrorNotice error={save.error} />
      <div className="flex items-center justify-between gap-3">
        <p
          className="text-xs text-muted-foreground"
          role="status"
        >
          {saved ? t('businessProfile.saved') : t('businessProfile.sourceHint')}
        </p>
        {canWrite && (
          <Button
            disabled={save.isPending || !profile.about?.trim() || !changed}
          >
            <Save /> {save.isPending ? t('saving') : t('save')}
          </Button>
        )}
      </div>
    </form>
  )
}

function profilePatch(
  initial: Profile,
  current: Profile,
  websiteOne: string,
  websiteTwo: string,
): BusinessProfileInput {
  const input: BusinessProfileInput = {}
  const fields = ['about', 'address', 'description', 'email'] as const

  for (const field of fields) {
    const value = current[field]?.trim() || ''

    if (value !== (initial[field]?.trim() || '')) input[field] = value
  }

  if (current.vertical && current.vertical !== initial.vertical)
    input.vertical = current.vertical

  const websites = [websiteOne.trim(), websiteTwo.trim()].filter(Boolean)

  if (JSON.stringify(websites) !== JSON.stringify(initial.websites || []))
    input.websites = websites

  return input
}
