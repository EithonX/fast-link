const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const UINT32_LIMIT = 0x100000000;

export type ArchiveKind = 'zip' | 'tar';
export type ArchiveCompression = 'stored' | 'deflate' | 'other';
export type ArchiveSizingStatus = 'verified' | 'estimated';
export type ArchiveSizingSource =
  | 'zip-local-header'
  | 'zip-central-directory'
  | 'tar-header'
  | 'unknown';

export const ARCHIVE_SIZING_WARNING =
  'Archive-backed analysis could not verify the inner file size. File size and bitrate may be inaccurate.';

export interface ArchiveEntryInspection {
  name: string;
  archiveKind: ArchiveKind;
  compression: ArchiveCompression;
  dataOffset?: number;
  compressedSize?: number;
  uncompressedSize?: number;
  sizeStatus: ArchiveSizingStatus;
  sizeSource: ArchiveSizingSource;
}

interface ZipExtraInfo {
  compressedSize?: number;
  uncompressedSize?: number;
  localHeaderOffset?: number;
}

const isZip = (buffer: Uint8Array) =>
  buffer.byteLength > 4 &&
  buffer[0] === 0x50 &&
  buffer[1] === 0x4b &&
  buffer[2] === 0x03 &&
  buffer[3] === 0x04;

const isTar = (buffer: Uint8Array) => {
  if (buffer.byteLength <= 262) return false;
  const ustarMagic = new TextDecoder().decode(buffer.subarray(257, 262));
  return ustarMagic === 'ustar';
};

const endsWithSlash = (value: string) =>
  value.slice(Math.max(0, value.length - 1)) === '/';

const readZip64Value = (data: Uint8Array, offset: number) => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const low = view.getUint32(offset, true);
  const high = view.getUint32(offset + 4, true);
  return high * UINT32_LIMIT + low;
};

const parseZipExtraInfo = (
  extra: Uint8Array,
  needsUncompressed: boolean,
  needsCompressed: boolean,
  needsOffset: boolean,
): ZipExtraInfo => {
  const view = new DataView(extra.buffer, extra.byteOffset, extra.byteLength);
  let offset = 0;

  while (offset + 4 <= extra.byteLength) {
    const headerId = view.getUint16(offset, true);
    const fieldSize = view.getUint16(offset + 2, true);
    const fieldStart = offset + 4;
    const fieldEnd = fieldStart + fieldSize;

    if (fieldEnd > extra.byteLength) break;

    if (headerId === 0x0001) {
      let cursor = fieldStart;
      const result: ZipExtraInfo = {};

      if (needsUncompressed && cursor + 8 <= fieldEnd) {
        result.uncompressedSize = readZip64Value(extra, cursor);
        cursor += 8;
      }
      if (needsCompressed && cursor + 8 <= fieldEnd) {
        result.compressedSize = readZip64Value(extra, cursor);
        cursor += 8;
      }
      if (needsOffset && cursor + 8 <= fieldEnd) {
        result.localHeaderOffset = readZip64Value(extra, cursor);
      }

      return result;
    }

    offset = fieldEnd;
  }

  return {};
};

const mapZipCompression = (method: number): ArchiveCompression => {
  if (method === 0) return 'stored';
  if (method === 8) return 'deflate';
  return 'other';
};

const parseCentralDirectoryEntry = (
  buffer: Uint8Array,
  offset: number,
): { entry: ArchiveEntryInspection; nextOffset: number } | null => {
  if (offset + 46 > buffer.byteLength) return null;

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (view.getUint32(offset, true) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
    return null;
  }

  const flags = view.getUint16(offset + 8, true);
  const method = view.getUint16(offset + 10, true);
  const compressedSize32 = view.getUint32(offset + 20, true);
  const uncompressedSize32 = view.getUint32(offset + 24, true);
  const fileNameLength = view.getUint16(offset + 28, true);
  const extraLength = view.getUint16(offset + 30, true);
  const commentLength = view.getUint16(offset + 32, true);
  const localHeaderOffset32 = view.getUint32(offset + 42, true);

  const fileNameStart = offset + 46;
  const extraStart = fileNameStart + fileNameLength;
  const commentStart = extraStart + extraLength;
  const nextOffset = commentStart + commentLength;
  if (nextOffset > buffer.byteLength) return null;

  const name = new TextDecoder().decode(
    buffer.subarray(fileNameStart, fileNameStart + fileNameLength),
  );
  const hasDataDescriptor = (flags & 0x08) !== 0;
  const zip64 = parseZipExtraInfo(
    buffer.subarray(extraStart, extraStart + extraLength),
    uncompressedSize32 === 0xffffffff,
    compressedSize32 === 0xffffffff,
    localHeaderOffset32 === 0xffffffff,
  );

  const compressedSize =
    compressedSize32 === 0xffffffff ? zip64.compressedSize : compressedSize32;
  const uncompressedSize =
    uncompressedSize32 === 0xffffffff
      ? zip64.uncompressedSize
      : uncompressedSize32;

  return {
    entry: {
      name,
      archiveKind: 'zip',
      compression: mapZipCompression(method),
      compressedSize,
      uncompressedSize,
      dataOffset: zip64.localHeaderOffset ?? localHeaderOffset32,
      sizeStatus:
        !hasDataDescriptor && uncompressedSize !== undefined
          ? 'verified'
          : 'estimated',
      sizeSource:
        !hasDataDescriptor && uncompressedSize !== undefined
          ? 'zip-central-directory'
          : 'unknown',
    },
    nextOffset,
  };
};

const findZipCentralDirectoryEntry = (
  tailBuffer: Uint8Array,
  name: string,
): ArchiveEntryInspection | null => {
  const view = new DataView(
    tailBuffer.buffer,
    tailBuffer.byteOffset,
    tailBuffer.byteLength,
  );

  for (let offset = 0; offset + 46 <= tailBuffer.byteLength; ) {
    if (view.getUint32(offset, true) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
      offset += 1;
      continue;
    }

    const parsed = parseCentralDirectoryEntry(tailBuffer, offset);
    if (!parsed) break;

    if (parsed.entry.name === name && !endsWithSlash(name)) {
      return parsed.entry;
    }

    offset = parsed.nextOffset;
  }

  return null;
};

const inspectZipArchiveEntry = (
  buffer: Uint8Array,
  tailBuffer?: Uint8Array,
): ArchiveEntryInspection | null => {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  let offset = 0;
  while (offset + 30 <= buffer.byteLength) {
    if (view.getUint32(offset, true) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE) {
      break;
    }

    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    const compressedSize32 = view.getUint32(offset + 18, true);
    const uncompressedSize32 = view.getUint32(offset + 22, true);
    const fileNameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const fileNameStart = offset + 30;
    const extraStart = fileNameStart + fileNameLength;
    const dataOffset = extraStart + extraLength;

    if (dataOffset > buffer.byteLength) break;

    const name = new TextDecoder().decode(
      buffer.subarray(fileNameStart, fileNameStart + fileNameLength),
    );
    const hasDataDescriptor = (flags & 0x08) !== 0;
    const zip64 = parseZipExtraInfo(
      buffer.subarray(extraStart, extraStart + extraLength),
      uncompressedSize32 === 0xffffffff,
      compressedSize32 === 0xffffffff,
      false,
    );
    const compressedSize =
      compressedSize32 === 0xffffffff ? zip64.compressedSize : compressedSize32;
    const uncompressedSize =
      uncompressedSize32 === 0xffffffff
        ? zip64.uncompressedSize
        : uncompressedSize32;

    if (!endsWithSlash(name)) {
      const entry: ArchiveEntryInspection = {
        name,
        archiveKind: 'zip',
        compression: mapZipCompression(method),
        dataOffset,
        compressedSize,
        uncompressedSize,
        sizeStatus:
          !hasDataDescriptor && uncompressedSize !== undefined
            ? 'verified'
            : 'estimated',
        sizeSource:
          !hasDataDescriptor && uncompressedSize !== undefined
            ? 'zip-local-header'
            : 'unknown',
      };

      if (entry.sizeStatus === 'estimated' && tailBuffer) {
        const centralDirectoryEntry = findZipCentralDirectoryEntry(
          tailBuffer,
          name,
        );
        if (
          centralDirectoryEntry?.uncompressedSize !== undefined &&
          centralDirectoryEntry.compressedSize !== undefined
        ) {
          entry.compressedSize = centralDirectoryEntry.compressedSize;
          entry.uncompressedSize = centralDirectoryEntry.uncompressedSize;
          entry.sizeStatus = 'verified';
          entry.sizeSource = 'zip-central-directory';
        }
      }

      return entry;
    }

    const headerSize = 30 + fileNameLength + extraLength;
    const skipSize = hasDataDescriptor ? 0 : (compressedSize ?? 0);
    offset += headerSize + skipSize;
  }

  return null;
};

const readTarString = (buffer: Uint8Array, start: number, length: number) => {
  let end = start;
  const limit = Math.min(start + length, buffer.byteLength);
  while (end < limit && buffer[end] !== 0) end += 1;
  return new TextDecoder().decode(buffer.subarray(start, end));
};

const readTarSize = (buffer: Uint8Array, offset: number) => {
  const sizeStr = readTarString(buffer, offset + 124, 12).trim();
  return parseInt(sizeStr || '0', 8) || 0;
};

const inspectTarArchiveEntry = (
  buffer: Uint8Array,
): ArchiveEntryInspection | null => {
  let offset = 0;
  let nextNameOverride: string | null = null;

  while (offset + 512 <= buffer.byteLength) {
    const typeFlag = String.fromCharCode(buffer[offset + 156] ?? 0);
    const size = readTarSize(buffer, offset);
    const dataOffset = offset + 512;
    const paddedSize = Math.ceil(size / 512) * 512;
    const defaultName = readTarString(buffer, offset, 100);
    const name = nextNameOverride ?? defaultName;
    nextNameOverride = null;

    if (!defaultName) {
      offset += 512;
      continue;
    }

    if (typeFlag === 'L') {
      if (dataOffset + size > buffer.byteLength) {
        return null;
      }
      nextNameOverride = readTarString(buffer, dataOffset, size);
      offset = dataOffset + paddedSize;
      continue;
    }

    if (typeFlag !== '5' && name && !endsWithSlash(name)) {
      return {
        name,
        archiveKind: 'tar',
        compression: 'stored',
        dataOffset,
        compressedSize: size,
        uncompressedSize: size,
        sizeStatus: 'verified',
        sizeSource: 'tar-header',
      };
    }

    offset = dataOffset + paddedSize;
  }

  return null;
};

export interface InspectArchiveEntryOptions {
  tailBuffer?: Uint8Array;
}

export const inspectArchiveEntry = (
  buffer: Uint8Array,
  options: InspectArchiveEntryOptions = {},
): ArchiveEntryInspection | null => {
  if (isZip(buffer)) {
    return inspectZipArchiveEntry(buffer, options.tailBuffer);
  }

  if (isTar(buffer)) {
    return inspectTarArchiveEntry(buffer);
  }

  return null;
};

export const extractFirstFileFromArchive = (buffer: Uint8Array) =>
  inspectArchiveEntry(buffer)?.name ?? null;
