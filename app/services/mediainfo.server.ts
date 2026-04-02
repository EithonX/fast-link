import {
  ARCHIVE_SIZING_WARNING,
  type ArchiveEntryInspection,
  extractFirstFileFromArchive,
} from '~/lib/archive-inspection';
import { DiagnosticsError } from '~/lib/error-utils';
import {
  type FilenameSource,
  getMediaInfoMetadataFilename,
} from '~/lib/filename-resolution';
import { normalizeMediaInfo } from '~/lib/media-utils';
import {
  createMediaInfo,
  type MediaInfo,
} from '~/services/mediainfo-factory.server';

export interface MediaInfoResult extends Record<string, unknown> {
  media?: {
    track?: {
      '@type': string;
      CompleteName?: string;
      Complete_name?: string;
      File_Name?: string;
      Title?: string;
      Movie?: string;
      Archive_Name?: string;
      Archive_Sizing_Status?: 'verified' | 'estimated';
      Archive_Sizing_Source?:
        | 'zip-local-header'
        | 'zip-central-directory'
        | 'tar-header'
        | 'unknown';
      Archive_Sizing_Warning?: string;
      [key: string]: unknown;
    }[];
  };
}

export interface MediaInfoDiagnostics {
  wasmLoadTimeMs: number;
  factoryCreateTimeMs: number;
  formatGenerationTimes: Record<string, number>;
  totalAnalysisTimeMs: number;
  wasmLoadError?: string;
  objectProcessError?: string;
  formatErrors: Record<string, string>;
}

export interface MediaInfoAnalysis {
  results: Record<string, string>;
  diagnostics: MediaInfoDiagnostics;
  resolvedFilename: string;
  resolvedFilenameSource: FilenameSource;
}

export type MediaInfoFormat = 'object' | 'Text' | 'XML' | 'HTML';

class DisposableMediaInfo {
  public readonly instance: MediaInfo;

  constructor(instance: MediaInfo) {
    this.instance = instance;
  }

  dispose() {
    this.instance.close();
  }
}

export async function analyzeMediaBuffer(
  fileBuffer: Uint8Array,
  fileSize: number | undefined,
  filename: string,
  filenameSource: FilenameSource = 'url',
  requestedFormats: string[] = [],
  archiveEntry?: ArchiveEntryInspection,
  remoteReadChunk?: (size: number, offset: number) => Promise<Uint8Array>,
): Promise<MediaInfoAnalysis> {
  const tStart = performance.now();
  const effectiveFileSize = fileSize ?? fileBuffer.byteLength;

  const diagnostics: MediaInfoDiagnostics = {
    wasmLoadTimeMs: 0,
    factoryCreateTimeMs: 0,
    formatGenerationTimes: {},
    totalAnalysisTimeMs: 0,
    formatErrors: {},
  };

  let archiveInnerName: string | null = archiveEntry?.name ?? null;
  if (!archiveInnerName) {
    archiveInnerName = extractFirstFileFromArchive(fileBuffer);
  }

  let displayFilename = archiveInnerName ?? filename;
  let resolvedFilenameSource: FilenameSource = archiveInnerName
    ? 'archive-inner'
    : filenameSource;
  const archiveName = archiveInnerName ? filename : undefined;

  const readChunk = async (chunkSize: number, offset: number) => {
    if (remoteReadChunk) {
      return remoteReadChunk(chunkSize, offset);
    }

    if (offset >= fileBuffer.byteLength) {
      return new Uint8Array(0);
    }
    const end = Math.min(offset + chunkSize, fileBuffer.byteLength);
    return fileBuffer.subarray(offset, end);
  };

  const shouldGenerateAll =
    requestedFormats.includes('all') || requestedFormats.length === 0;

  const allFormats: { type: MediaInfoFormat; key: string }[] = [
    { type: 'object', key: 'json' },
    { type: 'Text', key: 'text' },
    { type: 'XML', key: 'xml' },
    { type: 'HTML', key: 'html' },
  ];

  const formatsToGenerate = allFormats.filter(
    (f) =>
      shouldGenerateAll ||
      requestedFormats.includes(f.key) ||
      requestedFormats.includes(f.type.toLowerCase()),
  );

  const results: Record<string, string> = {};

  if (formatsToGenerate.length === 0) {
    formatsToGenerate.push({ type: 'object', key: 'json' });
  }

  try {
    const tFactory = performance.now();
    const rawInstance = await createMediaInfo();
    const disposable = new DisposableMediaInfo(rawInstance);
    const infoInstance = disposable.instance;

    try {
      infoInstance.options.chunkSize = 5 * 1024 * 1024;
      infoInstance.options.coverData = false;

      diagnostics.factoryCreateTimeMs = Math.round(
        performance.now() - tFactory,
      );

      for (const { type, key } of formatsToGenerate) {
        const tFormat = performance.now();
        try {
          const formatStr = type === 'Text' ? 'text' : type;

          infoInstance.options.format = formatStr as 'object';
          infoInstance.options.full = type === 'object' || type === 'Text';

          infoInstance.reset();

          const resultData = await infoInstance.analyzeData(
            () => effectiveFileSize,
            readChunk,
          );
          let resultStr = '';

          if (type !== 'object') {
            resultStr = infoInstance.inform();
          }

          if (type === 'object') {
            try {
              const json = normalizeMediaInfo(resultData) as MediaInfoResult;

              if (json.media?.track) {
                const generalTrack = json.media.track.find(
                  (t) => t['@type'] === 'General',
                );

                if (generalTrack) {
                  const metadataFallback =
                    !archiveInnerName && filenameSource === 'url'
                      ? getMediaInfoMetadataFilename(generalTrack)
                      : undefined;

                  if (metadataFallback) {
                    displayFilename = metadataFallback.filename;
                    resolvedFilenameSource = metadataFallback.source;
                  }

                  generalTrack.CompleteName = displayFilename;

                  if (archiveName) {
                    generalTrack.Archive_Name = archiveName;
                  }
                  if (archiveEntry) {
                    generalTrack.Archive_Sizing_Status =
                      archiveEntry.sizeStatus;
                    generalTrack.Archive_Sizing_Source =
                      archiveEntry.sizeSource;
                    if (archiveEntry.sizeStatus === 'estimated') {
                      generalTrack.Archive_Sizing_Warning =
                        ARCHIVE_SIZING_WARNING;
                    }
                  }
                }
              }

              results[key] = JSON.stringify(json, null, 2);
            } catch (e) {
              diagnostics.objectProcessError =
                e instanceof Error ? e.message : String(e);
              results[key] = '{}';
            }
          } else if (type === 'Text') {
            if (!resultStr.includes('Complete name')) {
              const lines = resultStr.split('\n');
              const generalIndex = lines.findIndex((l: string) =>
                l.trim().startsWith('General'),
              );
              if (generalIndex !== -1) {
                let insertIndex = generalIndex + 1;
                for (let i = generalIndex + 1; i < lines.length; i++) {
                  if (lines[i].trim().startsWith('Unique ID')) {
                    insertIndex = i + 1;
                    break;
                  }
                  if (lines[i].trim() === '') break;
                }
                const padding = ' '.repeat(41 - 'Complete name'.length);
                lines.splice(
                  insertIndex,
                  0,
                  `Complete name${padding}: ${displayFilename}`,
                );
                resultStr = lines.join('\n');
              }
            }
            results[key] = resultStr;
          } else {
            results[key] = resultStr;
          }

          diagnostics.formatGenerationTimes[key] = Math.round(
            performance.now() - tFormat,
          );
        } catch (err) {
          diagnostics.formatErrors[key] =
            err instanceof Error ? err.message : String(err);
          results[key] = `Error generating ${type} view.`;
        }
      }
    } finally {
      disposable.dispose();
    }
  } catch (err) {
    diagnostics.wasmLoadError =
      err instanceof Error ? err.message : String(err);
    throw new DiagnosticsError(diagnostics.wasmLoadError, diagnostics, err);
  }

  diagnostics.totalAnalysisTimeMs = Math.round(performance.now() - tStart);
  return {
    results,
    diagnostics,
    resolvedFilename: displayFilename,
    resolvedFilenameSource,
  };
}
