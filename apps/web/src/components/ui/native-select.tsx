import type { ComponentProps } from 'react'
import { SelectField } from './select-field'

// Preserve the value-event API used by existing forms while rendering the shared
// Base UI / shadcn select. New forms can use SelectField's onValueChange directly.
export function NativeSelect({
  onChange,
  ...props
}: Omit<ComponentProps<typeof SelectField>, 'onValueChange'> & {
  onChange: (event: { target: { value: string } }) => void
}) {
  return (
    <SelectField
      {...props}
      onValueChange={(value) => onChange({ target: { value } })}
    />
  )
}
