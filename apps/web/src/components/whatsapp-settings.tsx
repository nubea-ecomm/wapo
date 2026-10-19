import { MetaCredentialsGuide } from './meta-credentials-guide'
import { permissions } from '../app/permissions'
import { WhatsAppIcon } from './icons/whatsapp-icon'
import { ExternalLink, RefreshCw } from 'lucide-react'
import type { WhatsAppSettings as Settings } from '@wapo/sdk'
import { Link } from 'react-router-dom'
import { useSession } from '../app/session-context'
import { useApi } from '../hooks/use-api'
import { Panel, ErrorNotice, Loading, Status } from './ui'
import { Button } from './ui/button'
import { CopyCode } from './copy-code'
const credentials = [
  {
    name: 'META_APP_ID',
    source: 'Configuración de la app → Básica → App ID.',
  },
  {
    name: 'META_APP_SECRET',
    source: 'Configuración de la app → Básica → App Secret → Mostrar.',
  },
  {
    name: 'META_EMBEDDED_SIGNUP_CONFIG_ID',
    source: 'Facebook Login for Business → Configuraciones → Configuration ID.',
  },
  {
    name: 'META_VERIFY_TOKEN',
    source:
      'Un token aleatorio que elegís vos. Debe coincidir con el que pongas en los webhooks de Meta.',
  },
] as const
export function WhatsAppSettings() {
  const { session } = useSession()
  const settings = useApi<{ data: Settings }>('/admin/v1/settings/whatsapp', {
    admin: true,
    enabled: permissions(session).canManagePlatform,
  })
  const me = useApi<{ data: { onboarding_ready: boolean } }>('/v1/me')
  const config = settings.data?.data
  const ready = config?.onboarding_ready ?? me.data?.data.onboarding_ready
  const publicUrl = (config?.public_url || session?.url || '').replace(
    /\/$/,
    '',
  )
  const callback = session?.tenantId
    ? `${publicUrl}/hooks/meta/${encodeURIComponent(session.tenantId)}`
    : ''
  const envExample = `META_APP_ID=<id-de-tu-app>
META_APP_SECRET=<secreto-de-tu-app>
META_EMBEDDED_SIGNUP_CONFIG_ID=<id-de-embedded-signup>
META_VERIFY_TOKEN=<token-aleatorio-que-elegis>
META_GRAPH_VERSION=${config?.graph_version || 'v24.0'}
PUBLIC_URL=https://api.tu-dominio.com
WEB_ORIGIN=${window.location.origin}`
  if (settings.isLoading || me.isLoading)
    return (
      <Panel title="Configurar WhatsApp">
        <Loading variant="settings" />
      </Panel>
    )
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <WhatsAppIcon size={20} />
          Configurar WhatsApp
        </span>
      }
      action={
        <Button
          size="sm"
          variant="outline"
          disabled={settings.isFetching || me.isFetching}
          onClick={() => {
            void settings.refetch()
            void me.refetch()
          }}
        >
          <RefreshCw
            className={
              settings.isFetching || me.isFetching ? 'animate-spin' : ''
            }
          />
          {settings.isFetching || me.isFetching
            ? 'Verificando…'
            : 'Verificar configuración'}
        </Button>
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">
        Configurá tu aplicación de Meta una sola vez en el servidor. Después,
        cada cliente podrá autorizar su número desde un enlace.
      </p>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Status
          value={
            ready === undefined ? 'unknown' : ready ? 'configured' : 'warning'
          }
          label={
            ready === undefined
              ? 'Comprobando credenciales…'
              : ready
                ? 'Credenciales configuradas'
                : 'Faltan credenciales'
          }
        />
        {config && !config.public_https && (
          <Status
            value="warning"
            label="Falta una URL pública HTTPS para Meta"
          />
        )}
        <span className="text-xs text-muted-foreground">
          Los valores secretos no se muestran en la consola.
        </span>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        La comprobación detecta variables en el servidor. La autorización del
        número confirma el acceso a Meta.
      </p>
      <Button
        variant="outline"
        size="sm"
        asChild
        className="mb-5"
      >
        <a
          href={`${session?.url}/docs#meta-setup`}
          target="_blank"
          rel="noreferrer"
        >
          Ver guía completa
          <ExternalLink />
        </a>
      </Button>
      <ErrorNotice error={settings.error || me.error} />
      <ol className="grid gap-7 text-sm">
        <li className="grid gap-2">
          <h3 className="m-0 text-sm font-semibold">
            1. Obtené las credenciales en Meta
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Creá o seleccioná tu aplicación para empresas, agregá WhatsApp y
            configurá Embedded Signup. Para ofrecer Coexistence, habilitá
            también el flujo de WhatsApp Business App en esa configuración.
            Completá los permisos y las verificaciones que Meta requiera para tu
            app.
          </p>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="w-fit"
          >
            <a
              href="https://developers.facebook.com/apps/"
              target="_blank"
              rel="noreferrer"
            >
              Abrir Meta for Developers
              <ExternalLink />
            </a>
          </Button>
          <MetaCredentialsGuide />
          <div className="mt-2 divide-y rounded-md border">
            {credentials.map((item) => (
              <div
                className="grid gap-2 p-3 sm:grid-cols-[1fr_auto]"
                key={item.name}
              >
                <div>
                  <code className="text-xs font-medium">{item.name}</code>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {item.source}
                  </p>
                </div>
                <Status
                  value={
                    !config
                      ? 'unknown'
                      : config.credentials[item.name]
                        ? 'configured'
                        : 'pending'
                  }
                />
              </div>
            ))}
          </div>
        </li>
        <li>
          <h3 className="m-0 text-sm font-semibold">
            2. Guardalas en el archivo .env del servidor
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Editá el archivo .env en la raíz del proyecto y reemplazá los
            ejemplos por tus valores. PUBLIC_URL debe ser la dirección HTTPS
            pública de la API. Si trabajás en local, usá un túnel HTTPS; Meta no
            puede llamar a localhost. WEB_ORIGIN es la dirección de la consola.
          </p>
          <CopyCode
            value={envExample}
            label="Copiar ejemplo .env"
          />
          <p className="text-xs text-muted-foreground">
            Para crear META_VERIFY_TOKEN podés usar:
          </p>
          <CopyCode value="openssl rand -hex 32" />
        </li>
        <li>
          <h3 className="m-0 text-sm font-semibold">
            3. Reiniciá los servicios
          </h3>
          <p className="mt-2 text-xs text-muted-foreground">
            Con Docker Compose, ejecutá este comando desde la raíz del proyecto.
            Después usá “Verificar configuración”.
          </p>
          <CopyCode value="docker compose up -d --build migrate api worker" />
          <p className="text-xs text-muted-foreground">
            Si ejecutás el binario directamente, exportá esas variables en su
            entorno y reiniciá el proceso.
          </p>
        </li>
        <li>
          <h3 className="m-0 text-sm font-semibold">
            4. Configurá el webhook y el dominio en Meta
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Autorizá el dominio de PUBLIC_URL en la configuración de tu app.
            Para el proyecto seleccionado, usá esta URL de callback y el mismo
            META_VERIFY_TOKEN como token de verificación.
          </p>
          {callback ? (
            <CopyCode
              value={callback}
              label="Copiar callback"
            />
          ) : (
            <p className="my-3 text-xs text-muted-foreground">
              Seleccioná un proyecto para ver su callback.
            </p>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">
            Suscribí los eventos messages y account_update. Para Coexistence,
            agregá smb_message_echoes, history y smb_app_state_sync. Wapo valida
            las firmas con META_APP_SECRET. Para templates, suscribí
            message_template_status_update, template_category_update y
            message_template_quality_update.
          </p>
        </li>
        <li>
          <h3 className="m-0 text-sm font-semibold">
            5. Conectá el número del cliente
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            En Customers, elegí “Conectar WhatsApp” y generá el enlace. Por
            defecto, el cliente podrá elegir Coexistence o Solo API. Meta
            devuelve la autorización y Wapo guarda el token cifrado.
          </p>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="mt-3"
          >
            <Link to="/customers">Ir a Customers</Link>
          </Button>
        </li>
      </ol>
      <div className="mt-6 rounded-md border bg-muted/30 p-4">
        <h3 className="m-0 text-sm font-medium">
          ¿Ya tenés un número en Cloud API?
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Podés conectarlo desde Conexiones → Conectar WhatsApp → Usar
          credenciales de Meta, con su Phone Number ID, el WhatsApp Business
          Account ID y un access token con acceso a ese número. Esas
          credenciales se cargan por conexión; no van en las variables globales
          de la app.
        </p>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="mt-3"
        >
          <Link to="/connections">Ir a Conexiones</Link>
        </Button>
      </div>
    </Panel>
  )
}
