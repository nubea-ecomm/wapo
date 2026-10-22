import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useVoiceRecorder } from './use-voice-recorder'

afterEach(() => vi.unstubAllGlobals())

it('releases a microphone permission result that arrives after the composer unmounts', async () => {
  let grant!: (stream: MediaStream) => void
  const permission = new Promise<MediaStream>((resolve) => {
    grant = resolve
  })
  const getUserMedia = vi.fn(() => permission)

  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  vi.stubGlobal('MediaRecorder', class {})
  const onReady = vi.fn(),
    stop = vi.fn()
  const { result, unmount } = renderHook(() => useVoiceRecorder(onReady))
  let pending!: Promise<void>

  act(() => {
    pending = result.current.start()
  })
  await waitFor(() => expect(result.current.status).toBe('requesting'))
  unmount()
  await act(async () => {
    grant({ getTracks: () => [{ stop }] } as unknown as MediaStream)
    await pending
  })
  expect(stop).toHaveBeenCalledTimes(1)
  expect(onReady).not.toHaveBeenCalled()
})

it('shows a permission error without producing a recording', async () => {
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi
        .fn()
        .mockRejectedValue(new DOMException('Denied', 'NotAllowedError')),
    },
  })
  vi.stubGlobal('MediaRecorder', class {})
  const onReady = vi.fn()
  const { result } = renderHook(() => useVoiceRecorder(onReady))

  await act(() => result.current.start())
  expect(result.current.status).toBe('idle')
  expect(result.current.error).toContain('Permití')
  expect(onReady).not.toHaveBeenCalled()
})
