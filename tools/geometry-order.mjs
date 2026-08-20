/**
 * Locale-independent ordering for persisted geometry-gate output.
 *
 * JavaScript relational string comparison is defined in terms of UTF-16 code
 * units, unlike localeCompare(), whose punctuation ordering can vary by
 * runtime locale. Both worker serialization and parent validation must use the
 * same comparator so a canonical worker report is always accepted.
 */
export function compareGeometryText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
