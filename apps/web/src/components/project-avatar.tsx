import { useState } from 'react'
import { useSession } from '../app/session-context'

export function ProjectAvatar({ name, logoUrl }: { name: string; logoUrl?: string }) {
  const { session } = useSession()
  const [failed, setFailed] = useState('')
  const url = logoUrl ? `${session?.url || ''}${logoUrl}` : ''
  return (
    <span className="project-avatar flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-xs font-medium text-muted-foreground">
      {url && failed !== url ? (
        <img
          src={url}
          alt={`Logo de ${name}`}
          className="size-full object-contain p-0.5"
          loading="lazy"
          onError={() => setFailed(url)}
        />
      ) : (
        name.slice(0, 1).toUpperCase() || 'P'
      )}
    </span>
  )
}
