# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security vulnerabilities. Instead,
report them privately via GitHub's *"Report a vulnerability"* (Security advisories)
on this repository. We aim to acknowledge reports within 72 hours.

## Operator responsibilities (self-hosted)

MGG is self-hostable. When you deploy it, **you** are responsible for the
runtime secrets and hardening:

- Generate strong, unique values for `AUTH_SECRET`, `API_JWT_SECRET` and
  `DAEMON_TOKEN` (the installer does this automatically). Never reuse the
  placeholder/dev values from `.env.example`.
- Keep `.env` out of version control (it is git-ignored by default).
- Front the panel with TLS (the bundled Caddy does this with `APP_DOMAIN` set).
- Apply the host firewall (`deploy/firewall.sh`) and keep Docker/runc patched.
- RCON ports are bound to `127.0.0.1` only; do not publish them.

## Built-in protections

- bcrypt password hashing, TOTP 2FA with AES-256-GCM-encrypted secrets and
  single-use hashed recovery codes.
- Scoped, hashed API keys; short-lived HMAC WebSocket tokens.
- Per-IP rate limiting (panel L7), a Minecraft-aware DDoS guard (edge proxy),
  and an nftables host firewall — see the README "DDoS protection" section.
- Path-jailed file manager and SFTP; granular sub-user permission scopes.

See the README **Security notes** and **DDoS protection** sections for details.
