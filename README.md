<div align="center">
  <br />
  <h1 align="center">
    FASTLINK
  </h1>
  <p align="center">
    <strong>High-Speed Download Accelerator & Media Analyzer</strong>
  </p>
  <br />
  <p align="center">
    <a href="https://github.com/EithonX/fast-link/blob/main/LICENSE">
      <img src="https://img.shields.io/badge/License-GPLv3-222222.svg?style=for-the-badge&labelColor=111111" alt="License">
    </a>
    <a href="https://workers.cloudflare.com/">
      <img src="https://img.shields.io/badge/Cloudflare-F38020.svg?style=for-the-badge&logo=cloudflare&logoColor=white&labelColor=111111" alt="Cloudflare Workers">
    </a>
    <a href="https://reactrouter.com/">
      <img src="https://img.shields.io/badge/React_Router-CA4245.svg?style=for-the-badge&logo=react-router&logoColor=white&labelColor=111111" alt="React Router">
    </a>
    <a href="https://www.typescriptlang.org/">
      <img src="https://img.shields.io/badge/TypeScript-007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white&labelColor=111111" alt="TypeScript">
    </a>
  </p>
  <br />
</div>

<div align="center">
  <i>Generate direct links and proxy public media through Cloudflare's edge.</i>
</div>

---

## Overview

FastLink is a tool I built to make direct downloads easier to use. It can proxy publicly accessible files through a Cloudflare Worker. Actual transfer speed still depends on the source, network, and Cloudflare limits.

It can inspect video and audio metadata using partial HTTP reads, often without downloading the complete file.

## What it does

| Feature | How it works |
| :--- | :--- |
| **Edge Proxy** | Proxies public HTTP(S) file downloads through Cloudflare when the origin permits access. |
| **Resume Support** | Forwards HTTP `Range` requests and preserves origin response status; resuming depends on origin range support. |
| **Deep Media Analysis** | Runs `mediainfo.js` via WebAssembly to grab things like Bitrate, Codec, and Resolution on the fly. |
| **URL Safety** | Validates file URLs and redirect targets, blocks local/private addresses, and sends browser-like media request headers. |

<details>
<summary><strong>View System Architecture</strong></summary>
<br>

Everything runs on the edge to keep latency as low as possible globally:

- **Compute**: Cloudflare Workers
- **Framework**: React Router v8
- **UI Component System**: shadcn/ui + Tailwind CSS
- **Media Engine**: WebAssembly (WASM) 

</details>

## Quick Start

```bash
# 1. Get a direct link
https://example.com/movie.mp4

# 2. Drop it into FastLink
-> The UI validates it instantly on the client side

# 3. Get your results
-> A proxied, high-speed download link
-> Extracted Codec & Container data
```

## Credits

Built on top of some awesome open-source projects.

- **MediaInfo**: Analysis powered by [mediainfo.js](https://github.com/buzz/mediainfo.js) (MediaArea.net).
- **Media analysis engine**: Selected updates adapted from [MediaPeek](https://github.com/DG02002/mediapeek), while FastLink maintains its own generator and UI.
- **Maintained by**: [Eithon](https://github.com/EithonX).

<br />

<div align="center">
  Released under the <strong>GNU GPLv3 License</strong>
</div>
