import { useState } from 'react'
import { useSession } from '../app/session-context'
import { useAction, useApi } from '../hooks/use-api'
import { PageHeader, ErrorNotice, Field, Loading } from '../components/ui'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { NativeSelect } from '../components/ui/native-select'
import { useI18n } from '../app/i18n'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/table'

type Member = { id: string; name: string; email: string; role: string }
const roles = [
  ['admin', 'team.admin'],
  ['member', 'team.member'],
  ['viewer', 'team.viewer'],
  ['billing', 'team.billing'],
] as const

export function MembersPage() {
  const { t } = useI18n()
  const { client } = useSession()
  const members = useApi<{ data: Member[] }>('/v1/members')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [sent, setSent] = useState(false)
  const invite = useAction(async () => {
    await client.request('POST', '/v1/members', { email, role })
    setEmail('')
    setSent(true)
  })
  const update = useAction(async ({ id, role }: { id: string; role: string }) =>
    client.request('PATCH', `/v1/members/${id}`, { role }),
  )
  const remove = useAction(async (id: string) =>
    client.request('DELETE', `/v1/members/${id}`),
  )
  const [removing, setRemoving] = useState<string | null>(null)

  return (
    <>
      <PageHeader
        title={t('team.title')}
        description={t('team.description')}
      />
      <form
        className="mb-6 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          setSent(false)
          invite.mutate()
        }}
      >
        <Field label={t('team.email')}>
          <Input
            type="email"
            value={email}
            required
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label={t('team.role')}>
          <NativeSelect
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            {roles.map(([value, label]) => (
              <option
                key={value}
                value={value}
              >
                {t(label)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Button disabled={invite.isPending}>
          {invite.isPending ? t('team.sending') : t('team.send')}
        </Button>
      </form>
      {sent && (
        <p
          role="status"
          className="mb-4 text-sm"
        >
          {t('team.sent')}
        </p>
      )}
      <ErrorNotice
        error={members.error || invite.error || update.error || remove.error}
      />
      {members.isLoading ? (
        <Loading variant="table" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('name')}</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>{t('team.memberRole')}</TableHead>
              <TableHead>{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.data?.data.map((member) => (
              <TableRow key={member.id}>
                <TableCell>{member.name}</TableCell>
                <TableCell>{member.email}</TableCell>
                <TableCell>
                  <NativeSelect
                    aria-label={`${t('team.memberRole')} ${member.email}`}
                    value={member.role}
                    disabled={update.isPending}
                    onChange={(event) =>
                      update.mutate({ id: member.id, role: event.target.value })
                    }
                  >
                    {roles.map(([value, label]) => (
                      <option
                        key={value}
                        value={value}
                      >
                        {t(label)}
                      </option>
                    ))}
                  </NativeSelect>
                </TableCell>
                <TableCell>
                  {removing === member.id ? (
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        disabled={remove.isPending}
                        onClick={() =>
                          remove.mutate(member.id, {
                            onSuccess: () => setRemoving(null),
                          })
                        }
                      >
                        {t('team.confirmRemove')}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setRemoving(null)}
                      >
                        {t('common.cancel')}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      onClick={() => setRemoving(member.id)}
                    >
                      {t('team.remove')}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  )
}
