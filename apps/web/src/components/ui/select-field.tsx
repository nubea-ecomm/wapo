import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select'

type Option = { value: string; label: ReactNode; disabled: boolean }

function optionsFromChildren(children: ReactNode): Option[] {
  return Children.toArray(children).flatMap((child) => {
    if (
      !isValidElement<{
        value?: string | number
        children?: ReactNode
        disabled?: boolean
      }>(child)
    )
      return []

    if (child.type === Fragment)
      return optionsFromChildren(child.props.children)

    if (child.type !== 'option') return []

    return [
      {
        value: String(child.props.value ?? ''),
        label: child.props.children,
        disabled: child.props.disabled ?? false,
      },
    ]
  })
}

// Options are data descriptors only; no native select/option elements are rendered.
export function SelectField({
  children,
  value,
  onValueChange,
  required,
  name,
  disabled,
  ...props
}: Omit<
  ComponentProps<typeof SelectTrigger>,
  'children' | 'value' | 'onChange'
> & {
  children: ReactNode
  value: string
  onValueChange: (value: string) => void
  required?: boolean
  name?: string
}) {
  const options = useMemo(() => optionsFromChildren(children), [children])
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const triggerRef = useCallback(
    (node: HTMLButtonElement | null) =>
      setContainer(
        node?.closest<HTMLElement>('[role="dialog"], [role="alertdialog"]') ??
          null,
      ),
    [],
  )

  return (
    <Select
      items={options}
      value={value}
      onValueChange={(next) => onValueChange(next ?? '')}
      required={required}
      disabled={disabled}
      name={name}
    >
      <SelectTrigger
        {...props}
        ref={triggerRef}
      >
        <SelectValue className="min-w-0 flex-1 truncate" />
      </SelectTrigger>
      <SelectContent container={container}>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
