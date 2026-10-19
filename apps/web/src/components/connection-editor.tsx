import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronRight, KeyRound } from 'lucide-react'
import type { Customer, Page } from '@wapo/sdk'
import { useApi } from '../hooks/use-api'
import { FormDialog } from './form-dialog'
import { CustomerOnboarding } from './customer-onboarding'
import { ManualConnectionEditor } from './manual-connection-editor'
import { WhatsAppIcon } from './icons/whatsapp-icon'
import { ErrorNotice, Field } from './ui'
import { NativeSelect } from './ui/native-select'
import { Button } from './ui/button'
export function ConnectionEditor({ onClose }: { onClose: () => void }) {
  const [manual, setManual] = useState(false)
  const [customerId, setCustomerId] = useState('')
  const [connecting, setConnecting] = useState(false)
  const customers = useApi<Page<Customer>>('/v1/customers')
  const selected = customers.data?.data.find(
    (customer) => customer.id === customerId,
  )
  if (manual) return <ManualConnectionEditor onClose={onClose} />
  if (connecting && selected)
    return (
      <CustomerOnboarding
        customer={selected}
        onClose={onClose}
      />
    )
  return (
    <FormDialog
      title={
        <span className="flex items-center gap-2">
          <WhatsAppIcon size={20} />
          Conectar WhatsApp
        </span>
      }
      description="Generá un enlace para que el cliente autorice su cuenta con Meta."
      onClose={onClose}
    >
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          setConnecting(true)
        }}
      >
        <Field label="Customer">
          <NativeSelect
            disabled={customers.isLoading}
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
            required
          >
            <option value="">
              {customers.isLoading
                ? 'Cargando customers…'
                : 'Seleccioná un customer'}
            </option>
            {customers.data?.data.map((customer) => (
              <option
                key={customer.id}
                value={customer.id}
              >
                {customer.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {!customers.isLoading &&
          !customers.error &&
          !customers.data?.data.length && (
            <p className="text-sm text-muted-foreground">
              Creá un customer para identificar al negocio que va a conectar su
              número.{' '}
              <Link
                className="font-medium text-foreground underline underline-offset-4"
                to="/customers"
                onClick={onClose}
              >
                Ir a Customers
              </Link>
            </p>
          )}
        <ErrorNotice error={customers.error} />
        <p className="text-xs leading-relaxed text-muted-foreground">
          El cliente elige el tipo de conexión y autoriza su cuenta en Meta.
        </p>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button disabled={!selected}>
            Continuar
            <ArrowRight />
          </Button>
        </div>
      </form>
      <div className="border-t pt-4">
        <Button
          type="button"
          variant="ghost"
          className="h-auto w-full justify-start gap-3 whitespace-normal rounded-lg border px-3 py-3 text-left"
          aria-label="Conexión manual"
          onClick={() => setManual(true)}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <KeyRound />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">
              Usar credenciales de Meta
            </span>
            <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
              Para un número ya configurado en Cloud API.
            </span>
          </span>
          <ChevronRight className="text-muted-foreground" />
        </Button>
      </div>
    </FormDialog>
  )
}
