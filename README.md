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
  <i>Proxy direct links through Cloudflare's edge network for ultimate stability and speed.</i>
</div>

---

## Overview

FastLink is a tool I built to fix slow and unstable direct downloads. It uses Cloudflare's massive global network as a proxy, so your downloads go through their edge nodes instead of directly from the slow source.

It also grabs detailed metadata from video and audio files instantly, right in the browser, without needing to download the whole file first.

## What it does

| Feature | How it works |
| :--- | :--- |
| **Global Acceleration** | Routes traffic through Cloudflare Edge to bypass throttling and strict network limits. |
| **Resume Support** | Keeps `Byte-Range` headers intact. Pausing and resuming your downloads actually works. |
| **Deep Media Analysis** | Runs `mediainfo.js` via WebAssembly to grab things like Bitrate, Codec, and Resolution on the fly. |
| **Edge Security** | Comes with SSRF mitigation, TLS fingerprinting, and dynamic browser emulation so links don't get blocked. |

<details>
<summary><strong>View System Architecture</strong></summary>
<br>

Everything runs on the edge to keep latency as low as possible globally:

- **Compute**: Cloudflare Workers
- **Framework**: React Router v7
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
- **Inspiration**: Heavily inspired by [MediaPeek](https://github.com/luminalreason/mediapeek/). Big thanks to [luminalreason](https://github.com/luminalreason) for the original concept.
- **Maintained by**: [Eithon](https://github.com/EithonX).

<br />

<div align="center">
  Released under the <strong>GNU GPLv3 License</strong>
</div>
