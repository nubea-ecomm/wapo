import { FormDialog } from './form-dialog'
import { Textarea } from '../components/ui/textarea'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { useState } from 'react'
import type { Customer } from '@wapo/sdk'
import { useSession } from '../app/session-context'
import { useAction } from '../hooks/use-api'
import { ErrorNotice, Field } from './ui'

export function CustomerEditor({
  customer,
  onClose,
}: {
  customer?: Customer
  onClose: () => void
}) {
  const { client } = useSession()
  const [name, setName] = useState(customer?.name || '')
  const [external, setExternal] = useState(customer?.external_customer_id || '')
  const [email, setEmail] = useState(customer?.email || '')
  const [metadata, setMetadata] = useState(
    JSON.stringify(customer?.metadata || {}, null, 2),
  )
  const save = useAction(async () => {
    const parsed: unknown = JSON.parse(metadata)

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
      throw new Error('Metadata debe ser un objeto JSON.')

    const input = {
      name,
      external_customer_id: external,
      email,
      metadata: parsed as Record<string, unknown>,
    }

    if (customer) await client.updateCustomer(customer.id, input)
    else await client.createCustomer(input)

    onClose()
  })

  return (
    <FormDialog
      title={customer ? 'Editar customer' : 'Nuevo customer'}
      onClose={onClose}
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <Field label="Nombre">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </Field>
        <div className="form-grid">
          <Field label="ID externo">
            <Input
              value={external}
              onChange={(e) => setExternal(e.target.value)}
              placeholder="store-123"
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Metadata (JSON)">
          <Textarea
            className="code-input"
            rows={5}
            value={metadata}
            onChange={(e) => setMetadata(e.target.value)}
          />
        </Field>
        <ErrorNotice error={save.error} />
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
            disabled={save.isPending}
          >
            {save.isPending ? 'Guardando…' : 'Guardar customer'}
          </Button>
        </div>
      </form>
    </FormDialog>
  )
}
