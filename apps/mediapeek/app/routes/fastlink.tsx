"use client"

import {
  extractFilenameFromUrl,
} from "@mediapeek/shared/filename-resolution"
import { makeFastLink, parseFastLinkUrl } from "@mediapeek/shared/fastlink"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useState, type FormEvent } from "react"

import { Footer } from "~/components/footer"
import { Header } from "~/components/header"
import { Button } from "~/components/ui/button"
import { useHistory } from "~/features/fastlink/use-history"

interface FileInfo {
  filename: string
  size: number
  type: string
}

interface LinkResult {
  source: string
  filename: string
  size: number
  type: string
  link: string
}

const sizeLabel = (size: number): string => {
  if (!Number.isFinite(size) || size <= 0) return "Size unavailable"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let value = size
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return value.toFixed(index === 0 ? 0 : 1) + " " + units[index]
}

const previewUrl = (link: string) => link.replace("/p/", "/view/")

function FastLinkPage() {
  const [input, setInput] = useState("")
  const [result, setResult] = useState<LinkResult | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const { history, addToHistory, removeFromHistory, clearHistory } = useHistory()

  const generate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setNotice("")
    setResult(null)
    setCopied(false)

    let source: string
    try {
      source = parseFastLinkUrl(input.trim())
    } catch {
      setError("Enter a direct HTTP or HTTPS file URL without credentials.")
      return
    }

    setBusy(true)
    let info: FileInfo | null = null
    try {
      const response = await fetch("/info?url=" + encodeURIComponent(source))
      if (response.ok) {
        info = (await response.json()) as FileInfo
      } else {
        setNotice("The file server did not provide metadata. The link is still available.")
      }
    } catch {
      setNotice("Metadata is unavailable. You can still generate the link.")
    } finally {
      setBusy(false)
    }

    const filename = info?.filename || extractFilenameFromUrl(source) || "download"
    const link = makeFastLink(window.location.origin, source, filename)
    const size = info?.size ?? 0
    setResult({
      source, filename, size, type: info?.type || "Unknown",
      link,
    })
    addToHistory({
      url: source,
      fastLink: link,
      filename,
      fileSize: sizeLabel(size),
      sizeBytes: size,
    })
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setError("Clipboard access was denied. Select and copy the link manually.")
    }
  }

  const restore = (item: (typeof history)[number]) => {
    setInput(item.url)
    setResult({
      source: item.url,
      filename: item.filename,
      size: item.sizeBytes ?? 0,
      type: "Unknown",
      link: item.fastLink,
    })
    setError("")
    setNotice("")
    setCopied(false)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <div className="flex min-h-screen flex-col font-sans">
      <Header />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-10 md:px-8 md:py-14 lg:px-10">
        <div className="max-w-2xl space-y-4">
          <span className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
            FastLink / Link generator
          </span>
          <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
            Make a direct link easier to use.
          </h1>
          <p className="text-muted-foreground max-w-xl leading-relaxed">
            Generate a shareable, resumable link for a public media file. Preview it,
            copy it, or open it in a download manager. Existing FastLink URLs still work.
          </p>
        </div>

        <section className="rounded-2xl border border-border bg-card p-5 sm:p-7">
          <form onSubmit={(event) => void generate(event)} className="space-y-4">
            <label htmlFor="fastlink-url" className="block text-sm font-medium">
              Direct file URL
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                id="fastlink-url"
                value={input}
                onChange={(event) => setInput(event.currentTarget.value)}
                type="url"
                inputMode="url"
                autoComplete="off"
                placeholder="https://example.com/video.mp4"
                className="border-input bg-background h-12 min-w-0 flex-1 rounded-lg border px-4 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                required
                aria-describedby={error ? "fastlink-error" : undefined}
                aria-invalid={Boolean(error)}
              />
              <Button type="submit" disabled={busy} size="lg" className="h-12 px-6">
                {busy ? "Checking file…" : "Generate link"}
              </Button>
            </div>
            {error && (
              <p role="alert" id="fastlink-error" className="text-destructive text-sm">
                {error}
              </p>
            )}
            {notice && <p role="status" className="text-muted-foreground text-sm">{notice}</p>}
          </form>

          {result && (
            <div className="mt-8 space-y-5 border-t pt-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                    Ready to use
                  </p>
                  <p className="mt-1 break-all text-base font-semibold">{result.filename}</p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {sizeLabel(result.size)} · {result.type}
                  </p>
                </div>
                <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                  Range-aware streaming
                </span>
              </div>

              <label className="block text-sm font-medium" htmlFor="generated-fastlink">
                Your FastLink
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="generated-fastlink"
                  readOnly
                  value={result.link}
                  onFocus={(event) => event.currentTarget.select()}
                  className="bg-muted/40 border-input h-11 min-w-0 flex-1 rounded-lg border px-3 text-sm"
                />
                <Button onClick={() => void copy(result.link)} variant="outline" type="button">
                  {copied ? "Copied" : "Copy link"}
                </Button>
              </div>

              <div className="flex flex-wrap gap-3">
                <a href={result.link} target="_blank" rel="noreferrer"
                  className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-85">
                  Download
                </a>
                <a href={previewUrl(result.link)}
                  className="inline-flex h-10 items-center rounded-full border px-5 text-sm font-medium hover:bg-muted">
                  Preview file
                </a>
                <a href={"/app?url=" + encodeURIComponent(result.source)}
                  className="inline-flex h-10 items-center rounded-full border px-5 text-sm font-medium hover:bg-muted">
                  Analyze metadata
                </a>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-5" aria-labelledby="fastlink-history">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="fastlink-history" className="font-heading text-2xl font-semibold">
                Recent links
              </h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Saved only in this browser. Existing FastLink history is preserved.
              </p>
            </div>
            {history.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearHistory}>
                Clear history
              </Button>
            )}
          </div>
          {history.length === 0 ? (
            <div className="border-border rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
              Generated links will appear here.
            </div>
          ) : (
            <ol className="divide-y divide-border rounded-xl border">
              {history.slice(0, 12).map((item) => (
                <li key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{item.filename}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {item.url} · {item.fileSize || "Size unavailable"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => restore(item)}>
                      Open
                    </Button>
                    <Button variant="ghost" size="sm"
                      onClick={() => removeFromHistory(item.id)}
                      aria-label={"Remove " + item.filename}>
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
      <Footer />
    </div>
  )
}

export const Route = createFileRoute("/fastlink")({
  head: () => ({
    title: "Fast Links - FastLink",
    meta: [{ name: "description", content: "Generate and manage direct FastLink downloads." }],
  }),
  component: FastLinkPage,
})
