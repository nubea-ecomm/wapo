import { useState } from 'react'
import { KeyRound, Pencil } from 'lucide-react'
import { WapoError, type Connection } from '@wapo/sdk'
import { useSession } from '../app/session-context'
import { useAction } from '../hooks/use-api'
import { FormDialog } from './form-dialog'
import { Field, ErrorNotice } from './ui'
import { Input } from './ui/input'
import { Button } from './ui/button'

export function ConnectionUpdateEditor({
  connection,
  onClose,
}: {
  connection: Connection
  onClose: () => void
}) {
  const { client } = useSession()
  const [name, setName] = useState(connection.name || '')
  const [token, setToken] = useState('')
  const update = useAction(async () => {
    await client.updateConnection(connection.id, {
      name: name.trim(),
      ...(token ? { access_token: token } : {}),
    })
    setToken('')
    onClose()
  })
  return (
    <FormDialog
      title="Editar conexión"
      description={
        connection.display_phone_number || connection.external_id || connection.id
      }
      onClose={onClose}
    >
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          update.mutate()
        }}
      >
        <Field label="Nombre" hint="Se muestra en Conexiones, Templates y Chats.">
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            required
          />
        </Field>
        <div className="rounded-lg border bg-muted/25 p-4">
          <div className="mb-4 flex items-start gap-3">
            <KeyRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <h3 className="text-sm font-medium">Rotar access token</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Es opcional. Wapo verificará que el token nuevo tenga acceso al mismo
                número y cuenta antes de reemplazar la credencial cifrada actual.
              </p>
            </div>
          </div>
          <Field label="Nuevo access token" hint="Dejalo vacío para conservar el actual.">
            <Input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="••••••••••••••••"
            />
          </Field>
        </div>
        <ErrorNotice
          error={update.error ? new Error(connectionUpdateError(update.error)) : null}
        />
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            disabled={update.isPending}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button disabled={update.isPending || !name.trim()}>
            <Pencil />
            {update.isPending ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </div>
      </form>
    </FormDialog>
  )
}

function connectionUpdateError(error: unknown) {
  if (!(error instanceof WapoError)) {
    return 'No pudimos guardar los cambios. Intentá nuevamente.'
  }
  if (error.status === 405) {
    return 'El servidor todavía no admite esta edición. Reiniciá el API actualizado y volvé a intentar.'
  }
  const body = error.body as { error?: { code?: string | number; message?: string } }
  const code = body?.error?.code
  if (code === 190 || code === 'credential_expired') {
    return 'Meta rechazó el token porque venció o dejó de ser válido. Generá una credencial nueva y volvé a intentar.'
  }
  if (code === 200) {
    return 'El token no tiene permisos suficientes sobre esta cuenta de WhatsApp.'
  }
  if (code === 'asset_verification_failed') {
    return 'El token es válido, pero no permite administrar este número o su cuenta de WhatsApp.'
  }
  if (code === 'provider_unavailable') {
    return 'No pudimos comunicarnos con Meta para verificar el token. Intentá nuevamente en unos minutos.'
  }
  return body?.error?.message || 'No pudimos guardar los cambios. Intentá nuevamente.'
}
