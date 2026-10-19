import type { Page, Project, UserRole } from '@wapo/sdk'
import { useState } from 'react'
import { useApi } from '../hooks/use-api'
import { Field, ErrorNotice, Loading } from './ui'
import { NativeSelect } from './ui/native-select'
import { Input } from './ui/input'
import { ProjectAvatar } from './project-avatar'

export interface UserAccessValue {
  role: UserRole
  all_projects: boolean
  project_ids: string[]
}

export function UserAccessFields({
  value,
  onChange,
}: {
  value: UserAccessValue
  onChange: (value: UserAccessValue) => void
}) {
  const projects = useApi<Page<Project>>('/admin/v1/tenants', { admin: true })
  const [search, setSearch] = useState('')
  const filtered = (projects.data?.data || []).filter((project) =>
    project.name.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="grid gap-4">
      <Field label="Rol">
        <NativeSelect
          value={value.role}
          onChange={(event) =>
            onChange({ ...value, role: event.target.value as UserRole })
          }
        >
          <option value="member">Member</option>
          <option value="viewer">Viewer</option>
          <option value="billing">Billing</option>
          <option value="admin">Admin</option>
        </NativeSelect>
      </Field>
      <p className="-mt-2 text-xs text-muted-foreground">
        {
          {
            admin: 'Administra los proyectos asignados.',
            member: 'Gestiona mensajes, customers, conexiones y webhooks.',
            viewer: 'Acceso de lectura. No puede crear claves de API.',
            billing: 'Consulta el resumen y los datos del proyecto.',
          }[value.role]
        }
      </p>
      <Field label="Acceso a proyectos">
        <NativeSelect
          value={value.all_projects ? 'all' : 'selected'}
          onChange={(event) =>
            onChange({ ...value, all_projects: event.target.value === 'all' })
          }
        >
          <option value="selected">Elegir proyectos</option>
          <option value="all">Todos los proyectos</option>
        </NativeSelect>
      </Field>
      {value.all_projects ? (
        <p className="text-xs text-muted-foreground">
          Incluye los proyectos que se creen en el futuro.
          {value.role === 'admin' &&
            ' Puede administrar usuarios y proyectos de toda la plataforma.'}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <div className="border-b p-2">
            <Input
              aria-label="Buscar proyectos para el usuario"
              placeholder="Buscar proyecto…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            {projects.isLoading && <Loading />}
            {filtered.map((project) => (
              <label
                key={project.id}
                className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-accent"
              >
                <input
                  aria-label={project.name}
                  type="checkbox"
                  className="size-4 shrink-0"
                  checked={value.project_ids.includes(project.id)}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      project_ids: event.target.checked
                        ? [...value.project_ids, project.id]
                        : value.project_ids.filter((id) => id !== project.id),
                    })
                  }
                />
                <ProjectAvatar
                  name={project.name}
                  logoUrl={project.logo_url}
                />
                <span className="truncate text-sm">{project.name}</span>
              </label>
            ))}
            {!projects.isLoading && !filtered.length && (
              <p className="p-3 text-xs text-muted-foreground">
                Sin proyectos.
              </p>
            )}
          </div>
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">
            {value.project_ids.length} seleccionados
          </p>
        </div>
      )}
      <ErrorNotice error={projects.error} />
    </div>
  )
}
