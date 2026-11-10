import { describe, expect, it } from "vitest"

import { decodeFastLinkUrl, makeFastLink, parseFastLinkUrl } from "./fastlink"

describe("FastLink URL compatibility", () => {
  it("keeps the /p/ format used by existing links", () => {
    const source = "https://files.example.org/media/trailer.mp4?key=a%2Fb"
    const fastLink = makeFastLink(
      "https://dl.example.org/",
      source,
      "trailer.mp4"
    )
    const part = new URL(fastLink).pathname.split("/")[2]
    expect(decodeFastLinkUrl(part)).toBe(source)
    expect(fastLink).toContain("/p/")
    expect(fastLink).toContain("/trailer.mp4")
  })

  it("round-trips internationalized HTTP URLs", () => {
    const source = "https://example.org/ভিডিও.mp4"
    const fastLink = makeFastLink("https://dl.example.org", source)
    expect(decodeFastLinkUrl(new URL(fastLink).pathname.split("/")[2])).toBe(
      parseFastLinkUrl(source)
    )
  })

  it("rejects unsafe or corrupt schemes and user credentials", () => {
    expect(() => parseFastLinkUrl("file:///etc/passwd")).toThrow()
    expect(() => parseFastLinkUrl("https://user:pass@example.org/a")).toThrow()
    expect(() => decodeFastLinkUrl("not-base64")).toThrow()
  })
})
