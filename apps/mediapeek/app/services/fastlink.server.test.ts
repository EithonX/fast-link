import { makeFastLink } from "@mediapeek/shared/fastlink"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { safeMediaFetch } from "../../../mediapeek-analyzer/src/services/safe-media-fetch.server"
import { handleFastLinkRequest } from "./fastlink.server"

vi.mock(
  "../../../mediapeek-analyzer/src/services/safe-media-fetch.server",
  () => ({
    safeMediaFetch: vi.fn(),
  })
)

const remote = "https://media.example.org/video.mp4?token=temporary"
const origin = "https://dl.example.org"

const send = async (path: string, init?: RequestInit) => {
  const response = await handleFastLinkRequest(
    new Request(origin + path, init),
    {}
  )
  if (!response) throw new Error("FastLink route returned no response")
  return response
}

describe("FastLink compatibility routes", () => {
  beforeEach(() => vi.clearAllMocks())

  it("streams the original 206 status with Range and strips upstream cookies", async () => {
    vi.mocked(safeMediaFetch).mockResolvedValue(
      new Response(new Uint8Array([1, 2]), {
        status: 206,
        headers: {
          "Content-Range": "bytes 0-1/100",
          "Set-Cookie": "session=not-for-users",
          "Content-Type": "video/mp4",
        },
      })
    )

    const link = makeFastLink(origin, remote, "video.mp4")
    const response = await send(new URL(link).pathname, {
      headers: { Range: "bytes=0-1" },
    })

    expect(response.status).toBe(206)
    expect(response.headers.get("content-range")).toBe("bytes 0-1/100")
    expect(response.headers.has("set-cookie")).toBe(false)
    expect(response.headers.get("content-disposition")).toMatch(/^inline;/u)
    expect(await response.arrayBuffer()).toHaveProperty("byteLength", 2)
    expect(vi.mocked(safeMediaFetch).mock.calls[0][0]).toBe(remote)
    const init = vi.mocked(safeMediaFetch).mock.calls[0][1]
    expect(new Headers(init?.headers).get("Range")).toBe("bytes=0-1")
  })

  it("does not pretend a server supports ranges when it returns HTTP 200", async () => {
    vi.mocked(safeMediaFetch).mockResolvedValue(
      new Response("whole file", { status: 200 })
    )
    const response = await send(
      new URL(makeFastLink(origin, remote)).pathname,
      { headers: { Range: "bytes=0-2" } }
    )
    expect(response.status).toBe(200)
  })

  it("keeps /resources/proxy for existing clients", async () => {
    vi.mocked(safeMediaFetch).mockResolvedValue(
      new Response("ok", { status: 200 })
    )
    const response = await send(
      "/resources/proxy?url=" + encodeURIComponent(remote)
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toBe("ok")
  })

  it("reads file headers without downloading the full media", async () => {
    vi.mocked(safeMediaFetch).mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: {
          "Content-Length": "400",
          "Content-Disposition": "attachment; filename=video.mp4",
          "Content-Type": "video/mp4",
        },
      })
    )
    const response = await send("/info?url=" + encodeURIComponent(remote))
    expect(await response.json()).toEqual({
      filename: "video.mp4",
      size: 400,
      type: "video/mp4",
    })
    expect(vi.mocked(safeMediaFetch).mock.calls[0][1]?.method).toBe("HEAD")
  })

  it("blocks invalid encoded URL schemes", async () => {
    const invalid = encodeURIComponent(btoa("file:///etc/passwd"))
    const response = await send("/p/" + invalid)
    expect(response.status).toBe(400)
    expect(safeMediaFetch).not.toHaveBeenCalled()
  })

  it("requires explicit secrets for Telegram webhooks", async () => {
    const response = await send("/telegram", { method: "POST", body: "{}" })
    expect(response.status).toBe(503)
  })
})
