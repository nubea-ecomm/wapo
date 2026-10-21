import { MoreHorizontal, Shield, UserMinus } from 'lucide-react'
import { useI18n } from '../app/i18n'
import { useSession } from '../app/session-context'
import { useAction } from '../hooks/use-api'
import type { TeamMember } from '../lib/team'
import { useState } from 'react'
import { Button } from './ui/button'
import { ErrorNotice } from './ui'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog'

export function MemberActions({
  member,
  lastAdmin,
  onEdit,
}: {
  member: TeamMember
  lastAdmin: boolean
  onEdit: () => void
}) {
  const { t } = useI18n()
  const { client } = useSession()
  const [removing, setRemoving] = useState(false)
  const remove = useAction(async () => {
    await client.request('DELETE', `/v1/members/${member.id}`)
    setRemoving(false)
  })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${t('common.actions')}: ${member.name}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onEdit}>
            <Shield />
            {t('team.editAccess')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={lastAdmin}
            onSelect={() => {
              remove.reset()
              setRemoving(true)
            }}
          >
            <UserMinus />
            {t('team.remove')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog
        open={removing}
        onOpenChange={(open) => {
          if (!remove.isPending) setRemoving(open)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('team.remove')}: {member.name}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('team.removeDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ErrorNotice error={remove.error} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault()
                remove.mutate()
              }}
            >
              {t(remove.isPending ? 'common.processing' : 'common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
