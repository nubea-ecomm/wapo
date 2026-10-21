import { useState } from 'react'
import { useI18n } from '../app/i18n'
import { useSession } from '../app/session-context'
import { useAction } from '../hooks/use-api'
import { teamRoles, type TeamMember } from '../lib/team'
import { FormDialog } from './form-dialog'
import { ErrorNotice, Field } from './ui'
import { Button } from './ui/button'
import { SelectField } from './ui/select-field'

export function MemberRoleDialog({
  member,
  onClose,
}: {
  member: TeamMember
  onClose: () => void
}) {
  const { t } = useI18n()
  const { client } = useSession()
  const [role, setRole] = useState<string>(member.role)
  const save = useAction(async () => {
    await client.request('PATCH', `/v1/members/${member.id}`, { role })
    onClose()
  })

  return (
    <FormDialog
      title={t('team.editAccess')}
      description={`${member.name} · ${member.email}`}
      onClose={() => {
        if (!save.isPending) onClose()
      }}
      contentClassName="sm:max-w-md"
    >
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <Field label={t('team.memberRole')}>
          <SelectField
            value={role}
            onValueChange={setRole}
            disabled={save.isPending}
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
        <ErrorNotice error={save.error} />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={save.isPending}
            onClick={onClose}
          >
            {t('common.cancel')}
          </Button>
          <Button disabled={save.isPending}>
            {t(save.isPending ? 'saving' : 'save')}
          </Button>
        </div>
      </form>
    </FormDialog>
  )
}
