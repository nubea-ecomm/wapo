import { WapoError } from '@nubea-ecomm/wapo-sdk'
import type { Session } from '../app/session-context'

export interface UploadedMedia {
  id: string
  type: 'image' | 'video' | 'audio' | 'document'
  filename: string
  mime_type: string
  voice: boolean
}

export const mediaAccept =
  '.jpg,.jpeg,.png,.mp4,.3gp,.mp3,.m4a,.aac,.amr,.ogg,.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx'

export function mediaLimit(file: File) {
  if (file.type.startsWith('image/')) return 5 * 1024 * 1024

  if (/^(audio|video)\//.test(file.type)) return 16 * 1024 * 1024

  return 100 * 1024 * 1024
}

async function mediaRequest(
  session: Session | null,
  path: string,
  options: RequestInit = {},
) {
  if (!session) throw new Error('Iniciá sesión para acceder al archivo.')

  const response = await fetch(`${session.url.replace(/\/$/, '')}${path}`, {
    ...options,
    redirect: 'error',
    signal: options.signal || AbortSignal.timeout(180_000),
    headers: {
      'X-API-Key': session.key,
      ...(session.role === 'operator'
        ? { 'X-Tenant-ID': session.tenantId }
        : {}),
    },
  })

  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ error: { message: 'No se pudo acceder al archivo.' } }))

    throw new WapoError(response.status, body)
  }

  return response
}

export async function uploadChatMedia(
  session: Session | null,
  connection: string,
  file: File,
  voice = false,
) {
  if (!file.size || file.size > mediaLimit(file))
    throw new Error(
      'El archivo está vacío o supera el tamaño permitido: imágenes 5 MB, audio/video 16 MB, documentos 100 MB.',
    )

  const body = new FormData()

  body.set('file', file)
  body.set('voice', String(voice))
  const response = await mediaRequest(
    session,
    `/v1/connections/${encodeURIComponent(connection)}/media`,
    { method: 'POST', body },
  )

  return ((await response.json()) as { data: UploadedMedia }).data
}

export async function downloadChatMedia(
  session: Session | null,
  connection: string,
  id: string,
  signal?: AbortSignal,
) {
  return (
    await mediaRequest(
      session,
      `/v1/connections/${encodeURIComponent(connection)}/media/${encodeURIComponent(id)}`,
      { signal },
    )
  ).blob()
}

export function mediaPayload(media: UploadedMedia, caption: string) {
  return {
    type: media.type,
    [media.type]: {
      id: media.id,
      ...(media.type === 'document' ? { filename: media.filename } : {}),
      ...(media.type !== 'audio' && caption.trim()
        ? { caption: caption.trim() }
        : {}),
      ...(media.voice ? { voice: true } : {}),
    },
  }
}
