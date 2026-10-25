function friendlyAuthError(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  switch (code) {
    case 'auth/popup-closed-by-user': case 'auth/cancelled-popup-request': return 'Sign-in was cancelled. You can try again whenever you’re ready.'
    case 'auth/popup-blocked': return 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.'
    case 'auth/network-request-failed': return 'Could not connect. Check your internet connection and try again.'
    case 'auth/unauthorized-domain': return 'This domain needs to be added to Firebase Authentication’s authorized domains.'
    case 'auth/operation-not-allowed': return 'Google Sign-In needs to be enabled in Firebase Authentication.'
    case 'auth/web-storage-unsupported': return 'Browser storage is unavailable. Open this app in Safari or another full browser with site storage enabled, then reload.'
    case 'auth/operation-not-supported-in-this-environment': return 'This browser cannot complete Google sign-in. Open the app directly in Safari, or use the same-origin in-tab option if available.'
    case 'auth/invalid-api-key': return 'The Firebase configuration is invalid. Check your environment variables.'
    default: return 'Something went wrong with your account. Please try again.'
  }
}

export function authErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  const message = friendlyAuthError(error)
  return code ? `${message} (${code})` : message
}
