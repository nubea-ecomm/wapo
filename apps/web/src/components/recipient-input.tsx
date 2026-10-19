import { useId, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { Badge } from './ui/badge'
import { useI18n } from '../app/i18n'

const emailPattern = /^[^\s@,]+@[^\s@,]+$/

export function RecipientInput({
  id,
  value,
  onChange,
  disabled,
  suggestions = [],
  max = 10,
}: {
  id?: string
  value: string[]
  onChange: (recipients: string[]) => void
  disabled?: boolean
  suggestions?: Array<{ id: string; name: string; email: string }>
  max?: number
}) {
  const { t } = useI18n()
  const generatedID = useId()
  const inputID = id ?? generatedID
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(0)
  const available = suggestions.filter((suggestion) => {
    const query = draft.trim().toLowerCase()

    return (
      !value.includes(suggestion.email.toLowerCase()) &&
      (!query ||
        suggestion.email.toLowerCase().includes(query) ||
        suggestion.name.toLowerCase().includes(query))
    )
  })
  const listOpen = focused && available.length > 0 && value.length < max

  function add(candidates: string[]) {
    const next = [...value]
    const rejected: string[] = []
    let limitReached = false

    for (const candidate of candidates) {
      const email = candidate.trim().toLowerCase()

      if (!email) continue

      if (!emailPattern.test(email)) {
        rejected.push(candidate.trim())
      } else if (!next.includes(email) && next.length < max) {
        next.push(email)
      } else if (!next.includes(email)) {
        rejected.push(candidate.trim())
        limitReached = true
      }
    }

    if (next.length !== value.length) onChange(next)

    if (rejected.length > 0) {
      setError(
        limitReached
          ? t('notifications.recipientLimit')
          : t('notifications.invalidRecipient'),
      )
    } else {
      setError('')
    }

    return rejected.join(', ')
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target.value

    if (!input.includes(',')) {
      setDraft(input)
      setError('')
      setActive(0)

      return
    }

    const parts = input.split(',')
    const trailing = input.endsWith(',') ? '' : (parts.pop() ?? '')

    setDraft([add(parts), trailing].filter(Boolean).join(', '))
  }

  function commit() {
    if (draft.trim()) setDraft(add(draft.split(',')))
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && listOpen) {
      event.preventDefault()
      setActive((current) => (current + 1) % available.length)
    } else if (event.key === 'ArrowUp' && listOpen) {
      event.preventDefault()
      setActive((current) =>
        current === 0 ? available.length - 1 : current - 1,
      )
    } else if (event.key === 'Enter' && listOpen) {
      event.preventDefault()
      selectSuggestion(available[active] ?? available[0])
    } else if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commit()
    } else if (event.key === 'Escape') {
      setFocused(false)
    } else if (event.key === 'Backspace' && !draft && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  function selectSuggestion(suggestion: (typeof suggestions)[number]) {
    setDraft(add([suggestion.email]))
    setActive(0)
  }

  return (
    <div className="relative">
      <div
        className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30"
        aria-invalid={Boolean(error)}
      >
        <input
          id={inputID}
          type="email"
          value={draft}
          disabled={disabled || value.length >= max}
          className="h-8 w-full min-w-0 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          placeholder={value.length === 0 ? 'ops@example.com' : ''}
          aria-label={t('notifications.recipients')}
          aria-describedby={error ? `${inputID}-error` : undefined}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={listOpen}
          aria-controls={`${inputID}-suggestions`}
          aria-activedescendant={
            listOpen ? `${inputID}-suggestion-${active}` : undefined
          }
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            commit()
          }}
        />
        {value.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5 border-t pt-2">
            {value.map((email) => (
              <Badge
                key={email}
                variant="secondary"
                className="gap-1 py-1 pl-2.5 pr-1"
              >
                {email}
                <button
                  type="button"
                  disabled={disabled}
                  className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  aria-label={`${t('notifications.removeRecipient')} ${email}`}
                  onClick={() =>
                    onChange(value.filter((item) => item !== email))
                  }
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>
      {listOpen && (
        <div
          id={`${inputID}-suggestions`}
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <p className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
            {t('notifications.projectMembers')}
          </p>
          {available.map((suggestion, index) => (
            <button
              id={`${inputID}-suggestion-${index}`}
              key={suggestion.id}
              type="button"
              role="option"
              aria-selected={index === active}
              className="flex w-full items-center justify-between gap-4 rounded-sm px-2 py-2 text-left text-sm outline-none hover:bg-accent aria-selected:bg-accent"
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => selectSuggestion(suggestion)}
            >
              <span className="truncate font-medium">{suggestion.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {suggestion.email}
              </span>
            </button>
          ))}
        </div>
      )}
      {error && (
        <p
          id={`${inputID}-error`}
          className="mt-1.5 text-xs text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  )
}
