export function avatarHash(seed: string) {
  let hash = 2166136261
  for (const character of seed)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0
  return hash
}

export function nextAvatarVariant(id: string, current: number) {
  const currentAppearance = avatarHash(id + String(current)) % 6
  let next = current
  while (avatarHash(id + String(next)) % 6 === currentAppearance) {
    next = crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff
  }
  return next
}
