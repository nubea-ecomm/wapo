import { avatarHash } from '../lib/avatar'

const palettes = [
  ['#f1c6b7', '#733f38', '#f7e6dd'],
  ['#b8d3c9', '#294f48', '#e0efe8'],
  ['#c5c9ed', '#414272', '#ececfa'],
  ['#e7d09d', '#69532a', '#fff2d7'],
  ['#d8c0dc', '#674269', '#f5e8f5'],
  ['#b8d7e4', '#305363', '#e6f3fa'],
]
export function UserAvatar({
  id,
  name,
  className = 'size-8',
  variant = 0,
}: {
  id: string
  name: string
  className?: string
  variant?: number
}) {
  const hash = avatarHash(id + String(variant))
  const [face, ink, bg] = palettes[hash % palettes.length]
  const tilt = ((hash % 3) - 1) * 8
  return (
    <svg
      role="img"
      aria-label={`Avatar de ${name}`}
      viewBox="0 0 40 40"
      className={`shrink-0 rounded-lg ${className}`}
    >
      <rect width="40" height="40" rx="8" fill={bg} />
      <g transform={`rotate(${tilt} 20 20)`}>
        <rect x="7" y="6" width="26" height="31" rx={hash % 2 ? 13 : 9} fill={face} />
        {hash % 2 ? (
          <path d="M8 18V11Q20-1 32 11V15Q24 10 19 13Q13 18 8 18" fill={ink} />
        ) : (
          <path d="M9 13Q13 4 19 10Q27 3 32 13" fill={ink} />
        )}
        <circle cx="15" cy="22" r="1.5" fill={ink} />
        <circle cx="25" cy="22" r="1.5" fill={ink} />
        <path
          d={hash % 3 ? 'M16 28Q20 32 24 28' : 'M17 29H23'}
          fill="none"
          stroke={ink}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}
