;(() => {
  const dialog = document.querySelector('#docs-search')
  const query = document.querySelector('#docs-search-query')
  const list = document.querySelector('#docs-search-results')
  const empty = document.querySelector('#docs-search-empty')
  const sections = [...document.querySelectorAll('.guide-content section')].map(
    (section) => ({
      id: section.id,
      title: section.querySelector('h1,h2').textContent,
      content: section.textContent.toLowerCase(),
    }),
  )

  function render() {
    const results = sections.filter((section) =>
      section.content.includes(query.value.trim().toLowerCase()),
    )

    list.replaceChildren()
    empty.hidden = results.length !== 0

    for (const section of results) {
      const item = document.createElement('li')
      const link = document.createElement('a')

      link.href = `/docs#${section.id}`
      link.textContent = section.title
      link.addEventListener('click', () => dialog.close())
      item.append(link)
      list.append(item)
    }
  }

  function open() {
    render()
    dialog.showModal()
    query.focus()
  }

  document.querySelector('[data-open-search]').addEventListener('click', open)
  document
    .querySelector('[data-close-search]')
    .addEventListener('click', () => dialog.close())
  query.addEventListener('input', render)
  query.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      list.querySelector('a')?.click()
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      list.querySelector('a')?.focus()
    }
  })
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close()
  })
  dialog.addEventListener('close', () => {
    query.value = ''
  })
  document.addEventListener('keydown', (event) => {
    if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === 'k' &&
      new URLSearchParams(location.search).get('view') !== 'reference'
    ) {
      event.preventDefault()

      if (dialog.open) dialog.close()
      else open()
    }
  })
})()
