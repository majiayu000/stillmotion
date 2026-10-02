# Security Policy

## Supported versions

Security fixes are applied to the latest release on the `main` branch.

## Reporting a vulnerability

Please do **not** open a public issue for security problems. Report them privately through [GitHub Security Advisories](https://github.com/majiayu000/stillmotion/security/advisories/new).

Include the affected version, steps to reproduce, and the impact you observed. You can expect an initial response within a few days; once a fix is ready it will be released and credited in the advisory unless you prefer to stay anonymous.

The recorder runs a local HTTP server bound to `127.0.0.1` for the duration of an export and serves only files under `--root`. Path traversal outside `--root` is treated as a security bug.
