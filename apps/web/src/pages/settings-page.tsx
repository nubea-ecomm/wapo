import { permissions } from '../app/permissions'
import { useState } from 'react'
import { ProjectSettings } from '../components/project-settings'
import { WhatsAppSettings } from '../components/whatsapp-settings'
import { Button } from '../components/ui/button'
import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { useSession } from '../app/session-context'
import { PageHeader, Panel } from '../components/ui'
export function SettingsPage() {
  const [tab, setTab] = useState('project')
  const { session } = useSession()
  return (
    <>
      <PageHeader
        title="Configuración"
        description="Administrá tu proyecto y sus integraciones."
      />
      <div
        role="tablist"
        aria-label="Configuración"
        className="mb-6 flex gap-1 border-b pb-2"
      >
        {[
          ['project', 'Proyecto'],
          ['whatsapp', 'WhatsApp'],
          ['api', 'API'],
        ].map(([value, label]) => (
          <Button
            type="button"
            key={value}
            role="tab"
            id={`settings-${value}`}
            aria-controls={`panel-${value}`}
            aria-selected={tab === value}
            variant={tab === value ? 'secondary' : 'ghost'}
            onClick={() => setTab(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`settings-${tab}`}>
        {tab === 'project' && <ProjectSettings />}
        {tab === 'whatsapp' && <WhatsAppSettings />}
        {tab === 'api' && (
          <>
            <div className="overview-grid">
              <Panel title="Proyecto activo">
                <dl className="settings-list">
                  <dt>Instancia</dt>
                  <dd>{session?.url}</dd>
                  <dt>Proyecto</dt>
                  <dd className="mono">{session?.tenantId || 'Sin seleccionar'}</dd>
                  <dt>Rol</dt>
                  <dd>
                    {session?.role === 'operator'
                      ? 'Operador global'
                      : 'Acceso de proyecto'}
                  </dd>
                </dl>
              </Panel>
              <Panel title="Integrá tu aplicación">
                <p className="muted">
                  Accedé a la API de Wapo con una clave del proyecto.
                </p>
                <pre className="code-block">{`curl ${session?.url}/v1/customers -H "X-API-Key: <tu-api-key>"`}</pre>
                {permissions(session).canManageProject && (
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/api-keys">Administrar claves</Link>
                  </Button>
                )}
              </Panel>
              <Panel title="API pública">
                <p className="muted">
                  Referencia interactiva, ejemplos y especificación legible por
                  herramientas.
                </p>
                <div className="row-actions">
                  <Button variant="outline" size="default" asChild>
                    <a href={`${session?.url}/docs`} target="_blank" rel="noreferrer">
                      Documentación <ExternalLink size={14} />
                    </a>
                  </Button>
                  <Button variant="outline" size="default" asChild>
                    <a
                      href={`${session?.url}/openapi.json`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      OpenAPI JSON <ExternalLink size={14} />
                    </a>
                  </Button>
                </div>
              </Panel>
            </div>
          </>
        )}
      </div>
    </>
  )
}
