export function avatarHash(seed: string) {
  let hash = 2166136261
  for (const character of seed)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0
  return hash
}

export function nextAvatarVariant(id: string, current: number) {
  const currentHash = avatarHash(id + String(current))
  let next = current
  while (avatarHash(id + String(next)) === currentHash) {
    next = crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff
  }
  return next
}
