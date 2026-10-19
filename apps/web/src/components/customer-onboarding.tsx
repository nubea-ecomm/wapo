import { WhatsAppIcon } from './icons/whatsapp-icon'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Info, Link2, Settings2, ChevronDown, LoaderCircle } from 'lucide-react'
import type { Customer, Page, SetupLink } from '@wapo/sdk'
import { useSession } from '../app/session-context'
import { useApi, useAction } from '../hooks/use-api'
import { ErrorNotice, Field } from './ui'
import { FormDialog } from './form-dialog'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { SetupLinkResult } from './setup-link-result'
import { SetupLinkHistory } from './setup-link-history'
const choices = [
  {
    id: 'both',
    title: 'Que el cliente elija',
    description: 'El cliente decide cómo conectar su número al abrir el enlace.',
  },
  {
    id: 'coexistence',
    title: 'WhatsApp Business + API',
    description: 'Coexistence: sigue usando la app de WhatsApp Business junto con Wapo.',
  },
  {
    id: 'dedicated',
    title: 'Solo API',
    description: 'Conexión dedicada: gestiona los mensajes a través de la API.',
  },
] as const
export function CustomerOnboarding({
  customer,
  onClose,
}: {
  customer: Customer
  onClose: () => void
}) {
  const { client } = useSession()
  const [mode, setMode] = useState<(typeof choices)[number]['id']>('both')
  const [redirect, setRedirect] = useState('')
  const [link, setLink] = useState('')
  const instance = useApi<{ data: { onboarding_ready: boolean } }>('/v1/me')
  const links = useApi<Page<SetupLink>>(
    `/v1/customers/${encodeURIComponent(customer.id)}/setup_links`,
  )
  const ready = instance.data?.data.onboarding_ready === true
  const create = useAction(async () => {
    const result = await client.createSetupLink(customer.id, {
      allowed_connection_types: mode === 'both' ? ['coexistence', 'dedicated'] : [mode],
      ...(redirect ? { success_redirect_url: redirect } : {}),
      language: 'es',
    })
    setLink(result.data.url || '')
  })
  const revoke = useAction((id: string) => client.revokeSetupLink(id))
  return (
    <FormDialog
      title={
        <span className="flex items-center gap-2">
          <WhatsAppIcon size={20} />
          Conectar WhatsApp
        </span>
      }
      description={`Generá un enlace para que ${customer.name} autorice su cuenta.`}
      onClose={onClose}
    >
      {instance.isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Comprobando disponibilidad…
        </p>
      )}
      {instance.data && !ready && (
        <div className="flex gap-3 rounded-lg border bg-muted/40 p-4">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="grid gap-2">
            <p className="text-sm font-medium">WhatsApp aún no está habilitado</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Un administrador debe completar la configuración de Meta para generar
              enlaces de conexión.
            </p>
            <Link
              to="/settings"
              onClick={onClose}
              className="flex items-center gap-1 text-xs font-medium"
            >
              <Settings2 className="size-3.5" />
              Ver configuración
            </Link>
          </div>
        </div>
      )}
      <ErrorNotice
        error={
          instance.error
            ? new Error(
                'No pudimos comprobar la disponibilidad de WhatsApp. Volvé a abrir esta ventana.',
              )
            : null
        }
      />
      <form
        className="grid gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate()
        }}
      >
        <fieldset className="grid gap-2">
          <legend className="mb-3 text-sm font-medium">
            Opciones disponibles en el enlace
          </legend>
          {choices.map((choice) => (
            <label
              key={choice.id}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${mode === choice.id ? 'border-foreground/40 bg-muted/40' : 'hover:bg-muted/30'}`}
            >
              <input
                type="radio"
                name="connection-type"
                value={choice.id}
                checked={mode === choice.id}
                onChange={() => setMode(choice.id)}
                className="mt-0.5 size-4 shrink-0 accent-neutral-900"
              />
              <span className="grid gap-1">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {choice.title}
                  {choice.id === 'both' && (
                    <Badge variant="secondary" className="text-[10px]">
                      Predeterminado
                    </Badge>
                  )}
                </span>
                <span className="text-xs leading-relaxed text-muted-foreground">
                  {choice.description}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        <details className="rounded-lg border px-3 py-2.5">
          <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium">
            Opciones avanzadas
            <ChevronDown className="size-3.5" />
          </summary>
          <div className="pt-4 pb-1">
            <Field
              label="Redirección al finalizar"
              hint="Opcional. El cliente vuelve a esta dirección cuando termina."
            >
              <Input
                type="url"
                value={redirect}
                onChange={(e) => setRedirect(e.target.value)}
                placeholder="https://tu-app.com/conectado"
              />
            </Field>
          </div>
        </details>
        <ErrorNotice
          error={
            create.error
              ? new Error(
                  'No pudimos generar el enlace. Revisá las opciones o intentá nuevamente.',
                )
              : null
          }
        />
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          <Button disabled={!ready || create.isPending}>
            <Link2 />
            {create.isPending ? 'Generando…' : 'Generar enlace'}
          </Button>
        </div>
      </form>
      {link && <SetupLinkResult key={link} url={link} />}
      <ErrorNotice
        error={
          revoke.error
            ? new Error('No pudimos revocar el enlace. Intentá nuevamente.')
            : null
        }
      />
      <SetupLinkHistory
        links={links.data?.data || []}
        busy={revoke.isPending}
        onRevoke={(id) => revoke.mutateAsync(id)}
      />
      <ErrorNotice
        error={
          links.error ? new Error('No pudimos cargar los enlaces anteriores.') : null
        }
      />
    </FormDialog>
  )
}
