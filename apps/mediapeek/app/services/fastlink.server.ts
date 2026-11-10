import {
  extractFilenameFromUrl,
  isValidFilename,
  parseContentDispositionFilename,
} from "@mediapeek/shared/filename-resolution"

import { safeMediaFetch } from "../../../mediapeek-analyzer/src/services/safe-media-fetch.server"

interface FastLinkEnvironment {
  BOT_TOKEN?: string
  TELEGRAM_WEBHOOK_SECRET?: string
  WORKER_BASE_URL?: string
}

interface FileInfo {
  filename: string
  size: number
  type: string
}

const MAX_ENCODED_URL_LENGTH = 12_000
const MAX_TELEGRAM_BODY_BYTES = 16_384
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])
const PROXY_PATH = "/resources/proxy"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type",
  "Access-Control-Expose-Headers":
    "Accept-Ranges, Content-Length, Content-Range, Content-Disposition, Content-Type",
}

const textResponse = (message: string, status = 400) =>
  new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })

const parsePublicUrl = (value: string) => {
  const parsed = new URL(value)
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are supported.")
  }

  return parsed.toString()
}

export const encodeFastLinkUrl = (source: string) =>
  encodeURIComponent(btoa(parsePublicUrl(source)))

export const decodeFastLinkUrl = (encoded: string): string => {
  if (encoded.length === 0 || encoded.length > MAX_ENCODED_URL_LENGTH) {
    throw new Error("Invalid FastLink URL.")
  }

  return parsePublicUrl(atob(decodeURIComponent(encoded)))
}

export const makeFastLink = (
  baseUrl: string,
  source: string,
  filename?: string
) => {
  const name = filename?.trim() || extractFilenameFromUrl(source)
  const path = "/p/" + encodeFastLinkUrl(source)
  return baseUrl.replace(/\/+$/u, "") +
    path + (isValidFilename(name) ? "/" + encodeURIComponent(name) : "")
}

const resolveSize = (response: Response) => {
  const contentRange = response.headers.get("content-range")
  const total = contentRange?.match(/\/(\d+)$/u)?.[1]
  const raw = total ?? response.headers.get("content-length")
  const number = Number(raw)
  return Number.isSafeInteger(number) && number > 0 ? number : 0
}

const cleanFilename = (name: string) =>
  name.replace(/[\r\n"\\]/gu, "_").slice(0, 240) || "download"

const getFileInfo = async (source: string): Promise<FileInfo> => {
  let response = await safeMediaFetch(source, {
    method: "HEAD",
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok || (!response.headers.has("content-length") &&
    !response.headers.has("content-type"))) {
    void response.body?.cancel()
    response = await safeMediaFetch(source, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      signal: AbortSignal.timeout(20_000),
    })
  }

  if (!response.ok) {
    void response.body?.cancel()
    throw new Error("The source returned HTTP " + response.status)
  }

  const filename = parseContentDispositionFilename(
    response.headers.get("content-disposition")
  ) || extractFilenameFromUrl(response.url || source) || "download"

  const info: FileInfo = {
    filename: cleanFilename(filename),
    size: resolveSize(response),
    type: response.headers.get("content-type") ?? "application/octet-stream",
  }
  void response.body?.cancel()
  return info
}

async function handleInfo(url: URL, request: Request) {
  if (request.method !== "GET") {
    return textResponse("Method not allowed", 405)
  }
  const source = url.searchParams.get("url")
  if (!source) {
    return Response.json({ error: "Missing URL parameter" }, { status: 400 })
  }

  try {
    const info = await getFileInfo(parsePublicUrl(source))
    return Response.json(info, {
      headers: { "Cache-Control": "no-store", ...corsHeaders },
    })
  } catch {
    return Response.json(
      { error: "Could not retrieve metadata for this public URL." },
      { status: 422, headers: { "Cache-Control": "no-store" } }
    )
  }
}

const copyProxyHeaders = (response: Response) => {
  const headers = new Headers(response.headers)
  for (const key of [
    "set-cookie", "set-cookie2", "content-security-policy",
    "access-control-allow-origin", "access-control-allow-credentials",
    "connection", "transfer-encoding", "keep-alive",
  ]) {
    headers.delete(key)
  }

  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value)
  }
  headers.set("X-Content-Type-Options", "nosniff")
  if (!response.headers.has("cache-control")) {
    headers.set("Cache-Control", "private, no-store")
  }

  return headers
}

async function handleProxy(
  request: Request,
  source: string,
  filename?: string,
  forceInline = false
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (!SAFE_METHODS.has(request.method)) {
    return textResponse("Method not allowed", 405)
  }

  try {
    const headers = new Headers()
    const range = request.headers.get("range")
    if (range) headers.set("Range", range)

    const response = await safeMediaFetch(parsePublicUrl(source), {
      method: request.method,
      headers,
      signal: request.signal,
    })

    const outboundHeaders = copyProxyHeaders(response)
    if (filename) {
      const safeFilename = cleanFilename(filename)
      const disposition =
        forceInline || range ? "inline" : "attachment"
      outboundHeaders.set(
        "Content-Disposition",
        disposition + '; filename="' + safeFilename.replace(/[^\x20-\x7E]/gu, "_") +
          '"; filename*=UTF-8' + "''" + encodeURIComponent(safeFilename)
      )
    }
    const noBody = request.method === "HEAD" ||
      response.status === 204 || response.status === 304
    return new Response(noBody ? null : response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: outboundHeaders,
    })
  } catch {
    return textResponse("Unable to fetch this public media URL.", 502)
  }
}

const matchLegacyProxy = (pathname: string) =>
  pathname === PROXY_PATH || pathname === PROXY_PATH + "/"

const handleTelegram = async (
  request: Request,
  env: FastLinkEnvironment
): Promise<Response> => {
  // No webhook handling without both secrets. Never expose the token in responses.
  if (!env.BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) {
    return textResponse("Telegram integration is not configured.", 503)
  }
  if (
    request.headers.get("x-telegram-bot-api-secret-token") !==
    env.TELEGRAM_WEBHOOK_SECRET
  ) {
    return textResponse("Unauthorized.", 401)
  }

  try {
    const text = await request.text()
    if (text.length > MAX_TELEGRAM_BODY_BYTES) {
      return textResponse("Request too large.", 413)
    }
    const payload: unknown = JSON.parse(text)
    if (!payload || typeof payload !== "object" || !("message" in payload)) {
      return textResponse("OK", 200)
    }
    const message = payload.message
    if (!message || typeof message !== "object" ||
      !("text" in message) || typeof message.text !== "string" ||
      !("chat" in message) || !message.chat ||
      typeof message.chat !== "object" ||
      !("id" in message.chat) || typeof message.chat.id !== "number") {
      return textResponse("OK", 200)
    }

    const mediaUrl = parsePublicUrl(message.text.trim())
    const info = await getFileInfo(mediaUrl)
    const baseUrl = env.WORKER_BASE_URL?.trim() || new URL(request.url).origin
    const fastLink = makeFastLink(baseUrl, mediaUrl, info.filename)
    const textBody = info.filename + "\n" +
      (info.size ? String(info.size) + " bytes\n" : "") + fastLink
    const sent = await fetch(
      "https://api.telegram.org/bot" + env.BOT_TOKEN + "/sendMessage",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: message.chat.id, text: textBody }),
      }
    )
    return textResponse(sent.ok ? "OK" : "Telegram delivery failed.",
      sent.ok ? 200 : 502)
  } catch {
    return textResponse("Unable to process this URL.", 422)
  }
}

export async function handleFastLinkRequest(
  request: Request,
  env: FastLinkEnvironment
): Promise<Response | null> {
  const url = new URL(request.url)
  const { pathname } = url

  if (pathname === "/info") return handleInfo(url, request)

  if (matchLegacyProxy(pathname)) {
    const source = url.searchParams.get("url")
    if (!source) return textResponse("Missing URL parameter.")
    return handleProxy(request, source, undefined, true)
  }

  if (pathname.startsWith("/p/")) {
    const parts = pathname.split("/").filter(Boolean)
    if (parts.length < 2 || parts.length > 3) {
      return textResponse("Invalid FastLink path.")
    }
    try {
      const source = decodeFastLinkUrl(parts[1])
      const filename = parts[2] ? decodeURIComponent(parts[2]) : undefined
      return handleProxy(request, source, filename, url.searchParams.has("inline"))
    } catch {
      return textResponse("Invalid encoded FastLink URL.")
    }
  }

  if (pathname === "/telegram") {
    return request.method === "POST"
      ? handleTelegram(request, env)
      : textResponse("Method not allowed", 405)
  }

  return null
}
