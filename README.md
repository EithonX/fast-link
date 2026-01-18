# FastLink

<div align="center">

  <!-- You can add a logo here if you have one -->
  <!-- <img src="public/icon.svg" alt="FastLink Logo" width="120" /> -->

  <h3>High-Speed Download Accelerator & Media Analyzer</h3>

  <p>
    Accelerate downloads, analyze media metadata, and manage your history.<br />
    Powered by <b>Cloudflare Workers</b> and <b>MediaInfo.js</b>.
  </p>

  <p>
    <a href="#-features">Features</a> •
    <a href="#-tech-stack">Tech Stack</a> •
    <a href="#-license">License</a>
  </p>

  ![License](https://img.shields.io/badge/License-GPLv3-blue?style=flat-square)
  ![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-Orange?style=flat-square&logo=cloudflare)
  ![React](https://img.shields.io/badge/React_Router_v7-Red?style=flat-square&logo=react-router)
  ![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)

</div>

<br />

> **FastLink** solves the problem of slow direct downloads by proxying traffic through Cloudflare's global edge network. It creates resume-capable links and provides detailed technical metadata for video and audio files instantly—without downloading the entire file.

---

## ⚡ Features

| Feature | Description |
| :--- | :--- |
| **🚀 Acceleration** | Proxies downloads through Cloudflare to bypass throttling and improve stability. |
| **⏯️ Resume Support** | Generates links that support pausing and resuming downloads (Byte-Range headers). |
| **📊 Media Analysis** | Extracts deep metadata (Resolution, Bitrate, Codecs) using MediaInfo WebAssembly. |
| **🕒 Smart History** | Auto-saves your sessions. Restore previous links and metadata with a single click. |
| **🛡️ Secure Proxy** | Built-in SSRF protection and browser emulation for maximum compatibility. |
| **🎨 Modern UI** | A beautiful, responsive interface crafted with **shadcn/ui** and **Tailwind CSS**. |

## 🛠️ Tech Stack

This project is built with a modern, edge-first architecture:

-   **Runtime**: [Cloudflare Workers](https://workers.cloudflare.com/) (Serverless Edge)
-   **Framework**: [React Router v7](https://reactrouter.com/) (formerly Remix)
-   **Language**: TypeScript
-   **UI Library**: [shadcn/ui](https://ui.shadcn.com/)
-   **Styling**: [Tailwind CSS](https://tailwindcss.com/)
-   **Core Engine**: [MediaInfo.js](https://github.com/buzz/mediainfo.js) (WASM)

## 🚀 Getting Started

### Prerequisites

-   Use a **Standard HTTP/HTTPS** direct link to a media file.
-   Or use a public **Google Drive** file link.

### Usage

1.  Paste your link into the input field.
2.  FastLink instantly validates the URL.
3.  Click **Generate** to analyze the file and create a proxy link.
4.  View detailed media info or click the **Download** button to start.
5.  Access your **History** via the top-right menu to restore past sessions.

## 📄 License

**FastLink** is released under the **GNU GPLv3** license.

## 👏 Acknowledgments

Special thanks to the open-source community:

-   **MediaInfo**: Analysis powered by [mediainfo.js](https://github.com/buzz/mediainfo.js) (MediaArea.net).
-   **Inspiration**: This project was heavily inspired by [MediaPeek](https://github.com/luminalreason/mediapeek/).
    -   *Big thanks to [luminalreason](https://github.com/luminalreason) for the original concept.*
-   **Developer**: Built by [Eithon](https://github.com/EithonX).
