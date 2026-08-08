/**
 * Put one spoken beat on the single subtitle/voice floor.
 *
 * Priority never interrupts the line already speaking. It only moves an
 * authored response ahead of optional narration that is still waiting. When
 * the short queue is full, optional work is discarded before a required beat.
 */
export function enqueueVoiceFloor(queue, entry, limit = 4) {
  if (!Array.isArray(queue)) throw new TypeError('Voice floor queue must be an array');
  const item = { ...entry, priority: entry?.priority === true };
  if (item.priority) {
    const firstOptional = queue.findIndex((queued) => queued.priority !== true);
    if (firstOptional >= 0) queue.splice(firstOptional, 0, item);
    else queue.push(item);
  } else {
    queue.push(item);
  }

  while (queue.length > limit) {
    const optional = queue.findIndex((queued) => queued.priority !== true);
    queue.splice(optional >= 0 ? optional : 0, 1);
  }
  return queue;
}
