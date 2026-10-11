#!/usr/bin/env node
/** Deterministic next-task selector. No external dependencies and no filesystem writes. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = readFileSync(resolve(root, 'TASKS.md'), 'utf8');
const matches = [...file.matchAll(/^### \[([ x])\] (TASK-(\d{2})) — (.+)$/gm)];
if (matches.length !== 18) {
  console.error(`INVALID_TASK_QUEUE: expected 18 tasks, found ${matches.length}`);
  process.exit(2);
}
for (let i = 0; i < matches.length; i++) {
  if (Number(matches[i][3]) !== i + 1) {
    console.error(`INVALID_TASK_QUEUE: task position ${i + 1} is ${matches[i][2]}`);
    process.exit(2);
  }
}
const next = matches.find((match) => match[1] === ' ');
const complete = matches.filter((match) => match[1] === 'x').length;
if (!next) {
  console.log(`ALL_TASKS_COMPLETE (${complete}/${matches.length})`);
} else {
  console.log(`${next[2]} — ${next[4]}`);
  console.log(`DONE=${complete} REMAINING=${matches.length-complete}`);
}
