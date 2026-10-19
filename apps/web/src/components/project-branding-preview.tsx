import type { ProjectSettings } from '@nubea-ecomm/wapo-sdk'
import { WhatsAppIcon } from './icons/whatsapp-icon'

export function ProjectBrandingPreview({
  name,
  branding,
}: {
  name: string
  branding: ProjectSettings['branding']
}) {
  const dark = branding.theme === 'dark'
  const text = parseInt(branding.accent_color.slice(1), 16)
  const luminance =
    ((text >> 16) * 299 + ((text >> 8) & 255) * 587 + (text & 255) * 114) / 1000

  return (
    <aside>
      <h2 className="mb-3 text-sm">Vista previa</h2>
      <div
        className="rounded-lg border p-5"
        style={{
          background: dark ? '#101010' : '#fafafa',
          color: dark ? '#fafafa' : '#171717',
        }}
      >
        <div
          className="rounded-lg border p-5"
          style={{
            background: dark ? '#191919' : '#fff',
            borderColor: dark ? '#333' : '#e5e5e5',
          }}
        >
          <div
            className="mb-6 flex items-center gap-3 border-b pb-4"
            style={{ borderColor: dark ? '#333' : '#e5e5e5' }}
          >
            {branding.logo_data_url && (
              <img
                src={branding.logo_data_url}
                alt=""
                className="size-10 object-contain"
              />
            )}
            <strong className="break-words text-sm">
              {name || 'Tu proyecto'}
            </strong>
          </div>
          <span style={{ color: branding.accent_color }}>
            <WhatsAppIcon size={28} />
          </span>
          <h3 className="mt-3 mb-2 text-lg">Conectá tu WhatsApp</h3>
          <p className="text-xs opacity-70">
            Conectá tu número con {name || 'tu proyecto'}.
          </p>
          <div
            className="mt-5 rounded-md px-3 py-2 text-center text-sm font-medium"
            style={{
              background: branding.accent_color,
              color: luminance > 150 ? '#171717' : '#fff',
            }}
          >
            Continuar con Meta
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Guardá para aplicar los cambios.
      </p>
    </aside>
  )
}
