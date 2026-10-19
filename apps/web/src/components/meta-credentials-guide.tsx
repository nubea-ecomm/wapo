import { ExternalLink } from 'lucide-react'
const steps = [
  {
    title: 'Crear la app',
    items: [
      'Entrá en developers.facebook.com/apps y elegí Crear app.',
      'Seleccioná el caso de uso de WhatsApp y vinculá tu portafolio comercial. Si la app ya existe, abrila y comprobá que tenga WhatsApp.',
    ],
  },
  {
    title: 'Copiar App ID y App Secret',
    items: [
      'Abrí Configuración de la app → Básica (App settings → Basic).',
      'Copiá App ID en META_APP_ID. En App Secret, elegí Mostrar y copiá el valor en META_APP_SECRET. Son de la misma app.',
    ],
  },
  {
    title: 'Habilitar el alta de clientes',
    items: [
      'Wapo es open source: cada instalación usa sus propias credenciales. Si conectás otras empresas con tu app, completá el alta de proveedor que Meta solicite para esa instalación.',
      'Entrá en Casos de uso → WhatsApp → Personalizar → Inicio rápido → Hazte proveedor de tecnología → Continuar incorporación. Elegí proveedor independiente o la ruta con un Solution Partner según tu caso real.',
      'Revisá las condiciones y completá la verificación del portafolio. Si Incorporación queda en blanco, volvé a Inicio rápido y comprobá si falta este alta.',
    ],
  },
  {
    title: 'Crear la configuración de signup',
    items: [
      'Abrí Facebook Login for Business → Configuraciones y creá una configuración para WhatsApp Embedded Signup. Según tu app, también podés entrar desde Embedded Signup Builder.',
      'Guardala y copiá su Configuration ID en META_EMBEDDED_SIGNUP_CONFIG_ID. No es el ID del negocio, de la cuenta de WhatsApp ni del número.',
      'Para Coexistence, usá la variante de WhatsApp Business App disponible para tu app. Si no aparece, revisá la elegibilidad y el alta como Tech Provider en Meta.',
    ],
  },
  {
    title: 'Autorizar el sitio',
    items: [
      'En App Domains agregá el host público de la API, sin https:// ni rutas.',
      'En Facebook Login for Business, agregá el origen HTTPS que sirve /setup a Allowed Domains for the JavaScript SDK. Revisá también Valid OAuth Redirect URIs según la configuración de Meta. El webhook no es una URL de OAuth.',
    ],
  },
  {
    title: 'Revisar acceso y permisos',
    items: [
      'En desarrollo, probá con un usuario que tenga un rol de la app. Para customers externos, completá verificación del negocio, App Review y el acceso requerido por Meta.',
      'Revisá whatsapp_business_management y whatsapp_business_messaging. Embedded Signup puede requerir business_management según la configuración. Tener variables cargadas no concede estos permisos.',
    ],
  },
  {
    title: 'Completar la revisión y publicar',
    items: [
      'Entrá en Revisión → Revisión de la aplicación. Comprobá el estado del envío: Sin enviar significa que sigue siendo un borrador, aunque Incorporación muestre En revisión.',
      'Completá icono, categoría, contacto, política de privacidad y eliminación de datos. Describí quién opera esta instalación y cómo usa los permisos de WhatsApp.',
      'Grabá el envío desde Wapo y la recepción en WhatsApp para mensajería; grabá la creación y gestión de plantillas para administración. Realizá las llamadas de prueba que pide cada permiso; Meta indica que pueden tardar hasta 24 horas en reflejarse.',
      'Respondé Gestión de datos con el responsable, país, proveedores y políticas reales. Agregá una URL pública estable e instrucciones de acceso para el revisor. Después revisá el borrador, enviá y completá Publicar cuando Meta lo permita.',
    ],
  },
] as const
export function MetaCredentialsGuide() {
  return (
    <div className="divide-y rounded-lg border">
      {steps.map((step, index) => (
        <details
          key={step.title}
          className="group px-4 py-3"
          open={index === 0}
        >
          <summary className="cursor-pointer text-xs font-medium">
            {step.title}
          </summary>
          <ol className="mt-3 list-decimal space-y-2 pl-4 text-xs leading-relaxed text-muted-foreground">
            {step.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </details>
      ))}
      <div className="px-4 py-3">
        <a
          className="mb-3 block text-xs underline underline-offset-4"
          href={`${import.meta.env.VITE_API_URL || 'http://localhost:8080'}/docs#meta-setup`}
          target="_blank"
          rel="noreferrer"
        >
          Guía completa de configuración y revisión
        </a>
        <a
          className="inline-flex items-center gap-1 text-xs underline underline-offset-4"
          href="https://github.com/fbsamples/business-messaging-sample-tech-provider-app#3-meta-developer-app"
          target="_blank"
          rel="noreferrer"
        >
          Referencia oficial de Meta
          <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  )
}
