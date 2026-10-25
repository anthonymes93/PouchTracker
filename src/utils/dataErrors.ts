export function dataErrorMessage(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  if (code === 'permission-denied') return 'Access was denied. Check that you are signed in and your Firestore rules are deployed.'
  if (code === 'failed-precondition') return 'Firestore needs the latest index configuration. Deploy firestore.indexes.json and wait for the index to finish building.'
  if (code === 'unavailable') return 'The server is unavailable. Check your connection and try again.'
  return error instanceof Error && !code ? error.message : 'Could not save or load your data. Please try again.'
}
