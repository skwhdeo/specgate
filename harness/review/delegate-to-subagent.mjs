#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import { createAgentSession, SessionManager } from '@mariozechner/pi-coding-agent';

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
    artifactsDir: '.pi/specgate/artifacts',
    stateFile: '.pi/specgate/state/state.json',
    checkpointFile: '.pi/specgate/state/checkpoint.md',
    lastFailureFile: '.pi/specgate/state/last-failure.json',
  },
  review: {
    maxFileChars: 4000,
  },
};

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['reviewType', 'summary', 'severity', 'confidence', 'decision', 'findings', 'timestamp'],
  properties: {
    reviewType: { type: 'string' },
    summary: { type: 'string' },
    severity: { enum: ['low', 'medium', 'high'] },
    confidence: { enum: ['low', 'medium', 'high'] },
    decision: { enum: ['approve', 'needs_changes'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'severity', 'category', 'recommendation'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          severity: { enum: ['low', 'medium', 'high'] },
          category: { type: 'string' },
          evidence: { type: 'string' },
          file: { type: 'string' },
          line: { type: 'integer' },
          recommendation: { type: 'string' },
        },
      },
    },
    missingCases: {
      type: 'array',
      items: { type: 'string' },
    },
    strengths: {
      type: 'array',
      items: { type: 'string' },
    },
    timestamp: { type: 'string' },
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

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function getArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx === process.argv.length - 1) return undefined;
  return process.argv[idx + 1];
}

function hasArg(name) {
  return process.argv.includes(name);
}

function truncate(text, max) {
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n[truncated ${text.length - max} chars]`;
}

function extractJsonFromText(text) {
  if (!text) return null;

  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // continue
    }
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  return null;
}

function normalizePath(p) {
  if (!p) return p;
  if (path.isAbsolute(p)) return p;
  return path.join(ROOT, p);
}

function collectFileContents(files, maxFileChars) {
  const result = [];
  for (const file of files) {
    const full = normalizePath(file);
    const content = readText(full, '');
    if (!content) continue;
    result.push({
      file,
      content: truncate(content, maxFileChars),
    });
  }
  return result;
}

function buildPrompt({ reviewType, focus, context, fileContents }) {
  return [
    'You are a strict software reviewer.',
    `Review type: ${reviewType}`,
    `Focus: ${focus}`,
    '',
    'Rules:',
    '- Return ONLY JSON (no markdown, no prose outside JSON).',
    '- Use concrete evidence from provided context/files.',
    '- If uncertain, lower confidence instead of guessing.',
    '- Do not claim to execute commands/tests.',
    '',
    'Required JSON shape:',
    JSON.stringify({
      reviewType: reviewType,
      summary: 'short summary',
      severity: 'low|medium|high',
      confidence: 'low|medium|high',
      decision: 'approve|needs_changes',
      findings: [
        {
          id: 'F1',
          title: 'Issue title',
          severity: 'low|medium|high',
          category: 'test-quality|code-quality|security|architecture|docs',
          evidence: 'evidence snippet',
          file: 'optional file path',
          line: 1,
          recommendation: 'actionable fix',
        },
      ],
      missingCases: ['optional'],
      strengths: ['optional'],
      timestamp: new Date().toISOString(),
    }),
    '',
    'Context:',
    context,
    '',
    'Files:',
    ...fileContents.map((f) => `--- ${f.file}\n${f.content}`),
  ].join('\n');
}

async function main() {
  const userConfig = readJson(configPath, {});
  const config = {
    ...defaultConfig,
    ...userConfig,
    paths: { ...defaultConfig.paths, ...(userConfig.paths || {}) },
    review: { ...defaultConfig.review, ...(userConfig.review || {}) },
  };

  const reviewType = getArg('--review-type') || 'code-quality';
  const focus = getArg('--focus') || 'Assess quality and actionable improvements';
  const contextFile = getArg('--context-file');
  const filesArg = getArg('--files') || '';
  const outputArg = getArg('--output');
  const dryRun = hasArg('--dry-run');
  const maxFileChars = Number(getArg('--max-file-chars') || config.review.maxFileChars || 4000);

  const artifactsDir = path.join(ROOT, config.paths.artifactsDir);
  const statePath = path.join(ROOT, config.paths.stateFile);
  const checkpointPath = path.join(ROOT, config.paths.checkpointFile);
  const lastFailurePath = path.join(ROOT, config.paths.lastFailureFile);

  const state = readJson(statePath, {});
  const lastFailure = readJson(lastFailurePath, null);
  const checkpoint = readText(checkpointPath, '');

  const contextParts = [
    `state.status=${state.status || 'unknown'}`,
    `state.currentTask=${state.currentTask || 'unknown'}`,
    `state.lastError=${state.lastError || 'none'}`,
    `lastFailure=${lastFailure ? JSON.stringify(lastFailure) : 'none'}`,
    `checkpointHead=${checkpoint.split('\n').slice(0, 20).join('\n')}`,
  ];

  if (contextFile) {
    const extra = readText(normalizePath(contextFile), '');
    if (extra) contextParts.push(`contextFile(${contextFile})=${truncate(extra, 12000)}`);
  }

  const files = filesArg
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

  const fileContents = collectFileContents(files, maxFileChars);
  const prompt = buildPrompt({
    reviewType,
    focus,
    context: contextParts.join('\n\n'),
    fileContents,
  });

  if (dryRun) {
    console.log(prompt);
    return;
  }

  const { session } = await createAgentSession({
    cwd: ROOT,
    sessionManager: SessionManager.inMemory(),
  });

  let responseBuffer = '';
  const unsubscribe = session.subscribe((event) => {
    if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
      responseBuffer += event.assistantMessageEvent.delta;
    }
  });

  await session.prompt(prompt);
  unsubscribe();
  session.dispose();

  const parsed = extractJsonFromText(responseBuffer);
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(schema);

  const outputPath = outputArg
    ? normalizePath(outputArg)
    : path.join(artifactsDir, `review-${reviewType}.json`);

  const basePayload = {
    generatedAt: new Date().toISOString(),
    reviewType,
    focus,
    contextFiles: contextFile ? [contextFile] : [],
    files,
  };

  if (!parsed) {
    writeJson(outputPath, {
      ...basePayload,
      valid: false,
      error: 'Failed to parse JSON from subagent response',
      rawResponse: responseBuffer,
    });
    console.error('[review] failed: non-json response');
    process.exit(1);
  }

  const valid = validate(parsed);
  if (!valid) {
    writeJson(outputPath, {
      ...basePayload,
      valid: false,
      error: 'Schema validation failed',
      validationErrors: validate.errors,
      parsed,
      rawResponse: responseBuffer,
    });
    console.error('[review] failed: schema validation');
    process.exit(1);
  }

  writeJson(outputPath, {
    ...basePayload,
    valid: true,
    result: parsed,
  });

  console.log(JSON.stringify({ outputPath: path.relative(ROOT, outputPath), decision: parsed.decision, severity: parsed.severity }, null, 2));
}

main().catch((error) => {
  console.error('[review] fatal:', error?.stack || String(error));
  process.exit(1);
});
