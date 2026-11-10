import { extractFilenameFromUrl, isValidFilename } from "./filename-resolution"

const MAX_ENCODED_URL_LENGTH = 12_000

export const parseFastLinkUrl = (source: string): string => {
  const target = new URL(source)
  if (
    (target.protocol !== "http:" && target.protocol !== "https:") ||
    target.username ||
    target.password
  ) {
    throw new Error("Only public HTTP(S) links without embedded credentials are supported.")
  }

  return target.toString()
}

export const encodeFastLinkUrl = (source: string): string =>
  encodeURIComponent(btoa(parseFastLinkUrl(source)))

export const decodeFastLinkUrl = (encoded: string): string => {
  if (encoded.length === 0 || encoded.length > MAX_ENCODED_URL_LENGTH) {
    throw new Error("Invalid FastLink URL.")
  }
  return parseFastLinkUrl(atob(decodeURIComponent(encoded)))
}

export const makeFastLink = (
  baseUrl: string,
  source: string,
  filename?: string
): string => {
  const canonicalUrl = parseFastLinkUrl(source)
  const name = filename?.trim() || extractFilenameFromUrl(canonicalUrl)
  const suffix = isValidFilename(name)
    ? "/" + encodeURIComponent(name)
    : ""
  return (
    baseUrl.replace(/\/+$/u, "") +
    "/p/" + encodeFastLinkUrl(canonicalUrl) + suffix
  )
}
