"use client"

import { decodeFastLinkUrl, makeFastLink } from "@mediapeek/shared/fastlink"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { Footer } from "~/components/footer"
import { Header } from "~/components/header"

type MediaKind = "video" | "audio" | "image" | "pdf" | "unknown"

const inferKind = (filename: string, contentType = ""): MediaKind => {
  if (contentType.startsWith("video/")) return "video"
  if (contentType.startsWith("audio/")) return "audio"
  if (contentType.startsWith("image/")) return "image"
  if (contentType === "application/pdf") return "pdf"

  const ext = filename.split(".").at(-1)?.toLowerCase()
  if (["mp4", "webm", "mov", "m4v", "mkv", "avi"].includes(ext ?? "")) return "video"
  if (["mp3", "flac", "wav", "m4a", "aac", "ogg"].includes(ext ?? "")) return "audio"
  if (["jpg", "jpeg", "png", "gif", "webp", "avif"].includes(ext ?? "")) return "image"
  if (ext === "pdf") return "pdf"
  return "unknown"
}

function FilePreview() {
  const { encoded, filename } = Route.useParams()
  let source = ""
  try {
    source = decodeFastLinkUrl(encoded)
  } catch {
    // The generated UI below explains an invalid or expired link.
  }

  const [contentType, setContentType] = useState("")
  const [fileSize, setFileSize] = useState<number | undefined>()
  useEffect(() => {
    if (!source) return

    const controller = new AbortController()
    const query = "/info?url=" + encodeURIComponent(source)
    void fetch(query, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((info: { type?: string; size?: number } | null) => {
        if (info?.type) setContentType(info.type)
        if (info?.size) setFileSize(info.size)
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [source])

  const proxy = source ? makeFastLink("", source, filename) : ""
  const kind = inferKind(filename, contentType)
  const inline = proxy + "?inline=1"

  return (
    <div className="flex min-h-screen flex-col font-sans">
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-8">
        <div className="flex flex-col justify-between gap-4 border-b pb-6 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              FastLink / Media preview
            </p>
            <h1 className="mt-2 break-all text-xl font-semibold sm:text-2xl">
              {filename || "Media file"}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {contentType || "Media type unknown"}
              {fileSize ? " · " + (fileSize / 1024 / 1024).toFixed(1) + " MB" : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {source && (
              <a href={proxy}
                className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">
                Download
              </a>
            )}
            <Link to="/fastlink"
              className="inline-flex h-10 items-center rounded-full border px-5 text-sm font-medium hover:bg-muted">
              New link
            </Link>
          </div>
        </div>

        {!source ? (
          <p role="alert" className="text-destructive">
            This FastLink URL is invalid. Generate a fresh link from the original source.
          </p>
        ) : kind === "video" ? (
          <video controls playsInline preload="metadata" src={inline}
            className="aspect-video max-h-[75vh] w-full rounded-xl bg-black">
            Your browser cannot preview this video format.
          </video>
        ) : kind === "audio" ? (
          <div className="mx-auto flex w-full max-w-xl flex-col gap-6 rounded-xl border p-8">
            <p className="text-center font-medium">{filename}</p>
            <audio controls preload="metadata" src={inline} className="w-full">
              Your browser cannot preview this audio format.
            </audio>
          </div>
        ) : kind === "image" ? (
          <img src={inline} alt={filename}
            className="mx-auto max-h-[75vh] max-w-full rounded-xl object-contain" />
        ) : kind === "pdf" ? (
          <iframe src={inline} title={filename}
            className="h-[75vh] w-full rounded-xl border" />
        ) : (
          <div className="mx-auto max-w-xl rounded-xl border border-dashed p-10 text-center">
            <h2 className="text-lg font-semibold">Preview not available</h2>
            <p className="text-muted-foreground mt-2 text-sm">
              Download the file or open its original public URL.
            </p>
            <a href={source} target="_blank" rel="noreferrer"
              className="mt-4 inline-block text-sm font-semibold underline underline-offset-4">
              Open original source
            </a>
          </div>
        )}
      </main>
      <Footer />
    </div>
  )
}

export const Route = createFileRoute("/view/$encoded/$filename")({
  head: () => ({
    title: "Preview - FastLink",
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: FilePreview,
})
