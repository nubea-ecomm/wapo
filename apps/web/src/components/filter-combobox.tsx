import { useId, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Button } from './ui/button'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './ui/command'

export interface FilterOption {
  value: string
  label: string
  keywords?: string
}

export function FilterCombobox({
  label,
  value,
  options,
  onChange,
  searchPlaceholder = 'Buscar…',
}: {
  label: string
  value: string
  options: FilterOption[]
  onChange: (value: string) => void
  searchPlaceholder?: string
}) {
  const [open, setOpen] = useState(false)
  const listID = useId()
  const selected = options.find((option) => option.value === value)

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listID}
          className="h-8 w-full justify-between px-2.5 text-xs font-normal"
        >
          <span className="truncate">{selected?.label || label}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-52 p-0"
      >
        <Command>
          <CommandInput
            placeholder={searchPlaceholder}
            aria-label={`Buscar ${label}`}
          />
          <CommandList id={listID}>
            <CommandEmpty>Sin resultados.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={`${option.value}:${option.label}`}
                  value={`${option.label} ${option.keywords || ''}`}
                  onSelect={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {option.label}
                  </span>
                  {option.value === value && (
                    <Check className="ml-auto size-4" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
