import type { Page } from '@playwright/test'
export async function isolateFirebase(page: Page, signedIn = true) {
  // These interceptions keep every automated UI test isolated from the user's configured Firebase project.
  await page.route('**/src/lib/firebase.ts', route => route.fulfill({ contentType: 'application/javascript', body: 'export const auth=null; export const db=null; export const firebaseConfigured=false;' }))
  if (!signedIn) return
  await page.route('**/src/hooks/useAuth.ts', route => route.fulfill({ contentType: 'application/javascript', body: `
    import React from '/node_modules/.vite/deps/react.js';
    const subscribe = cb => { window.addEventListener('fixture-auth', cb); return () => window.removeEventListener('fixture-auth', cb); };
    const snapshot = () => localStorage.getItem('fixture-signed-out');
    const user = { uid: 'test-user', displayName: 'Test User', email: 'test@example.com' };
    export function useAuth() {
      const signedOut = React.useSyncExternalStore(subscribe, snapshot);
      return { user: signedOut ? null : user, loading:false, busy:false, error:null, profileError:null, login:async()=>{}, logout:async()=>{localStorage.setItem('fixture-signed-out','true'); window.dispatchEvent(new Event('fixture-auth'));}, retryProfile:async()=>{} };
    }
  ` }))
  for (const module of ['entries', 'preferences', 'finance', 'performance', 'rewards', 'schedule']) await page.route(`**/src/services/${module}.ts`, route => route.fulfill({ contentType: 'application/javascript', body: `export * from '/tests/fixtures/tracking.ts';` }))
}
