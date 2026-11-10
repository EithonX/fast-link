# FastLink

**FastLink** is a Cloudflare-based media utility for public HTTP(S) URLs. It combines direct, resumable file links with a detailed MediaInfo analyzer.

The modern application is built on [MediaPeek](https://github.com/DG02002/mediapeek), at upstream commit [621a315](https://github.com/DG02002/mediapeek/commit/621a315e79298d14223782b4d9dd1f8c9803034d), with FastLink's original download features migrated into the newer architecture.

## Features

- **Fast links:** Generate shareable Cloudflare Worker URLs for public files at \`/fastlink\`. The \`/p/<encoded-url>/<filename>\` format is retained for existing links.
- **Resumable downloads:** Forward HTTP \`Range\` requests and preserve the origin's real HTTP status. If an origin ignores ranges, FastLink does not pretend that it supports them.
- **Media previews:** Preview compatible video, audio, images, and PDFs through \`/view/<encoded-url>/<filename>\`.
- **Deep media analysis:** Inspect codecs, bitrates, tracks, archive contents and more using the upstream two-Worker MediaPeek analyzer at \`/app\`.
- **Browser history:** Recent generated links use the original \`fastlink_history\` browser-storage key so existing history survives the migration.
- **Metadata endpoint:** \`GET /info?url=...\` probes remote metadata with HEAD and a bounded range fallback.
- **Legacy proxy endpoint:** \`/resources/proxy?url=...\` remains available for compatible clients.
- **Optional Telegram bot:** Configure both \`BOT_TOKEN\` and \`TELEGRAM_WEBHOOK_SECRET\` as Worker secrets. The webhook is disabled without both secrets.

FastLink supports ordinary publicly accessible media. Access restrictions, permissions and origin rate limits still apply. The project does not guarantee increased speed; performance depends on the origin, network and Cloudflare limits.

## Architecture

The new application uses the upstream **pnpm workspace**, **TanStack Start**, **React**, **TypeScript**, **Effect**, **Vite**, and two **Cloudflare Workers**.

| Component | Location | Default Worker name |
| --- | --- | --- |
| Web app, FastLink routes and report UI | \`apps/mediapeek\` | \`dl\` |
| MediaInfo analyzer and safe ranged fetching | \`apps/mediapeek-analyzer\` | \`fastlink-analyzer\` |
| Shared contracts and URL codec | \`packages/shared\` | — |

The web Worker uses the \`ANALYZER\` service binding to call the analyzer. The separate analyzer must exist before deploying the web Worker. Internal upstream workspace/package names remain unchanged to minimize migration risk.

## Develop and verify

Use Node.js **26.12.0** and pnpm **12.5.1**:

\`\`\`bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
\`\`\`

Run both development Workers with:

\`\`\`bash
pnpm dev
\`\`\`

Builds and deployments use the checked-in lockfile. Repository CI performs checks, tests, both builds and dry-run Worker deployments. CI **does not publish** on every push.

## Production configuration

The web Worker is configured in \`apps/mediapeek/wrangler.jsonc\`. The analyzer Worker is configured in \`apps/mediapeek-analyzer/wrangler.jsonc\`.

Before publishing a release, verify the intended Cloudflare account, service binding, production rate limiting and custom-domain routing. The new two-Worker deployment is not interchangeable with the older single-Worker build. Deploy the analyzer first and the web Worker second. Keep tokens and application secrets in your Cloudflare configuration, not in Git.

The upstream deployment and rate-limiting checks live in \`scripts/deployment-preflight.mjs\`. See [the upstream analyzer guide](apps/mediapeek-analyzer/README.md) for analyzer configuration.

**Privacy:** Generated links contain a reversible encoding of the original URL, not encryption. Avoid sharing private or credential-bearing URLs. Link history is stored in the browser.

## Credits and license

FastLink is maintained by [EithonX](https://github.com/EithonX). Its media analysis implementation builds upon [MediaPeek](https://github.com/DG02002/mediapeek), including ongoing improvements to MediaInfo handling, range fetching, archive analysis, UX and security. The original project and its contributors retain their respective credits and rights.

MediaInfo analysis is powered by [mediainfo.js](https://github.com/buzz/mediainfo.js) and [MediaInfoLib](https://github.com/MediaArea/MediaInfoLib).

Licensed under [GNU GPL-3.0](LICENSE).
