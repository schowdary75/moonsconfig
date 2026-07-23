# Digital contributor certificates

MooNsConfig certificates are public acknowledgements for notable community work. Each certificate
is an SVG committed to this repository, so anyone can verify its contents, history, and maintainer
approval.

## Current certificates

| Certificate ID                                                                 | Contributor                       | Recognition      | Reference                                                    | Issued     |
| ------------------------------------------------------------------------------ | --------------------------------- | ---------------- | ------------------------------------------------------------ | ---------- |
| [MOONSCONFIG-RC-2026-0001](certificates/mfa-g-roadmap-champion-2026-07-23.svg) | [MFA-G](https://github.com/MFA-G) | Roadmap Champion | [PR #22](https://github.com/schowdary75/moonsconfig/pull/22) | 2026-07-23 |

## Verification

To verify a certificate:

1. Open the certificate from the table above.
2. Confirm its contributor, certificate ID, contribution reference, and issue date.
3. Select **History** on GitHub to inspect the commit that introduced it.
4. Confirm that the file exists on the repository's protected `main` branch.

A copied image outside this repository is not independently verifiable. The canonical certificate
is always the file in `schowdary75/moonsconfig`.

## Issuing a certificate

Maintainers can generate a safe SVG without external fonts, remote images, or contributor personal
data:

```bash
npm run community:certificate -- \
  --login contributor-login \
  --display-name "Contributor Name" \
  --recognition "Roadmap Champion" \
  --reference "PR #123 · Community Upgrade Roadmap" \
  --date 2026-07-23 \
  --id MOONSCONFIG-RC-2026-0002
```

The generator writes to `docs/community/certificates/`. Review the SVG, add its record to this
page, and merge it through the normal pull-request process.

Use only the contributor's public GitHub login or a display name they explicitly requested. Never
include an email address, location, employer, customer information, or other private data.

## Meaning

Certificates recognize open-source participation in MooNsConfig. They do not represent employment,
academic credit, identity verification, a professional license, or a warranty from the project.
