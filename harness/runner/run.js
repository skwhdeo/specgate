#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const configCandidates = [
  path.join(ROOT, '.pi', 'specgate', 'config.json'),
  path.join(ROOT, 'harness', 'config.json'),
];
const configPath = configCandidates.find((p) => fs.existsSync(p)) || configCandidates[0];

const defaultConfig = {
  paths: {
    stateFile: '.pi/specgate/state/state.json',
    checkpointFile: '.pi/specgate/state/checkpoint.md',
    lastFailureFile: '.pi/specgate/state/last-failure.json',
    beforeLoopStateFile: '.pi/specgate/state/state.before-loop.json',
  },
  runner: {
    defaultGates: ['lint', 'typecheck', 'test', 'arch'],
    browserGate: 'browser',
  },
  loop: {
    enabled: false,
    sleepMs: 2000,
    maxCycles: 30,
    maxWallTimeMs: 1800000,
    maxSameFingerprint: 3,
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

const userConfig = readJson(configPath, {});
const config = {
  ...defaultConfig,
  ...userConfig,
  paths: { ...defaultConfig.paths, ...(userConfig.paths || {}) },
  runner: { ...defaultConfig.runner, ...(userConfig.runner || {}) },
  loop: { ...defaultConfig.loop, ...(userConfig.loop || {}) },
};

const statePath = path.join(ROOT, config.paths.stateFile);
const checkpointPath = path.join(ROOT, config.paths.checkpointFile);
const lastFailurePath = path.join(ROOT, config.paths.lastFailureFile);
const beforeLoopStatePath = path.join(ROOT, config.paths.beforeLoopStateFile);
const gateRunnerPath = path.join(ROOT, 'harness', 'gates', 'run.js');

function getNumberArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index === process.argv.length - 1) return undefined;
  const n = Number(process.argv[index + 1]);
  return Number.isFinite(n) ? n : undefined;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runGate(gate) {
  const exec = spawnSync('node', [gateRunnerPath, gate], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  const stdout = exec.stdout || '';
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    parsed = {
      gate,
      passed: false,
      exitCode: typeof exec.status === 'number' ? exec.status : 1,
      summary: 'gate output parse failed',
      stdout,
      stderr: exec.stderr || '',
      timestamp: new Date().toISOString(),
    };
  }

  return {
    ...parsed,
    exitCode: typeof exec.status === 'number' ? exec.status : parsed.exitCode || 1,
  };
}

function normalizeCurrentTask(state) {
  const appCompleted = state.appTrackCompleted || [];
  if (appCompleted.includes('A7')) return 'A7';
  return state.currentTask || 'H0';
}

function nextHint(state) {
  if (state.status === 'DONE') return 'All tasks complete. Keep regressions green.';
  if (state.status === 'FAILED') return 'Investigate lastError and retry after fixes.';
  return `Continue task ${state.currentTask || 'unknown'} and rerun runner.`;
}

function gateLines(state) {
  const gateOrder = [
    ...(config.runner.defaultGates || ['lint', 'typecheck', 'test', 'arch']),
    config.runner.browserGate || 'browser',
  ];
  const batch = state.lastGateBatch || [];
  if (batch.length > 0) {
    return batch.map((g) => `  - ${g.gate}: ${g.passed ? 'PASS' : `FAIL(${g.exitCode})`}`).join('\n');
  }

  const gateResults = state.gateResults || {};
  const ordered = gateOrder.map((gate) => gateResults[gate]).filter(Boolean);

  if (ordered.length > 0) {
    return ordered.map((g) => `  - ${g.gate}: ${g.passed ? 'PASS' : `FAIL(${g.exitCode})`} (last)`).join('\n');
  }

  return '  - not-run';
}

function loopLines(state) {
  const summary = state.loopSummary;
  const progress = state.loopProgress;
  if (!summary && !progress) return '  - disabled or not-run';

  const lines = [];
  if (progress?.active) {
    lines.push(`  - active: cycle=${progress.cycle}, startedAt=${progress.startedAt}`);
  }
  if (summary) {
    lines.push(`  - cycles: ${summary.cycles}`);
    lines.push(`  - startedAt: ${summary.startedAt}`);
    lines.push(`  - endedAt: ${summary.endedAt}`);
    lines.push(`  - terminationReason: ${summary.terminationReason}`);
  }
  return lines.join('\n');
}

function topErrorLines(gateRuns) {
  return gateRuns
    .filter((g) => !g.passed)
    .flatMap((g) => {
      const source = `${g.stderr || ''}\n${g.stdout || ''}`.trim();
      const first = source.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, 2);
      return first.map((line) => `[${g.gate}] ${line}`);
    })
    .slice(0, 6);
}

function normalizeForFingerprint(text) {
  return (text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\d+/g, '#')
    .trim();
}

function buildFailureFingerprint(gateRuns) {
  const failed = gateRuns.filter((g) => !g.passed);
  if (failed.length === 0) return null;
  const parts = failed.map((g) => {
    const firstLine = `${g.stderr || ''}\n${g.stdout || ''}`.split(/\r?\n/).find((x) => x.trim());
    return `${g.gate}:${g.exitCode}:${normalizeForFingerprint(firstLine || g.summary || 'failed')}`;
  });
  return parts.join('|');
}

function writeLastFailure({ cycle, reason, gateRuns, fingerprint }) {
  const failed = gateRuns.filter((g) => !g.passed);
  const payload = {
    cycle,
    reason,
    failedGates: failed.map(({ gate, exitCode, summary, timestamp }) => ({ gate, exitCode, summary, timestamp })),
    fingerprint,
    topErrors: topErrorLines(gateRuns),
    timestamp: new Date().toISOString(),
  };
  writeJson(lastFailurePath, payload);
}

function writeCheckpoint(state) {
  const checkpoint = `# Harness Checkpoint\n\n- status: ${state.status}\n- currentTask: ${state.currentTask}\n- attempt: ${state.attempt}\n- maxAttempts: ${state.maxAttempts}\n- runCount: ${state.runCount}\n- lastRunAt: ${state.lastRunAt}\n- lastError: ${state.lastError || 'none'}\n- transitions:\n${state.lastTransitions?.map((t) => `  - ${t.from} -> ${t.to}`).join('\n') || '  - none'}\n- gates:\n${gateLines(state)}\n- loop:\n${loopLines(state)}\n- next: ${nextHint(state)}\n`;

  fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
  fs.writeFileSync(checkpointPath, checkpoint, 'utf8');
}

function runOnce(state, { forceReverify, withBrowserGate }) {
  const now = new Date().toISOString();
  state.currentTask = normalizeCurrentTask(state);

  const transitions = [];
  const gateRuns = [];

  const transition = (to) => {
    const from = state.status;
    state.status = to;
    transitions.push({ from, to });
    console.log(`[runner] transition ${from} -> ${to}`);
  };

  const runAllGates = () => {
    const gates = [...(config.runner.defaultGates || ['lint', 'typecheck', 'test', 'arch'])];
    if (withBrowserGate) gates.push(config.runner.browserGate || 'browser');
    gates.forEach((gate) => gateRuns.push(runGate(gate)));
  };

  console.log(`[runner] started at ${now}`);

  const terminal = state.status === 'DONE' || state.status === 'FAILED';

  if (terminal && !forceReverify) {
    console.log(`[runner] terminal state: ${state.status}`);
  } else if (terminal && forceReverify) {
    console.log(`[runner] reverify terminal state: ${state.status}`);
    transition('VERIFY');
    runAllGates();

    const failed = gateRuns.filter((g) => !g.passed);
    if (failed.length === 0) {
      state.lastError = null;
      transition('DONE');
    } else {
      state.lastError = failed.map((f) => `${f.gate}:${f.exitCode}`).join(', ');
      transition('FIX');
      transition('FAILED');
    }
  } else {
    if (state.status !== 'PENDING') transition('PENDING');

    transition('PLAN');
    transition('DO');
    transition('VERIFY');

    runAllGates();

    const failed = gateRuns.filter((g) => !g.passed);

    if (failed.length === 0) {
      state.lastError = null;
      transition('DONE');
    } else {
      state.lastError = failed.map((f) => `${f.gate}:${f.exitCode}`).join(', ');
      transition('FIX');
      state.attempt = (state.attempt || 0) + 1;

      if (state.attempt >= (state.maxAttempts || 5)) transition('FAILED');
      else transition('PENDING');
    }
  }

  if (gateRuns.length > 0) {
    state.gateResults = state.gateResults || {};
    gateRuns.forEach((g) => {
      state.gateResults[g.gate] = g;
    });
    state.lastGateResult = gateRuns[gateRuns.length - 1];
    state.lastGateAt = gateRuns[gateRuns.length - 1]?.timestamp;
    state.lastGateBatch = gateRuns.map(({ gate, passed, exitCode, summary, timestamp }) => ({
      gate,
      passed,
      exitCode,
      summary,
      timestamp,
    }));
  }

  state.runCount = (state.runCount || 0) + 1;
  state.lastRunAt = now;
  state.lastTransitions = transitions;

  return {
    transitions,
    gateRuns,
    failedGates: gateRuns.filter((g) => !g.passed),
  };
}

async function main() {
  const forceReverify = process.argv.includes('--reverify');
  const withBrowserGate = process.argv.includes('--with-browser');

  const loopFromArg = process.argv.includes('--loop');
  const loopEnabled = loopFromArg || config.loop.enabled;

  const sleepMs = getNumberArg('--sleep-ms') ?? config.loop.sleepMs;
  const maxCycles = getNumberArg('--max-cycles') ?? config.loop.maxCycles;
  const maxWallTimeMs = getNumberArg('--max-wall-time-ms') ?? config.loop.maxWallTimeMs;
  const maxSameFingerprint = getNumberArg('--max-same-fingerprint') ?? config.loop.maxSameFingerprint;

  const state = readJson(statePath, {
    status: 'PENDING',
    currentTask: 'H0',
    attempt: 0,
    maxAttempts: 5,
    lastError: null,
    runCount: 0,
    gateResults: {},
    lastGateBatch: [],
  });

  if (!loopEnabled) {
    const run = runOnce(state, { forceReverify, withBrowserGate });
    if (run.failedGates.length > 0) {
      const fingerprint = buildFailureFingerprint(run.gateRuns);
      writeLastFailure({ cycle: 1, reason: 'GATE_FAILED', gateRuns: run.gateRuns, fingerprint });
    }
    writeJson(statePath, state);
    writeCheckpoint(state);
    console.log('[runner] state/checkpoint updated');
    return;
  }

  const loopStartedAt = new Date().toISOString();
  writeJson(beforeLoopStatePath, state);

  let cycles = 0;
  let lastFingerprint = null;
  let sameFingerprintCount = 0;
  let terminationReason = 'UNKNOWN';

  while (true) {
    const wall = Date.now() - new Date(loopStartedAt).getTime();
    if (wall > maxWallTimeMs) {
      state.status = 'FAILED';
      terminationReason = 'LOOP_LIMIT_REACHED:maxWallTimeMs';
      writeLastFailure({ cycle: cycles, reason: 'LOOP_LIMIT_REACHED', gateRuns: [], fingerprint: lastFingerprint });
      break;
    }

    if (cycles >= maxCycles) {
      state.status = 'FAILED';
      terminationReason = 'LOOP_LIMIT_REACHED:maxCycles';
      writeLastFailure({ cycle: cycles, reason: 'LOOP_LIMIT_REACHED', gateRuns: [], fingerprint: lastFingerprint });
      break;
    }

    cycles += 1;
    state.loopProgress = {
      active: true,
      cycle: cycles,
      startedAt: loopStartedAt,
    };

    const run = runOnce(state, { forceReverify, withBrowserGate });

    if (run.failedGates.length > 0) {
      const fingerprint = buildFailureFingerprint(run.gateRuns);
      writeLastFailure({ cycle: cycles, reason: 'GATE_FAILED', gateRuns: run.gateRuns, fingerprint });

      if (fingerprint && fingerprint === lastFingerprint) sameFingerprintCount += 1;
      else sameFingerprintCount = 1;

      lastFingerprint = fingerprint;

      if (sameFingerprintCount >= maxSameFingerprint) {
        state.status = 'FAILED';
        terminationReason = 'LOOP_LIMIT_REACHED:sameFingerprint';
      }
    }

    if (state.status === 'DONE') {
      terminationReason = 'DONE';
    } else if (state.status === 'FAILED' && terminationReason === 'UNKNOWN') {
      terminationReason = 'FAILED';
    }

    writeJson(statePath, state);
    writeCheckpoint(state);

    if (state.status === 'DONE' || state.status === 'FAILED') break;

    if (sleepMs > 0) await sleep(sleepMs);
  }

  state.loopProgress = { active: false };
  state.loopSummary = {
    cycles,
    startedAt: loopStartedAt,
    endedAt: new Date().toISOString(),
    terminationReason,
  };

  writeJson(statePath, state);
  writeCheckpoint(state);
  console.log('[runner] loop finished');
}

main();
