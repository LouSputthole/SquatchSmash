import { BADA_BING_PERFORMERS } from '../bing/performers.js';

/** Scene clothes over a stable adult performer identity. */
function resortModel(identityIndex, outfit) {
  return Object.freeze({
    role: 'performer', adult: true, gender: 'female', bodyShape: 'curvy',
    dress: 'bikini',
    ...BADA_BING_PERFORMERS[identityIndex],
    ...outfit,
  });
}

function variant(identityIndex, name, look, outfit) {
  return Object.freeze({
    identityIndex,
    name,
    look,
    identity: Object.freeze({
      source: 'BADA_BING_PERFORMERS',
      index: identityIndex,
      look,
    }),
    model: resortModel(identityIndex, outfit),
  });
}

/**
 * Seven exact Mansion looks: two in the suite, four on loungers and one in
 * the water. Every model remains opaque/non-nude; the variants change the
 * cut, contrast trim and palette, not the adult-performer safety gate.
 */
export const MANSION_PERFORMER_VARIANTS = Object.freeze({
  suitePerformer0: variant(3, 'the Bada Bing blonde performer', 'blonde long hair', {
    shirt: 0x17151b, swimStyle: 'halter', swimAccent: 0xd94f9a,
  }),
  suitePerformer1: variant(1, 'the Bada Bing brunette performer', 'brunette long hair', {
    shirt: 0x6e264c, swimStyle: 'onepiece', swimAccent: 0xd6a2c4,
  }),
  poolPerformer0: variant(0, 'the Bada Bing platinum performer', 'platinum tied hair', {
    shirt: 0xefe1ad, swimStyle: 'highwaist', swimAccent: 0xb98a2e,
  }),
  poolPerformer1: variant(2, 'the Bada Bing black-haired performer', 'black long hair', {
    shirt: 0x194f3b, swimStyle: 'classic', swimAccent: 0xd8b85a,
  }),
  poolPerformer2: variant(4, 'the Bada Bing auburn performer', 'auburn long hair', {
    shirt: 0x254f9a, swimStyle: 'onepiece', swimAccent: 0x7fb6e8,
  }),
  poolPerformer3: variant(5, 'the Bada Bing raven-haired performer', 'raven tied hair', {
    shirt: 0x315f9e, swimStyle: 'halter', swimAccent: 0xd8dde7,
  }),
  poolPerformer4: variant(6, 'the Bada Bing silver-haired performer', 'silver long hair', {
    shirt: 0x781f39, swimStyle: 'highwaist', swimAccent: 0x17131b,
  }),
});

export const MANSION_SUITE_PERFORMER_POSTS = Object.freeze([
  'suitePerformer0', 'suitePerformer1',
]);

export const MANSION_POOL_PERFORMER_POSTS = Object.freeze([
  'poolPerformer0', 'poolPerformer1', 'poolPerformer2',
  'poolPerformer3', 'poolPerformer4',
]);

export const MANSION_POOL_RECLINER_CHAIRS = Object.freeze({
  poolPerformer0: 4,
  poolPerformer1: 6,
  poolPerformer3: 1,
  poolPerformer4: 3,
});
