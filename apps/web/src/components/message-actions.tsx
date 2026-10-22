import { useRef, useState } from 'react'
import { CornerUpLeft, SmilePlus, Trash2, LoaderCircle } from 'lucide-react'
import type { Message } from '@nubea-ecomm/wapo-sdk'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Button } from './ui/button'
import { ErrorNotice } from './ui'

const emojis = [
  '👍',
  '❤️',
  '😂',
  '😮',
  '😢',
  '🙏',
  '🎉',
  '🔥',
  '👏',
  '✅',
  '💯',
  '😍',
  '👀',
  '🙌',
  '🤔',
  '😊',
]

export function MessageActions({
  message,
  canReply,
  canReact,
  onReply,
  onReact,
}: {
  message: Message
  canReply: boolean
  canReact: boolean
  onReply: () => void
  onReact: (emoji: string, key: string) => Promise<unknown>
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const [custom, setCustom] = useState('')
  const attempt = useRef<{ emoji: string; key: string } | null>(null)
  const own = message.reactions?.find(
    (item) => item.direction === 'outbound',
  )?.emoji

  async function react(value: string) {
    if (busy || !canReact) return

    const emoji = own === value ? '' : value

    if (
      emoji &&
      (!/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(
        emoji,
      ) ||
        [
          ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
            emoji,
          ),
        ].length !== 1)
    ) {
      setError(new Error('Elegí un solo emoji.'))

      return
    }

    if (!attempt.current || attempt.current.emoji !== emoji)
      attempt.current = { emoji, key: crypto.randomUUID() }

    setBusy(true)
    setError(undefined)

    try {
      await onReact(emoji, attempt.current.key)
      attempt.current = null
      setOpen(false)
      setCustom('')
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="message-actions"
      data-open={open || undefined}
    >
      <button
        type="button"
        aria-label="Responder a este mensaje"
        title="Responder"
        disabled={!canReply || busy}
        onClick={onReply}
      >
        <CornerUpLeft size={17} />
      </button>
      {canReact && (
        <Popover
          open={open}
          onOpenChange={(value) => {
            if (!busy) setOpen(value)
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Reaccionar a este mensaje"
              title="Reaccionar"
              disabled={busy}
            >
              {busy ? (
                <LoaderCircle
                  className="animate-spin"
                  size={17}
                />
              ) : (
                <SmilePlus size={17} />
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="reaction-picker"
            side="top"
            align="center"
          >
            <span className="text-xs font-medium">Reaccionar al mensaje</span>
            <div className="reaction-picker-grid">
              {emojis.map((emoji) => (
                <button
                  type="button"
                  key={emoji}
                  aria-label={`Reaccionar con ${emoji}`}
                  aria-pressed={own === emoji}
                  disabled={busy}
                  onClick={() => void react(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <form
              className="reaction-custom"
              onSubmit={(event) => {
                event.preventDefault()
                void react(custom.trim())
              }}
            >
              <input
                aria-label="Otro emoji"
                placeholder="Otro emoji…"
                value={custom}
                maxLength={32}
                disabled={busy}
                onChange={(event) => setCustom(event.target.value)}
              />
              <Button
                type="submit"
                size="sm"
                variant="ghost"
                disabled={busy || !custom.trim()}
              >
                Aplicar
              </Button>
            </form>
            {own && (
              <Button
                className="w-full"
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void react('')}
              >
                <Trash2 /> Quitar reacción
              </Button>
            )}
            <ErrorNotice error={error} />
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
