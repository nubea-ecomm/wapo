import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from './ui/button'
export function CopyCode({
  value,
  label = 'Copiar',
}: {
  value: string
  label?: string
}) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(false)
  return (
    <div className="my-3 overflow-hidden rounded-md border bg-muted/30">
      <div className="flex justify-end border-b px-2 py-1">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => {
            void navigator.clipboard
              .writeText(value)
              .then(() => {
                setCopied(true)
                setError(false)
              })
              .catch(() => setError(true))
          }}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? 'Copiado' : label}
        </Button>
      </div>
      <pre className="overflow-x-auto p-4 text-xs leading-6">
        <code>{value}</code>
      </pre>
      {error && (
        <p className="px-4 pb-3 text-xs text-destructive">
          Seleccioná el texto y copialo manualmente.
        </p>
      )}
    </div>
  )
}
