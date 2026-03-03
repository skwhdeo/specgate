import fs from 'node:fs';
import path from 'node:path';

function normalizeCandidate(candidate) {
  return String(candidate || '')
    .trim()
    .replaceAll('\\', '/')
    .replace(/^\.\//, '');
}

function resolveCandidate(repoRoot, candidate) {
  if (!candidate) return null;
  const resolved = path.isAbsolute(candidate) ? candidate : path.join(repoRoot, candidate);
  return resolved;
}

function clipSnippet(text, maxBytes) {
  if (maxBytes <= 0) return { snippet: '', truncated: false, bytes: 0 };
  const buffer = Buffer.from(text, 'utf8');
  if (buffer.length <= maxBytes) {
    return { snippet: text, truncated: false, bytes: buffer.length };
  }
  const clipped = buffer.subarray(0, maxBytes).toString('utf8');
  return { snippet: clipped, truncated: true, bytes: Buffer.byteLength(clipped, 'utf8') };
}

export function packContext({
  repoRoot,
  fileCandidates = [],
  maxFiles = 5,
  maxBytesPerFile = 2000,
  maxTotalBytes = 8000,
} = {}) {
  const root = repoRoot || process.cwd();
  const normalized = [...new Set(fileCandidates.map(normalizeCandidate).filter(Boolean))];
  const files = [];
  let totalBytes = 0;

  for (const candidate of normalized) {
    if (files.length >= maxFiles) break;
    const resolved = resolveCandidate(root, candidate);
    if (!resolved) continue;
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) continue;

    const raw = fs.readFileSync(resolved, 'utf8');
    const remaining = Math.max(maxTotalBytes - totalBytes, 0);
    if (remaining <= 0) break;

    const perFileLimit = Math.min(maxBytesPerFile, remaining);
    const clipped = clipSnippet(raw, perFileLimit);

    totalBytes += clipped.bytes;
    files.push({
      path: candidate,
      snippet: clipped.snippet,
      truncated: clipped.truncated,
      bytes: clipped.bytes,
    });
  }

  return {
    files,
    totalBytes,
    maxFiles,
    maxBytesPerFile,
    maxTotalBytes,
  };
}
