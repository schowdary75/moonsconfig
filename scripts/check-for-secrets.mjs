import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const publishableFiles = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  {
    cwd: root,
    encoding: 'utf8',
  },
)
  .split('\0')
  .filter(Boolean);

const forbiddenPaths = [
  {
    test: (file) => /(^|\/)\.env(?:\.|$)/i.test(file) && !/(^|\/)\.env\.example$/i.test(file),
    reason: 'tracked environment file',
  },
  {
    test: (file) => /\.(?:pem|key|crt|cer|p12|pfx|jks|keystore)$/i.test(file),
    reason: 'tracked certificate or key material',
  },
  {
    test: (file) => /\.(?:tfvars|tfstate)(?:\..*)?$/i.test(file),
    reason: 'tracked Terraform values or state',
  },
  {
    test: (file) => /\.(?:dump|bak|sql\.gz)$/i.test(file),
    reason: 'tracked database export',
  },
];

const contentPatterns = [
  [/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g, 'private key'],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, 'AWS access key'],
  [/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, 'GitHub token'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, 'GitHub fine-grained token'],
  [/\bAIza[0-9A-Za-z_-]{30,}\b/g, 'Google API key'],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/g, 'API token'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, 'Slack token'],
];

const allowedExamplePasswords = new Set([
  '',
  'change-me',
  'change-root-password',
  'password',
  'example',
  'test',
  'test-password',
  'test-root-password',
]);

const findings = [];

for (const file of publishableFiles) {
  const normalized = file.replaceAll('\\', '/');
  for (const rule of forbiddenPaths) {
    if (rule.test(normalized)) findings.push({ file: normalized, reason: rule.reason });
  }

  const absolute = path.join(root, file);
  let details;
  try {
    details = await stat(absolute);
  } catch (error) {
    if (error?.code === 'ENOENT') continue;
    throw error;
  }
  if (!details.isFile() || details.size > 2_000_000) continue;

  const bytes = await readFile(absolute);
  if (bytes.includes(0)) continue;
  const content = bytes.toString('utf8');

  for (const [pattern, reason] of contentPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) findings.push({ file: normalized, reason });
  }

  const databaseUrl = /\b(?:mysql|postgres(?:ql)?|mongodb(?:\+srv)?):\/\/([^:\s/]+):([^@\s/]+)@/gi;
  for (const match of content.matchAll(databaseUrl)) {
    const password = match[2].replace(/['"`)}\]]+$/, '').toLowerCase();
    const isVariable = password.includes('${') || password.includes('process.env');
    const isPlaceholder =
      allowedExamplePasswords.has(password) ||
      password.startsWith('replace-with') ||
      password.startsWith('your-');
    if (!isVariable && !isPlaceholder) {
      findings.push({ file: normalized, reason: 'database URL with a literal password' });
    }
  }
}

const unique = [
  ...new Map(findings.map((finding) => [`${finding.file}:${finding.reason}`, finding])).values(),
];

if (unique.length > 0) {
  console.error('Potential secret-safety problems found:');
  for (const finding of unique) console.error(`- ${finding.file}: ${finding.reason}`);
  process.exit(1);
}

console.info(`Secret-safety check passed for ${publishableFiles.length} publishable files.`);
