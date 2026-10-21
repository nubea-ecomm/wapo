import { useEffect, useId, useRef, useState, type ComponentProps } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from './ui/input'
import { useI18n } from '../app/i18n'
import { passwordBytes, passwordScore } from '../lib/password-strength'

export function PasswordInput({
  value,
  strength = false,
  id,
  disabled,
  ...props
}: Omit<ComponentProps<'input'>, 'type' | 'value' | 'ref'> & {
  value: string
  strength?: boolean
}) {
  const { t } = useI18n()
  const generated = useId()
  const inputID = id || generated
  const feedbackID = `${inputID}-strength`
  const input = useRef<HTMLInputElement>(null)
  const [visible, setVisible] = useState(false)
  const [score, setScore] = useState<number | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const bytes = passwordBytes(value)
  const invalidLength = strength && bytes > 0 && (bytes < 12 || bytes > 72)
  const lengthMessage =
    bytes < 12 ? t('passwordStrength.short') : t('passwordStrength.long')

  useEffect(() => {
    input.current?.setCustomValidity(invalidLength ? lengthMessage : '')
  }, [invalidLength, lengthMessage])
  useEffect(() => {
    if (!value) setVisible(false)
  }, [value])
  useEffect(() => {
    setScore(null)
    setUnavailable(false)

    if (!strength || !value || bytes < 12 || bytes > 72) return

    let cancelled = false
    const timer = window.setTimeout(() => {
      void passwordScore(value)
        .then((result) => {
          if (!cancelled) setScore(result)
        })
        .catch(() => {
          if (!cancelled) setUnavailable(true)
        })
    }, 200)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [value, strength, bytes])
  const grade = invalidLength
    ? 'invalid'
    : score === null
      ? 'pending'
      : score < 2
        ? 'weak'
        : score === 2
          ? 'fair'
          : score === 3
            ? 'good'
            : 'strong'
  const label = invalidLength
    ? lengthMessage
    : score === null
      ? t(
          unavailable
            ? 'passwordStrength.unavailable'
            : 'passwordStrength.checking',
        )
      : t(
          score < 2
            ? 'passwordStrength.weak'
            : score === 2
              ? 'passwordStrength.fair'
              : score === 3
                ? 'passwordStrength.good'
                : 'passwordStrength.strong',
        )

  return (
    <div className="password-field">
      <div className="password-control">
        <Input
          {...props}
          ref={input}
          id={inputID}
          value={value}
          disabled={disabled}
          type={visible ? 'text' : 'password'}
          minLength={strength ? undefined : props.minLength}
          maxLength={strength ? undefined : props.maxLength}
          aria-invalid={invalidLength || props['aria-invalid']}
          aria-describedby={
            [props['aria-describedby'], strength && value ? feedbackID : null]
              .filter(Boolean)
              .join(' ') || undefined
          }
        />
        <button
          type="button"
          className="password-visibility"
          aria-label={t(
            visible ? 'passwordStrength.hide' : 'passwordStrength.show',
          )}
          aria-pressed={visible}
          aria-controls={inputID}
          disabled={disabled}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </div>
      {strength && value && (
        <div
          id={feedbackID}
          className="password-feedback"
          data-grade={grade}
          role="status"
          aria-live="polite"
        >
          <div
            className="password-meter"
            role="meter"
            aria-label={t('passwordStrength.label')}
            aria-valuemin={0}
            aria-valuemax={4}
            aria-valuenow={invalidLength ? 0 : (score ?? 0)}
            aria-valuetext={label}
          >
            {[1, 2, 3, 4].map((level) => (
              <span
                key={level}
                data-filled={
                  invalidLength
                    ? level === 1
                    : score !== null && level <= Math.max(1, score)
                }
              />
            ))}
          </div>
          <div className="password-summary">
            <span>{label}</span>
            <span>{bytes}/72 bytes</span>
          </div>
          {!invalidLength && (
            <p>
              {t(
                score !== null && score < 3
                  ? 'passwordStrength.advice'
                  : 'passwordStrength.estimate',
              )}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
