export const DEFAULT_ATTEMPT_SCORE_WEIGHTS = Object.freeze({
  gateDelta: 1,
  fingerprintNovelty: 0.5,
  fileRelevance: 0.5,
});

function normalizeFile(filePath) {
  return String(filePath || '')
    .trim()
    .replaceAll('\\', '/')
    .replace(/^\.\//, '');
}

function countFailedGates(failure) {
  if (!failure || !Array.isArray(failure.failedGates)) return null;
  return failure.failedGates.length;
}

function scoreGateDelta(previousFailure, currentFailure) {
  const previousCount = countFailedGates(previousFailure);
  const currentCount = countFailedGates(currentFailure);
  if (previousCount === null || currentCount === null) return { score: 0, previousCount, currentCount };
  if (previousCount === 0 && currentCount === 0) return { score: 0, previousCount, currentCount };
  const delta = previousCount - currentCount;
  const normalized = delta / Math.max(previousCount, 1);
  return { score: Math.max(-1, Math.min(1, normalized)), previousCount, currentCount };
}

function scoreFingerprintNovelty(previousFailure, currentFailure) {
  const prev = previousFailure?.fingerprint || null;
  const curr = currentFailure?.fingerprint || null;
  if (!prev && !curr) return { score: 0, previous: prev, current: curr, changed: false };
  if (!prev && curr) return { score: 0.5, previous: prev, current: curr, changed: true };
  if (prev && !curr) return { score: 1, previous: prev, current: curr, changed: true };
  if (prev === curr) return { score: -1, previous: prev, current: curr, changed: false };
  return { score: 1, previous: prev, current: curr, changed: true };
}

function scoreFileRelevance({ changedFiles = [], fileCandidates = [] }) {
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) {
    return { score: 0, relevantFiles: [], changedCount: 0, candidateCount: fileCandidates.length };
  }
  if (!Array.isArray(fileCandidates) || fileCandidates.length === 0) {
    return { score: 0, relevantFiles: [], changedCount: changedFiles.length, candidateCount: 0 };
  }

  const normalizedChanged = [...new Set(changedFiles.map(normalizeFile).filter(Boolean))];
  const normalizedCandidates = [...new Set(fileCandidates.map(normalizeFile).filter(Boolean))];

  const relevantFiles = normalizedChanged.filter((file) =>
    normalizedCandidates.some((candidate) => file === candidate || file.endsWith(candidate) || candidate.endsWith(file)),
  );

  const ratio = relevantFiles.length / Math.max(normalizedChanged.length, 1);
  return {
    score: Math.max(0, Math.min(1, ratio)),
    relevantFiles,
    changedCount: normalizedChanged.length,
    candidateCount: normalizedCandidates.length,
  };
}

export function computeAttemptScore({
  previousFailure,
  currentFailure,
  changedFiles = [],
  fileCandidates = [],
  weights = DEFAULT_ATTEMPT_SCORE_WEIGHTS,
} = {}) {
  const gateDelta = scoreGateDelta(previousFailure, currentFailure);
  const fingerprintNovelty = scoreFingerprintNovelty(previousFailure, currentFailure);
  const fileRelevance = scoreFileRelevance({ changedFiles, fileCandidates });

  const weightConfig = { ...DEFAULT_ATTEMPT_SCORE_WEIGHTS, ...(weights || {}) };
  const score =
    gateDelta.score * weightConfig.gateDelta +
    fingerprintNovelty.score * weightConfig.fingerprintNovelty +
    fileRelevance.score * weightConfig.fileRelevance;

  return {
    score,
    components: {
      gateDelta: gateDelta.score,
      fingerprintNovelty: fingerprintNovelty.score,
      fileRelevance: fileRelevance.score,
    },
    detail: {
      gateDelta,
      fingerprintNovelty,
      fileRelevance,
      weights: weightConfig,
    },
  };
}
