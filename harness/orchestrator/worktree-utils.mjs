import { spawnSync } from 'node:child_process';

export const DEFAULT_WORKTREE_ROOT = '.worktrees';
export const DEFAULT_WORKTREE_BRANCH_PREFIX = 'autopilot';

export function formatJobIdDate(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

export function createJobId(prefix = 'ap', date = new Date()) {
  return `${prefix}-${formatJobIdDate(date)}`;
}

export function resolveWorktreeRoot(rootDir = DEFAULT_WORKTREE_ROOT) {
  return rootDir || DEFAULT_WORKTREE_ROOT;
}

export function resolveBranchPrefix(prefix = DEFAULT_WORKTREE_BRANCH_PREFIX) {
  return prefix || DEFAULT_WORKTREE_BRANCH_PREFIX;
}

export function buildWorktreeBranchName({ prefix = DEFAULT_WORKTREE_BRANCH_PREFIX, jobId }) {
  const safePrefix = resolveBranchPrefix(prefix);
  return `${safePrefix}/${jobId}`;
}

export function addWorktree({ cwd, worktreePath, branch, baseRef = 'HEAD', dryRun = false }) {
  const args = ['worktree', 'add'];
  if (branch) {
    args.push('-b', branch);
  }
  args.push(worktreePath);
  if (baseRef) {
    args.push(baseRef);
  }

  if (dryRun) {
    return {
      ok: true,
      status: 0,
      stdout: '',
      stderr: '',
      error: null,
      args,
      dryRun: true,
    };
  }

  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  const status = typeof result.status === 'number' ? result.status : 1;
  const ok = status === 0 && !result.error;

  return {
    ok,
    status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error || null,
    args,
    dryRun: false,
  };
}

export function removeWorktree({ cwd, worktreePath, force = false, dryRun = false }) {
  const args = ['worktree', 'remove'];
  if (force) args.push('--force');
  args.push(worktreePath);

  if (dryRun) {
    return {
      ok: true,
      status: 0,
      stdout: '',
      stderr: '',
      error: null,
      args,
      dryRun: true,
    };
  }

  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  const status = typeof result.status === 'number' ? result.status : 1;
  const ok = status === 0 && !result.error;

  return {
    ok,
    status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error || null,
    args,
    dryRun: false,
  };
}
