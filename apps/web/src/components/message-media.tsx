import { useEffect, useRef, useState } from 'react'
import { Download, FileText, LoaderCircle, Play } from 'lucide-react'
import type { Message } from '@nubea-ecomm/wapo-sdk'
import { useSession } from '../app/session-context'
import { downloadChatMedia } from '../lib/chat-media'
import { Button } from './ui/button'
import { ErrorNotice } from './ui'
import { WhatsAppText } from './whatsapp-text'

export function MessageMedia({ message }: { message: Message }) {
  const { session } = useSession()
  const type = String(message.payload.type)
  const media = message.payload[type] as Record<string, unknown>
  const id = typeof media?.id === 'string' ? media.id : ''
  const filename =
    typeof media?.filename === 'string'
      ? media.filename
      : type === 'audio'
        ? 'Audio'
        : type === 'image'
          ? 'Imagen'
          : type === 'video'
            ? 'Video'
            : 'Archivo'
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const request = useRef<AbortController | null>(null)

  useEffect(
    () => () => {
      request.current?.abort()
    },
    [],
  )
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url)
    },
    [url],
  )

  async function load() {
    if (!id || busy) return

    const controller = new AbortController()

    request.current = controller
    setBusy(true)
    setError(undefined)

    try {
      const blob = await downloadChatMedia(
        session,
        message.connection_id,
        id,
        controller.signal,
      )

      if (!controller.signal.aborted) setUrl(URL.createObjectURL(blob))
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause)
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  return (
    <div className="message-media">
      {url ? (
        type === 'audio' ? (
          <audio
            controls
            src={url}
            aria-label="Audio del mensaje"
          />
        ) : type === 'image' ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
          >
            <img
              src={url}
              alt={filename}
            />
          </a>
        ) : type === 'video' ? (
          <video
            controls
            src={url}
            aria-label="Video del mensaje"
          />
        ) : (
          <a
            className="message-file"
            href={url}
            download={filename}
          >
            <FileText size={20} />
            <span>{filename}</span>
            <Download size={15} />
          </a>
        )
      ) : (
        <Button
          type="button"
          variant="ghost"
          className="message-file"
          disabled={busy || !id}
          onClick={() => void load()}
        >
          {busy ? (
            <LoaderCircle className="animate-spin" />
          ) : type === 'audio' || type === 'video' ? (
            <Play />
          ) : (
            <FileText />
          )}
          <span>{busy ? 'Cargando…' : filename}</span>
          {!busy && <Download size={15} />}
        </Button>
      )}
      <ErrorNotice error={error} />
      {typeof media?.caption === 'string' && (
        <p>
          <WhatsAppText text={media.caption} />
        </p>
      )}
    </div>
  )
}
