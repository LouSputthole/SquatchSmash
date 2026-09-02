import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/*
 * Every scene that names faces in its own table wears every photo that has
 * landed for the people it builds.
 *
 * Owner, 2026-09-02: "I'm not seeing the new faces on the characters for
 * Numbskull, Sauce -- make sure the faces are on the characters for all of
 * them." The faces branch had landed four photographs as an asset-only drop
 * and `tests/appearances.test.mjs` proved each was worn *somewhere*, which
 * is true of the Bing and says nothing about the mansion, the siege, THE
 * TAKE, the Initiation, Enola, the cabin, the Palace or the HotDog party --
 * the scenes that name faces by hand rather than reading the index. This
 * holds each of those hand tables to the index. Add a photo to
 * `assets/faces/index.json` and the scene that builds that person goes red
 * until it names the file.
 */
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const onDisk = new Set(JSON.parse(read('assets/faces/index.json')).files);

/* file -> [photo, the source shape that proves the scene wears it] */
const SITES = [
  ['src/mansion/cast.js', {
    'lou.png': /lou: 'assets\/faces\/lou\.png'/,
    'sasole.png': /sasole: 'assets\/faces\/sasole\.png'/,
    'booski.png': /booski: 'assets\/faces\/booski\.png'/,
    'deathmegatron.png': /deathmegatron: 'assets\/faces\/deathmegatron\.png'/,
    'irish.png': /irish: 'assets\/faces\/irish\.png'/,
    'rippinflow.png': /rippinflow: 'assets\/faces\/rippinflow\.png'/,
    'erican.png': /erican: 'assets\/faces\/erican\.png'/,
    'shubes.png': /shubes: 'assets\/faces\/shubes\.png'/,
    'hogmama.png': /hogmama: 'assets\/faces\/hogmama\.png'/,
    'ape.png': /ape: 'assets\/faces\/ape\.png'/,
    'stove.png': /stove: 'assets\/faces\/stove\.png'/,
    'snow.png': /withFace\([^)]*SNOW[^)]*, FACES\.snow\)/,
    'gratin.png': /withFace\(GRATIN, FACES\.gratin\)/,
    'numbskull.png': /withFace\(NUMBSKULL, FACES\.numbskull\)/,
    'sauce.png': /withFace\(familyModel\(CHARACTER_IDS\.SAUCE\), FACES\.sauce\)/,
    'lag.png': /withFace\(familyModel\(CHARACTER_IDS\.LAG\), FACES\.lag\)/,
    'seff.png': /withFace\(familyModel\(CHARACTER_IDS\.SEFF\), FACES\.seff\)/,
  }],
  ['src/mansion/siege/ensemble.js', {
    'lou.png': /withFace\(BIG_UNCLE_LOU_MANSION, FACES\.lou\)/,
    'booski.png': /withFace\(BOOSKI, FACES\.booski\)/,
    'rippinflow.png': /withFace\(RIPPINFLOW, FACES\.rippinflow\)/,
    'shubes.png': /withFace\(SHUBENATOR, FACES\.shubes\)/,
    'erican.png': /withFace\(ERIC, FACES\.erican\)/,
    'gratin.png': /withFace\(GRATIN, FACES\.gratin\)/,
    'irish.png': /withFace\(IRISH, FACES\.irish\)/,
    'deathmegatron.png': /withFace\(DEATHMEGATRON, FACES\.deathmegatron\)/,
    'hogmama.png': /withFace\(HOG_MAMA, FACES\.hogmama\)/,
    'sasole.png': /withFace\(CAPTAIN_LOU_SASOLE, FACES\.sasole\)/,
    'numbskull.png': /withFace\(NUMBSKULL, FACES\.numbskull\)/,
  }],
  ['src/heist/cast.js', {
    'snow.png': /face: 'assets\/faces\/snow\.png'/,
    'rippinflow.png': /face: 'assets\/faces\/rippinflow\.png'/,
    'shubes.png': /face: 'assets\/faces\/shubes\.png'/,
    'deathmegatron.png': /face: 'assets\/faces\/deathmegatron\.png'/,
    'numbskull.png': /face: 'assets\/faces\/numbskull\.png'/,
  }],
  ['src/initiation/cast.js', {
    'gratin.png': /key: 'GRATIN'[^}]*face: 'assets\/faces\/gratin\.png'/,
    'seff.png': /key: 'SEFF'[^}]*face: 'assets\/faces\/seff\.png'/,
    'deathmegatron.png': /key: 'DEATHMEGATRON'[^}]*face: 'assets\/faces\/deathmegatron\.png'/,
    'rippinflow.png': /key: 'RIPPINFLOW'[^}]*face: 'assets\/faces\/rippinflow\.png'/,
    'shubenator.png': /key: 'SHUBENATOR'[^}]*face: 'assets\/faces\/shubenator\.png'/,
    'numbskull.png': /key: 'NUMBSKULL'[^}]*face: 'assets\/faces\/numbskull\.png'/,
    'ape.png': /key: 'APE'[^}]*face: 'assets\/faces\/ape\.png'/,
    'snow.png': /key: 'SNOW'[^}]*face: 'assets\/faces\/snow\.png'/,
    'irish.png': /key: 'IRISH'[^}]*face: 'assets\/faces\/irish\.png'/,
    'hogmama.png': /key: 'HOGMAMA'[^}]*face: 'assets\/faces\/hogmama\.png'/,
    'lag.png': /key: 'LAG'[^}]*face: 'assets\/faces\/lag\.png'/,
    'erican.png': /key: 'ERIC'[^}]*face: 'assets\/faces\/erican\.png'/,
    'sasole.png': /key: 'SASOLE'[^}]*face: 'assets\/faces\/sasole\.png'/,
  }],
  ['src/initiation/ceremony-layout.js', {
    'lou.png': /key: 'LOU'[^}]*face: 'assets\/faces\/lou\.png'/,
    'gratin.png': /key: 'GRATIN'[^}]*face: 'assets\/faces\/gratin\.png'/,
    'seff.png': /key: 'SEFF'[^}]*face: 'assets\/faces\/seff\.png'/,
    'numbskull.png': /key: 'NUMBSKULL'[^}]*face: 'assets\/faces\/numbskull\.png'/,
    'lag.png': /key: 'LAG'[^}]*face: 'assets\/faces\/lag\.png'/,
  }],
  ['src/initiation/npc.js', {
    'booski.png': /id: 'booski'[^}]*face: 'assets\/faces\/booski\.png'/,
    'ape.png': /id: 'ape'[^}]*face: 'assets\/faces\/ape\.png'/,
    'irish.png': /id: 'irish'[^}]*face: 'assets\/faces\/irish\.png'/,
    'gratin.png': /id: 'gratin'[^}]*face: 'assets\/faces\/gratin\.png'/,
    'snow.png': /id: 'snow'[^}]*face: 'assets\/faces\/snow\.png'/,
  }],
  ['src/enolasquatch/crew.js', {
    'sasole.png': /face: 'assets\/faces\/sasole\.png'/,
    'irish.png': /face: 'assets\/faces\/irish\.png'/,
    'numbskull.png': /name: 'numbskull'[^}]*face: 'assets\/faces\/numbskull\.png'/,
  }],
  ['src/bing/hotdog-party.js', {
    'lou.png': /faces\.has\('lou\.png'\) \? 'assets\/faces\/lou\.png' : null/,
    'aubbie.png': /faces\.has\('aubbie\.png'\) \? 'assets\/faces\/aubbie\.png' : null/,
    'sauce.png': /faces\.has\('sauce\.png'\) \? 'assets\/faces\/sauce\.png' : null/,
  }],
  ['src/cartel-palace/cast.js', {
    'sauce.png': /SAUCE_FACE = 'assets\/faces\/sauce\.png'/,
  }],
  ['src/cabin/lag.js', {
    'lag.png': /face: LAG_FACE/,
  }],
];

for (const [file, wears] of SITES) {
  test(`${file} wears every landed photo it names`, () => {
    const source = read(file);
    for (const [photo, proof] of Object.entries(wears)) {
      assert.ok(onDisk.has(photo), `${photo} is no longer on the index; retire the ${file} row`);
      assert.match(source, proof, `${file} builds the person ${photo} is of, but does not wear it`);
    }
  });
}

test('the four faces from the 2026-09-01 drop are on the index this test reads', () => {
  for (const photo of ['numbskull.png', 'sauce.png', 'lag.png', 'seff.png']) {
    assert.ok(onDisk.has(photo), `${photo} left the index`);
  }
});
