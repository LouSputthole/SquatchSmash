/** Browser-free semantic contract for one rendered evidence ray. */
export function rayHitContractError(expectation, actualHit) {
  const actualName = actualHit?.name ?? 'nothing';
  if (expectation.pattern && !new RegExp(expectation.pattern).test(actualName)) {
    return `hit ${actualName}, expected ${expectation.pattern}`;
  }
  if (expectation.characterId && actualHit?.characterId !== expectation.characterId) {
    return `hit ${actualName} on ${actualHit?.characterId ?? 'no character'},`
      + ` expected ${expectation.characterId}`;
  }
  return null;
}
