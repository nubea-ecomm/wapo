import { useEffect, useRef, useState } from 'react'
import { Paperclip, X } from 'lucide-react'
import { useSession } from '../app/session-context'
import { useVoiceRecorder } from '../hooks/use-voice-recorder'
import {
  mediaLimit,
  mediaPayload,
  uploadChatMedia,
  type UploadedMedia,
} from '../lib/chat-media'
import { dateLabel } from '../lib/message-format'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { ErrorNotice } from './ui'
import { InteractiveMessageDialog } from './interactive-message-dialog'
import { ComposerTools } from './composer-tools'

export function ChatComposer({
  connection,
  disabled,
  expiresAt,
  onSend,
}: {
  connection: string
  disabled: boolean
  expiresAt?: string
  onSend: (payload: Record<string, unknown>, key: string) => Promise<unknown>
}) {
  const { session } = useSession()
  const [text, setText] = useState('')
  const [key, setKey] = useState(() => crypto.randomUUID())
  const [attachment, setAttachment] = useState<{
    file: File
    voice: boolean
  } | null>(null)
  const [preview, setPreview] = useState('')
  const [interactive, setInteractive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<unknown>()
  const textarea = useRef<HTMLTextAreaElement>(null)
  const uploaded = useRef<UploadedMedia | null>(null)
  const voice = useVoiceRecorder((file) => selectFile(file, true))
  const recording = voice.status !== 'idle'
  const audio = Boolean(attachment?.file.type.startsWith('audio/'))
  const blocked = disabled || busy || recording

  useEffect(() => {
    if (!attachment) {
      setPreview('')

      return
    }

    const url = URL.createObjectURL(attachment.file)

    setPreview(url)

    return () => URL.revokeObjectURL(url)
  }, [attachment])

  function selectFile(file: File | null, isVoice = false) {
    setError(undefined)

    if (file && (!file.size || file.size > mediaLimit(file))) {
      setError(
        new Error(
          'Archivo vacío o demasiado grande. Máximos: imágenes 5 MB; audio/video 16 MB; documentos 100 MB.',
        ),
      )

      return
    }

    setAttachment(file ? { file, voice: isVoice } : null)
    uploaded.current = null
    setKey(crypto.randomUUID())
  }

  function edit(value: string) {
    setText(value)
    setKey(crypto.randomUUID())
    setError(undefined)
  }

  function format(marker: string) {
    const element = textarea.current

    if (!element || blocked) return

    const start = element.selectionStart,
      end = element.selectionEnd
    const selected = text.slice(start, end) || 'texto'

    if (
      start !== end &&
      text.slice(0, start).endsWith(marker) &&
      text.slice(end).startsWith(marker)
    ) {
      edit(
        `${text.slice(0, start - marker.length)}${selected}${text.slice(end + marker.length)}`,
      )
      requestAnimationFrame(() => {
        element.focus()
        element.setSelectionRange(start - marker.length, end - marker.length)
      })

      return
    }

    edit(
      `${text.slice(0, start)}${marker}${selected}${marker}${text.slice(end)}`,
    )
    requestAnimationFrame(() => {
      element.focus()
      element.setSelectionRange(
        start + marker.length,
        start + marker.length + selected.length,
      )
    })
  }

  async function send() {
    if (blocked || (!text.trim() && !attachment)) return

    setBusy(true)
    setError(undefined)

    try {
      let payload: Record<string, unknown> = {
        type: 'text',
        text: { body: text.trim() },
      }

      if (attachment) {
        if (!uploaded.current) {
          setUploading(true)
          uploaded.current = await uploadChatMedia(
            session,
            connection,
            attachment.file,
            attachment.voice,
          )
          setUploading(false)
        }

        payload = mediaPayload(uploaded.current, audio ? '' : text)
      }

      await onSend(payload, key)

      if (!audio) setText('')

      selectFile(null)
      setKey(crypto.randomUUID())
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
      setUploading(false)
    }
  }

  return (
    <div className="chat-composer-area">
      <ErrorNotice
        error={error || (voice.error ? new Error(voice.error) : undefined)}
      />
      <form
        className="chat-composer"
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
      >
        {attachment && (
          <div className="composer-attachment">
            {audio && preview ? (
              <audio
                controls
                src={preview}
                aria-label="Vista previa del audio"
              />
            ) : (
              <>
                <Paperclip size={17} />
                <div className="min-w-0">
                  <strong>{attachment.file.name}</strong>
                  <span>
                    {(attachment.file.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
              </>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={busy}
              aria-label="Quitar adjunto"
              onClick={() => selectFile(null)}
            >
              <X />
            </Button>
          </div>
        )}
        {recording ? (
          <div
            className="composer-recording"
            role="status"
          >
            <span className="recording-dot" />
            {voice.status === 'requesting'
              ? 'Esperando permiso del micrófono…'
              : `Grabando ${Math.floor(voice.seconds / 60)
                  .toString()
                  .padStart(
                    2,
                    '0',
                  )}:${(voice.seconds % 60).toString().padStart(2, '0')}`}
            <span className="ml-auto text-xs text-muted-foreground">
              Máx. 2 min
            </span>
          </div>
        ) : !audio ? (
          <Textarea
            ref={textarea}
            aria-label="Responder conversación"
            placeholder="Escribí un mensaje…"
            value={text}
            disabled={disabled || busy}
            rows={1}
            maxLength={attachment ? 1024 : 4096}
            onChange={(event) => edit(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return

              if (
                (event.metaKey || event.ctrlKey) &&
                ['b', 'i'].includes(event.key.toLowerCase())
              ) {
                event.preventDefault()
                format(event.key.toLowerCase() === 'b' ? '*' : '_')
              }

              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void send()
              }
            }}
          />
        ) : (
          <p className="composer-audio-hint">
            {attachment?.voice
              ? 'Nota de voz lista para enviar.'
              : 'Audio listo para enviar.'}
            {text && ' Tu borrador de texto se conserva.'}
          </p>
        )}
        <ComposerTools
          blocked={blocked}
          audio={audio}
          hasAttachment={Boolean(attachment)}
          busy={busy}
          uploading={uploading}
          canSend={Boolean(text.trim() || attachment)}
          voice={voice}
          onFormat={format}
          onFile={selectFile}
          onInteractive={() => setInteractive(true)}
        />
      </form>
      <div className="composer-hint">
        <span>Shift + Enter para una nueva línea</span>
        {expiresAt && (
          <span title={`Ventana abierta hasta ${dateLabel(expiresAt)}`}>
            Ventana de 24 h abierta
          </span>
        )}
      </div>
      {interactive && (
        <InteractiveMessageDialog
          onClose={() => setInteractive(false)}
          onSend={onSend}
        />
      )}
    </div>
  )
}
