const endpoint = location.pathname.replace('/setup/', '/public/setup/')
const copy = JSON.parse(document.getElementById('setup-copy').textContent)
const button = document.getElementById('connect'),
  status = document.getElementById('status'),
  mode = document.getElementById('mode')
// Business App onboarding includes phone confirmation and business details, so
// Meta can keep its window open for several minutes before reporting back.
const authorizationWindow = 30 * 60 * 1000
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
    ? copy.appAuthorizationDescription
    : copy.dedicatedAuthorizationDescription
  document.getElementById('authorization-title').textContent = coexistence
    ? copy.appAuthorizationTitle
    : copy.dedicatedAuthorizationTitle
  const steps = coexistence
    ? [copy.stepOne, copy.appStepTwo, copy.appStepThree]
    : [copy.stepOne, copy.dedicatedStepTwo, copy.dedicatedStepThree]

  document.getElementById('instructions').replaceChildren(
    ...steps.map((text) => {
      const li = document.createElement('li')

      li.textContent = text

      return li
    }),
  )
  document.getElementById('requirement').textContent = coexistence
    ? copy.appRequirement
    : copy.dedicatedRequirement
}

function showStep(authorize) {
  document.getElementById('choose').hidden = authorize
  document.getElementById('authorize').hidden = !authorize

  if (authorize) describe()

  document
    .querySelector(authorize ? '#authorization-title' : '#choose h1')
    .setAttribute('tabindex', '-1')
  document
    .querySelector(authorize ? '#authorization-title' : '#choose h1')
    .focus()
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
  status.textContent = copy.verifying

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

    if (!response.ok) throw new Error(copy.completeError)

    status.textContent = copy.connected
    button.hidden = true
    document.getElementById('back').hidden = true
    document.querySelector('.instructions').hidden = true
    document.querySelector('.secure-note').hidden = true
    document.getElementById('authorization-title').textContent =
      copy.successTitle
    document.getElementById('description').textContent = copy.successDescription

    if (body.data.redirect_url) location.assign(body.data.redirect_url)
  } catch {
    status.textContent = copy.completeError
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

  if (
    ['FINISH', 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'].includes(value.event)
  ) {
    if (!value.data?.waba_id) {
      stopWaiting(copy.missingAccount)

      return
    }

    session = value.data
    void complete()
  } else if (value.event === 'ERROR' || value.event === 'CANCEL') {
    stopWaiting(value.event === 'CANCEL' ? copy.cancelled : copy.providerError)
  }
})
fetch(endpoint, { cache: 'no-store' })
  .then((r) => {
    if (!r.ok) throw new Error(copy.unavailable)

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
        value === 'coexistence' ? copy.appTitle : copy.dedicatedTitle
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
      button.textContent = copy.continue
    }
    const script = document.createElement('script')

    script.src = `https://connect.facebook.net/${copy.sdkLocale}/sdk.js`
    script.async = true
    script.onerror = () => {
      status.textContent = copy.sdkError
    }
    document.head.append(script)
  })
  .catch((e) => {
    document.getElementById('choices').setAttribute('aria-busy', 'false')
    status.textContent =
      e.message === copy.unavailable ? copy.unavailable : copy.loadError
  })
button.onclick = () => {
  code = ''
  session = null
  submitting = false
  waiting = true
  clearTimeout(authorizationTimer)
  authorizationTimer = setTimeout(() => {
    if (waiting && !submitting)
      stopWaiting(code ? copy.accountTimeout : copy.loginTimeout)
  }, authorizationWindow)
  button.disabled = true
  document.getElementById('back').disabled = true
  status.textContent = copy.authorizePrompt
  const extras = { setup: { business: config.business || {} }, version: 'v5' }

  if (mode.value === 'coexistence') {
    extras.featureType = 'whatsapp_business_app_onboarding'
    extras.sessionInfoVersion = '3'
  }

  window.FB.login(
    (response) => {
      if (!waiting || submitting) return

      if (response.authResponse?.code) {
        code = response.authResponse.code
        status.textContent = copy.authorized
        clearTimeout(authorizationTimer)
        authorizationTimer = setTimeout(() => {
          if (waiting && !submitting) stopWaiting(copy.accountTimeout)
        }, 15000)
        void complete()
      } else {
        stopWaiting(copy.noAuthorization)
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
