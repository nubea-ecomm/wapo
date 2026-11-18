// A project invitation link must survive account creation and email
// verification, which happen on other pages (and often in another tab).
const key = 'wapo.pendingProjectJoin'

export function rememberPendingJoin(hash: string) {
  try {
    localStorage.setItem(key, hash)
  } catch {
    // Storage can be unavailable (private mode); the link still works directly.
  }
}

export function forgetPendingJoin() {
  try {
    localStorage.removeItem(key)
  } catch {
    // Ignore unavailable storage.
  }
}

export function resumePendingJoin() {
  let hash: string | null

  try {
    hash = localStorage.getItem(key)
  } catch {
    return
  }

  // Resume once: the invitation page stores the link again while the visitor is
  // still signed out, so a different signed-in account is never sent back repeatedly.
  forgetPendingJoin()

  if (hash?.startsWith('#/join-project?') && location.hash !== hash)
    location.hash = hash
}
