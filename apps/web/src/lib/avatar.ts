const avatarChanged = 'wapo-avatar-changed'
export function readVariant(id: string) {
  try {
    return localStorage.getItem(`wapo-avatar:${id}`) || '0'
  } catch {
    return '0'
  }
}
export function subscribe(onChange: () => void) {
  window.addEventListener(avatarChanged, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(avatarChanged, onChange)
    window.removeEventListener('storage', onChange)
  }
}
export function regenerateAvatar(id: string) {
  try {
    const previous = avatarHash(id + readVariant(id)) % 6
    let variant = crypto.randomUUID()
    while (avatarHash(id + variant) % 6 === previous) variant = crypto.randomUUID()
    localStorage.setItem(`wapo-avatar:${id}`, variant)
  } catch {
    return
  }
  window.dispatchEvent(new Event(avatarChanged))
}

export function avatarHash(seed: string) {
  let hash = 2166136261
  for (const character of seed)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0
  return hash
}
