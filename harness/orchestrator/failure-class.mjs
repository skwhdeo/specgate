export const FAILURE_CLASSES = Object.freeze({
  LINT: 'lint',
  TYPECHECK: 'typecheck',
  TEST: 'test',
  ARCH: 'arch',
  BROWSER: 'browser',
  UNKNOWN: 'unknown',
});

const PRIORITY = [
  FAILURE_CLASSES.ARCH,
  FAILURE_CLASSES.TYPECHECK,
  FAILURE_CLASSES.LINT,
  FAILURE_CLASSES.TEST,
  FAILURE_CLASSES.BROWSER,
];

function normalize(value) {
  return String(value || '').toLowerCase();
}

function collectFromGates(failedGates) {
  if (!Array.isArray(failedGates) || failedGates.length === 0) return [];
  const classes = new Set();
  failedGates.forEach((gate) => {
    const name = normalize(gate?.gate || gate);
    if (!name) return;
    if (name.includes('lint')) classes.add(FAILURE_CLASSES.LINT);
    if (name.includes('typecheck') || name.includes('tsc')) classes.add(FAILURE_CLASSES.TYPECHECK);
    if (name.includes('test')) classes.add(FAILURE_CLASSES.TEST);
    if (name.includes('arch') || name.includes('boundary')) classes.add(FAILURE_CLASSES.ARCH);
    if (name.includes('browser') || name.includes('playwright')) classes.add(FAILURE_CLASSES.BROWSER);
  });
  return [...classes];
}

function collectFromFingerprint(fingerprint) {
  const classes = new Set();
  const text = normalize(fingerprint);
  if (!text) return [];
  if (text.includes('lint') || text.includes('eslint')) classes.add(FAILURE_CLASSES.LINT);
  if (text.includes('typecheck') || text.includes('tsc') || text.includes('typescript')) classes.add(FAILURE_CLASSES.TYPECHECK);
  if (text.includes('test') || text.includes('jest') || text.includes('vitest')) classes.add(FAILURE_CLASSES.TEST);
  if (text.includes('arch') || text.includes('boundary') || text.includes('import')) classes.add(FAILURE_CLASSES.ARCH);
  if (text.includes('browser') || text.includes('playwright') || text.includes('puppeteer')) classes.add(FAILURE_CLASSES.BROWSER);
  return [...classes];
}

function pickPrimary(classes) {
  if (!classes || classes.length === 0) return FAILURE_CLASSES.UNKNOWN;
  for (const candidate of PRIORITY) {
    if (classes.includes(candidate)) return candidate;
  }
  return classes[0] || FAILURE_CLASSES.UNKNOWN;
}

export function classifyFailure(lastFailure) {
  const fromGates = collectFromGates(lastFailure?.failedGates);
  const fromFingerprint = collectFromFingerprint(lastFailure?.fingerprint);
  const combined = [...new Set([...fromGates, ...fromFingerprint])];

  return {
    primary: pickPrimary(combined),
    classes: combined.length > 0 ? combined : [FAILURE_CLASSES.UNKNOWN],
    sources: {
      gateClasses: fromGates,
      fingerprintClasses: fromFingerprint,
    },
  };
}
