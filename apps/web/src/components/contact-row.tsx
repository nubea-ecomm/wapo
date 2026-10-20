import type { Contact } from '@nubea-ecomm/wapo-sdk'
import { CircleUserRound, Eye, Phone, Trash2 } from 'lucide-react'
import { useI18n } from '../app/i18n'
import { dateLabel } from '../lib/message-format'
import { ConfirmButton } from './ui'
import { Button } from './ui/button'
import { TableCell, TableRow } from './ui/table'

export function ContactRow({
  contact,
  erasePending,
  edit,
  erase,
}: {
  contact: Contact
  erasePending: boolean
  edit: () => void
  erase: () => Promise<unknown>
}) {
  const { t } = useI18n()
  const secondary =
    contact.display_name_source === 'local' && contact.profile_name
      ? `${t('contacts.metaName')}: ${contact.profile_name}`
      : contact.username ||
        contact.business_scoped_user_id ||
        contact.email ||
        contact.phone_number

  return (
    <TableRow className="group">
      <TableCell className="py-3 pl-4">
        <div className="flex items-center gap-2.5">
          <Phone className="size-4 text-muted-foreground" />
          <div>
            <p className="font-medium">{contact.phone_number}</p>
            <p className="text-xs text-muted-foreground">
              {contact.connection_name || contact.phone_number_id}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2.5">
          <CircleUserRound className="size-4 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate font-medium">{contact.display_name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {secondary}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <span className="inline-flex items-center gap-2 text-sm">
          <span
            className={`size-2 rounded-full ${contact.marketing_preference.marketing_allowed ? 'bg-muted-foreground/60' : 'bg-destructive'}`}
          />
          {contact.marketing_preference.marketing_allowed
            ? t('contacts.marketingAllowed')
            : t('contacts.marketingStopped')}
        </span>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {dateLabel(contact.created_at)}
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${t('contacts.view')} ${contact.display_name}`}
            onClick={edit}
          >
            <Eye />
          </Button>
          <ConfirmButton
            disabled={erasePending}
            message={t('contacts.eraseDescription')}
            onConfirm={erase}
          >
            <Trash2 />
            <span className="sr-only">
              {t('contacts.erase')} {contact.display_name}
            </span>
          </ConfirmButton>
        </div>
      </TableCell>
    </TableRow>
  )
}
