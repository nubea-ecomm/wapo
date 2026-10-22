import { useRef } from 'react'
import {
  ArrowUp,
  Bold,
  Code2,
  Italic,
  LoaderCircle,
  Mic,
  MousePointerClick,
  Paperclip,
  Square,
  Strikethrough,
  Trash2,
} from 'lucide-react'
import type { useVoiceRecorder } from '../hooks/use-voice-recorder'
import { mediaAccept } from '../lib/chat-media'
import { Button } from './ui/button'

export function ComposerTools({
  blocked,
  audio,
  hasAttachment,
  busy,
  uploading,
  canSend,
  voice,
  onFormat,
  onFile,
  onInteractive,
}: {
  blocked: boolean
  audio: boolean
  hasAttachment: boolean
  busy: boolean
  uploading: boolean
  canSend: boolean
  voice: ReturnType<typeof useVoiceRecorder>
  onFormat: (marker: string) => void
  onFile: (file: File) => void
  onInteractive: () => void
}) {
  const picker = useRef<HTMLInputElement>(null)

  return (
    <div className="composer-toolbar">
      <div className="composer-tools">
        {[
          { label: 'Negrita', marker: '*', Icon: Bold },
          { label: 'Cursiva', marker: '_', Icon: Italic },
          { label: 'Tachado', marker: '~', Icon: Strikethrough },
          { label: 'Monoespaciado', marker: '```', Icon: Code2 },
        ].map(({ label, marker, Icon }) => (
          <Button
            key={label}
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            title={label}
            disabled={blocked || audio}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onFormat(marker)}
          >
            <Icon />
          </Button>
        ))}
        <span className="composer-divider" />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Adjuntar archivo"
          title="Adjuntar archivo"
          disabled={blocked}
          onClick={() => picker.current?.click()}
        >
          <Paperclip />
        </Button>
        <input
          ref={picker}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-label="Archivo adjunto"
          accept={mediaAccept}
          disabled={blocked}
          onChange={(event) => {
            const file = event.target.files?.[0]

            if (file) onFile(file)

            event.target.value = ''
          }}
        />
      </div>
      <div className="composer-tools">
        {voice.status !== 'idle' ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Cancelar grabación"
              onClick={voice.cancel}
            >
              <Trash2 />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Detener grabación"
              disabled={voice.status !== 'recording'}
              onClick={voice.stop}
            >
              <Square className="text-red-500" />
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Mensaje interactivo"
              title="Mensaje interactivo"
              disabled={blocked}
              onClick={onInteractive}
            >
              <MousePointerClick />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Grabar audio"
              title="Grabar audio"
              disabled={blocked || hasAttachment}
              onClick={() => void voice.start()}
            >
              <Mic />
            </Button>
          </>
        )}
        <Button
          type="submit"
          size="icon-sm"
          className="composer-send"
          aria-label={
            uploading ? 'Subiendo archivo…' : busy ? 'Enviando…' : 'Enviar'
          }
          title="Enviar · Enter"
          disabled={blocked || !canSend}
        >
          {busy ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
        </Button>
      </div>
    </div>
  )
}
