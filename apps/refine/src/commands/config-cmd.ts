/**
 * Config command — get/set configuration values.
 * @module commands/config-cmd
 */
import { Command } from 'commander';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { loadConfig } from '../config/index.js';

/** Get the config file path. */
function getConfigPath(): string {
  return join(homedir(), '.config', 'ody-refine', 'config.toml');
}

/** Create the config command with get/set subcommands. */
export function createConfigCommand(): Command {
  const cmd = new Command('config')
    .description('Get or set configuration values')
    .addHelpText('after', `
Examples:
  $ ody-refine config show                       Show all settings
  $ ody-refine config get embedding.provider      Get a specific value
  $ ody-refine config set llm.model qwen2.5:7b    Set a value

Config file: ~/.config/ody-refine/config.toml
`);

  cmd.addCommand(
    new Command('get')
      .description('Get a configuration value')
      .argument('<key>', 'Configuration key (e.g., embedding.provider)')
      .action((key: string) => {
        const config = loadConfig();
        const value = getNestedValue(config as unknown as Record<string, unknown>, key);

        if (value === undefined) {
          process.stdout.write(`Unknown key: ${key}\n`);
          process.exitCode = 1;
          return;
        }

        process.stdout.write(`${key} = ${String(value)}\n`);
      }),
  );

  cmd.addCommand(
    new Command('set')
      .description('Set a configuration value')
      .argument('<key>', 'Configuration key (e.g., embedding.provider)')
      .argument('<value>', 'Value to set')
      .action((key: string, value: string) => {
        const configPath = getConfigPath();
        const dir = dirname(configPath);

        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        let tomlContent = '';
        if (existsSync(configPath)) {
          tomlContent = readFileSync(configPath, 'utf-8');
        }

        tomlContent = setTomlValue(tomlContent, key, value);
        writeFileSync(configPath, tomlContent, 'utf-8');
        process.stdout.write(`Set ${key} = ${value}\n`);
      }),
  );

  cmd.addCommand(
    new Command('show')
      .description('Show all configuration values')
      .action(() => {
        const config = loadConfig();
        process.stdout.write(JSON.stringify(config, null, 2) + '\n');
      }),
  );

  return cmd;
}

function getNestedValue(obj: Record<string, unknown>, key: string): unknown {
  const parts = key.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function setTomlValue(content: string, key: string, value: string): string {
  const parts = key.split('.');
  if (parts.length === 1) {
    return appendOrReplaceKey(content, parts[0]!, value);
  }

  const section = parts.slice(0, -1).join('.');
  const field = parts[parts.length - 1]!;
  const sectionHeader = `[${section}]`;

  if (!content.includes(sectionHeader)) {
    return content + `\n${sectionHeader}\n${field} = "${value}"\n`;
  }

  const lines = content.split('\n');
  const result: string[] = [];
  let inSection = false;
  let replaced = false;

  for (const line of lines) {
    if (line.trim() === sectionHeader) {
      inSection = true;
      result.push(line);
      continue;
    }

    if (inSection && line.trim().startsWith('[')) {
      if (!replaced) {
        result.push(`${field} = "${value}"`);
        replaced = true;
      }
      inSection = false;
    }

    if (inSection && line.trim().startsWith(`${field} `)) {
      result.push(`${field} = "${value}"`);
      replaced = true;
      continue;
    }

    result.push(line);
  }

  if (inSection && !replaced) {
    result.push(`${field} = "${value}"`);
  }

  return result.join('\n');
}

function appendOrReplaceKey(content: string, key: string, value: string): string {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.trim().startsWith(`${key} `)) {
      lines[i] = `${key} = "${value}"`;
      return lines.join('\n');
    }
  }
  return content + `\n${key} = "${value}"\n`;
}
