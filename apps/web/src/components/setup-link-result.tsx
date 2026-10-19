import { useState } from 'react'
import { Check, Copy, ExternalLink, Link2 } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
export function SetupLinkResult({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  return (
    <div className="grid gap-3 rounded-lg border bg-muted/30 p-4" role="status">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Link2 className="size-4" />
        Enlace listo para compartir
      </div>
      <p className="text-xs text-muted-foreground">
        Compartilo con el titular del número.
      </p>
      <Input
        readOnly
        aria-label="Enlace de onboarding"
        value={url}
        onFocus={(e) => e.target.select()}
        className="bg-background text-xs"
      />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard
              .writeText(url)
              .then(() => {
                setCopied(true)
                setFailed(false)
              })
              .catch(() => setFailed(true))
          }}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? 'Copiado' : 'Copiar enlace'}
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <a href={url} target="_blank" rel="noreferrer">
            Abrir enlace
            <ExternalLink />
          </a>
        </Button>
      </div>
      {failed && (
        <p className="text-xs text-destructive">
          Seleccioná el enlace y copialo manualmente.
        </p>
      )}
    </div>
  )
}
