/**
 * The Bada Bing's adult performer roster, independent of any renderer.
 *
 * The first four women are the established story-night stage cast. The last
 * three are off-shift performers who can appear at the Mansion without
 * duplicating one of the women already in the suite. Physical identity lives
 * here; a scene supplies only the clothes for that particular night.
 */

const performer = (look) => Object.freeze(look);

export const BADA_BING_CORE_STAGE_COUNT = 4;

export const BADA_BING_PERFORMERS = Object.freeze([
  performer({
    height: 1.73, build: 1.10, curveScale: 1.14,
    skin: 0x8d5a3a, hairColour: 0xe0c884, hair: 'tied', shirt: 0xd9c04f,
  }), // platinum
  performer({
    height: 1.71, build: 1.10, curveScale: 1.18,
    skin: 0xe8c39c, hairColour: 0x5a3a20, hair: 'long', shirt: 0x9a4fd9,
  }), // brunette
  performer({
    height: 1.72, build: 1.08, curveScale: 1.12,
    skin: 0xf2d3b4, hairColour: 0x14100e, hair: 'long', shirt: 0x4fd9c0,
  }), // black-haired
  performer({
    height: 1.74, build: 1.11, curveScale: 1.16,
    skin: 0xf0cba6, hairColour: 0xdcb04a, hair: 'long', shirt: 0xd94f9a,
  }), // blonde
  performer({
    height: 1.75, build: 1.12, curveScale: 1.18,
    skin: 0xb97852, hairColour: 0x78301f, hair: 'long', shirt: 0x2f8a61,
  }), // auburn
  performer({
    height: 1.72, build: 1.10, curveScale: 1.17,
    skin: 0xa66f4f, hairColour: 0x171214, hair: 'tied', shirt: 0x315f9e,
  }), // raven-haired
  performer({
    height: 1.76, build: 1.13, curveScale: 1.18,
    skin: 0x6f432d, hairColour: 0xc9c0b5, hair: 'long', shirt: 0x9f294a,
  }), // silver-haired
]);
