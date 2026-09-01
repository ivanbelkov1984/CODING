import fs from 'node:fs';
import assert from 'node:assert/strict';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const triage = fs.readFileSync(new URL('../backend/triage.mjs', import.meta.url), 'utf8');

assert.ok(!app.includes("conf: { type: 'integer', minimum: 0, maximum: 100 }"), 'psych contour: Anthropic transport schema must not carry integer bounds');
assert.match(app, /Number\.isInteger\(m\.conf\).*m\.conf < 0 \|\| m\.conf > 100/s, 'psych contour: domain confidence validation 0..100 must remain');
assert.ok(!triage.includes("confidence:{type:'integer', minimum:0, maximum:100}"), 'triage: Anthropic transport schema must not carry integer bounds');
assert.match(triage, /Number\.isInteger\(m\.confidence\).*m\.confidence < 0 \|\| m\.confidence > 100/s, 'triage: domain confidence validation 0..100 must remain');

for (const [name, source] of [['app', app], ['triage', triage]]) {
  const directIntegerBounds = /type:\s*['"]integer['"][^}\n]*(?:minimum|maximum)/g;
  assert.equal((source.match(directIntegerBounds) || []).length, 0, `${name}: unsupported integer bounds must not reach Anthropic structured-output schemas`);
}

console.log('P0-193 Anthropic schema regression: 6/6');
