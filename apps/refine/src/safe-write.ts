/**
 * Safe file write with ENOSPC (disk full) handling.
 * Wraps writeFileSync to provide a clear, actionable error message.
 * @module safe-write
 */
import { writeFileSync } from 'node:fs';

/**
 * Write data to a file, converting ENOSPC into a user-friendly error.
 * Re-throws other errors unchanged.
 */
export function safeWriteFileSync(
  path: string,
  data: string,
  encoding: BufferEncoding = 'utf-8',
): void {
  try {
    writeFileSync(path, data, encoding);
  } catch (err: unknown) {
    if (isEnospc(err)) {
      throw new Error(
        `Disk full — cannot write to ${path}.\n` +
        '  Free up disk space and try again.\n' +
        '  Tip: run "df -h" to check available space.',
      );
    }
    throw err;
  }
}

/** Check if an error is ENOSPC. */
function isEnospc(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as NodeJS.ErrnoException).code;
  return code === 'ENOSPC'
    || err.message.includes('ENOSPC')
    || err.message.includes('no space left');
}
