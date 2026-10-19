import { cn } from '../lib/utils'

const glyphs = {
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
} as const

export function WapoLogo({
  compact = false,
  className,
}: {
  compact?: boolean
  className?: string
}) {
  const letters = compact ? ['W'] : ['W', 'A', 'P', 'O']
  const blockWidth = 5
  const blockHeight = 3
  const gap = 3
  const glyphWidth = 5 * blockWidth
  const width = letters.length * glyphWidth + (letters.length - 1) * gap
  return (
    <svg
      viewBox={`0 0 ${width} ${7 * blockHeight}`}
      role="img"
      aria-label="Wapo"
      className={cn('wapo-logo', className)}
      shapeRendering="crispEdges"
    >
      {letters.flatMap((letter, letterIndex) =>
        glyphs[letter as keyof typeof glyphs].flatMap((row, rowIndex) =>
          [...row].map((pixel, columnIndex) =>
            pixel === '1' ? (
              <rect
                key={`${letterIndex}:${rowIndex}:${columnIndex}`}
                x={letterIndex * (glyphWidth + gap) + columnIndex * blockWidth}
                y={rowIndex * blockHeight}
                width={blockWidth}
                height={blockHeight}
                fill="currentColor"
              />
            ) : null,
          ),
        ),
      )}
    </svg>
  )
}
