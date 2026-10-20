const header = document.querySelector<HTMLElement>('.site-header')
const toggle = header?.querySelector<HTMLButtonElement>('.menu-toggle')

if (header && toggle) {
  const languages = header.querySelector<HTMLDetailsElement>('.language-menu')
  const close = () => {
    if (languages) languages.open = false

    header.removeAttribute('data-menu-open')
    toggle.setAttribute('aria-expanded', 'false')
    toggle.setAttribute('aria-label', toggle.dataset.openLabel ?? 'Open menu')
  }

  toggle.addEventListener('click', () => {
    if (header.hasAttribute('data-menu-open')) return close()

    header.setAttribute('data-menu-open', '')
    toggle.setAttribute('aria-expanded', 'true')
    toggle.setAttribute('aria-label', toggle.dataset.closeLabel ?? 'Close menu')
  })
  header
    .querySelectorAll('.header-links a')
    .forEach((link) => link.addEventListener('click', close))
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && languages?.open) {
      languages.open = false
      languages.querySelector('summary')?.focus()

      return
    }

    if (event.key !== 'Escape' || !header.hasAttribute('data-menu-open')) return

    close()
    toggle.focus()
  })
  document.addEventListener('click', (event) => {
    if (
      languages &&
      event.target instanceof Node &&
      !languages.contains(event.target)
    )
      languages.open = false

    if (event.target instanceof Node && !header.contains(event.target)) close()
  })
  header.addEventListener('focusout', (event) => {
    // A null target can occur between pointer-down and link activation in Safari.
    // Only close for a confirmed keyboard focus move outside the navigation.
    if (
      event.relatedTarget instanceof Node &&
      !header.contains(event.relatedTarget)
    )
      close()
  })
  languages?.addEventListener('focusout', (event) => {
    if (
      event.relatedTarget instanceof Node &&
      !languages.contains(event.relatedTarget)
    ) {
      languages.open = false
    }
  })
  window.matchMedia('(max-width: 1050px)').addEventListener('change', close)

  let queued = false
  const update = () => {
    header.classList.toggle('is-scrolled', window.scrollY > 24)
    queued = false
  }

  window.addEventListener(
    'scroll',
    () => {
      if (queued) return

      queued = true
      window.requestAnimationFrame(update)
    },
    { passive: true },
  )
  update()
}
