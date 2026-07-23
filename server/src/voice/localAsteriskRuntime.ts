import { spawn } from 'node:child_process';
import { env } from '../config/env.js';
import { logger } from '../logger/index.js';

/**
 * Local Windows development runs Asterisk inside the Ubuntu WSL distribution.
 * Keep one lightweight process alive there so WSL's localhost forwarding and
 * Asterisk do not disappear between calls. Linux deployments are unaffected.
 */
export function ensureLocalAsteriskRuntime() {
  if (process.platform !== 'win32') return;
  if (!/^http:\/\/(?:127\.0\.0\.1|localhost):8088\/?$/i.test(env.asteriskAri.url)) return;
  const distro = process.env.ASTERISK_WSL_DISTRO?.trim() || 'Ubuntu';
  if (!/^[A-Za-z0-9_.-]+$/.test(distro)) {
    logger.error('Invalid ASTERISK_WSL_DISTRO; local Asterisk was not started');
    return;
  }
  const command =
    "pgrep -f '^moonsconfig-asterisk-keepalive' >/dev/null || exec -a moonsconfig-asterisk-keepalive sleep infinity";
  const child = spawn('wsl.exe', ['-d', distro, '--', 'bash', '-lc', command], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.once('error', (error) =>
    logger.error('Could not start local Asterisk WSL runtime', { error }),
  );
  child.unref();
}
