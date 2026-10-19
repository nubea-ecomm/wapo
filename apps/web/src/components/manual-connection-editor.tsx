import { WhatsAppIcon } from './icons/whatsapp-icon'
import { NativeSelect } from '../components/ui/native-select'
import { FormDialog } from './form-dialog'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { useState } from 'react'
import type { Customer, Page } from '@nubea-ecomm/wapo-sdk'
import { useSession } from '../app/session-context'
import { useApi, useAction } from '../hooks/use-api'
import { Field, ErrorNotice } from './ui'

export function ManualConnectionEditor({ onClose }: { onClose: () => void }) {
  const { client } = useSession()
  const [name, setName] = useState('')
  const [customer, setCustomer] = useState('')
  const [phone, setPhone] = useState('')
  const [waba, setWaba] = useState('')
  const [token, setToken] = useState('')
  const customers = useApi<Page<Customer>>('/v1/customers')
  const create = useAction(async () => {
    await client.createConnection({
      channel: 'whatsapp',
      name,
      ...(customer ? { customer_id: customer } : {}),
      external_id: phone,
      business_account_id: waba,
      access_token: token,
    })
    setToken('')
    onClose()
  })

  return (
    <FormDialog
      title={
        <span className="flex items-center gap-2">
          <WhatsAppIcon size={20} />
          Conexión manual de WhatsApp
        </span>
      }
      description="Conectá un número de WhatsApp que ya esté configurado en Meta."
      onClose={onClose}
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate()
        }}
      >
        <div>
          <Field label="Nombre">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>
        </div>
        <Field label="Customer">
          <NativeSelect
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
          >
            <option value="">Conexión del proyecto</option>
            {customers.data?.data.map((c) => (
              <option
                key={c.id}
                value={c.id}
              >
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <>
          <Field label="Phone Number ID de Meta">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              pattern="[0-9]+"
            />
          </Field>
          <Field label="WhatsApp Business Account ID">
            <Input
              value={waba}
              onChange={(e) => setWaba(e.target.value)}
              required
              pattern="[0-9]+"
            />
          </Field>
          <Field
            label="Access token de Meta"
            hint="Se verifica con Meta y se guarda cifrado."
          >
            <Input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            />
          </Field>
          <p className="hint">
            Para autorizar un número nuevo o Coexistence, generá un enlace desde
            Customers.
          </p>
        </>
        <ErrorNotice error={create.error} />
        <ErrorNotice error={customers.error} />
        <div className="row-actions">
          <Button
            variant="outline"
            size="default"
            type="button"
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            variant="default"
            size="default"
            disabled={create.isPending}
          >
            <WhatsAppIcon />
            {create.isPending ? 'Conectando…' : 'Conectar WhatsApp'}
          </Button>
        </div>
      </form>
    </FormDialog>
  )
}
