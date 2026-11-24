import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const boundaryScript = fileURLToPath(
  new URL('../../../scripts/check-core-boundary.mjs', import.meta.url)
);
const sdkPackage = ['matrix', 'js-sdk'].join('-');
const sdkClientImport = `import { MatrixClient } from '${sdkPackage}';\n`;

const runBoundary = (files: Record<string, string>) => {
  const root = mkdtempSync(join(tmpdir(), 'harrier-core-boundary-'));
  try {
    Object.entries(files).forEach(([relativePath, content]) => {
      const file = join(root, relativePath);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, content, 'utf8');
    });
    return spawnSync(process.execPath, [boundaryScript], { cwd: root, encoding: 'utf8' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

const expectAccepted = (result: ReturnType<typeof runBoundary>) => {
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stdout).toBe('Core boundary check passed.\n');
  expect(result.stderr).toBe('');
};

const expectRejected = (result: ReturnType<typeof runBoundary>) => {
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain('Core boundary check failed:');
};

describe('core boundary CLI', () => {
  it('rejects matrix-js-sdk imports in src', () => {
    const result = runBoundary({
      'src/legacy.ts': `${sdkClientImport}export type Client = MatrixClient;\n`,
    });

    expectRejected(result);
    expect(result.stderr).toContain('src/legacy.ts: SDK вне core-matrix-js (matrix-js-sdk)');
  });

  it('accepts matrix-js-sdk imports in the core-matrix-js adapter', () => {
    const result = runBoundary({
      'packages/core-matrix-js/src/adapter.ts': `${sdkClientImport}export type Client = MatrixClient;\n`,
    });

    expectAccepted(result);
  });

  it('rejects EventTimelineSetHandlerMap in src', () => {
    const result = runBoundary({
      'src/legacy.ts': 'export type Handlers = EventTimelineSetHandlerMap;\n',
    });

    expectRejected(result);
    expect(result.stderr).toContain('src/legacy.ts');
    expect(result.stderr).toContain('EventTimelineSetHandlerMap');
  });

  it('accepts plain core view types in src', () => {
    const result = runBoundary({
      'src/view.ts':
        "import type { RoomView } from '@harrier/core';\nexport type View = RoomView;\n",
    });

    expectAccepted(result);
  });

  it('accepts EventTimelineSetHandlerMap in the core-matrix-js adapter', () => {
    const result = runBoundary({
      'packages/core-matrix-js/src/adapter.ts':
        'export type Handlers = EventTimelineSetHandlerMap;\n',
    });

    expectAccepted(result);
  });

  it('rejects EventTimelineSetHandlerMap in non-adapter packages', () => {
    const result = runBoundary({
      'packages/core/src/legacy.ts': 'export type Handlers = EventTimelineSetHandlerMap;\n',
    });

    expectRejected(result);
    expect(result.stderr).toContain('packages/core/src/legacy.ts');
    expect(result.stderr).toContain('EventTimelineSetHandlerMap');
  });
});
