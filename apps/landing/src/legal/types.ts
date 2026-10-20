export interface LegalSection {
  title: string
  paragraphs?: string[]
  items?: string[]
}

export interface LegalCopy {
  updated: string
  privacy: {
    title: string
    description: string
    intro: string
    sections: LegalSection[]
    contact: string
    deletionLink: string
  }
  deletion: {
    title: string
    description: string
    eyebrow: string
    note: string
    intro: string
    instructions: string
    subject: string
    emailLead: string
    emailTail: string
    steps: { title: string; body: string }[]
    sections: LegalSection[]
    contact: string
    contactNote: string
    privacyLink: string
  }
}
