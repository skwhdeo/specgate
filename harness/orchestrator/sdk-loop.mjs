#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  createAgentSession,
  SessionManager,
} from '@mariozechner/pi-coding-agent';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const configCandidates = [
  path.join(ROOT, '.pi', 'specgate', 'config.json'),
  path.join(ROOT, 'harness', 'config.json'),
];
const configPath = configCandidates.find((p) => fs.existsSync(p)) || configCandidates[0];

const defaultConfig = {
  paths: {
    stateFile: '.pi/specgate/state/state.json',
    lastFailureFile: '.pi/specgate/state/last-failure.json',
    checkpointFile: '.pi/specgate/state/checkpoint.md',
    artifactsDir: '.pi/specgate/artifacts',
  },
  orchestrator: {
    enabled: false,
    mode: 'sdk',
    maxAttempts: 8,
    maxWallTimeMs: 60 * 60 * 1000,
    sleepMs: 1000,
    goal: 'Fix target project until harness gates pass',
  },
};

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function getArgValue(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx === process.argv.length - 1) return undefined;
  return process.argv[idx + 1];
}

function getNumberArg(name) {
  const v = getArgValue(name);
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarizeFailure(lastFailure) {
  if (!lastFailure) return 'No previous failure artifact.';

  const failed = Array.isArray(lastFailure.failedGates)
    ? lastFailure.failedGates.map((g) => `${g.gate}:${g.exitCode}`).join(', ')
    : 'n/a';

  const errors = Array.isArray(lastFailure.topErrors) ? lastFailure.topErrors.slice(0, 6) : [];
  const files = Array.isArray(lastFailure.fileCandidates) ? lastFailure.fileCandidates.slice(0, 10) : [];

  return [
    `reason: ${lastFailure.reason || 'unknown'}`,
    `failedGates: ${failed}`,
    `fingerprint: ${lastFailure.fingerprint || 'n/a'}`,
    'topErrors:',
    ...errors.map((e) => `- ${e}`),
    'fileCandidates:',
    ...(files.length > 0 ? files.map((f) => `- ${f}`) : ['- n/a']),
  ].join('\n');
}

function extractFileCandidates(state) {
  const candidates = new Set();
  const failed = Object.values(state?.gateResults || {}).filter((g) => g && g.passed === false);
  const fileRegex = /(?:^|\s|\()((?:\.\.?\/)?[\w@.-]+(?:\/[\w@.-]+)+\.(?:ts|tsx|js|jsx|vue|json|md))(?:\)|:|\s|$)/g;

  for (const gate of failed) {
    const source = `${gate.stderr || ''}\n${gate.stdout || ''}`;
    let match;
    while ((match = fileRegex.exec(source)) !== null) {
      candidates.add(match[1]);
      if (candidates.size >= 12) break;
    }
    if (candidates.size >= 12) break;
  }

  return [...candidates];
}

function buildPrompt({ goal, attempt, maxAttempts, withBrowser, lastFailure, fileCandidates }) {
  return [
    'You are fixing an external project so harness gates pass.',
    `Goal: ${goal}`,
    `Attempt: ${attempt}/${maxAttempts}`,
    withBrowser ? 'Browser gate is included in verification.' : 'Browser gate is not included in verification.',
    '',
    'Constraints:',
    '- Do not modify harness runtime contract unless required.',
    '- Keep harness-project boundary via command/file/API only.',
    '- Make minimal changes in target project to pass failing gates.',
    '',
    'Latest failure artifact:',
    summarizeFailure(lastFailure),
    '',
    'Additional file candidates from latest state:',
    ...(fileCandidates.length > 0 ? fileCandidates.map((f) => `- ${f}`) : ['- n/a']),
    '',
    'After edits, stop. Harness will re-verify and decide DONE/FAILED.',
  ].join('\n');
}

function runHarnessVerify(withBrowser) {
  const args = ['harness/runner/run.js', '--reverify'];
  if (withBrowser) args.push('--with-browser');

  const run = spawnSync('node', args, {
    cwd: ROOT,
    encoding: 'utf8',
  });

  return {
    code: typeof run.status === 'number' ? run.status : 1,
    stdout: run.stdout || '',
    stderr: run.stderr || '',
  };
}

function logAttempt(artifactsDir, payload) {
  fs.mkdirSync(artifactsDir, { recursive: true });
  const file = path.join(artifactsDir, 'orchestrator-log.jsonl');
  fs.appendFileSync(file, `${JSON.stringify(payload)}\n`, 'utf8');
}

async function main() {
  const userConfig = readJson(configPath, {});
  const config = {
    ...defaultConfig,
    ...userConfig,
    paths: { ...defaultConfig.paths, ...(userConfig.paths || {}) },
    orchestrator: { ...defaultConfig.orchestrator, ...(userConfig.orchestrator || {}) },
  };

  const statePath = path.join(ROOT, config.paths.stateFile);
  const lastFailurePath = path.join(ROOT, config.paths.lastFailureFile);
  const artifactsDir = path.join(ROOT, config.paths.artifactsDir);

  const maxAttempts = getNumberArg('--max-attempts') ?? config.orchestrator.maxAttempts;
  const maxWallTimeMs = getNumberArg('--max-wall-time-ms') ?? config.orchestrator.maxWallTimeMs;
  const sleepMs = getNumberArg('--sleep-ms') ?? config.orchestrator.sleepMs;
  const goal = getArgValue('--goal') ?? config.orchestrator.goal;
  const withBrowser = process.argv.includes('--with-browser');
  const dryRun = process.argv.includes('--dry-run');

  const startedAt = Date.now();

  let session;
  if (!dryRun) {
    try {
      const created = await createAgentSession({
        cwd: ROOT,
        sessionManager: SessionManager.inMemory(),
      });
      session = created.session;
    } catch (error) {
      console.error('[orchestrator] failed to create Pi SDK session. Configure model/API key first.');
      throw error;
    }

    session.subscribe((event) => {
      if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
        process.stdout.write(event.assistantMessageEvent.delta);
      }
    });
  } else {
    console.log('[orchestrator] dry-run enabled: agent edit step is skipped.');
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (Date.now() - startedAt > maxWallTimeMs) {
      const failure = {
        cycle: attempt,
        reason: 'LOOP_LIMIT_REACHED',
        failedGates: [],
        fingerprint: null,
        topErrors: [`orchestrator maxWallTimeMs exceeded (${maxWallTimeMs})`],
        timestamp: new Date().toISOString(),
      };
      writeJson(lastFailurePath, failure);
      process.exit(1);
    }

    const lastFailure = readJson(lastFailurePath, null);
    const preState = readJson(statePath, {});
    const fileCandidates = extractFileCandidates(preState);

    if (lastFailure && (!Array.isArray(lastFailure.fileCandidates) || lastFailure.fileCandidates.length === 0)) {
      writeJson(lastFailurePath, {
        ...lastFailure,
        fileCandidates,
      });
    }

    const prompt = buildPrompt({
      goal,
      attempt,
      maxAttempts,
      withBrowser,
      lastFailure: lastFailure ? { ...lastFailure, fileCandidates } : { fileCandidates },
      fileCandidates,
    });

    console.log(`\n[orchestrator] attempt ${attempt}/${maxAttempts}`);
    if (!dryRun) {
      await session.prompt(prompt);
    } else {
      console.log('\n[orchestrator] prompt preview:\n');
      console.log(prompt);
    }

    const verify = runHarnessVerify(withBrowser);
    const state = readJson(statePath, {});

    logAttempt(artifactsDir, {
      at: new Date().toISOString(),
      attempt,
      dryRun,
      harnessExitCode: verify.code,
      harnessStatus: state.status,
      lastError: state.lastError || null,
      fileCandidates,
    });

    if (state.status === 'DONE') {
      console.log(`\n[orchestrator] DONE at attempt ${attempt}`);
      if (session) session.dispose();
      process.exit(0);
    }

    if (attempt < maxAttempts) {
      await sleep(sleepMs);
    }
  }

  const failure = {
    cycle: maxAttempts,
    reason: 'LOOP_LIMIT_REACHED',
    failedGates: [],
    fingerprint: null,
    topErrors: [`orchestrator maxAttempts reached (${maxAttempts})`],
    timestamp: new Date().toISOString(),
  };
  writeJson(lastFailurePath, failure);

  console.log('\n[orchestrator] FAILED: max attempts reached');
  if (session) session.dispose();
  process.exit(1);
}

main().catch((error) => {
  console.error('[orchestrator] fatal:', error?.stack || String(error));
  process.exit(1);
});
