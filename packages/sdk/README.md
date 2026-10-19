# @nubea-ecomm/wapo-sdk

[![Wapo SDK version](https://img.shields.io/npm/v/%40nubea-ecomm%2Fwapo-sdk?label=Wapo%20SDK&color=171717)](https://www.npmjs.com/package/@nubea-ecomm/wapo-sdk)

Typed JavaScript and TypeScript client for the public Wapo messaging API.

## Install

Choose the command for your package manager:

```bash
npm install @nubea-ecomm/wapo-sdk
# or: pnpm add @nubea-ecomm/wapo-sdk
# or: yarn add @nubea-ecomm/wapo-sdk
```

Node.js 18 or newer is required. Modern browsers with `fetch` and
`AbortSignal.timeout` are also supported.

## Usage

```ts
import { WapoClient, WapoError } from '@nubea-ecomm/wapo-sdk'

const wapo = new WapoClient({
  baseUrl: 'https://api.example.com',
  apiKey: process.env.WAPO_API_KEY!,
})

try {
  const { data: customer } = await wapo.createCustomer({
    name: 'Example store',
    external_customer_id: 'store-123',
  })

  console.log(customer.id)
} catch (error) {
  if (error instanceof WapoError) {
    console.error(error.status, error.body)
  }
}
```

Outbound sends require a stable idempotency key:

```ts
await wapo.sendText(
  'connection-id',
  '15551234567',
  'Hello from Wapo',
  'order-123-notification',
)
```

Technical operator and console-session clients are also exported as
`WapoAdminClient` and `WapoAuthClient`. Never expose project or operator API keys
in a browser application.

See the [Wapo repository](https://github.com/nubea-ecomm/wapo) for API setup,
OpenAPI documentation and compatibility details.
