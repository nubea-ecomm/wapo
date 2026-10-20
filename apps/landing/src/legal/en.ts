import { site } from '../config'
import type { LegalCopy } from './types'

export const en: LegalCopy = {
  updated: 'Last updated',
  privacy: {
    title: 'Privacy policy',
    description:
      'How Wapo collects, uses, retains, and protects personal data.',
    intro: `This policy explains how ${site.operator} (“we”) processes personal data when operating the hosted instance of Wapo, a platform for integrating and managing WhatsApp communications.`,
    sections: [
      {
        title: '1. Controller and scope',
        paragraphs: [
          `The data controller is ${site.operator}, operating in ${site.location}. For privacy questions, contact ${site.contactEmail}.`,
          `This policy applies to the public website, console, and API of the Wapo instance operated by ${site.operator}. Wapo can also be installed by third parties: each independent operator is responsible for their own practices and must publish their own policy.`,
        ],
      },
      {
        title: '2. Data we process',
        items: [
          'Account data: name, email address, role, assigned projects, and protected authentication data.',
          'Customer and contact data: identifiers, name, phone number, email, marketing preferences, and properties added by authorized users.',
          'Communications: content, files, templates, status, and metadata of messages sent or received through WhatsApp.',
          'Integration data: WhatsApp Business account and phone number identifiers, webhook configuration, and encrypted credentials.',
          'Technical data: IP address, request identifier, route, date, duration, response code, events, and security logs. We do not store the full body of every request in access logs.',
        ],
      },
      {
        title: '3. How we use data',
        items: [
          'Provide, maintain, and protect Wapo and its integrations.',
          'Send and receive communications requested by our customers.',
          'Manage accounts, permissions, connections, templates, and webhooks.',
          'Diagnose errors, prevent abuse, and maintain operational records.',
          'Send operational notices and respond to support requests.',
          'Comply with legal obligations and enforce applicable agreements.',
        ],
        paragraphs: [
          'We do not sell personal data or use it to build our own advertising profiles.',
        ],
      },
      {
        title: '4. Roles and legal bases',
        paragraphs: [
          'For data relating to organizations that subscribe to or administer Wapo, we process information to deliver the requested service, pursue legitimate security interests, and comply with legal obligations. For contacts and recipients added by a customer, we normally act as a processor and follow that customer’s instructions. The customer must have a legal basis and any necessary consents.',
        ],
      },
      {
        title: '5. Providers and transfers',
        paragraphs: [
          'We share data only when necessary with infrastructure, email, and messaging providers engaged to operate the service, subject to confidentiality and security obligations. WhatsApp communications are also processed through Meta Platforms and its affiliates under their terms and policies.',
          'Some providers may process data outside Argentina. In those cases, we seek to apply contractual and security safeguards appropriate to applicable law.',
        ],
      },
      {
        title: '6. Retention',
        paragraphs: [
          'We retain data while the account or project remains active and for as long as needed to provide the service, resolve disputes, and meet our obligations. Successful API logs and completed jobs are retained for up to 30 days; audit logs and failed deliveries for up to 90 days. Messages, contacts, and other operational data remain until the customer deletes them, ends the service, or requests erasure, unless retention is required by law.',
        ],
      },
      {
        title: '7. Security',
        paragraphs: [
          'We apply reasonable technical and organizational controls, including credential encryption, HTTPS connections in production, role-based permissions, project isolation, revocable sessions, and audit logs. No system is completely infallible; if we detect a significant incident, we will respond and provide notifications as required by applicable law.',
        ],
      },
      {
        title: '8. Your rights',
        paragraphs: [
          `You may request access to, updating, correction, or erasure of your data, or ask about its processing, by emailing ${site.contactEmail}. We may need to verify your identity and, where the data was added by a customer organization, refer the request to that organization.`,
          'You can also follow our data deletion instructions. In Argentina, the Agency for Access to Public Information is the supervisory authority for Law 25,326 and receives complaints and claims.',
        ],
      },
      {
        title: '9. Cookies and analytics',
        paragraphs: [
          'This landing page does not install advertising cookies or third-party analytics tools. The console may use browser storage to maintain a signed-in session and remember interface preferences. If we introduce non-essential technologies, we will update this policy and request the appropriate consent.',
        ],
      },
      {
        title: '10. Changes and contact',
        paragraphs: [
          'We may update this policy to reflect legal, technical, or service changes. We will publish the new date on this page and notify you of material changes where appropriate.',
        ],
      },
    ],
    contact: 'PRIVACY QUESTIONS',
    deletionLink: 'Data deletion instructions',
  },
  deletion: {
    title: 'Delete my data',
    description:
      'Instructions for requesting the deletion of personal data from Wapo.',
    eyebrow: 'DATA CONTROL',
    note: 'Free request by email',
    intro: `You can request deletion of data associated with your account or your interaction with an organization using the Wapo instance operated by ${site.operator}.`,
    instructions: 'How to submit a request',
    subject: 'Data deletion request | Wapo',
    emailLead: 'Send an email to',
    emailTail: 'with the subject',
    steps: [
      { title: 'Email us', body: '' },
      {
        title: 'Identify the data',
        body: 'Provide the related email address or phone number, the organization you interacted with, and the information you want deleted. Do not send passwords, codes, or tokens.',
      },
      {
        title: 'We verify and respond',
        body: 'We may request limited information to verify your identity. We will acknowledge receipt and respond within the time required by applicable law.',
      },
    ],
    sections: [
      {
        title: 'What happens next',
        paragraphs: [
          'We will delete or anonymize the data we control, except data we must retain to meet a legal obligation, protect security, or resolve a dispute. Backups will be deleted according to their normal rotation cycle.',
          'If a customer company added your data, we may forward your request to that company because it determines the purpose of processing. Deletion in Wapo does not automatically delete information retained by Meta, WhatsApp, or other third parties in their own systems.',
        ],
      },
      {
        title: 'Independent installations',
        paragraphs: [
          `Wapo is open-source software. If you used an installation operated by another organization, contact that organization directly. ${site.operator} cannot access or delete data on servers managed by third parties.`,
        ],
      },
    ],
    contact: 'REQUEST DELETION',
    contactNote: 'Include only the information needed to locate your record.',
    privacyLink: 'Privacy policy',
  },
}
