import assert from 'node:assert/strict';
import test from 'node:test';

import {
  certificateFilename,
  parseCertificateArguments,
  renderCertificate,
} from './create-contributor-certificate.mjs';

const certificate = {
  login: 'MFA-G',
  displayName: 'MFA-G',
  recognition: 'Roadmap Champion',
  reference: 'PR #22 · Community Upgrade Roadmap',
  date: '2026-07-23',
  id: 'MOONSCONFIG-RC-2026-0001',
};

test('validates certificate metadata and produces a stable filename', () => {
  const parsed = parseCertificateArguments([
    '--login',
    certificate.login,
    '--display-name',
    certificate.displayName,
    '--recognition',
    certificate.recognition,
    '--reference',
    certificate.reference,
    '--date',
    certificate.date,
    '--id',
    certificate.id,
  ]);

  assert.deepEqual(parsed, certificate);
  assert.equal(certificateFilename(parsed), 'mfa-g-roadmap-champion-2026-07-23.svg');
});

test('escapes contributor-provided text in the SVG', () => {
  const svg = renderCertificate({
    ...certificate,
    displayName: 'MFA-G <maintainer>',
    reference: 'PR #22 & issue #21',
  });

  assert.match(svg, /MFA-G &lt;maintainer&gt;/);
  assert.match(svg, /PR #22 &amp; issue #21/);
  assert.doesNotMatch(svg, /<maintainer>/);
});

test('rejects unsafe or incomplete certificate metadata', () => {
  assert.throws(() => parseCertificateArguments([]), /Missing certificate fields/);
  assert.throws(
    () =>
      parseCertificateArguments([
        '--login',
        '../private',
        '--display-name',
        'Unsafe',
        '--recognition',
        'Roadmap Champion',
        '--reference',
        'PR #1',
        '--date',
        '2026-07-23',
        '--id',
        'MOONSCONFIG-RC-2026-0002',
      ]),
    /GitHub login is invalid/,
  );
});
