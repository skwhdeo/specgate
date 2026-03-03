#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

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
    artifactsDir: '.pi/specgate/artifacts',
  },
};

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function readText(filePath, fallback = '') {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

function summarizeGate(gate) {
  if (!gate) return { passed: null, at: null };
  return {
    passed: !!gate.passed,
    at: gate.timestamp || null,
  };
}

const userConfig = readJson(configPath, {});
const config = {
  ...defaultConfig,
  ...userConfig,
  paths: { ...defaultConfig.paths, ...(userConfig.paths || {}) },
};

const statePath = path.join(ROOT, config.paths.stateFile);
const checkpointPath = path.join(ROOT, config.paths.checkpointFile);
const artifactsDir = path.join(ROOT, config.paths.artifactsDir);
const outputPath = path.join(artifactsDir, 'efficacy-summary.json');

function main() {
  const state = readJson(statePath, {});
  const checkpoint = readText(checkpointPath, '');

  const summary = {
    generatedAt: new Date().toISOString(),
    status: state.status || 'unknown',
    currentTask: state.currentTask || 'unknown',
    runCount: state.runCount || 0,
    attempts: state.attempt || 0,
    lastRunAt: state.lastRunAt || null,
    appTrackCompletedCount: (state.appTrackCompleted || []).length,
    harnessTrackCompletedCount: (state.harnessTrackCompleted || []).length,
    gates: {
      lint: summarizeGate(state.gateResults?.lint),
      typecheck: summarizeGate(state.gateResults?.typecheck),
      test: summarizeGate(state.gateResults?.test),
      arch: summarizeGate(state.gateResults?.arch),
      browser: summarizeGate(state.gateResults?.browser),
    },
    checkpointHeadline: checkpoint.split('\n').slice(0, 8),
  };

  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(summary, null, 2));
}

main();
