#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

const TARGET_DIRS = ['harness'];
const TARGET_EXT = new Set(['.js', '.mjs', '.cjs']);

function walk(dirPath, out = []) {
  if (!fs.existsSync(dirPath)) return out;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.worktrees') continue;
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (TARGET_EXT.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

function checkFile(file) {
  const run = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  const code = typeof run.status === 'number' ? run.status : 1;
  return { ok: code === 0, code, stdout: run.stdout || '', stderr: run.stderr || '' };
}

const files = TARGET_DIRS.flatMap((dir) => walk(path.join(ROOT, dir)));
let failures = 0;

for (const file of files) {
  const result = checkFile(file);
  if (!result.ok) {
    failures += 1;
    console.error(`[syntax] FAIL ${path.relative(ROOT, file)}\n${result.stderr || result.stdout}`.trim());
  }
}

if (failures > 0) {
  console.error(`[syntax] ${failures} file(s) failed syntax check.`);
  process.exit(1);
}

console.log(`[syntax] OK (${files.length} files)`);
