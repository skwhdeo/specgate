import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

type ExecResult = {
  stdout: string;
  stderr: string;
  code: number;
  killed: boolean;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOOL_ROOT = path.resolve(__dirname, '..', '..', '..');

function toolScript(...parts: string[]) {
  return path.join(TOOL_ROOT, ...parts);
}

function truncate(text: string, max = 6000) {
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n[truncated ${text.length - max} chars]`;
}

function safeReadJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function resolveHarnessPaths(cwd: string) {
  const specgatePaths = {
    stateFile: path.join(cwd, '.pi', 'specgate', 'state', 'state.json'),
    lastFailureFile: path.join(cwd, '.pi', 'specgate', 'state', 'last-failure.json'),
  };

  if (fs.existsSync(specgatePaths.stateFile) || fs.existsSync(specgatePaths.lastFailureFile)) {
    return specgatePaths;
  }

  return {
    stateFile: path.join(cwd, 'harness', 'state', 'state.json'),
    lastFailureFile: path.join(cwd, 'harness', 'state', 'last-failure.json'),
  };
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function buildStatusText(cwd: string) {
  const paths = resolveHarnessPaths(cwd);
  const state = safeReadJson<Record<string, any>>(paths.stateFile, {});
  const failure = safeReadJson<Record<string, any> | null>(paths.lastFailureFile, null);

  const gates = Array.isArray(state.lastGateBatch)
    ? state.lastGateBatch.map((g: any) => `${g.gate}:${g.passed ? 'PASS' : `FAIL(${g.exitCode})`}`).join(', ')
    : 'n/a';

  let text = '';
  text += `status=${state.status || 'unknown'}\n`;
  text += `currentTask=${state.currentTask || 'unknown'}\n`;
  text += `runCount=${state.runCount || 0}\n`;
  text += `lastRunAt=${state.lastRunAt || 'n/a'}\n`;
  text += `gates=${gates}\n`;

  if (state.loopSummary) {
    text += `loop.cycles=${state.loopSummary.cycles}\n`;
    text += `loop.terminationReason=${state.loopSummary.terminationReason}\n`;
  }

  if (failure) {
    text += `lastFailure.reason=${failure.reason || 'n/a'}\n`;
    text += `lastFailure.cycle=${failure.cycle ?? 'n/a'}\n`;
    text += `lastFailure.fingerprint=${failure.fingerprint || 'n/a'}\n`;
  }

  return text.trim();
}

export default function (pi: ExtensionAPI) {
  function emitResult(title: string, result: ExecResult, details: Record<string, unknown>) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    pi.sendMessage({
      customType: 'harness',
      content: `${title}: ${result.code === 0 ? 'PASS' : `FAIL(${result.code})`}\n\n${truncate(output || '(no output)')}`,
      display: true,
      details: { ...details, code: result.code, killed: result.killed },
    });
  }

  async function runNodeTool(scriptPath: string, args: string[], timeout = 60 * 60 * 1000) {
    return (await pi.exec('node', [scriptPath, ...args], { timeout })) as ExecResult;
  }

  pi.registerCommand('harness-run', {
    description: 'Run harness once. Use /harness-run --browser or --reverify.',
    handler: async (args = '', ctx) => {
      const browser = args.includes('--browser');
      const reverify = args.includes('--reverify');
      const cliArgs: string[] = [];
      if (reverify) cliArgs.push('--reverify');
      if (browser) cliArgs.push('--with-browser');

      if (ctx.hasUI) ctx.ui.notify('Running harness runner...', 'info');
      const result = await runNodeTool(toolScript('harness', 'runner', 'run.js'), cliArgs);
      emitResult('harness-run', result, { args: cliArgs });
      if (ctx.hasUI) {
        ctx.ui.notify(result.code === 0 ? 'Harness run completed' : `Harness run failed (${result.code})`, result.code === 0 ? 'info' : 'error');
      }
    },
  });

  pi.registerCommand('harness-loop', {
    description: 'Run harness loop to terminal state. Use /harness-loop --browser.',
    handler: async (args = '', ctx) => {
      const browser = args.includes('--browser');
      const cliArgs: string[] = ['--loop'];
      if (browser) cliArgs.push('--with-browser');

      if (ctx.hasUI) ctx.ui.notify('Running harness loop...', 'info');
      const result = await runNodeTool(toolScript('harness', 'runner', 'run.js'), cliArgs, 2 * 60 * 60 * 1000);
      emitResult('harness-loop', result, { args: cliArgs });
      if (ctx.hasUI) {
        ctx.ui.notify(result.code === 0 ? 'Harness loop completed' : `Harness loop failed (${result.code})`, result.code === 0 ? 'info' : 'error');
      }
    },
  });

  pi.registerCommand('harness-status', {
    description: 'Show harness state summary from harness/state files.',
    handler: async (_args, ctx) => {
      const statusText = buildStatusText(ctx.cwd);
      pi.sendMessage({
        customType: 'harness',
        content: statusText,
        display: true,
      });
      if (ctx.hasUI) ctx.ui.notify('Harness status loaded', 'info');
    },
  });

  pi.registerCommand('harness-orchestrate', {
    description: 'Run SDK orchestrator. Use --browser, --dry-run, --max-attempts N.',
    handler: async (args = '', ctx) => {
      const browser = args.includes('--browser');
      const dryRun = args.includes('--dry-run');

      const maxAttemptsMatch = args.match(/--max-attempts\s+(\d+)/);
      const sleepMsMatch = args.match(/--sleep-ms\s+(\d+)/);

      const scriptArgs: string[] = [toolScript('harness', 'orchestrator', 'sdk-loop.mjs')];
      if (browser) scriptArgs.push('--with-browser');
      if (dryRun) scriptArgs.push('--dry-run');
      if (maxAttemptsMatch) {
        scriptArgs.push('--max-attempts', maxAttemptsMatch[1]);
      }
      if (sleepMsMatch) {
        scriptArgs.push('--sleep-ms', sleepMsMatch[1]);
      }

      if (ctx.hasUI) ctx.ui.notify(`Running orchestrator ${browser ? '(browser)' : ''}${dryRun ? ' (dry-run)' : ''}...`, 'info');

      const result = (await pi.exec('node', scriptArgs, { timeout: 2 * 60 * 60 * 1000 })) as ExecResult;
      const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();

      pi.sendMessage({
        customType: 'harness',
        content: `harness-orchestrate: ${result.code === 0 ? 'PASS' : `FAIL(${result.code})`}\n\n${truncate(output || '(no output)')}`,
        display: true,
        details: { code: result.code, killed: result.killed, args: scriptArgs.slice(1) },
      });

      if (ctx.hasUI) {
        ctx.ui.notify(result.code === 0 ? 'Harness orchestrator completed' : `Harness orchestrator failed (${result.code})`, result.code === 0 ? 'info' : 'error');
      }
    },
  });

  pi.registerCommand('harness-review', {
    description: 'Run delegate_to_subagent review. Example: /harness-review --review-type test-quality --files apps/fare-api/test/fare.test.ts',
    handler: async (args = '', ctx) => {
      const scriptArgs: string[] = [toolScript('harness', 'review', 'delegate-to-subagent.mjs')];
      const tokens = args.trim().length > 0 ? args.trim().split(/\s+/) : [];
      scriptArgs.push(...tokens);

      if (ctx.hasUI) ctx.ui.notify('Running harness review...', 'info');

      const result = (await pi.exec('node', scriptArgs, { timeout: 60 * 60 * 1000 })) as ExecResult;
      const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();

      pi.sendMessage({
        customType: 'harness',
        content: `harness-review: ${result.code === 0 ? 'PASS' : `FAIL(${result.code})`}\n\n${truncate(output || '(no output)')}`,
        display: true,
        details: { code: result.code, killed: result.killed, args: scriptArgs.slice(1) },
      });

      if (ctx.hasUI) {
        ctx.ui.notify(result.code === 0 ? 'Harness review completed' : `Harness review failed (${result.code})`, result.code === 0 ? 'info' : 'error');
      }
    },
  });

  pi.registerCommand('harness-autopilot', {
    description: 'Run task-driven autopilot. Example: /harness-autopilot --feature 003-my-feature --worktree --result-mode patch',
    handler: async (args = '', ctx) => {
      const scriptArgs: string[] = [toolScript('harness', 'orchestrator', 'autopilot.mjs')];
      const tokens = args.trim().length > 0 ? args.trim().split(/\s+/) : [];
      scriptArgs.push(...tokens);

      if (ctx.hasUI) ctx.ui.notify('Running harness autopilot...', 'info');

      const result = (await pi.exec('node', scriptArgs, { timeout: 4 * 60 * 60 * 1000 })) as ExecResult;
      const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
      const manifestPath = fs.existsSync(path.join(ctx.cwd, '.pi', 'specgate', 'artifacts', 'job-manifest.json'))
        ? path.join(ctx.cwd, '.pi', 'specgate', 'artifacts', 'job-manifest.json')
        : path.join(ctx.cwd, 'harness', 'artifacts', 'job-manifest.json');
      const manifest = safeReadJson<Record<string, any> | null>(manifestPath, null);
      const summary = manifest
        ? [
            `jobId=${manifest.jobId || 'n/a'}`,
            `worktree=${manifest.executionRoot || 'n/a'}`,
            `resultMode=${manifest.resultMode || 'n/a'}`,
          ].join('\n')
        : '';

      pi.sendMessage({
        customType: 'harness',
        content: [
          `harness-autopilot: ${result.code === 0 ? 'PASS' : `FAIL(${result.code})`}`,
          summary,
          truncate(output || '(no output)'),
        ]
          .filter(Boolean)
          .join('\n\n'),
        display: true,
        details: { code: result.code, killed: result.killed, args: scriptArgs.slice(1) },
      });

      if (ctx.hasUI) {
        ctx.ui.notify(result.code === 0 ? 'Harness autopilot completed' : `Harness autopilot stopped (${result.code})`, result.code === 0 ? 'info' : 'warning');
      }
    },
  });

  pi.registerCommand('speckit-init-generic', {
    description: 'Initialize/refresh spec-kit generic commands. Example: /speckit-init-generic --ai-commands-dir .pi/prompts/speckit',
    handler: async (args = '', ctx) => {
      const dirMatch = args.match(/--ai-commands-dir\s+(\S+)/);
      const aiCommandsDir = dirMatch ? dirMatch[1] : '.pi/prompts/speckit';

      const cmdArgs = [
        '--from',
        'git+https://github.com/github/spec-kit.git',
        'specify',
        'init',
        '--here',
        '--ai',
        'generic',
        '--ai-commands-dir',
        aiCommandsDir,
        '--force',
        '--ignore-agent-tools',
      ];

      if (ctx.hasUI) ctx.ui.notify(`Initializing spec-kit generic commands at ${aiCommandsDir}...`, 'info');
      const result = (await pi.exec('uvx', cmdArgs, { timeout: 10 * 60 * 1000 })) as ExecResult;
      const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();

      pi.sendMessage({
        customType: 'harness',
        content: `speckit-init-generic: ${result.code === 0 ? 'PASS' : `FAIL(${result.code})`}\n\n${truncate(output || '(no output)')}`,
        display: true,
      });

      if (ctx.hasUI) {
        ctx.ui.notify(result.code === 0 ? 'spec-kit generic init completed' : `spec-kit init failed (${result.code})`, result.code === 0 ? 'info' : 'error');
      }
    },
  });

  pi.registerCommand('speckit-check', {
    description: 'Run spec-kit tool check via uvx.',
    handler: async (_args = '', ctx) => {
      const result = (await pi.exec('uvx', ['--from', 'git+https://github.com/github/spec-kit.git', 'specify', 'check'], { timeout: 5 * 60 * 1000 })) as ExecResult;
      const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
      pi.sendMessage({
        customType: 'harness',
        content: `speckit-check: ${result.code === 0 ? 'PASS' : `FAIL(${result.code})`}\n\n${truncate(output || '(no output)')}`,
        display: true,
      });
      if (ctx.hasUI) {
        ctx.ui.notify(result.code === 0 ? 'spec-kit check completed' : `spec-kit check failed (${result.code})`, result.code === 0 ? 'info' : 'error');
      }
    },
  });

  pi.registerCommand('speckit-autopilot', {
    description: 'Run harness autopilot from a spec-kit feature. Example: /speckit-autopilot --feature 003-my-feature --worktree --result-mode patch',
    handler: async (args = '', ctx) => {
      const scriptArgs: string[] = [toolScript('harness', 'orchestrator', 'autopilot.mjs')];
      const tokens = args.trim().length > 0 ? args.trim().split(/\s+/) : [];
      scriptArgs.push(...tokens);

      const hasFeature = tokens.includes('--feature');
      if (!hasFeature) {
        pi.sendMessage({
          customType: 'harness',
          content: 'speckit-autopilot: FAIL\n\nMissing --feature <spec-folder>.',
          display: true,
        });
        return;
      }

      if (ctx.hasUI) ctx.ui.notify('Running spec-kit feature autopilot...', 'info');
      const result = (await pi.exec('node', scriptArgs, { timeout: 4 * 60 * 60 * 1000 })) as ExecResult;
      const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
      pi.sendMessage({
        customType: 'harness',
        content: `speckit-autopilot: ${result.code === 0 ? 'PASS' : `FAIL(${result.code})`}\n\n${truncate(output || '(no output)')}`,
        display: true,
      });
      if (ctx.hasUI) {
        ctx.ui.notify(result.code === 0 ? 'spec-kit autopilot completed' : `spec-kit autopilot stopped (${result.code})`, result.code === 0 ? 'info' : 'warning');
      }
    },
  });

  pi.registerCommand('specgate-init', {
    description: 'Initialize project-local specgate config under .pi/specgate.',
    handler: async (_args = '', ctx) => {
      const configPath = path.join(ctx.cwd, '.pi', 'specgate', 'config.json');
      const config = {
        version: 'specgate-config-v1',
        projectRoot: '.',
        paths: {
          stateFile: '.pi/specgate/state/state.json',
          checkpointFile: '.pi/specgate/state/checkpoint.md',
          lastFailureFile: '.pi/specgate/state/last-failure.json',
          beforeLoopStateFile: '.pi/specgate/state/state.before-loop.json',
          artifactsDir: '.pi/specgate/artifacts',
          scanDirs: ['src', 'apps', 'packages'],
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
        orchestrator: {
          enabled: false,
          mode: 'sdk',
          maxAttempts: 8,
          maxWallTimeMs: 3600000,
          sleepMs: 1000,
          goal: 'Fix project until gates pass',
        },
        autopilot: {
          enabled: false,
          taskFile: null,
          maxWorkTimeMs: 7200000,
          maxAttemptsPerTask: 4,
          blockedFingerprintThreshold: 3,
          sleepMs: 1000,
          subagentDebateOnBlocked: true,
          worktree: {
            enabled: false,
            rootDir: '.worktrees',
            branchPrefix: 'autopilot',
            resultMode: 'branch',
            cleanupOnSuccess: false,
            cleanupOnFail: false,
            requireCleanBaseRepo: true,
          },
        },
      };

      writeJson(configPath, config);
      fs.mkdirSync(path.join(ctx.cwd, '.pi', 'specgate', 'state'), { recursive: true });
      fs.mkdirSync(path.join(ctx.cwd, '.pi', 'specgate', 'artifacts'), { recursive: true });

      pi.sendMessage({
        customType: 'harness',
        content: `specgate-init: PASS\n\nCreated ${path.relative(ctx.cwd, configPath)}\nProject is ready for project-local runtime artifacts under .pi/specgate/.`,
        display: true,
      });
      if (ctx.hasUI) ctx.ui.notify('specgate project config initialized', 'info');
    },
  });

  const aliasToHarness: Array<[string, string]> = [
    ['specgate-run', '/harness-run'],
    ['specgate-loop', '/harness-loop'],
    ['specgate-status', '/harness-status'],
    ['specgate-orchestrate', '/harness-orchestrate'],
    ['specgate-autopilot', '/harness-autopilot'],
    ['specgate-review', '/harness-review'],
  ];

  aliasToHarness.forEach(([alias, target]) => {
    pi.registerCommand(alias, {
      description: `Alias for ${target}`,
      handler: async (args = '') => {
        const text = `${target}${args ? ` ${args}` : ''}`;
        pi.sendUserMessage(text, { deliverAs: 'followUp' });
      },
    });
  });
}
