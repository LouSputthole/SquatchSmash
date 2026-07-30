/**
 * Classic-script boot guard for standalone scene entrypoints.
 *
 * This deliberately is not an ES module: it must be alive before the scene
 * module is fetched so a missing import, parse failure, or early rejection can
 * still put an actionable error on screen.
 */
(() => {
  const script = document.currentScript;
  const target = document.getElementById(script?.dataset.target || 'bootFailure');
  const readyGlobal = script?.dataset.ready;
  const sceneName = script?.dataset.scene || 'The scene';
  const timeout = Number(script?.dataset.timeout) || 30000;
  let shown = false;

  function fail(title, detail) {
    if (shown || !target) return;
    shown = true;
    target.hidden = false;
    target.querySelector('[data-boot-title]').textContent = title;
    target.querySelector('[data-boot-detail]').textContent = detail || '';
  }

  globalThis.__squatchSceneFail = fail;
  target?.querySelector('[data-boot-reload]')?.addEventListener('click', () => {
    globalThis.location.reload();
  });

  addEventListener('error', (event) => {
    fail('Could not start', event.message || String(event.error || event));
  });
  addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    fail('Could not start', reason?.message || String(reason));
  });
  setTimeout(() => {
    if (!readyGlobal || !globalThis[readyGlobal]) {
      fail(
        `${sceneName} did not finish loading`,
        'Reload the scene. If it keeps happening, return to the apartment and '
          + 'check the browser console for the missing file or runtime error.',
      );
    }
  }, timeout);
})();
