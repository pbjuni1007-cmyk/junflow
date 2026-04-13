import { execFile } from 'child_process';
import { promisify } from 'util';
import type { CliType, CliValidation } from './types.js';

const execFileAsync = promisify(execFile);

/**
 * Sanitize a binary path to prevent injection.
 */
function sanitizeBin(bin: string): string {
  if (bin.includes('\0')) throw new Error('Invalid binary path: null byte detected');
  if (/[;&|`$(){}]/.test(bin)) throw new Error('Invalid binary path: shell metacharacters detected');
  return bin;
}

/**
 * Check if a CLI tool is installed and get its version.
 */
export async function validateCli(cli: CliType, customBin?: string): Promise<CliValidation> {
  const bin = sanitizeBin(customBin ?? cli);

  try {
    const { stdout } = await execFileAsync(bin, ['--version'], {
      timeout: 5000,
      windowsHide: true,
    });

    const version = stdout.trim().split('\n')[0];
    return { installed: true, version };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    if (msg.includes('ENOENT') || msg.includes('not found') || msg.includes('not recognized')) {
      const installCmd =
        cli === 'codex'
          ? 'npm install -g @openai/codex'
          : 'npm install -g @google/gemini-cli';
      return {
        installed: false,
        error: `${cli} CLI not found. Install: ${installCmd}`,
      };
    }

    // CLI exists but --version failed (still usable)
    return { installed: true, version: 'unknown', error: msg };
  }
}

/**
 * Resolve the binary path for a CLI type from config or PATH.
 */
export function resolveBin(cli: CliType, configBin?: string): string {
  if (configBin) return configBin;
  return cli; // rely on PATH
}
