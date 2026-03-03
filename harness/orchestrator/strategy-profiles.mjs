import { FAILURE_CLASSES } from './failure-class.mjs';

export const STRATEGY_PROFILES = Object.freeze({
  lintFirst: {
    key: 'lint-first',
    focus: 'Resolve lint violations first; prioritize formatting and lint rule fixes over behavior changes.',
    tactics: [
      'Run lint locally or inspect lint errors in logs.',
      'Fix formatting and simple rule violations before touching logic.',
      'Avoid large refactors unless required to satisfy lint rules.',
    ],
  },
  typecheckFix: {
    key: 'typecheck-fix',
    focus: 'Resolve TypeScript type errors; keep code changes minimal and type-safe.',
    tactics: [
      'Inspect type errors in failing output to identify root cause.',
      'Prefer adding types or adjusting interfaces over disabling checks.',
      'Avoid changing runtime behavior unless required to fix types.',
    ],
  },
  testFix: {
    key: 'test-fix',
    focus: 'Address failing tests; ensure behavior matches expected contracts.',
    tactics: [
      'Locate failing tests and align implementation with assertions.',
      'Update fixtures or mocks only when behavior changes are intended.',
      'Keep fixes scoped to failing test paths.',
    ],
  },
  archBoundary: {
    key: 'arch-boundary',
    focus: 'Respect architecture boundaries; fix import or layering violations.',
    tactics: [
      'Check for forbidden imports or boundary violations in logs.',
      'Move code to allowed layers or introduce adapters.',
      'Avoid bypassing boundary checks by disabling rules.',
    ],
  },
  browserFix: {
    key: 'browser-fix',
    focus: 'Resolve browser gate failures; focus on UI/test stability.',
    tactics: [
      'Inspect browser test output/screenshots for failure details.',
      'Stabilize selectors and ensure UI state matches expectations.',
      'Keep visual or flow changes targeted to failing tests.',
    ],
  },
  mixedDefault: {
    key: 'mixed-default',
    focus: 'Address the highest impact failure first with minimal, safe changes.',
    tactics: [
      'Start with the most severe/primary failure signal.',
      'Apply smallest change that moves gates toward green.',
      'Avoid broad refactors until errors are isolated.',
    ],
  },
});

export function selectStrategyProfile(failureClass) {
  switch (failureClass) {
    case FAILURE_CLASSES.LINT:
      return STRATEGY_PROFILES.lintFirst;
    case FAILURE_CLASSES.TYPECHECK:
      return STRATEGY_PROFILES.typecheckFix;
    case FAILURE_CLASSES.TEST:
      return STRATEGY_PROFILES.testFix;
    case FAILURE_CLASSES.ARCH:
      return STRATEGY_PROFILES.archBoundary;
    case FAILURE_CLASSES.BROWSER:
      return STRATEGY_PROFILES.browserFix;
    default:
      return STRATEGY_PROFILES.mixedDefault;
  }
}
