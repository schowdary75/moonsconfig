import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function option(arguments_, name) {
  const index = arguments_.indexOf(`--${name}`);
  return index >= 0 ? arguments_[index + 1] : undefined;
}

export function parseCertificateArguments(arguments_) {
  const data = {
    login: option(arguments_, 'login'),
    displayName: option(arguments_, 'display-name'),
    recognition: option(arguments_, 'recognition'),
    reference: option(arguments_, 'reference'),
    date: option(arguments_, 'date'),
    id: option(arguments_, 'id'),
  };
  const missing = Object.entries(data)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) throw new Error(`Missing certificate fields: ${missing.join(', ')}`);
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(data.login)) {
    throw new Error('GitHub login is invalid');
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(data.date) ||
    Number.isNaN(Date.parse(`${data.date}T00:00:00Z`))
  ) {
    throw new Error('Date must use YYYY-MM-DD');
  }
  if (!/^MOONSCONFIG-[A-Z]{2,8}-\d{4}-\d{4}$/.test(data.id)) {
    throw new Error('Certificate ID must match MOONSCONFIG-TYPE-YYYY-NNNN');
  }
  return data;
}

export function certificateFilename(data) {
  const recognition = data.recognition
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${data.login.toLowerCase()}-${recognition}-${data.date}.svg`;
}

export function renderCertificate(data) {
  const issued = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${data.date}T00:00:00Z`));
  const safe = Object.fromEntries(
    Object.entries({ ...data, issued }).map(([key, value]) => [key, escapeXml(value)]),
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" role="img" aria-labelledby="title description">
  <title id="title">MooNsConfig ${safe.recognition} certificate for ${safe.displayName}</title>
  <description id="description">Certificate ${safe.id}, issued ${safe.issued}, recognizing ${safe.reference}.</description>
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#08111f" />
      <stop offset="0.55" stop-color="#10233d" />
      <stop offset="1" stop-color="#07101c" />
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#b98b2f" />
      <stop offset="0.5" stop-color="#f3d67a" />
      <stop offset="1" stop-color="#b98b2f" />
    </linearGradient>
  </defs>
  <rect width="1200" height="675" fill="url(#background)" />
  <circle cx="1030" cy="105" r="155" fill="#d4af37" opacity="0.08" />
  <circle cx="170" cy="590" r="185" fill="#4f83cc" opacity="0.07" />
  <rect x="28" y="28" width="1144" height="619" rx="18" fill="none" stroke="url(#gold)" stroke-width="2" />
  <rect x="44" y="44" width="1112" height="587" rx="14" fill="none" stroke="#d4af37" stroke-opacity="0.25" />
  <text x="88" y="100" fill="#f8fafc" font-family="Inter, Segoe UI, sans-serif" font-size="30" font-weight="700">MooNsConfig</text>
  <text x="88" y="128" fill="#9fb2ca" font-family="Inter, Segoe UI, sans-serif" font-size="14" letter-spacing="2">OPEN TRAVEL OPERATING SYSTEM</text>
  <text x="600" y="205" text-anchor="middle" fill="#d4af37" font-family="Inter, Segoe UI, sans-serif" font-size="18" font-weight="700" letter-spacing="5">CERTIFICATE OF RECOGNITION</text>
  <text x="600" y="267" text-anchor="middle" fill="#ffffff" font-family="Georgia, Times New Roman, serif" font-size="52">${safe.recognition}</text>
  <rect x="355" y="290" width="490" height="2" fill="url(#gold)" />
  <text x="600" y="340" text-anchor="middle" fill="#aebdd0" font-family="Inter, Segoe UI, sans-serif" font-size="17">Presented to</text>
  <text x="600" y="397" text-anchor="middle" fill="#f3d67a" font-family="Inter, Segoe UI, sans-serif" font-size="46" font-weight="700">${safe.displayName}</text>
  <text x="600" y="452" text-anchor="middle" fill="#dce5f0" font-family="Inter, Segoe UI, sans-serif" font-size="18">${safe.reference}</text>
  <text x="110" y="535" fill="#8296ad" font-family="Inter, Segoe UI, sans-serif" font-size="13" letter-spacing="1">ISSUED</text>
  <text x="110" y="562" fill="#f8fafc" font-family="Inter, Segoe UI, sans-serif" font-size="17">${safe.issued}</text>
  <text x="440" y="535" fill="#8296ad" font-family="Inter, Segoe UI, sans-serif" font-size="13" letter-spacing="1">CERTIFICATE ID</text>
  <text x="440" y="562" fill="#f8fafc" font-family="Inter, Segoe UI, sans-serif" font-size="17">${safe.id}</text>
  <text x="905" y="535" fill="#8296ad" font-family="Inter, Segoe UI, sans-serif" font-size="13" letter-spacing="1">MAINTAINER</text>
  <text x="905" y="562" fill="#f8fafc" font-family="Inter, Segoe UI, sans-serif" font-size="17">MooN</text>
  <text x="600" y="615" text-anchor="middle" fill="#718399" font-family="Inter, Segoe UI, sans-serif" font-size="12">Verify on github.com/schowdary75/moonsconfig · @${safe.login} · ${safe.id}</text>
</svg>
`;
}

export async function createCertificate(data) {
  const directory = path.join(root, 'docs', 'community', 'certificates');
  await mkdir(directory, { recursive: true });
  const outputPath = path.join(directory, certificateFilename(data));
  await writeFile(outputPath, renderCertificate(data), 'utf8');
  return outputPath;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  const data = parseCertificateArguments(process.argv.slice(2));
  const outputPath = await createCertificate(data);
  console.info(`Certificate created at ${path.relative(root, outputPath)}`);
}
