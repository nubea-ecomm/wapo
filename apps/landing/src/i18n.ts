export const locales = ['en', 'es', 'pt'] as const

export type Locale = (typeof locales)[number]

export const localePaths: Record<Locale, string> = {
  es: '/es',
  en: '/',
  pt: '/pt',
}

export const copy = {
  es: {
    metaTitle: 'Wapo | Infraestructura de WhatsApp para tu producto',
    metaDescription:
      'Integrá WhatsApp con una sola API. Onboarding, mensajes, plantillas y webhooks en una plataforma open source que corre en tu infraestructura.',
    skip: 'Ir al contenido',
    nav: {
      product: 'Producto',
      developers: 'Developers',
      security: 'Seguridad',
      privacy: 'Privacidad',
      contact: 'Contactar',
      signIn: 'Ingresar',
    },
    hero: {
      title: 'WhatsApp para tu producto.',
      titleMuted: 'La infraestructura, resuelta.',
      description:
        'Mensajes, onboarding y webhooks. Open source, bajo tu control.',
      primary: 'Explorar la API',
      secondary: 'GitHub',
      command: 'Levantar Wapo',
      copy: 'Copiar',
      copied: 'Copiado',
    },
    preview: {
      title: 'Operación',
      online: 'Operativo',
      sent: 'Enviados',
      delivered: 'Entregados',
      received: 'Recibidos',
      failures: 'Fallidos',
      activity: 'Mensajes en 30 días',
      connections: 'Conexiones',
      active: 'Activa',
      sync: 'Sincronizado ahora',
    },
    included: {
      title: 'Incluido',
      intro: 'Todo lo necesario para operar WhatsApp',
      ui: {
        customer: 'Cliente',
        reply: 'Respuesta enviada',
        delivered: 'Entregado',
        business: 'Empresa autorizada',
        connected: 'Cuenta conectada',
        approved: 'Aprobada',
        live: 'En vivo',
        message: '¿Mi pedido ya está en camino?',
        answer: 'Sale hoy, seguimiento enviado',
      },
      items: [
        ['Mensajería', 'Texto, media y estados'],
        ['Onboarding', 'Embedded Signup'],
        ['Plantillas', 'Crear, sincronizar y enviar'],
        ['Webhooks', 'Firmas y reintentos'],
        ['Inbox', 'Conversaciones y contactos'],
        ['Observabilidad', 'Logs y métricas'],
      ],
    },
    flows: {
      title: 'Flujos operativos',
      intro: 'Estado de cada operación',
      cards: {
        connect: ['Onboarding', 'Cliente, Wapo y Meta'],
        delivery: ['Entrega', 'Cola durable y reintentos'],
        templates: ['Plantillas', 'Estado sincronizado con Meta'],
        webhooks: ['Webhooks', 'Firma e historial'],
      },
      connecting: 'Autorizando cuenta',
      connected: 'Cuenta conectada',
      processing: 'Procesando',
      delivered: 'Entregado',
      approved: 'Aprobada',
      retrying: 'Reintentando',
    },
    api: {
      title: 'API First',
      intro:
        'De tu código a WhatsApp. Un SDK tipado, menos trabajo de integración.',
      replay: 'Reproducir demo',
      copyError:
        'No se pudo copiar. Seleccioná el código y copialo manualmente.',
      status: 'Estado de la solicitud',
      accepted: 'Aceptada',
      queued: 'En cola',
      delivered: 'Entregada',
    },
    enterprise: {
      title: 'Controles de plataforma',
      label: 'Infraestructura',
      items: [
        ['Tenant isolation', 'Separación por proyecto'],
        ['Encrypted credentials', 'Tokens cifrados'],
        ['Durable delivery', 'Outbox y reintentos'],
        ['Access control', 'Roles y auditoría'],
        ['PostgreSQL', 'Fuente de verdad'],
        ['OpenAPI', 'Contrato público'],
      ],
    },
    final: {
      title: 'Tu WhatsApp, en tu infraestructura.',
      body: 'Cloná el repo, levantalo con Docker Compose y mandá tu primer mensaje.',
      primary: 'Ver en GitHub',
      secondary: 'Contactar',
    },
    footer: {
      summary: 'Infraestructura de WhatsApp',
      product: 'Producto',
      openSource: 'Código abierto',
      contact: 'Contacto',
      legal: 'Legal',
      privacy: 'Privacidad',
      deletion: 'Eliminar mis datos',
    },
  },
  en: {
    metaTitle: 'Wapo | WhatsApp infrastructure for your product',
    metaDescription:
      'Integrate WhatsApp through one API. Onboarding, messages, templates, and webhooks in an open-source platform that runs on your infrastructure.',
    skip: 'Skip to content',
    nav: {
      product: 'Product',
      developers: 'Developers',
      security: 'Security',
      privacy: 'Privacy',
      contact: 'Contact',
      signIn: 'Sign in',
    },
    hero: {
      title: 'WhatsApp for your product.',
      titleMuted: 'The infrastructure, sorted.',
      description:
        'Messaging, onboarding, and webhooks. Open source. Yours to run.',
      primary: 'Explore the API',
      secondary: 'GitHub',
      command: 'Start Wapo',
      copy: 'Copy',
      copied: 'Copied',
    },
    preview: {
      title: 'Operations',
      online: 'Operational',
      sent: 'Sent',
      delivered: 'Delivered',
      received: 'Received',
      failures: 'Failed',
      activity: 'Messages in 30 days',
      connections: 'Connections',
      active: 'Active',
      sync: 'Synced just now',
    },
    included: {
      title: 'Included',
      intro: 'Everything required to operate WhatsApp',
      ui: {
        customer: 'Customer',
        reply: 'Reply sent',
        delivered: 'Delivered',
        business: 'Business authorized',
        connected: 'Account connected',
        approved: 'Approved',
        live: 'Live',
        message: 'Is my order already on the way?',
        answer: 'Ships today, tracking sent',
      },
      items: [
        ['Messaging', 'Text, media, and status'],
        ['Onboarding', 'Embedded Signup'],
        ['Templates', 'Create, sync, and send'],
        ['Webhooks', 'Signatures and retries'],
        ['Inbox', 'Conversations and contacts'],
        ['Observability', 'Logs and metrics'],
      ],
    },
    flows: {
      title: 'Operational flows',
      intro: 'State for every operation',
      cards: {
        connect: ['Onboarding', 'Customer, Wapo, and Meta'],
        delivery: ['Delivery', 'Durable queue and retries'],
        templates: ['Templates', 'Status synced with Meta'],
        webhooks: ['Webhooks', 'Signature and history'],
      },
      connecting: 'Authorizing account',
      connected: 'Account connected',
      processing: 'Processing',
      delivered: 'Delivered',
      approved: 'Approved',
      retrying: 'Retrying',
    },
    api: {
      title: 'API First',
      intro: 'From your code to WhatsApp. A typed SDK, less integration work.',
      replay: 'Replay demo',
      copyError: 'Could not copy. Select the code and copy it manually.',
      status: 'Request status',
      accepted: 'Accepted',
      queued: 'Queued',
      delivered: 'Delivered',
    },
    enterprise: {
      title: 'Platform controls',
      label: 'Infrastructure',
      items: [
        ['Tenant isolation', 'Project separation'],
        ['Encrypted credentials', 'Encrypted tokens'],
        ['Durable delivery', 'Outbox and retries'],
        ['Access control', 'Roles and audit trail'],
        ['PostgreSQL', 'Source of truth'],
        ['OpenAPI', 'Public contract'],
      ],
    },
    final: {
      title: 'Your WhatsApp, on your infrastructure.',
      body: 'Clone the repo, start it with Docker Compose, and send your first message.',
      primary: 'View on GitHub',
      secondary: 'Contact',
    },
    footer: {
      summary: 'WhatsApp infrastructure',
      product: 'Product',
      openSource: 'Open source',
      contact: 'Contact',
      legal: 'Legal',
      privacy: 'Privacy',
      deletion: 'Delete my data',
    },
  },
  pt: {
    metaTitle: 'Wapo | Infraestrutura de WhatsApp para seu produto',
    metaDescription:
      'Integre o WhatsApp com uma única API. Onboarding, mensagens, modelos e webhooks em uma plataforma de código aberto que roda na sua infraestrutura.',
    skip: 'Ir para o conteúdo',
    nav: {
      product: 'Produto',
      developers: 'Developers',
      security: 'Segurança',
      privacy: 'Privacidade',
      contact: 'Contato',
      signIn: 'Entrar',
    },
    hero: {
      title: 'WhatsApp para seu produto.',
      titleMuted: 'A infraestrutura, resolvida.',
      description:
        'Mensagens, onboarding e webhooks. Código aberto, sob seu controle.',
      primary: 'Explorar a API',
      secondary: 'GitHub',
      command: 'Iniciar Wapo',
      copy: 'Copiar',
      copied: 'Copiado',
    },
    preview: {
      title: 'Operação',
      online: 'Operacional',
      sent: 'Enviadas',
      delivered: 'Entregues',
      received: 'Recebidas',
      failures: 'Falhas',
      activity: 'Mensagens em 30 dias',
      connections: 'Conexões',
      active: 'Ativa',
      sync: 'Sincronizado agora',
    },
    included: {
      title: 'Incluído',
      intro: 'Tudo para operar WhatsApp',
      ui: {
        customer: 'Cliente',
        reply: 'Resposta enviada',
        delivered: 'Entregue',
        business: 'Empresa autorizada',
        connected: 'Conta conectada',
        approved: 'Aprovado',
        live: 'Ao vivo',
        message: 'Meu pedido já está a caminho?',
        answer: 'Sai hoje, rastreamento enviado',
      },
      items: [
        ['Mensagens', 'Texto, mídia e status'],
        ['Onboarding', 'Embedded Signup'],
        ['Templates', 'Criar, sincronizar e enviar'],
        ['Webhooks', 'Assinaturas e retentativas'],
        ['Inbox', 'Conversas e contatos'],
        ['Observabilidade', 'Logs e métricas'],
      ],
    },
    flows: {
      title: 'Fluxos operacionais',
      intro: 'Estado de cada operação',
      cards: {
        connect: ['Onboarding', 'Cliente, Wapo e Meta'],
        delivery: ['Entrega', 'Fila durável e retentativas'],
        templates: ['Templates', 'Status sincronizado com a Meta'],
        webhooks: ['Webhooks', 'Assinatura e histórico'],
      },
      connecting: 'Autorizando conta',
      connected: 'Conta conectada',
      processing: 'Processando',
      delivered: 'Entregue',
      approved: 'Aprovado',
      retrying: 'Tentando novamente',
    },
    api: {
      title: 'API First',
      intro:
        'Do seu código ao WhatsApp. Um SDK tipado, menos trabalho de integração.',
      replay: 'Reproduzir demo',
      copyError:
        'Não foi possível copiar. Selecione o código e copie manualmente.',
      status: 'Status da solicitação',
      accepted: 'Aceita',
      queued: 'Na fila',
      delivered: 'Entregue',
    },
    enterprise: {
      title: 'Controles de plataforma',
      label: 'Infraestrutura',
      items: [
        ['Tenant isolation', 'Separação por projeto'],
        ['Encrypted credentials', 'Tokens criptografados'],
        ['Durable delivery', 'Outbox e retentativas'],
        ['Access control', 'Funções e auditoria'],
        ['PostgreSQL', 'Fonte de verdade'],
        ['OpenAPI', 'Contrato público'],
      ],
    },
    final: {
      title: 'Seu WhatsApp, na sua infraestrutura.',
      body: 'Clone o repo, suba com Docker Compose e envie sua primeira mensagem.',
      primary: 'Ver no GitHub',
      secondary: 'Contato',
    },
    footer: {
      summary: 'Infraestrutura de WhatsApp',
      product: 'Produto',
      openSource: 'Código aberto',
      contact: 'Contato',
      legal: 'Legal',
      privacy: 'Privacidade',
      deletion: 'Excluir meus dados',
    },
  },
} as const

export function privacyPath(locale: Locale) {
  return { en: '/privacy', es: '/privacidad', pt: '/pt/privacidade' }[locale]
}

export function deletionPath(locale: Locale) {
  return {
    en: '/data-deletion',
    es: '/eliminacion-de-datos',
    pt: '/pt/exclusao-de-dados',
  }[locale]
}

export function localizedPath(pathname: string, locale: Locale) {
  const path = pathname.replace(/\/$/, '') || '/'

  if (locales.some((code) => privacyPath(code) === path))
    return privacyPath(locale)

  if (locales.some((code) => deletionPath(code) === path))
    return deletionPath(locale)

  return localePaths[locale]
}

export const languageNames: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  pt: 'Português',
}
