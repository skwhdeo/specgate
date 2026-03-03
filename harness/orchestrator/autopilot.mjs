#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createAgentSession, SessionManager } from '@mariozechner/pi-coding-agent';
import {
  addWorktree,
  buildWorktreeBranchName,
  createJobId,
  removeWorktree,
  resolveBranchPrefix,
  resolveWorktreeRoot,
} from './worktree-utils.mjs';
import { computeAttemptScore } from './attempt-score.mjs';
import { classifyFailure } from './failure-class.mjs';
import { selectStrategyProfile } from './strategy-profiles.mjs';
import { packContext } from './context-pack.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');
const configCandidates = [
  path.join(ROOT, '.pi', 'specgate', 'config.json'),
  path.join(ROOT, 'harness', 'config.json'),
];
const configPath = configCandidates.find((p) => fs.existsSync(p)) || configCandidates[0];

const defaultConfig = {
  paths: {
    stateFile: '.pi/specgate/state/state.json',
    lastFailureFile: '.pi/specgate/state/last-failure.json',
    artifactsDir: '.pi/specgate/artifacts',
  },
  orchestrator: {
    goal: 'Implement tasks in order while keeping all gates green',
  },
  autopilot: {
    enabled: false,
    taskFile: null,
    maxWorkTimeMs: 2 * 60 * 60 * 1000,
    maxAttemptsPerTask: 4,
    blockedFingerprintThreshold: 3,
    progressScoreThreshold: 0.1,
    sleepMs: 1000,
    subagentDebateOnBlocked: true,
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

function readText(filePath, fallback = '') {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

function getRepoStatus(cwd) {
  const result = spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' });
  if (result.error) {
    return { ok: false, error: result.error };
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    return { ok: false, error: new Error(result.stderr || 'git status failed') };
  }
  const entries = (result.stdout || '').split(/\r?\n/).filter(Boolean);
  return { ok: true, entries };
}

function extractChangedFiles(statusEntries) {
  if (!Array.isArray(statusEntries)) return [];
  const files = [];
  statusEntries.forEach((entry) => {
    const trimmed = entry.trim();
    if (trimmed.length < 4) return;
    const raw = trimmed.slice(3);
    if (!raw) return;
    const parts = raw.split(' -> ');
    files.push(parts[parts.length - 1]);
  });
  return files.filter(Boolean);
}

function getChangedFiles(cwd) {
  const status = getRepoStatus(cwd);
  if (!status.ok) return [];
  return extractChangedFiles(status.entries);
}

function requireCleanBaseRepo({ cwd, lastFailurePath }) {
  const status = getRepoStatus(cwd);
  if (!status.ok) {
    const message = `[autopilot] failed to check git status: ${status.error?.message || 'unknown error'}`;
    console.error(message);
    if (lastFailurePath) {
      writeJson(lastFailurePath, {
        cycle: 0,
        reason: 'GIT_STATUS_FAILED',
        failedGates: [],
        fingerprint: null,
        topErrors: [message],
        timestamp: new Date().toISOString(),
      });
    }
    process.exit(1);
  }

  if (status.entries.length > 0) {
    const details = status.entries.slice(0, 12).map((entry) => `dirty: ${entry}`);
    const message = '[autopilot] base repo is dirty. commit or stash changes before running autopilot.';
    console.error(message);
    if (lastFailurePath) {
      writeJson(lastFailurePath, {
        cycle: 0,
        reason: 'BASE_REPO_DIRTY',
        failedGates: [],
        fingerprint: null,
        topErrors: [message, ...details],
        timestamp: new Date().toISOString(),
      });
    }
    process.exit(1);
  }
}

function ensureBaseRepoUnchanged({ cwd, lastFailurePath }) {
  const status = getRepoStatus(cwd);
  if (!status.ok) {
    const message = `[autopilot] failed to re-check git status: ${status.error?.message || 'unknown error'}`;
    console.error(message);
    if (lastFailurePath) {
      writeJson(lastFailurePath, {
        cycle: 0,
        reason: 'GIT_STATUS_FAILED',
        failedGates: [],
        fingerprint: null,
        topErrors: [message],
        timestamp: new Date().toISOString(),
      });
    }
    process.exit(1);
  }

  if (status.entries.length > 0) {
    const details = status.entries.slice(0, 12).map((entry) => `dirty: ${entry}`);
    const message = '[autopilot] base repo changed during worktree run. aborting to protect base repo.';
    console.error(message);
    if (lastFailurePath) {
      writeJson(lastFailurePath, {
        cycle: 0,
        reason: 'BASE_REPO_DIRTY_AFTER_RUN',
        failedGates: [],
        fingerprint: null,
        topErrors: [message, ...details],
        timestamp: new Date().toISOString(),
      });
    }
    process.exit(1);
  }
}

function getArg(name) {
  const i = process.argv.indexOf(name);
  if (i === -1 || i === process.argv.length - 1) return undefined;
  const v = process.argv[i + 1];
  if (!v || v.startsWith('--')) return undefined;
  return v;
}

function getNumberArg(name) {
  const v = getArg(name);
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseTasks(taskFilePath) {
  const raw = readText(taskFilePath, '');
  const lines = raw.split(/\r?\n/);
  let currentSection = '';
  const tasks = [];

  lines.forEach((line, idx) => {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      currentSection = heading[1].trim();
      return;
    }

    const unchecked = line.match(/^\s*-\s*\[ \]\s+(.+)$/);
    if (unchecked) {
      tasks.push({
        checked: false,
        text: unchecked[1].trim(),
        lineNumber: idx + 1,
        section: currentSection,
      });
      return;
    }

    const checked = line.match(/^\s*-\s*\[x\]\s+(.+)$/i);
    if (checked) {
      tasks.push({
        checked: true,
        text: checked[1].trim(),
        lineNumber: idx + 1,
        section: currentSection,
      });
    }
  });

  return { raw, lines, tasks };
}

function markTaskChecked(taskFilePath, lineNumber) {
  const raw = readText(taskFilePath, '');
  if (!raw) return false;
  const lines = raw.split(/\r?\n/);
  const idx = lineNumber - 1;
  if (!lines[idx]) return false;

  const updated = lines[idx].replace(/^(\s*-\s*\[) (\]\s+)/, '$1x$2');
  if (updated === lines[idx]) return false;

  lines[idx] = updated;
  fs.writeFileSync(taskFilePath, `${lines.join('\n')}\n`, 'utf8');
  return true;
}

function runHarnessReverify(withBrowser, cwd) {
  const args = ['harness/runner/run.js', '--reverify'];
  if (withBrowser) args.push('--with-browser');
  const run = spawnSync('node', args, { cwd, encoding: 'utf8' });
  return {
    code: typeof run.status === 'number' ? run.status : 1,
    stdout: run.stdout || '',
    stderr: run.stderr || '',
  };
}

function runDelegate(reviewType, focus, outputFile) {
  const args = [
    'harness/review/delegate-to-subagent.mjs',
    '--review-type',
    reviewType,
    '--focus',
    focus,
    '--output',
    outputFile,
  ];
  const run = spawnSync('node', args, { cwd: ROOT, encoding: 'utf8' });
  return {
    code: typeof run.status === 'number' ? run.status : 1,
    stdout: run.stdout || '',
    stderr: run.stderr || '',
    outputFile,
  };
}

function summarizeDebate(artifactPath) {
  const data = readJson(artifactPath, null);
  if (!data?.valid || !data?.result) return '';
  const r = data.result;
  const findings = Array.isArray(r.findings) ? r.findings.slice(0, 5).map((f) => `- [${f.severity}] ${f.title}: ${f.recommendation}`) : [];
  return [
    `reviewType=${r.reviewType}`,
    `decision=${r.decision}`,
    `severity=${r.severity}`,
    `summary=${r.summary}`,
    ...findings,
  ].join('\n');
}

function buildPrompt({
  goal,
  task,
  attempt,
  maxAttemptsPerTask,
  lastFailure,
  lastAttemptScore,
  debateNotes,
  taskFileDisplay,
  strategyProfile,
  packedContext,
}) {
  const failed = Array.isArray(lastFailure?.failedGates)
    ? lastFailure.failedGates.map((g) => `${g.gate}:${g.exitCode}`).join(', ')
    : 'n/a';
  const errors = Array.isArray(lastFailure?.topErrors) ? lastFailure.topErrors.slice(0, 6).map((e) => `- ${e}`) : [];
  const attemptScoreLine = lastAttemptScore
    ? `Last attempt score: ${Number(lastAttemptScore.score || 0).toFixed(2)}`
    : 'Last attempt score: n/a';
  const strategyLines = strategyProfile
    ? [
        `Strategy profile: ${strategyProfile.key}`,
        `Strategy focus: ${strategyProfile.focus}`,
        'Strategy tactics:',
        ...strategyProfile.tactics.map((tactic) => `- ${tactic}`),
      ]
    : ['Strategy profile: mixed-default'];
  const contextLines = packedContext
    ? [
        'Packed context:',
        ...packedContext.files.map((entry) =>
          [
            `File: ${entry.path} (${entry.bytes} bytes${entry.truncated ? ', truncated' : ''})`,
            entry.snippet ? entry.snippet : '[empty]',
          ].join('\n'),
        ),
      ]
    : ['Packed context: n/a'];

  return [
    'You are in autopilot mode. Work independently on one task at a time.',
    `Goal: ${goal}`,
    `Current task section: ${task.section || 'unknown'}`,
    `Current task: ${task.text}`,
    `Task attempt: ${attempt}/${maxAttemptsPerTask}`,
    attemptScoreLine,
    ...strategyLines,
    '',
    'Required behavior:',
    '- Make focused edits for this task only.',
    '- Reuse existing architecture and contracts.',
    `- If task is completed, update ${taskFileDisplay} line to [x].`,
    '- Stop after making edits.',
    '',
    'Latest harness failure:',
    `failedGates: ${failed}`,
    ...errors,
    '',
    ...contextLines,
    '',
    debateNotes ? `Blocked-debate hints:\n${debateNotes}` : 'Blocked-debate hints: n/a',
  ].join('\n');
}

function appendLog(artifactsDir, payload) {
  fs.mkdirSync(artifactsDir, { recursive: true });
  const file = path.join(artifactsDir, 'autopilot-log.jsonl');
  fs.appendFileSync(file, `${JSON.stringify(payload)}\n`, 'utf8');
}

function listSpecTaskFiles(baseRoot) {
  const specsRoot = path.join(baseRoot, 'specs');
  if (!fs.existsSync(specsRoot)) return [];

  const entries = fs.readdirSync(specsRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      featureDir: entry.name,
      taskFile: path.join('specs', entry.name, 'tasks.md'),
    }))
    .filter((entry) => fs.existsSync(path.join(baseRoot, entry.taskFile)));
}

function resolveFeatureTaskFile(feature, baseRoot) {
  if (!feature) return { taskFile: null, reason: 'no-feature' };

  const normalized = String(feature).trim().replace(/^specs\//, '').replace(/\/$/, '');
  if (!normalized) return { taskFile: null, reason: 'empty-feature' };

  const direct = path.join('specs', normalized, 'tasks.md');
  if (fs.existsSync(path.join(baseRoot, direct))) {
    return { taskFile: direct, reason: 'exact' };
  }

  const all = listSpecTaskFiles(baseRoot);
  const q = normalized.toLowerCase();
  const matched = all.filter((entry) => entry.featureDir.toLowerCase().includes(q));

  if (matched.length === 1) {
    return { taskFile: matched[0].taskFile, reason: 'partial' };
  }

  if (matched.length > 1) {
    return {
      taskFile: null,
      reason: 'ambiguous-feature',
      candidates: matched.map((entry) => entry.featureDir),
    };
  }

  return { taskFile: null, reason: 'feature-not-found' };
}

function resolveAutoTaskFile(baseRoot) {
  const all = listSpecTaskFiles(baseRoot);
  if (all.length === 1) {
    return { taskFile: all[0].taskFile, reason: 'single-spec' };
  }
  if (all.length > 1) {
    return {
      taskFile: null,
      reason: 'multiple-specs',
      candidates: all.map((entry) => entry.featureDir),
    };
  }
  return { taskFile: null, reason: 'no-spec-tasks' };
}

function resolveFromRoot(baseRoot, targetPath) {
  if (!targetPath) return targetPath;
  if (path.isAbsolute(targetPath)) return targetPath;
  return path.join(baseRoot, targetPath);
}

function displayPath(baseRoot, filePath) {
  if (!filePath) return 'n/a';
  const rel = path.relative(baseRoot, filePath).replaceAll('\\', '/');
  if (!rel.startsWith('..')) return rel;
  return filePath;
}

function writeJobManifest(artifactsDir, payload) {
  fs.mkdirSync(artifactsDir, { recursive: true });
  const file = path.join(artifactsDir, 'job-manifest.json');
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function updateJobManifest(artifactsDir, updates) {
  const file = path.join(artifactsDir, 'job-manifest.json');
  const current = readJson(file, {});
  writeJobManifest(artifactsDir, { ...current, ...updates });
}

function normalizeResultMode(mode) {
  const normalized = String(mode || '').trim().toLowerCase();
  if (['branch', 'merge', 'patch'].includes(normalized)) return normalized;
  return 'branch';
}

function writePatchResult({ executionRoot, patchArtifactsDir, jobId, lastFailurePath }) {
  const patchDir = patchArtifactsDir;
  const patchPath = path.join(patchDir, `autopilot-result-${jobId}.patch`);
  fs.mkdirSync(patchDir, { recursive: true });

  const result = spawnSync('git', ['diff', '--binary', 'HEAD'], { cwd: executionRoot, encoding: 'utf8' });
  const status = typeof result.status === 'number' ? result.status : 1;
  if (status !== 0 || result.error) {
    const message = `[autopilot] failed to create patch: ${result.error?.message || result.stderr || 'git diff failed'}`;
    console.error(message);
    if (lastFailurePath) {
      writeJson(lastFailurePath, {
        cycle: 0,
        reason: 'PATCH_EXPORT_FAILED',
        failedGates: [],
        fingerprint: null,
        topErrors: [message],
        timestamp: new Date().toISOString(),
      });
    }
    process.exit(1);
  }

  fs.writeFileSync(patchPath, result.stdout || '', 'utf8');
  return patchPath;
}

function getCurrentBranch(cwd) {
  const result = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, encoding: 'utf8' });
  if (typeof result.status !== 'number' || result.status !== 0 || result.error) return null;
  return String(result.stdout || '').trim();
}

function mergeWorktreeResult({ executionRoot, baseRoot, lastFailurePath }) {
  const branch = getCurrentBranch(executionRoot);
  if (!branch) {
    const message = '[autopilot] failed to resolve worktree branch name for merge.';
    console.error(message);
    if (lastFailurePath) {
      writeJson(lastFailurePath, {
        cycle: 0,
        reason: 'MERGE_FAILED',
        failedGates: [],
        fingerprint: null,
        topErrors: [message],
        timestamp: new Date().toISOString(),
      });
    }
    process.exit(1);
  }

  const mergeResult = spawnSync('git', ['merge', '--ff-only', branch], { cwd: baseRoot, encoding: 'utf8' });
  const status = typeof mergeResult.status === 'number' ? mergeResult.status : 1;
  if (status !== 0 || mergeResult.error) {
    const message = `[autopilot] failed to merge result branch ${branch}: ${mergeResult.error?.message || mergeResult.stderr || 'git merge failed'}`;
    console.error(message);
    if (lastFailurePath) {
      writeJson(lastFailurePath, {
        cycle: 0,
        reason: 'MERGE_FAILED',
        failedGates: [],
        fingerprint: null,
        topErrors: [message],
        timestamp: new Date().toISOString(),
      });
    }
    process.exit(1);
  }

  return { branch, stdout: mergeResult.stdout || '', stderr: mergeResult.stderr || '' };
}

async function main() {
  const userConfig = readJson(configPath, {});
  const config = {
    ...defaultConfig,
    ...userConfig,
    paths: { ...defaultConfig.paths, ...(userConfig.paths || {}) },
    orchestrator: { ...defaultConfig.orchestrator, ...(userConfig.orchestrator || {}) },
    autopilot: { ...defaultConfig.autopilot, ...(userConfig.autopilot || {}) },
  };

  const feature = getArg('--feature') || process.env.SPECIFY_FEATURE;
  const featureTaskResolution = resolveFeatureTaskFile(feature, ROOT);
  const cliTaskFile = getArg('--task-file');
  const configTaskFile = config.autopilot.taskFile || null;
  const autoTaskResolution = !cliTaskFile && !featureTaskResolution.taskFile && !configTaskFile
    ? resolveAutoTaskFile(ROOT)
    : { taskFile: null, reason: 'not-needed' };
  const taskFileInput = cliTaskFile || featureTaskResolution.taskFile || configTaskFile || autoTaskResolution.taskFile;
  const maxWorkTimeMs = getNumberArg('--max-work-time-ms') ?? config.autopilot.maxWorkTimeMs;
  const maxAttemptsPerTask = getNumberArg('--max-attempts-per-task') ?? config.autopilot.maxAttemptsPerTask;
  const blockedThreshold = getNumberArg('--blocked-fingerprint-threshold') ?? config.autopilot.blockedFingerprintThreshold;
  const progressScoreThreshold = getNumberArg('--progress-score-threshold') ?? config.autopilot.progressScoreThreshold;
  const sleepMs = getNumberArg('--sleep-ms') ?? config.autopilot.sleepMs;
  const withBrowser = hasArg('--with-browser');
  const dryRun = hasArg('--dry-run');
  const useDebate = config.autopilot.subagentDebateOnBlocked && !hasArg('--no-debate');
  const worktreeConfig = config.autopilot.worktree || {};
  const jobId = getArg('--job-id') || createJobId();
  const worktreeArg = getArg('--worktree');
  const worktreeEnabled = hasArg('--worktree') || Boolean(worktreeConfig.enabled);
  const worktreeRoot = resolveWorktreeRoot(worktreeConfig.rootDir);
  const executionRoot = path.resolve(
    ROOT,
    getArg('--worktree-cwd') || worktreeArg || (worktreeEnabled ? path.join(worktreeRoot, jobId) : ROOT),
  );
  const resultMode = normalizeResultMode(getArg('--result-mode') || worktreeConfig.resultMode || 'branch');
  const cleanupOnSuccess = hasArg('--cleanup-on-success') || Boolean(worktreeConfig.cleanupOnSuccess);
  const cleanupOnFail = hasArg('--cleanup-on-fail') || Boolean(worktreeConfig.cleanupOnFail);

  if (worktreeEnabled && executionRoot !== ROOT) {
    const gitDir = path.join(executionRoot, '.git');
    if (!fs.existsSync(gitDir)) {
      fs.mkdirSync(worktreeRoot, { recursive: true });
      const branchPrefix = resolveBranchPrefix(worktreeConfig.branchPrefix);
      const branch = buildWorktreeBranchName({ prefix: branchPrefix, jobId });
      const added = addWorktree({ cwd: ROOT, worktreePath: executionRoot, branch, baseRef: 'HEAD', dryRun });
      if (!added.ok) {
        const message = `[autopilot] failed to create worktree at ${executionRoot}: ${added.error?.message || added.stderr || 'git worktree add failed'}`;
        console.error(message);
        process.exit(1);
      }
    }
  }

  if (!taskFileInput) {
    const reasons = [];
    if (featureTaskResolution.reason === 'ambiguous-feature') {
      reasons.push(`feature "${feature}" is ambiguous: ${(featureTaskResolution.candidates || []).join(', ')}`);
    } else if (feature && featureTaskResolution.reason === 'feature-not-found') {
      reasons.push(`feature "${feature}" not found under specs/*/tasks.md`);
    }

    if (autoTaskResolution.reason === 'multiple-specs') {
      reasons.push(`multiple spec task files found: ${(autoTaskResolution.candidates || []).join(', ')}`);
    } else if (autoTaskResolution.reason === 'no-spec-tasks') {
      reasons.push('no specs/*/tasks.md found');
    }

    const details = reasons.length > 0 ? `\n${reasons.map((r) => `- ${r}`).join('\n')}` : '';
    console.error(`[autopilot] no task file resolved. use --feature <name> or --task-file <path>.${details}`);
    process.exit(1);
  }

  const taskFile = resolveFromRoot(executionRoot, taskFileInput);
  const taskFileDisplay = displayPath(executionRoot, taskFile);

  if (!fs.existsSync(taskFile)) {
    console.error(`[autopilot] task file not found: ${taskFileDisplay}`);
    process.exit(1);
  }

  const statePath = path.join(executionRoot, config.paths.stateFile);
  const lastFailurePath = path.join(executionRoot, config.paths.lastFailureFile);
  const artifactsDir = path.join(executionRoot, config.paths.artifactsDir);
  const baseLastFailurePath = path.join(ROOT, config.paths.lastFailureFile);

  const requireCleanBaseRepoFlag = worktreeConfig.requireCleanBaseRepo !== false;
  if (requireCleanBaseRepoFlag) {
    requireCleanBaseRepo({ cwd: ROOT, lastFailurePath: baseLastFailurePath });
  }

  const startedAt = Date.now();

  writeJobManifest(artifactsDir, {
    jobId,
    createdAt: new Date(startedAt).toISOString(),
    executionRoot,
    baseRoot: ROOT,
    taskFile,
    taskFileDisplay,
    feature: feature || null,
    maxWorkTimeMs,
    maxAttemptsPerTask,
    blockedThreshold,
    progressScoreThreshold,
    withBrowser,
    dryRun,
    resultMode,
    cleanupOnSuccess,
    cleanupOnFail,
    worktreeEnabled,
    worktreeRoot,
  });

  let session;
  if (!dryRun) {
    const created = await createAgentSession({ cwd: executionRoot, sessionManager: SessionManager.inMemory() });
    session = created.session;
    session.subscribe((event) => {
      if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
        process.stdout.write(event.assistantMessageEvent.delta);
      }
    });
  } else {
    console.log('[autopilot] dry-run enabled: prompts only, no agent edits.');
  }

  while (Date.now() - startedAt < maxWorkTimeMs) {
    const parsed = parseTasks(taskFile);
    const pending = parsed.tasks.filter((t) => !t.checked);

    if (pending.length === 0) {
      console.log('[autopilot] all tasks already checked. exiting.');
      let patchPath;
      let mergeInfo;
      let cleanupResult;
      if (resultMode === 'patch') {
        patchPath = writePatchResult({
          executionRoot,
          patchArtifactsDir: artifactsDir,
          jobId,
          lastFailurePath,
        });
      }
      if (resultMode === 'merge') {
        mergeInfo = mergeWorktreeResult({
          executionRoot,
          baseRoot: ROOT,
          lastFailurePath,
        });
      }
      if (cleanupOnSuccess && executionRoot !== ROOT) {
        cleanupResult = removeWorktree({ cwd: ROOT, worktreePath: executionRoot, force: true });
      }

      updateJobManifest(artifactsDir, {
        completedAt: new Date().toISOString(),
        status: 'DONE',
        resultMode,
        patchPath: patchPath || null,
        mergedBranch: mergeInfo?.branch || null,
        cleanupOnSuccess,
        cleanupResult: cleanupResult || null,
      });
      if (resultMode === 'branch') {
        console.log('[autopilot] resultMode=branch: keeping worktree branch for manual review.');
      }
      if (resultMode === 'patch') {
        console.log(`[autopilot] resultMode=patch: wrote patch to ${patchPath}`);
      }
      if (resultMode === 'merge') {
        console.log(`[autopilot] resultMode=merge: merged ${mergeInfo?.branch || 'unknown'} into base repo.`);
      }
      if (cleanupOnSuccess && executionRoot !== ROOT) {
        console.log(`[autopilot] cleanupOnSuccess: removed worktree at ${executionRoot}`);
      }
      if (session) session.dispose();
      process.exit(0);
    }

    const task = pending[0];
    console.log(`\n[autopilot] task: ${task.text} (${task.section})`);

    let lastFp = null;
    let repeatCount = 0;
    let debateNotes = '';
    let lastAttemptScore = null;
    let blockedReason = null;

    for (let attempt = 1; attempt <= maxAttemptsPerTask; attempt += 1) {
      if (Date.now() - startedAt >= maxWorkTimeMs) break;

      const lastFailure = readJson(lastFailurePath, null);
      const failureClass = classifyFailure(lastFailure);
      const strategyProfile = selectStrategyProfile(failureClass.primary);
      const contextFileCandidates = lastFailure?.fileCandidates || [];
      const packedContext = packContext({
        repoRoot: executionRoot,
        fileCandidates: contextFileCandidates,
        maxFiles: 5,
        maxBytesPerFile: 2000,
        maxTotalBytes: 8000,
      });
      const prompt = buildPrompt({
        goal: config.orchestrator.goal,
        task,
        attempt,
        maxAttemptsPerTask,
        lastFailure,
        lastAttemptScore,
        debateNotes,
        taskFileDisplay,
        strategyProfile,
        packedContext,
      });

      console.log(`[autopilot] attempt ${attempt}/${maxAttemptsPerTask}`);
      if (!dryRun) await session.prompt(prompt);
      else console.log(`\n[prompt-preview]\n${prompt}\n`);

      const verify = runHarnessReverify(withBrowser, executionRoot);
      if (worktreeEnabled && executionRoot !== ROOT) {
        ensureBaseRepoUnchanged({ cwd: ROOT, lastFailurePath: baseLastFailurePath });
      }
      const state = readJson(statePath, {});
      const nowFailure = readJson(lastFailurePath, null);
      const changedFiles = getChangedFiles(executionRoot);
      const fileCandidates = nowFailure?.fileCandidates || lastFailure?.fileCandidates || [];
      const attemptScore = computeAttemptScore({
        previousFailure: lastFailure,
        currentFailure: nowFailure,
        changedFiles,
        fileCandidates,
      });
      lastAttemptScore = attemptScore;

      appendLog(artifactsDir, {
        at: new Date().toISOString(),
        task: task.text,
        section: task.section,
        attempt,
        dryRun,
        harnessExitCode: verify.code,
        status: state.status,
        fingerprint: nowFailure?.fingerprint || null,
        attemptScore,
      });

      const reparsed = parseTasks(taskFile);
      const sameTaskNow = reparsed.tasks.find((t) => t.lineNumber === task.lineNumber);
      if (sameTaskNow?.checked) {
        console.log('[autopilot] task checked by agent. move next.');
        debateNotes = '';
        break;
      }

      if (state.status === 'DONE') {
        const marked = markTaskChecked(taskFile, task.lineNumber);
        console.log(marked ? '[autopilot] task auto-checked on green verify.' : '[autopilot] verify green but failed to mark task line.');
        debateNotes = '';
        break;
      }

      const fp = nowFailure?.fingerprint || null;
      if (fp && fp === lastFp) repeatCount += 1;
      else repeatCount = 1;
      lastFp = fp;

      const progressScore = Number.isFinite(attemptScore?.score) ? attemptScore.score : null;
      const lowProgress = progressScore !== null && progressScore <= progressScoreThreshold;

      if (repeatCount >= blockedThreshold && lowProgress && useDebate) {
        blockedReason = `repeatFingerprint:${repeatCount};lowProgress:${progressScore?.toFixed(2) ?? 'n/a'}`;
        console.log('[autopilot] blocked detected. running subagent debate...');
        const aOut = path.join(artifactsDir, 'review-blocked-a.json');
        const bOut = path.join(artifactsDir, 'review-blocked-b.json');

        runDelegate('code-quality', `Propose pragmatic unblock for task: ${task.text}`, aOut);
        runDelegate('architecture', `Propose boundary-safe unblock for task: ${task.text}`, bOut);

        debateNotes = [
          'AgentA:',
          summarizeDebate(aOut) || 'n/a',
          '',
          'AgentB:',
          summarizeDebate(bOut) || 'n/a',
        ].join('\n');
      }

      if (attempt < maxAttemptsPerTask) await sleep(sleepMs);
    }

    const afterTask = parseTasks(taskFile).tasks.find((t) => t.lineNumber === task.lineNumber);
    if (!afterTask?.checked) {
      writeJson(lastFailurePath, {
        cycle: maxAttemptsPerTask,
        reason: 'LOOP_LIMIT_REACHED',
        failedGates: [],
        fingerprint: null,
        blockedReason,
        topErrors: [`autopilot maxAttemptsPerTask reached for task: ${task.text}`],
        timestamp: new Date().toISOString(),
      });
      console.error('[autopilot] failed: max attempts for task reached.');
      if (cleanupOnFail && executionRoot !== ROOT) {
        const cleanupResult = removeWorktree({ cwd: ROOT, worktreePath: executionRoot, force: true });
        updateJobManifest(artifactsDir, {
          completedAt: new Date().toISOString(),
          status: 'FAILED',
          cleanupOnFail,
          cleanupResult,
        });
        console.log(`[autopilot] cleanupOnFail: removed worktree at ${executionRoot}`);
      } else if (executionRoot !== ROOT) {
        console.log(`[autopilot] worktree preserved for inspection: ${executionRoot}`);
      }
      if (session) session.dispose();
      process.exit(1);
    }
  }

  writeJson(path.join(ROOT, config.paths.lastFailureFile), {
    cycle: 0,
    reason: 'LOOP_LIMIT_REACHED',
    failedGates: [],
    fingerprint: null,
    blockedReason: null,
    topErrors: [`autopilot maxWorkTimeMs reached (${maxWorkTimeMs})`],
    timestamp: new Date().toISOString(),
  });

  console.error('[autopilot] stopped by timebox.');
  if (cleanupOnFail && executionRoot !== ROOT) {
    const cleanupResult = removeWorktree({ cwd: ROOT, worktreePath: executionRoot, force: true });
    updateJobManifest(artifactsDir, {
      completedAt: new Date().toISOString(),
      status: 'FAILED',
      cleanupOnFail,
      cleanupResult,
    });
    console.log(`[autopilot] cleanupOnFail: removed worktree at ${executionRoot}`);
  } else if (executionRoot !== ROOT) {
    console.log(`[autopilot] worktree preserved for inspection: ${executionRoot}`);
  }
  if (session) session.dispose();
  process.exit(1);
}

main().catch((error) => {
  console.error('[autopilot] fatal:', error?.stack || String(error));
  process.exit(1);
});
