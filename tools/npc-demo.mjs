// Exercises the NPC system and prints a readable transcript for review.
import { NpcSystem, ROSTER, tierOf, stateOf } from '../src/initiation/npc.js';

// Deterministic RNG so the transcript is stable run-to-run.
let seed = 12345;
const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

function hr(t) { console.log('\n' + '='.repeat(64) + '\n' + t + '\n' + '='.repeat(64)); }

// ---------------------------------------------------------------
hr('1 · A GOOD RUN → THE PARTY, everyone sober, you greet the room');
{
  const npc = new NpcSystem({ rng });
  npc.seedStanding({ enduredFull: true, roarLoud: true, quizPassed: true, brokeLogFirstTry: true, partyHasBong: true });
  for (const r of ROSTER) {
    const n = npc.get(r.id);
    const g = npc.greet(r.id);
    console.log(`  ${g.name.padEnd(14)} [${tierOf(n.standing)}/${stateOf(n)[0]}]  ${g.text}`);
  }
}

// ---------------------------------------------------------------
hr('2 · SAME NIGHT, 40 MINUTES LATER — everyone is wrecked/high');
{
  const npc = new NpcSystem({ rng });
  npc.seedStanding({ enduredFull: true, roarLoud: true, quizPassed: true });
  for (const r of ROSTER) { npc.setDrunk(r.id, 0.85); }
  npc.setHigh('shubes', { stoned: true });
  npc.setHigh('gratin', { stoned: true });
  for (const r of ROSTER) {
    const n = npc.get(r.id);
    const g = npc.greet(r.id);
    console.log(`  ${g.name.padEnd(14)} [${tierOf(n.standing)}/${stateOf(n).join('+')}]  ${g.text}`);
  }
}

// ---------------------------------------------------------------
hr('3 · NO REPEATS — greet Booski ten times, watch the bank drain');
{
  const npc = new NpcSystem({ rng });
  npc.seedStanding({ enduredFull: true, roarLoud: true, quizPassed: true });
  npc.setDrunk('booski', 0.5);
  const seen = new Set();
  for (let i = 0; i < 10; i++) {
    const g = npc.greet('booski');
    const dup = seen.has(g.text) ? '  <-- repeat (bank exhausted, reset)' : '';
    seen.add(g.text);
    console.log(`  ${i + 1}. ${g.text}${dup}`);
  }
}

// ---------------------------------------------------------------
hr('4 · THE RAT ROUTE — working the room builds suspicion, lines flip');
{
  const npc = new NpcSystem({ route: 'rat', rng });
  npc.seedStanding({ enduredFull: true, quizPassed: true });
  // Talk to a bunch of people; suspicion accumulates on the watchful ones.
  const order = ['lou', 'ape', 'hogmama', 'shubes', 'erican', 'sasole', 'gratin', 'snow', 'irish', 'deathmegatron', 'booski'];
  for (const id of order) {
    const g = npc.greet(id);
    const lead = npc.suspicionLeader();
    console.log(`  ${g.name.padEnd(14)} ${g.text}`);
    if (lead) console.log(`     (suspicion leader: ${lead.name} @ ${lead.suspicion})`);
  }
  // Now force Rippinflow's suspicion over the line and greet him.
  const rip = npc.get('rippinflow');
  rip.suspicion = 80;
  console.log('\n  --- Rippinflow, suspicious ---');
  for (let i = 0; i < 3; i++) console.log(`  ${npc.greet('rippinflow').text}`);
  console.log('\n  --- Booski, suspicious ---');
  npc.get('booski').suspicion = 80;
  for (let i = 0; i < 3; i++) console.log(`  ${npc.greet('booski').text}`);
}

// ---------------------------------------------------------------
hr('5 · AMBIENT BARKS — the party talking to itself (normal route)');
{
  const npc = new NpcSystem({ rng });
  npc.seedStanding({ enduredFull: true });
  for (let i = 0; i < 6; i++) {
    const bark = npc.ambientBark();
    if (!bark) { console.log('  (out of barks)'); break; }
    console.log('  ·');
    for (const step of bark) console.log(`    ${step.name}: ${step.text}`);
  }
}

// ---------------------------------------------------------------
hr('6 · AMBIENT BARKS — rat route unlocks the paranoid ones');
{
  const npc = new NpcSystem({ route: 'rat', rng });
  npc.seedStanding({ enduredFull: true });
  let ratOnes = 0;
  for (let i = 0; i < 12; i++) {
    const bark = npc.ambientBark();
    if (!bark) break;
    const text = bark.map((s) => `${s.name}: ${s.text}`).join(' / ');
    if (/weird|hands|Rippinflow's got it/.test(text)) { ratOnes++; console.log('  [RAT] ' + text); }
  }
  console.log(`  → ${ratOnes} rat-only exchange(s) surfaced (0 would mean the gate is broken)`);
}

// ---------------------------------------------------------------
hr('7 · A BAD RUN — hesitated on the quiz, quiet roar; standings dip');
{
  const npc = new NpcSystem({ rng });
  npc.seedStanding({ quizHesitated: true, enduredFull: false, roarLoud: false });
  for (const id of ['booski', 'lou', 'ape', 'rippinflow']) {
    const n = npc.get(id);
    const g = npc.greet(id);
    console.log(`  ${g.name.padEnd(14)} [${tierOf(n.standing)} @ ${n.standing}]  ${g.text}`);
  }
}

console.log('\nDONE. No throws = the engine is sound. Read the lines = judge the writing.');
