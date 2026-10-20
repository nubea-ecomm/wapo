const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
const items = Array.from(
  document.querySelectorAll<HTMLElement>(
    '.section-heading, .feature-card, .operation-card, .api-grid, .enterprise-grid article, .closing-inner',
  ),
)

if (!preference.matches && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return

        const element = entry.target as HTMLElement

        observer.unobserve(element)
        element.classList.remove('reveal-pending')

        if (preference.matches) return

        const index = Array.from(element.parentElement?.children ?? []).indexOf(
          element,
        )

        element.animate(
          [
            { opacity: 0, transform: 'translateY(18px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          {
            duration: 650,
            delay: Math.max(0, index % 3) * 65,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            fill: 'backwards',
          },
        )
      })
    },
    { threshold: 0.08 },
  )

  items.forEach((item) => {
    if (item.getBoundingClientRect().top < window.innerHeight) return

    item.classList.add('reveal-pending')
    observer.observe(item)
  })
  preference.addEventListener('change', () => {
    if (!preference.matches) return

    observer.disconnect()
    items.forEach((item) => {
      item.classList.remove('reveal-pending')
      item.getAnimations().forEach((animation) => animation.cancel())
    })
  })
}
