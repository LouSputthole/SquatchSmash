/** Share one successful asynchronous load while allowing a failed load to retry. */
export function loadOnceRetriable(owner, key, loader) {
  if (owner[key]) return owner[key];

  let result;
  try {
    result = loader();
  } catch (error) {
    return Promise.reject(error);
  }

  const guarded = Promise.resolve(result).catch((error) => {
    if (owner[key] === guarded) owner[key] = null;
    throw error;
  });
  owner[key] = guarded;
  return guarded;
}

/** Run asynchronous work through a bounded pool instead of flooding the browser. */
export async function runWorkerPool(items, worker, concurrency = 32) {
  let cursor = 0;
  const run = async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  };
  const count = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: count }, () => run()));
}
