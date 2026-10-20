async function copyText(source: string) {
  try {
    await navigator.clipboard.writeText(source)

    return
  } catch {
    const focused = document.activeElement
    const field = document.createElement('textarea')

    field.value = source
    field.readOnly = true
    field.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0'
    document.body.append(field)

    try {
      field.select()

      if (!document.execCommand('copy')) throw new Error('Copy failed')
    } finally {
      field.remove()

      if (focused instanceof HTMLElement) focused.focus({ preventScroll: true })
    }
  }
}

document
  .querySelectorAll<HTMLButtonElement>('[data-copy-code]')
  .forEach((button) => {
    let resetTimer: number | undefined
    const panel = button.closest('.code-panel')
    const feedback = panel?.querySelector<HTMLElement>('[data-copy-feedback]')
    const label = button.querySelector<HTMLElement>('[data-copy-text]')

    button.addEventListener('click', async () => {
      const source = Array.from(panel?.querySelectorAll('.line-code') ?? [])
        .map((line) => line.textContent ?? '')
        .join('\n')

      if (!source) return

      window.clearTimeout(resetTimer)
      button.disabled = true
      button.classList.remove('is-copied')

      if (feedback) feedback.textContent = ''

      try {
        await copyText(source)
        const copied = button.dataset.copiedLabel ?? 'Copied'

        button.classList.add('is-copied')
        button.setAttribute('aria-label', copied)
        button.title = copied

        if (label) label.textContent = copied

        if (feedback) feedback.textContent = copied
      } catch {
        if (feedback)
          feedback.textContent = button.dataset.errorLabel ?? 'Could not copy'
      } finally {
        button.disabled = false
        resetTimer = window.setTimeout(() => {
          button.classList.remove('is-copied')
          const original = button.dataset.copyLabel ?? 'Copy'

          button.setAttribute('aria-label', original)
          button.title = original

          if (label) label.textContent = original

          if (feedback) feedback.textContent = ''
        }, 2600)
      }
    })
  })

document
  .querySelectorAll<HTMLButtonElement>('[data-replay-demo]')
  .forEach((button) => {
    const panel = button.closest('.request-panel')
    const steps = Array.from(
      panel?.querySelectorAll<HTMLElement>('.request-step') ?? [],
    )
    const status = panel?.querySelector<HTMLElement>('[data-demo-status]')

    button.addEventListener('click', async () => {
      button.disabled = true
      panel?.classList.add('is-replaying')

      if (status) status.textContent = ''

      steps.forEach((step) => step.classList.remove('done'))

      for (const step of steps) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 450))
        step.classList.add('done')
      }

      panel?.classList.remove('is-replaying')

      if (status)
        status.textContent =
          steps.at(-1)?.querySelector('span')?.textContent ?? ''

      button.disabled = false
    })
  })
