import { Store } from 'lucide-react'
import type { BusinessProfile, BusinessVertical } from '@nubea-ecomm/wapo-sdk'
import { useI18n } from '../app/i18n'
import { Input } from './ui/input'
import { NativeSelect } from './ui/native-select'
import { Textarea } from './ui/textarea'
import { Field, Panel } from './ui'
import {
  businessVerticalLabel,
  businessVerticals,
} from './business-profile-verticals'

export function BusinessProfileFields({
  profile,
  update,
  websiteOne,
  websiteTwo,
  updateWebsite,
}: {
  profile: BusinessProfile
  update: (patch: Partial<BusinessProfile>) => void
  websiteOne: string
  websiteTwo: string
  updateWebsite: (index: 0 | 1, value: string) => void
}) {
  const { t, language } = useI18n()

  return (
    <Panel title={t('businessProfile.title')}>
      <div className="mb-6 flex items-center gap-4">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted">
          {profile.profile_picture_url ? (
            <img
              src={profile.profile_picture_url}
              alt={t('businessProfile.imageAlt')}
              referrerPolicy="no-referrer"
              className="size-full object-cover"
            />
          ) : (
            <Store className="size-7 text-muted-foreground" />
          )}
        </div>
        <div>
          <p className="text-sm font-medium">{t('businessProfile.image')}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('businessProfile.imageHint')}
          </p>
        </div>
      </div>
      <div className="grid gap-4">
        <Field
          label={t('businessProfile.about')}
          hint={`${profile.about?.length || 0}/139`}
        >
          <Input
            value={profile.about || ''}
            maxLength={139}
            required
            onChange={(event) => update({ about: event.target.value })}
          />
        </Field>
        <Field label={t('businessProfile.description')}>
          <Textarea
            value={profile.description || ''}
            maxLength={512}
            rows={4}
            onChange={(event) => update({ description: event.target.value })}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('businessProfile.address')}>
            <Input
              value={profile.address || ''}
              maxLength={256}
              onChange={(event) => update({ address: event.target.value })}
            />
          </Field>
          <Field label={t('businessProfile.email')}>
            <Input
              type="email"
              value={profile.email || ''}
              maxLength={128}
              onChange={(event) => update({ email: event.target.value })}
            />
          </Field>
        </div>
        <Field label={t('businessProfile.category')}>
          <NativeSelect
            value={profile.vertical || ''}
            onChange={(event) =>
              update({ vertical: event.target.value as BusinessVertical })
            }
          >
            <option
              value=""
              disabled
            >
              {t('businessProfile.chooseCategory')}
            </option>
            {businessVerticals.map((vertical) => (
              <option
                key={vertical}
                value={vertical}
              >
                {businessVerticalLabel(language, vertical)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          {[websiteOne, websiteTwo].map((website, index) => (
            <Field
              key={index}
              label={`${t('businessProfile.website')} ${index + 1}`}
            >
              <Input
                type="url"
                value={website}
                maxLength={256}
                placeholder={
                  index === 0
                    ? 'https://example.com'
                    : 'https://instagram.com/example'
                }
                onChange={(event) =>
                  updateWebsite(index as 0 | 1, event.target.value)
                }
              />
            </Field>
          ))}
        </div>
      </div>
    </Panel>
  )
}
