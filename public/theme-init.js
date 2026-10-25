// Runs before styles are loaded. The auth provider clears the cache if the session is signed out.
try {
  const cached = JSON.parse(localStorage.getItem('pouch-tracker-theme') || 'null');
  document.documentElement.dataset.theme = cached?.uid && cached.theme === 'ocean' ? 'ocean' : 'forest';
} catch { document.documentElement.dataset.theme = 'forest'; }
