const endpoint = location.pathname.replace('/setup/', '/public/setup/')
const button = document.getElementById('connect'),
  status = document.getElementById('status'),
  mode = document.getElementById('mode')
let config,
  code = '',
  session = null,
  submitting = false,
  waiting = false,
  authorizationTimer
function stopWaiting(message) {
  clearTimeout(authorizationTimer)
  waiting = false
  code = ''
  session = null
  button.disabled = false
  document.getElementById('back').disabled = false
  status.textContent = message
}
function describe() {
  const coexistence = mode.value === 'coexistence'
  document.getElementById('description').textContent = coexistence
    ? 'Seguí usando la app de WhatsApp Business con tu número.'
    : 'Usá este número desde la API de WhatsApp.'
  document.getElementById('authorization-title').textContent = coexistence
    ? 'Conectá tu WhatsApp Business'
    : 'Conectá un número dedicado'
  const steps = coexistence
    ? [
        'Iniciá sesión en Meta y elegí tu negocio.',
        'Seleccioná la opción para conectar tu WhatsApp Business App.',
        'Seguí las instrucciones de Meta en tu teléfono y autorizá el acceso.',
      ]
    : [
        'Iniciá sesión en Meta y elegí tu negocio.',
        'Seleccioná o registrá el número que querés conectar.',
        'Verificá el número si Meta lo solicita y autorizá el acceso.',
      ]
  document.getElementById('instructions').replaceChildren(
    ...steps.map((text) => {
      const li = document.createElement('li')
      li.textContent = text
      return li
    }),
  )
  document.getElementById('requirement').textContent = coexistence
    ? 'Tené a mano el teléfono donde usás WhatsApp Business App.'
    : 'Si querés seguir usando la app del teléfono, volvé y elegí WhatsApp Business App.'
}
function showStep(authorize) {
  document.getElementById('choose').hidden = authorize
  document.getElementById('authorize').hidden = !authorize
  document
    .getElementById('step-one')
    .setAttribute('aria-current', authorize ? 'false' : 'step')
  document
    .getElementById('step-two')
    .setAttribute('aria-current', authorize ? 'step' : 'false')
  if (authorize) describe()
  document
    .querySelector(authorize ? '#authorization-title' : '#choose h1')
    .setAttribute('tabindex', '-1')
  document.querySelector(authorize ? '#authorization-title' : '#choose h1').focus()
}
document.querySelectorAll('[data-select]').forEach((choice) => {
  choice.onclick = () => {
    mode.value = choice.dataset.select
    showStep(true)
  }
})
document.getElementById('back').onclick = () => showStep(false)
async function complete() {
  if (!code || !session || submitting) return
  submitting = true
  waiting = false
  clearTimeout(authorizationTimer)
  button.disabled = true
  status.textContent = 'Verificando el número y completando la conexión…'
  try {
    const response = await fetch(endpoint + '/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        waba_id: session.waba_id,
        phone_number_id: session.phone_number_id || '',
        connection_type: mode.value,
      }),
    })
    code = ''
    const body = await response.json()
    if (!response.ok)
      throw new Error(body.error?.message || 'No se pudo completar la conexión')
    status.textContent = 'WhatsApp conectado.'
    button.hidden = true
    document.getElementById('back').hidden = true
    document.querySelector('.instructions').hidden = true
    document.querySelector('.secure-note').hidden = true
    document.getElementById('authorization-title').textContent =
      'Tu número está conectado'
    document.getElementById('description').textContent = 'Ya podés cerrar esta página.'
    if (body.data.redirect_url) location.assign(body.data.redirect_url)
  } catch (e) {
    status.textContent =
      e.message + ' Solicitá un nuevo enlace si necesitás volver a iniciar.'
  }
}
window.addEventListener('message', (event) => {
  if (
    ![
      'https://www.facebook.com',
      'https://web.facebook.com',
      'https://business.facebook.com',
    ].includes(event.origin)
  )
    return
  let value
  try {
    value = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
  } catch {
    return
  }
  if (value?.type !== 'WA_EMBEDDED_SIGNUP' || !waiting) return
  if (['FINISH', 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'].includes(value.event)) {
    if (!value.data?.waba_id) {
      stopWaiting(
        'Meta no devolvió la cuenta de WhatsApp. Revisá la configuración de registro integrado y volvé a intentar.',
      )
      return
    }
    session = value.data
    void complete()
  } else if (value.event === 'ERROR' || value.event === 'CANCEL') {
    stopWaiting(
      value.event === 'CANCEL'
        ? 'Cancelaste la configuración en Meta. Podés volver a intentarlo.'
        : 'Meta informó un error al configurar WhatsApp. Revisá los permisos y la configuración de registro integrado.',
    )
  }
})
fetch(endpoint, { cache: 'no-store' })
  .then((r) => {
    if (!r.ok) throw new Error('El enlace ya no está disponible')
    return r.json()
  })
  .then((body) => {
    config = body.data
    mode.replaceChildren()
    document.getElementById('choices').setAttribute('aria-busy', 'false')
    status.textContent = ''
    for (const value of config.allowed_connection_types) {
      const option = document.createElement('option')
      option.value = value
      option.textContent =
        value === 'coexistence'
          ? 'WhatsApp Business App + API (Coexistence)'
          : 'Número dedicado (Cloud API)'
      mode.append(option)
      const choice = document.querySelector(`[data-mode="${value}"]`)
      if (choice) choice.hidden = false
    }
    describe()
    window.fbAsyncInit = () => {
      window.FB.init({
        appId: config.app_id,
        autoLogAppEvents: false,
        xfbml: false,
        version: config.graph_version,
      })
      button.disabled = false
      button.textContent = 'Continuar con Meta'
    }
    const script = document.createElement('script')
    script.src = 'https://connect.facebook.net/es_LA/sdk.js'
    script.async = true
    script.onerror = () => {
      status.textContent = 'No se pudo cargar Meta. Revisá tu conexión o bloqueador.'
    }
    document.head.append(script)
  })
  .catch((e) => {
    document.getElementById('choices').setAttribute('aria-busy', 'false')
    status.textContent = e.message
  })
button.onclick = () => {
  code = ''
  session = null
  submitting = false
  waiting = true
  clearTimeout(authorizationTimer)
  authorizationTimer = setTimeout(() => {
    if (waiting && !submitting)
      stopWaiting(
        code
          ? 'Meta autorizó el acceso, pero no confirmó una cuenta de WhatsApp. Revisá que el ajuste use Registro insertado de WhatsApp y los productos de WhatsApp habilitados.'
          : 'No llegó la respuesta de Meta. Revisá si el navegador bloqueó la ventana y volvé a intentar.',
      )
  }, 90000)
  button.disabled = true
  document.getElementById('back').disabled = true
  status.textContent = 'Completá la autorización en la ventana de Meta.'
  const extras = { setup: {} }
  if (mode.value === 'coexistence')
    extras.featureType = 'whatsapp_business_app_onboarding'
  window.FB.login(
    (response) => {
      if (!waiting || submitting) return
      if (response.authResponse?.code) {
        code = response.authResponse.code
        status.textContent =
          'Acceso autorizado. Esperando la confirmación de la cuenta de WhatsApp…'
        clearTimeout(authorizationTimer)
        authorizationTimer = setTimeout(() => {
          if (waiting && !submitting)
            stopWaiting(
              'Meta autorizó el acceso, pero no confirmó una cuenta de WhatsApp. Revisá el ajuste de Registro insertado de WhatsApp y sus productos habilitados.',
            )
        }, 15000)
        void complete()
      } else {
        stopWaiting('No se recibió autorización. Podés volver a intentarlo.')
      }
    },
    {
      config_id: config.config_id,
      auth_type: 'rerequest',
      response_type: 'code',
      override_default_response_type: true,
      extras,
    },
  )
}
