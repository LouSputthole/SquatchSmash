/** Start a local evidence server with an awaited error boundary. */
export function listenEvidenceServer(server, port, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off?.('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off?.('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.listen(port, host, onListening);
  });
}

function closeServer(server) {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

/** Close both nullable resources even when the first close itself fails. */
export async function closeEvidenceLifecycle({ browser = null, server = null } = {}) {
  let failure = null;
  try {
    await browser?.close?.();
  } catch (error) {
    failure = error;
  }
  try {
    await closeServer(server);
  } catch (error) {
    failure ??= error;
  }
  if (failure) throw failure;
}
