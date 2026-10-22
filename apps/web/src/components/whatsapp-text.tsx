import { Fragment, type ReactNode } from 'react'

// Render WhatsApp's text markers as React nodes, never as provider-supplied HTML.
export function WhatsAppText({ text }: { text: string }) {
  const parts: ReactNode[] = []
  const pattern = /```([\s\S]+?)```|\*([^*\n]+)\*|_([^_\n]+)_|~([^~\n]+)~/g
  let position = 0

  for (const match of text.matchAll(pattern)) {
    parts.push(text.slice(position, match.index))
    parts.push(
      <Fragment key={match.index}>
        {match[1] ? (
          <code>{match[1]}</code>
        ) : match[2] ? (
          <strong>{match[2]}</strong>
        ) : match[3] ? (
          <em>{match[3]}</em>
        ) : (
          <del>{match[4]}</del>
        )}
      </Fragment>,
    )
    position = match.index + match[0].length
  }

  parts.push(text.slice(position))

  return <>{parts}</>
}
