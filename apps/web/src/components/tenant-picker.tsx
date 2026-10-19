import { ProjectAvatar } from './project-avatar'
import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import type { Page, Project } from '@wapo/sdk'
import { useSession } from '../app/session-context'
import { useApi } from '../hooks/use-api'
import { Button } from './ui/button'
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from './ui/command'

export function TenantPicker() {
  const { session, selectTenant } = useSession()
  const [open, setOpen] = useState(false)
  const tenants = useApi<Page<Project>>('/admin/v1/tenants', {
    admin: true,
    enabled: session?.role === 'operator',
  })
  const projectSettings = useApi<{ data: Project }>('/v1/project', {
    enabled: session?.role !== 'operator',
  })
  const activeProject = tenants.data?.data.find(
    (project) => project.id === session?.tenantId,
  )

  if (session?.role !== 'operator')
    return (
      <div className="workspace-picker">
        <ProjectAvatar
          name={session?.tenantName || ''}
          logoUrl={projectSettings.data?.data.logo_url}
        />
        <span className="truncate text-sm">{session?.tenantName}</span>
      </div>
    )

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-controls="tenant-options"
          aria-label="Proyecto activo"
          className="tenant-picker-trigger"
        >
          <ProjectAvatar
            name={session.tenantName}
            logoUrl={activeProject?.logo_url}
          />
          <span className="min-w-0 flex-1 truncate text-left">
            {session.tenantName || 'Elegí un proyecto'}
          </span>
          <ChevronsUpDown className="size-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 max-w-[calc(100vw-2rem)] p-0"
      >
        <Command
          filter={(value, search) =>
            value.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput
            placeholder="Buscar proyecto…"
            aria-label="Buscar proyecto"
          />
          <CommandList id="tenant-options">
            <CommandEmpty>
              {tenants.isLoading
                ? 'Cargando proyectos…'
                : tenants.error
                  ? 'No se pudieron cargar los proyectos.'
                  : 'No se encontraron proyectos.'}
            </CommandEmpty>
            <CommandGroup heading="Proyectos">
              {tenants.data?.data
                .filter((tenant) => tenant.status === 'active')
                .map((tenant) => (
                  <CommandItem
                    key={tenant.id}
                    value={`${tenant.name} ${tenant.id}`}
                    onSelect={() => {
                      selectTenant(tenant.id, tenant.name)
                      setOpen(false)
                    }}
                  >
                    <ProjectAvatar
                      name={tenant.name}
                      logoUrl={tenant.logo_url}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{tenant.name}</span>
                    </span>
                    {tenant.id === session.tenantId && (
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
