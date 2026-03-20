import { describe, it, expect, vi, afterEach } from 'vitest';
import { safeWriteFileSync } from '../src/safe-write.js';
import * as fs from 'node:fs';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return { ...actual, writeFileSync: vi.fn() };
});

describe('safeWriteFileSync', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls writeFileSync on success', () => {
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});
    safeWriteFileSync('/tmp/test.html', '<html>test</html>');
    expect(fs.writeFileSync).toHaveBeenCalledWith('/tmp/test.html', '<html>test</html>', 'utf-8');
  });

  it('throws user-friendly error on ENOSPC', () => {
    const err = new Error('ENOSPC: no space left on device') as NodeJS.ErrnoException;
    err.code = 'ENOSPC';
    vi.mocked(fs.writeFileSync).mockImplementation(() => { throw err; });

    expect(() => safeWriteFileSync('/tmp/test.html', 'data')).toThrow(
      /Disk full/,
    );
  });

  it('re-throws non-ENOSPC errors unchanged', () => {
    const err = new Error('EACCES: permission denied');
    vi.mocked(fs.writeFileSync).mockImplementation(() => { throw err; });

    expect(() => safeWriteFileSync('/tmp/test.html', 'data')).toThrow(
      /EACCES/,
    );
  });
});
