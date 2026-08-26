# EasyNotice project guide

## Purpose

EasyNotice is a self-hosted notification gateway for NAS, router, and Docker events: receive, normalize, route, deliver, and diagnose notifications without requiring users to understand webhook internals.

## Stack

- Node.js 22, TypeScript, Express, SQLite (`better-sqlite3`)
- React 19, Vite, Base UI, Phosphor Icons
- Docker image for `linux/amd64` and `linux/arm64`

## Commands

```bash
npm ci
npm run dev
npm run check
npm test
npm run build
```

## Project map

- `server/`: API, authentication, database migrations, normalization, routing, channel delivery
- `src/`: React management UI
- `public/`: shipped static assets
- `docs/使用手册.md`: authoritative user operation and troubleshooting guide
- `docker-compose.yml`, `Dockerfile`, `docker-entrypoint.sh`: production container path

## Working conventions

- Write user-facing product copy and user documentation in clear Simplified Chinese.
- Explain tasks as entrance → rule → route → outlet; avoid implementation jargon in the README.
- Preserve existing data and migrations. Never expose source tokens, channel secrets, AI keys, or raw sensitive payloads.
- Keep channel behavior explicit: WeCom Robot is text-only; WeCom App and Telegram support uploaded images; Bark images require a reachable URL.
- The built-in cover is preview-only. Do not add it to real notifications without an explicit source image or rule.
- Test OpenWrt PushBot as one complete generated configuration, not separate URL/header/body fields.
- Run `npm run check` and `npm test` before pushing functional changes.
- Do not bump the package version, create a tag, or publish a release unless the task explicitly requests a release.

## Current delivery path

`main` is the shipping branch. GitHub Actions runs CI and publishes GHCR images from main; releases add fixed `vX.Y.Z` tags. User-facing overview belongs in `README.md`; detailed procedures belong in `docs/使用手册.md`.
