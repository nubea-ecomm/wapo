import { useEffect, useRef, useState } from 'react'

export function useVoiceRecorder(onReady: (file: File) => void) {
  const [status, setStatus] = useState<'idle' | 'requesting' | 'recording'>(
    'idle',
  )
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState('')
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const generation = useRef(0)
  const release = () => {
    clearInterval(timer.current)
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
  }

  useEffect(
    () => () => {
      generation.current++

      if (recorder.current?.state === 'recording') recorder.current.stop()

      clearInterval(timer.current)
      stream.current?.getTracks().forEach((track) => track.stop())
    },
    [],
  )

  async function start() {
    if (status !== 'idle') return

    const attempt = ++generation.current

    setError('')
    setStatus('requesting')

    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === 'undefined'
      )
        throw new Error(
          'Tu navegador necesita HTTPS y soporte de grabación de audio.',
        )

      const source = await navigator.mediaDevices.getUserMedia({ audio: true })

      if (generation.current !== attempt) {
        source.getTracks().forEach((track) => track.stop())

        return
      }

      stream.current = source
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ].find((type) => MediaRecorder.isTypeSupported(type))

      if (!mimeType)
        throw new Error(
          'Este navegador no ofrece un formato de grabación compatible.',
        )

      const active = new MediaRecorder(source, {
        mimeType,
        audioBitsPerSecond: 32000,
      })

      recorder.current = active
      const chunks: Blob[] = []
      let size = 0

      active.ondataavailable = ({ data }) => {
        if (data.size) {
          chunks.push(data)
          size += data.size

          if (size >= 15 * 1024 * 1024 && active.state === 'recording')
            active.stop()
        }
      }
      active.onerror = () => {
        if (generation.current !== attempt) {
          source.getTracks().forEach((track) => track.stop())

          return
        }

        setError('No se pudo grabar el audio.')
        generation.current++
        release()
        setStatus('idle')
      }
      active.onstop = () => {
        if (generation.current !== attempt) {
          source.getTracks().forEach((track) => track.stop())

          return
        }

        release()
        setStatus('idle')
        const blob = new Blob(chunks, { type: mimeType })

        if (blob.size)
          onReady(
            new File(
              [blob],
              `audio.${mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm'}`,
              { type: mimeType },
            ),
          )
        else setError('La grabación está vacía. Intentá nuevamente.')
      }
      active.start(250)
      setSeconds(0)
      setStatus('recording')
      const started = Date.now()

      timer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - started) / 1000)

        setSeconds(elapsed)

        if (elapsed >= 120 && active.state === 'recording') active.stop()
      }, 250)
    } catch (cause) {
      if (generation.current !== attempt) return

      release()
      setStatus('idle')
      setError(
        cause instanceof DOMException && cause.name === 'NotAllowedError'
          ? 'Permití el acceso al micrófono para grabar.'
          : cause instanceof Error
            ? cause.message
            : 'No se pudo acceder al micrófono.',
      )
    }
  }

  function stop() {
    if (recorder.current?.state === 'recording') recorder.current.stop()
  }

  function cancel() {
    generation.current++
    stop()
    release()
    setStatus('idle')
    setSeconds(0)
  }

  return { status, seconds, error, start, stop, cancel }
}
