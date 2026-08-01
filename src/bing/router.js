const visit = new URLSearchParams(location.search).get('visit');

try {
  if (visit === '2') await import('./hotdog-main.js');
  else await import('./main.js');
} catch (error) {
  window.__squatchFail?.(
    'Could not load the game code',
    error?.message || String(error),
  );
  throw error;
}
