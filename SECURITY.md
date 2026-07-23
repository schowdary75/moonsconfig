# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability or include sensitive details in a
discussion.

Use GitHub's private vulnerability reporting:

1. Open the repository's **Security** tab.
2. Select **Advisories**.
3. Select **Report a vulnerability**.
4. Include affected versions, impact, reproduction steps, and any proposed mitigation.

Reports are reviewed by repository administrators. Please allow time to reproduce and coordinate a
fix before public disclosure.

## Sensitive data

Never commit or attach:

- `.env` files or provider credentials
- private keys, certificates, signing secrets, or database URLs with real passwords
- database dumps, Terraform state or variable files
- traveller/customer information, passports, identity documents, or payment data
- uploads, call recordings, email exports, logs, or production screenshots

Use synthetic data in tests, issues, discussions, and pull requests.

## Supported versions

Until tagged stable releases are published, security fixes are applied to the latest `main`
revision. Older commits and unmaintained forks are not supported.
