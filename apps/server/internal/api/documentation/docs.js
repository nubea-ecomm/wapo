let scalarReference
window.addEventListener('docs-theme-change', (event) => {
  if (!scalarReference) return
  const current = scalarReference.getConfiguration()
  const update = (config) => ({ ...config, forceDarkModeState: event.detail })
  scalarReference.updateConfiguration(
    Array.isArray(current) ? current.map(update) : update(current),
  )
})
const referenceView =
  new URLSearchParams(location.search).get('view') === 'reference'
document.querySelectorAll('[data-tab]').forEach((link) => {
  if (link.dataset.tab === (referenceView ? 'reference' : 'guides'))
    link.setAttribute('aria-current', 'page')
})
document.querySelectorAll('[data-api-origin]').forEach((element) => {
  element.textContent = location.origin
})
document.querySelectorAll('[data-copy]').forEach((button) => {
  button.addEventListener('click', async () => {
    const text = button.closest('.code-block').querySelector('pre').textContent
    try {
      await navigator.clipboard.writeText(text)
      button.textContent = 'Copied'
      setTimeout(() => {
        button.textContent = 'Copy'
      }, 2000)
    } catch {
      button.textContent = 'Select text to copy'
    }
  })
})
const sectionButton = document.querySelector('.mobile-sections')
const guideNavigation = document.querySelector('#guide-navigation')
sectionButton.addEventListener('click', () => {
  const open = sectionButton.getAttribute('aria-expanded') !== 'true'
  sectionButton.setAttribute('aria-expanded', String(open))
  guideNavigation.classList.toggle('open', open)
})
guideNavigation.addEventListener('click', (event) => {
  if (event.target.closest('a')) {
    guideNavigation.classList.remove('open')
    sectionButton.setAttribute('aria-expanded', 'false')
  }
})
if (!referenceView) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        guideNavigation.querySelectorAll('a').forEach((link) => {
          if (link.hash === `#${entry.target.id}`)
            link.setAttribute('aria-current', 'location')
          else link.removeAttribute('aria-current')
        })
      }
    },
    { rootMargin: '-10% 0px -65% 0px' },
  )
  document
    .querySelectorAll('.guide-content section')
    .forEach((section) => observer.observe(section))
} else {
  document.querySelector('#guides').hidden = true
  document.querySelector('#reference').hidden = false
  document.querySelector('.skip-link').href = '#reference'
  void loadReference()
}
async function loadReference() {
  const target = document.querySelector('#reference')
  try {
    const response = await fetch('/openapi.json')
    if (!response.ok) throw new Error('API document unavailable')
    const document = await response.json()
    await new Promise((resolve, reject) => {
      const script = window.document.createElement('script')
      script.src = '/docs/assets/scalar.js?v=1.75.0'
      script.onload = resolve
      script.onerror = reject
      window.document.head.append(script)
    })
    const selected =
      new URLSearchParams(location.search).get('api') || 'messaging'
    const configurations = [
      {
        title: 'Messaging API',
        slug: 'messaging',
        prefix: (path) =>
          path.startsWith('/v1/') || path.startsWith('/public/'),
        description:
          'Tenant-scoped WhatsApp messaging. Authenticate with a tenant API key. Start with customers, connect a number, then send and receive messages.',
      },
      {
        title: 'Administration API',
        slug: 'administration',
        prefix: (path) =>
          path.startsWith('/admin/') ||
          path.startsWith('/auth/') ||
          ['/healthz', '/readyz'].includes(path),
        description:
          'Global administration for tenants, console users and configuration. These operations require an administrator session or operator credential, except login and health checks.',
      },
      {
        title: 'Compatibility API',
        slug: 'compatibility',
        prefix: (path) =>
          path.startsWith('/platform/') || path.startsWith('/meta/'),
        description:
          'Alternate platform and Graph-shaped routes. Use the native Messaging API for new integrations. Unsupported standalone capabilities return 501; support is described per operation.',
      },
    ]
    const shared = {
      theme: 'none',
      layout: 'modern',
      forceDarkModeState: window.document.documentElement.dataset.theme,
      hideDarkModeToggle: true,
      withDefaultFonts: false,
      hideClientButton: true,
      hideModels: true,
      showDeveloperTools: 'never',
      agent: { disabled: true },
      persistAuth: false,
      telemetry: false,
      defaultOpenFirstTag: true,
      documentDownloadType: 'json',
      defaultHttpClient: { targetKey: 'shell', clientKey: 'curl' },
      customCss: `:root,.light-mode{--scalar-font:Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;--scalar-font-code:'SFMono-Regular',Consolas,monospace;--scalar-color-1:#171717;--scalar-color-2:#525252;--scalar-color-3:#737373;--scalar-color-accent:#171717;--scalar-background-1:#fff;--scalar-background-2:#fafafa;--scalar-background-3:#f5f5f5;--scalar-background-accent:#f0f0f0;--scalar-border-color:#e5e5e5;--scalar-sidebar-background:#fafafa;--scalar-sidebar-color-1:#525252;--scalar-sidebar-color-2:#737373;--scalar-sidebar-item-hover-background:#f0f0f0;--scalar-sidebar-item-active-background:#ebebeb;--scalar-sidebar-color-active:#171717;--scalar-radius:6px;--scalar-radius-lg:8px}.dark-mode{--scalar-color-1:#fafafa;--scalar-color-2:#c2c2c2;--scalar-color-3:#a3a3a3;--scalar-color-accent:#fafafa;--scalar-background-1:#101010;--scalar-background-2:#191919;--scalar-background-3:#262626;--scalar-background-accent:#333;--scalar-border-color:#292929;--scalar-sidebar-background:#141414;--scalar-sidebar-color-1:#d4d4d4;--scalar-sidebar-color-2:#a3a3a3;--scalar-sidebar-item-hover-background:#262626;--scalar-sidebar-item-active-background:#333;--scalar-sidebar-color-active:#fff}.scalar-api-reference{--scalar-custom-header-height:60px}`,
    }
    target.replaceChildren()
    scalarReference = window.Scalar.createApiReference(
      '#reference',
      configurations.map((configuration) => ({
        ...shared,
        title: configuration.title,
        slug: configuration.slug,
        default: selected === configuration.slug,
        content: {
          ...document,
          tags: document.tags.filter((tag) =>
            Object.entries(document.paths).some(
              ([path, methods]) =>
                configuration.prefix(path) &&
                Object.values(methods).some((operation) =>
                  operation.tags?.includes(tag.name),
                ),
            ),
          ),
          info: {
            ...document.info,
            title: configuration.title,
            description: configuration.description,
          },
          servers: [
            { url: location.origin, description: 'Current Wapo instance' },
          ],
          'x-tagGroups': document['x-tagGroups']
            .map((group) => ({
              ...group,
              tags: group.tags.filter((tag) =>
                Object.entries(document.paths).some(
                  ([path, methods]) =>
                    configuration.prefix(path) &&
                    Object.values(methods).some((operation) =>
                      operation.tags?.includes(tag),
                    ),
                ),
              ),
            }))
            .filter((group) => group.tags.length),
          paths: Object.fromEntries(
            Object.entries(document.paths).filter(([path]) =>
              configuration.prefix(path),
            ),
          ),
        },
      })),
    )
  } catch {
    target.innerHTML =
      '<div class="reference-error"><h1>Reference unavailable</h1><p>The interactive reference could not load. Reload this page or use the OpenAPI document directly.</p><a href="/openapi.json">Download OpenAPI JSON</a> / <a href="/docs">Read the guides</a></div>'
  }
}
