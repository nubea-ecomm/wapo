import { permissions } from '../app/permissions'
import { useState } from 'react'
import type { ProjectSettings as Project } from '@wapo/sdk'
import { Building2, Upload, Save, Trash2 } from 'lucide-react'
import { useSession } from '../app/session-context'
import { useApi, useAction } from '../hooks/use-api'
import { Panel, Field, ErrorNotice, Loading } from './ui'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { NativeSelect } from './ui/native-select'
import { ProjectBrandingPreview } from './project-branding-preview'

export function ProjectSettings() {
  const { session } = useSession()
  const settings = useApi<{ data: Project }>('/v1/project')
  if (!session?.tenantId)
    return (
      <Panel title="Proyecto">
        <p className="muted">Seleccioná un proyecto.</p>
      </Panel>
    )
  if (settings.isLoading)
    return (
      <Panel title="Proyecto">
        <Loading variant="settings" />
      </Panel>
    )
  if (!settings.data) return <ErrorNotice error={settings.error} />
  return (
    <ProjectSettingsForm
      key={`${session.id}:${settings.data.data.name}`}
      project={settings.data.data}
    />
  )
}

function ProjectSettingsForm({ project }: { project: Project }) {
  const { client, selectTenant, session } = useSession()
  const { canManageProject } = permissions(session)
  const [name, setName] = useState(project.name)
  const [branding, setBranding] = useState(project.branding)
  const [fileError, setFileError] = useState<unknown>(null)
  const [reading, setReading] = useState(false)
  const [saved, setSaved] = useState(false)
  const save = useAction(async () => {
    await client.updateProject({ name: name.trim(), branding })
    selectTenant(project.id, name.trim())
    setSaved(true)
  })
  const changed =
    name.trim() !== project.name ||
    JSON.stringify(branding) !== JSON.stringify(project.branding)
  function updateBranding(patch: Partial<Project['branding']>) {
    setBranding((current) => ({ ...current, ...patch }))
    setSaved(false)
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (canManageProject) save.mutate()
      }}
      className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]"
    >
      <fieldset disabled={!canManageProject} className="min-w-0">
        <Panel title="General">
          <Field label="Nombre del proyecto">
            <Input
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                setSaved(false)
              }}
              required
              maxLength={120}
            />
          </Field>
          <p className="mt-3 text-xs text-muted-foreground">
            Aparece en la consola y en los enlaces de conexión.
          </p>
        </Panel>
        <Panel title="Identidad del enlace">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex size-16 items-center justify-center overflow-hidden rounded-lg border bg-muted">
              {branding.logo_data_url ? (
                <img
                  src={branding.logo_data_url}
                  alt="Logo del proyecto"
                  className="size-full object-contain p-1"
                />
              ) : (
                <Building2 className="size-6 text-muted-foreground" />
              )}
            </div>
            <div className="grid gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium">
                <Upload className="size-4" />
                {reading ? 'Cargando…' : 'Subir logo'}
                <input
                  className="sr-only"
                  aria-label="Subir logo"
                  type="file"
                  accept="image/png,image/jpeg"
                  disabled={reading || save.isPending}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (!file) return
                    setFileError(null)
                    if (
                      !['image/png', 'image/jpeg'].includes(file.type) ||
                      file.size > 5 * 1024 * 1024
                    ) {
                      setFileError(new Error('Usá PNG o JPG de hasta 5 MB.'))
                      return
                    }
                    setReading(true)
                    const reader = new FileReader()
                    reader.onload = () => {
                      updateBranding({ logo_data_url: String(reader.result) })
                      setReading(false)
                    }
                    reader.onerror = () => {
                      setFileError(new Error('No se pudo leer el archivo.'))
                      setReading(false)
                    }
                    reader.readAsDataURL(file)
                  }}
                />
              </label>
              <span className="text-xs text-muted-foreground">
                PNG o JPG. Hasta 5 MB.
              </span>
            </div>
            {branding.logo_data_url && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => updateBranding({ logo_data_url: '' })}
              >
                <Trash2 />
                Quitar logo
              </Button>
            )}
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field label="Color de acento">
              <div className="flex items-center gap-2">
                <Input
                  aria-label="Color de acento"
                  type="color"
                  className="w-12 p-1"
                  value={branding.accent_color}
                  onChange={(event) =>
                    updateBranding({ accent_color: event.target.value })
                  }
                />
                <code className="text-xs text-muted-foreground">
                  {branding.accent_color}
                </code>
              </div>
            </Field>
            <Field label="Tema del enlace">
              <NativeSelect
                value={branding.theme}
                onChange={(event) =>
                  updateBranding({ theme: event.target.value as 'light' | 'dark' })
                }
              >
                <option value="light">Claro</option>
                <option value="dark">Oscuro</option>
              </NativeSelect>
            </Field>
          </div>
        </Panel>
        <ErrorNotice error={fileError || save.error} />
        <div className="mb-5 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground" role="status">
            {save.isPending
              ? 'Guardando…'
              : saved
                ? 'Cambios guardados.'
                : 'Los cambios se aplican a todos los enlaces del proyecto.'}
          </p>
          <Button
            className={!canManageProject ? 'hidden' : undefined}
            disabled={!changed || !name.trim() || reading || save.isPending}
          >
            <Save />
            {save.isPending ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </div>
      </fieldset>
      <ProjectBrandingPreview name={name} branding={branding} />
    </form>
  )
}
