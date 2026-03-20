import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    appendFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return { ...actual, homedir: vi.fn(() => '/mock-home') };
});

// Must import after mocks are set up
import {
  isEnabled,
  enable,
  disable,
  statusText,
  record,
  readLog,
} from '../src/telemetry.js';

describe('telemetry', () => {
  const originalEnv = process.env['ODY_TELEMETRY'];

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['ODY_TELEMETRY'];
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env['ODY_TELEMETRY'] = originalEnv;
    } else {
      delete process.env['ODY_TELEMETRY'];
    }
  });

  describe('isEnabled', () => {
    it('returns false by default (opt-in)', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(isEnabled()).toBe(false);
    });

    it('returns true when ODY_TELEMETRY=1', () => {
      process.env['ODY_TELEMETRY'] = '1';
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(isEnabled()).toBe(true);
    });

    it('returns true when consent file exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      expect(isEnabled()).toBe(true);
    });

    it('returns false when ODY_TELEMETRY is set to something other than 1', () => {
      process.env['ODY_TELEMETRY'] = '0';
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(isEnabled()).toBe(false);
    });
  });

  describe('enable', () => {
    it('creates the consent file', () => {
      enable();
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('.ody'),
        { recursive: true },
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('telemetry-consent'),
        'opted-in\n',
        'utf-8',
      );
    });
  });

  describe('disable', () => {
    it('removes the consent file if it exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      disable();
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining('telemetry-consent'),
      );
    });

    it('does nothing if consent file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      disable();
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });
  });

  describe('statusText', () => {
    it('shows disabled by default', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(statusText()).toContain('disabled');
    });

    it('shows enabled via env', () => {
      process.env['ODY_TELEMETRY'] = '1';
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(statusText()).toContain('ODY_TELEMETRY=1');
    });

    it('shows enabled via consent file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      expect(statusText()).toContain('consent file');
    });

    it('shows both when env and file are set', () => {
      process.env['ODY_TELEMETRY'] = '1';
      vi.mocked(fs.existsSync).mockReturnValue(true);
      expect(statusText()).toContain('env + consent file');
    });
  });

  describe('record', () => {
    it('does nothing when telemetry is disabled', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      record('scan_started', { detector_names: ['contradictions'] });
      expect(fs.appendFileSync).not.toHaveBeenCalled();
    });

    it('appends JSONL when telemetry is enabled via env', () => {
      process.env['ODY_TELEMETRY'] = '1';
      record('scan_started', { detector_names: ['contradictions'] });

      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.appendFileSync).toHaveBeenCalledTimes(1);

      const [path, data] = vi.mocked(fs.appendFileSync).mock.calls[0] as [string, string];
      expect(path).toContain('telemetry.jsonl');
      const parsed = JSON.parse(data.trim());
      expect(parsed.event).toBe('scan_started');
      expect(parsed.payload.detector_names).toEqual(['contradictions']);
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.version).toBe('0.0.0'); // getVersion() fallback when fs is mocked
    });

    it('records scan_completed with metrics', () => {
      process.env['ODY_TELEMETRY'] = '1';
      record('scan_completed', {
        file_count: 10,
        node_count: 25,
        issue_count: 3,
        duration_ms: 5000,
        detector_names: ['contradictions', 'staleness'],
      });

      const [, data] = vi.mocked(fs.appendFileSync).mock.calls[0] as [string, string];
      const parsed = JSON.parse(data.trim());
      expect(parsed.event).toBe('scan_completed');
      expect(parsed.payload.file_count).toBe(10);
      expect(parsed.payload.issue_count).toBe(3);
    });

    it('silently ignores write errors', () => {
      process.env['ODY_TELEMETRY'] = '1';
      vi.mocked(fs.appendFileSync).mockImplementation(() => {
        throw new Error('EACCES');
      });
      // Should not throw
      expect(() => record('scan_started', { detector_names: [] })).not.toThrow();
    });
  });

  describe('readLog', () => {
    it('returns empty array when log does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(readLog()).toEqual([]);
    });

    it('parses JSONL entries', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const line1 = JSON.stringify({
        event: 'scan_started',
        timestamp: '2026-03-18T00:00:00.000Z',
        version: '0.1.0',
        payload: { detector_names: ['contradictions'] },
      });
      const line2 = JSON.stringify({
        event: 'scan_completed',
        timestamp: '2026-03-18T00:00:01.000Z',
        version: '0.1.0',
        payload: { file_count: 5, node_count: 10, issue_count: 2, duration_ms: 1000, detector_names: [] },
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`${line1}\n${line2}\n`);

      const entries = readLog();
      expect(entries).toHaveLength(2);
      expect(entries[0].event).toBe('scan_started');
      expect(entries[1].event).toBe('scan_completed');
    });
  });
});
