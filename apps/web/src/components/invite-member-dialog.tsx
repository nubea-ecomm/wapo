import { useState } from 'react'
import { useI18n } from '../app/i18n'
import { useSession } from '../app/session-context'
import { useAction } from '../hooks/use-api'
import { teamRoles } from '../lib/team'
import { FormDialog } from './form-dialog'
import { ErrorNotice, Field } from './ui'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { SelectField } from './ui/select-field'

export function InviteMemberDialog({
  onClose,
  onSent,
}: {
  onClose: () => void
  onSent: () => void
}) {
  const { t } = useI18n()
  const { client } = useSession()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const invite = useAction(async () => {
    await client.request('POST', '/v1/members', { email, role })
    onSent()
  })

  return (
    <FormDialog
      title={t('team.invite')}
      description={t('team.inviteDescription')}
      onClose={() => {
        if (!invite.isPending) onClose()
      }}
      contentClassName="sm:max-w-md"
    >
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault()
          invite.mutate()
        }}
      >
        <Field label={t('team.email')}>
          <Input
            type="email"
            autoFocus
            autoComplete="email"
            placeholder="m@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            disabled={invite.isPending}
          />
        </Field>
        <Field label={t('team.role')}>
          <SelectField
            value={role}
            onValueChange={setRole}
            disabled={invite.isPending}
          >
            {teamRoles.map(([value, key]) => (
              <option
                key={value}
                value={value}
              >
                {t(key)}
              </option>
            ))}
          </SelectField>
        </Field>
        <ErrorNotice error={invite.error} />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={invite.isPending}
            onClick={onClose}
          >
            {t('common.cancel')}
          </Button>
          <Button disabled={invite.isPending}>
            {t(invite.isPending ? 'team.sending' : 'team.send')}
          </Button>
        </div>
      </form>
    </FormDialog>
  )
}
