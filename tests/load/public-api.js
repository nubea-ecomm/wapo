/* global __ENV */

import http from 'k6/http'
import exec from 'k6/execution'
import { check, fail } from 'k6'

const baseURL = (__ENV.BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '')
const apiKey = __ENV.API_KEY
const rate = Number(__ENV.RATE || 1000)
const duration = __ENV.DURATION || '30s'
const messagePercent = Number(__ENV.MESSAGE_PERCENT || 20)

if (!apiKey) {
  throw new Error('API_KEY is required')
}

export const options = {
  discardResponseBodies: true,
  scenarios: {
    public_api: {
      executor: 'constant-arrival-rate',
      rate,
      timeUnit: '1s',
      duration,
      preAllocatedVUs: Number(
        __ENV.PREALLOCATED_VUS || Math.max(50, Math.ceil(rate / 10)),
      ),
      maxVUs: Number(__ENV.MAX_VUS || Math.max(200, Math.ceil(rate / 2))),
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<100', 'p(99)<250'],
    dropped_iterations: ['count==0'],
  },
}

const params = {
  headers: { 'X-API-Key': apiKey },
}

export function setup() {
  const ready = http.get(`${baseURL}/readyz`)

  if (ready.status !== 200) {
    fail(`API is not ready: HTTP ${ready.status}`)
  }

  const authenticated = http.get(`${baseURL}/v1/me`, params)

  if (authenticated.status !== 200) {
    fail(`API key was rejected: HTTP ${authenticated.status}`)
  }
}

export default function () {
  // Most integrations validate credentials or fetch lightweight state more often
  // than they paginate history, while the 20% list traffic still exercises PostgreSQL.
  const listMessages =
    messagePercent > 0 && exec.scenario.iterationInTest % 100 < messagePercent
  const path = listMessages ? '/v1/messages?limit=50' : '/v1/me'
  const response = http.get(`${baseURL}${path}`, {
    ...params,
    tags: {
      endpoint: listMessages ? 'messages' : 'me',
      name: path.split('?')[0],
    },
  })

  check(response, {
    'status is 200': (result) => result.status === 200,
  })
}
