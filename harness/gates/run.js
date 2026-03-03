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
    artifactsDir: '.pi/specgate/artifacts',
    scanDirs: ['src', 'apps', 'packages'],
  },
  gates: {
    lint: { command: 'npm run lint', timeoutMs: 180000 },
    typecheck: { command: 'npm run typecheck', timeoutMs: 180000 },
    test: { command: 'npm test', timeoutMs: 180000 },
    browser: {
      command: 'npm run test:browser',
      timeoutMs: 300000,
      requires: {
        apiHealthUrl: 'http://127.0.0.1:3000/health',
        uiBaseUrl: 'http://127.0.0.1:5173',
      },
    },
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
  gates: { ...defaultConfig.gates, ...(userConfig.gates || {}) },
};

const statePath = path.join(ROOT, config.paths.stateFile);
const artifactsDir = path.join(ROOT, config.paths.artifactsDir);
const gate = process.argv[2];

function ensureArtifactsDir() {
  fs.mkdirSync(artifactsDir, { recursive: true });
}

function updateState(result) {
  const state = readJson(statePath, {
    status: 'PENDING',
    currentTask: 'H1',
    attempt: 0,
    maxAttempts: 5,
    lastError: null,
  });

  const nextState = {
    ...state,
    gateResults: {
      ...(state.gateResults || {}),
      [result.gate]: result,
    },
    lastGateResult: result,
    lastGateAt: result.timestamp,
  };

  writeJson(statePath, nextState);
}

function runCommandGate(targetGate) {
  const gateConfig = config.gates[targetGate];
  const run = spawnSync(gateConfig.command, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: true,
    timeout: gateConfig.timeoutMs || 180000,
  });

  const exitCode = typeof run.status === 'number' ? run.status : 1;

  return {
    gate: targetGate,
    passed: exitCode === 0,
    exitCode,
    summary: exitCode === 0 ? `${targetGate} passed` : `${targetGate} failed`,
    stdout: run.stdout || '',
    stderr: run.stderr || '',
    timestamp: new Date().toISOString(),
  };
}

async function isHttpOk(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function runBrowserGate() {
  const requires = config.gates.browser?.requires || {};
  const apiHealthUrl = process.env.API_HEALTH_URL || requires.apiHealthUrl || 'http://127.0.0.1:3000/health';
  const uiBaseUrl = process.env.UI_BASE_URL || requires.uiBaseUrl || 'http://127.0.0.1:5173';

  const apiUp = await isHttpOk(apiHealthUrl);
  const uiUp = await isHttpOk(uiBaseUrl);

  if (!apiUp || !uiUp) {
    return {
      gate: 'browser',
      passed: false,
      exitCode: 3,
      summary: 'browser gate precondition failed (run dev:api/dev:ui first)',
      stdout: '',
      stderr: `apiUp=${apiUp}, uiUp=${uiUp}, API_HEALTH_URL=${apiHealthUrl}, UI_BASE_URL=${uiBaseUrl}`,
      timestamp: new Date().toISOString(),
    };
  }

  return runCommandGate('browser');
}

function walkFiles(dirPath, results = []) {
  if (!fs.existsSync(dirPath)) return results;

  for (const name of fs.readdirSync(dirPath)) {
    const fullPath = path.join(dirPath, name);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      walkFiles(fullPath, results);
      continue;
    }

    if (/\.(ts|tsx|js|mjs|cjs|vue)$/.test(name)) {
      results.push(fullPath);
    }
  }

  return results;
}

function collectImportSpecifiers(code) {
  const specs = [];
  const patterns = [
    /import\s+[^'"`]*?from\s+['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /require\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      specs.push(match[1]);
    }
  });

  return specs;
}

function isBoundaryViolation(filePath, specifier) {
  const relative = path.relative(ROOT, filePath).replaceAll('\\', '/');
  const inHarness = relative.startsWith('harness/');
  const inApps = relative.startsWith('apps/') || relative.includes('/apps/');

  if (inHarness) {
    return /(^|\/)apps\//.test(specifier) || specifier.startsWith('../apps') || specifier.includes('/apps/');
  }

  if (inApps) {
    return /(^|\/)harness\//.test(specifier) || specifier.startsWith('../harness') || specifier.includes('/harness/');
  }

  return false;
}

function runArchRuleGate() {
  const scanDirs = config.paths.scanDirs || ['harness', 'apps'];
  const files = scanDirs.flatMap((dir) => walkFiles(path.join(ROOT, dir)));
  const violations = [];

  files.forEach((filePath) => {
    const code = fs.readFileSync(filePath, 'utf8');
    const specifiers = collectImportSpecifiers(code);
    specifiers.forEach((specifier) => {
      if (isBoundaryViolation(filePath, specifier)) {
        violations.push({
          file: path.relative(ROOT, filePath).replaceAll('\\', '/'),
          import: specifier,
          reason: 'harness/* <-> apps/* direct import is forbidden',
        });
      }
    });
  });

  const report = {
    gate: 'arch',
    checkedFiles: files.length,
    violations,
    timestamp: new Date().toISOString(),
  };

  ensureArtifactsDir();
  writeJson(path.join(artifactsDir, 'arch-rule-report.json'), report);

  return {
    gate: 'arch',
    passed: violations.length === 0,
    exitCode: violations.length === 0 ? 0 : 1,
    summary: violations.length === 0 ? 'arch rule passed' : `arch rule failed (${violations.length} violations)`,
    details: {
      checkedFiles: files.length,
      reportPath: path.relative(ROOT, path.join(artifactsDir, 'arch-rule-report.json')).replaceAll('\\', '/'),
      violations,
    },
    timestamp: report.timestamp,
  };
}

async function execute(targetGate) {
  if (targetGate === 'arch') return runArchRuleGate();
  if (targetGate === 'browser') return runBrowserGate();

  if (!targetGate || !config.gates[targetGate]) {
    return {
      gate: targetGate || 'unknown',
      passed: false,
      exitCode: 2,
      summary: `Unknown gate. Use one of: ${Object.keys(config.gates).concat('arch').join(', ')}`,
      stdout: '',
      stderr: '',
      timestamp: new Date().toISOString(),
    };
  }

  return runCommandGate(targetGate);
}

(async () => {
  const result = await execute(gate);
  updateState(result);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.exitCode);
})();
