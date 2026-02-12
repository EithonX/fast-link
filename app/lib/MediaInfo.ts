import { unknownToError } from './error';
import { FLOAT_FIELDS, INT_FIELDS } from './MediaInfoResult.js';

import type {
  MediaInfoModule,
  MediaInfoModuleInstance,
} from '~/types/mediainfo-wasm';

const MAX_UINT32_PLUS_ONE = 2 ** 32;

/** Format of the result type */
const FORMAT_CHOICES = ['JSON', 'XML', 'HTML', 'text'];

interface MediaInfoOptions {
  coverData?: boolean;
  chunkSize: number;
  format?: 'object' | 'JSON' | 'XML' | 'HTML' | 'text';
  full?: boolean;
}

const DEFAULT_OPTIONS: MediaInfoOptions = {
  coverData: false,
  chunkSize: 256 * 1024,
  format: 'object',
  full: false,
};

type ReadChunkCallback = (
  size: number,
  offset: number,
) => Uint8Array | Promise<Uint8Array>;
type AnalyzeCallback = (result: unknown, error?: Error) => void;

/**
 * Wrapper for the MediaInfoLib WASM module.
 *
 * This class should not be instantiated directly. Use the {@link mediaInfoFactory} function
 * to create instances of `MediaInfo`.
 */
class MediaInfo {
  private readonly mediainfoModule: MediaInfoModule;
  private mediainfoModuleInstance: MediaInfoModuleInstance;

  isAnalyzing = false;
  options: MediaInfoOptions;

  /**
   * @hidden
   * @param mediainfoModule WASM module
   * @param options User options
   */
  constructor(mediainfoModule: MediaInfoModule, options: MediaInfoOptions) {
    this.mediainfoModule = mediainfoModule;
    this.options = options;
    this.mediainfoModuleInstance = this.instantiateModuleInstance();
  }

  /**
   * Convenience method for analyzing a buffer chunk by chunk.
   */
  analyzeData(
    size: number | (() => number | Promise<number>),
    readChunk: ReadChunkCallback,
  ): Promise<unknown>;
  analyzeData(
    size: number | (() => number | Promise<number>),
    readChunk: ReadChunkCallback,
    callback: AnalyzeCallback,
  ): void;
  analyzeData(
    size: number | (() => number | Promise<number>),
    readChunk: ReadChunkCallback,
    callback?: AnalyzeCallback,
  ): Promise<unknown> | void {
    if (callback === undefined) {
      return new Promise((resolve, reject) => {
        const resultCb = (result: unknown, error?: Error) => {
          this.isAnalyzing = false;
          if (error || !result) {
            reject(unknownToError(error));
          } else {
            resolve(result);
          }
        };
        this.analyzeData(size, readChunk, resultCb);
      });
    }

    if (this.isAnalyzing) {
      callback(
        '',
        new Error('cannot start a new analysis while another is in progress'),
      );
      return;
    }
    this.reset();
    this.isAnalyzing = true;

    const finalize = () => {
      try {
        this.openBufferFinalize();
        const result = this.inform();
        if (this.options.format === 'object') {
          callback(this.parseResultJson(result));
        } else {
          callback(result);
        }
      } finally {
        this.isAnalyzing = false;
      }
    };

    let offset = 0;
    const runReadDataLoop = (fileSize: number) => {
      const readNextChunk = (data: Uint8Array) => {
        if (continueBuffer(data)) {
          getChunk();
        } else {
          finalize();
        }
      };

      const getChunk = () => {
        let dataValue;
        try {
          const safeSize = Math.min(this.options.chunkSize, fileSize - offset);
          dataValue = readChunk(safeSize, offset);
        } catch (error) {
          this.isAnalyzing = false;
          callback('', unknownToError(error));
          return;
        }
        if (dataValue instanceof Promise) {
          dataValue.then(readNextChunk).catch((error) => {
            this.isAnalyzing = false;
            callback('', unknownToError(error));
          });
        } else {
          readNextChunk(dataValue);
        }
      };

      const continueBuffer = (data: Uint8Array) => {
        if (data.length === 0 || this.openBufferContinue(data, data.length)) {
          return false;
        }
        const seekTo = this.openBufferContinueGotoGet();
        if (seekTo === -1) {
          offset += data.length;
        } else {
          offset = seekTo;
          this.openBufferInit(fileSize, seekTo);
        }
        return true;
      };

      this.openBufferInit(fileSize, offset);
      getChunk();
    };

    const fileSizeValue = typeof size === 'function' ? size() : size;
    if (fileSizeValue instanceof Promise) {
      fileSizeValue.then(runReadDataLoop).catch((error) => {
        callback(null, unknownToError(error));
      });
    } else {
      runReadDataLoop(fileSizeValue as number);
    }
  }

  /**
   * Set a MediaInfo option.
   */
  setOption(option: string, value: string): string {
    if (typeof this.mediainfoModuleInstance.Option === 'function') {
      return this.mediainfoModuleInstance.Option(option, value);
    }
    return '';
  }

  /**
   * Close the MediaInfoLib WASM instance.
   */
  close(): void {
    if (typeof this.mediainfoModuleInstance.close === 'function') {
      this.mediainfoModuleInstance.close();
    }
  }

  /**
   * Reset the MediaInfoLib WASM instance to its initial state.
   */
  reset(): void {
    this.mediainfoModuleInstance.delete();
    this.mediainfoModuleInstance = this.instantiateModuleInstance();
  }

  /**
   * Receive result data from the WASM instance.
   */
  inform(): string {
    return this.mediainfoModuleInstance.inform();
  }

  /**
   * Send more data to the WASM instance.
   */
  openBufferContinue(data: Uint8Array, size: number): boolean {
    return !!(
      this.mediainfoModuleInstance.open_buffer_continue(data, size) & 0x08
    );
  }

  /**
   * Retrieve seek position from WASM instance.
   */
  openBufferContinueGotoGet(): number {
    let seekTo = -1;
    const seekToLow =
      this.mediainfoModuleInstance.open_buffer_continue_goto_get_lower();
    const seekToHigh =
      this.mediainfoModuleInstance.open_buffer_continue_goto_get_upper();
    if (seekToLow === -1 && seekToHigh === -1) {
      seekTo = -1;
    } else if (seekToLow < 0) {
      seekTo =
        seekToLow + MAX_UINT32_PLUS_ONE + seekToHigh * MAX_UINT32_PLUS_ONE;
    } else {
      seekTo = seekToLow + seekToHigh * MAX_UINT32_PLUS_ONE;
    }
    return seekTo;
  }

  /**
   * Inform MediaInfoLib that no more data is being read.
   */
  openBufferFinalize(): void {
    this.mediainfoModuleInstance.open_buffer_finalize();
  }

  /**
   * Prepare MediaInfoLib to process a data buffer.
   */
  openBufferInit(size: number, offset: number): void {
    this.mediainfoModuleInstance.open_buffer_init(size, offset);
  }

  /**
   * Parse result JSON. Convert integer/float fields.
   */
  parseResultJson(resultString: string): Record<string, unknown> {
    const result = JSON.parse(resultString) as Record<string, unknown>;

    if (!result.media || typeof result.media !== 'object') {
      return result;
    }

    const media = result.media as Record<string, unknown>;
    const tracks = media.track;
    if (!Array.isArray(tracks)) {
      return result;
    }

    const newMedia = {
      ...media,
      track: tracks.map((track: Record<string, unknown>) => {
        const newTrack: Record<string, unknown> = {
          '@type': track['@type'],
        };
        for (const [key, val] of Object.entries(track)) {
          if (key === '@type') continue;

          if (typeof val === 'string' && INT_FIELDS.includes(key)) {
            newTrack[key] = Number.parseInt(val, 10);
          } else if (typeof val === 'string' && FLOAT_FIELDS.includes(key)) {
            newTrack[key] = Number.parseFloat(val);
          } else {
            newTrack[key] = val;
          }
        }
        return newTrack;
      }),
    };

    return { ...result, media: newMedia };
  }

  /**
   * Instantiate a new WASM module instance.
   */
  private instantiateModuleInstance(): MediaInfoModuleInstance {
    return new this.mediainfoModule.MediaInfo(
      this.options.format === 'object' ? 'JSON' : (this.options.format ?? 'JSON'),
      this.options.coverData ?? false,
      this.options.full ?? false,
    );
  }
}

export { DEFAULT_OPTIONS, FORMAT_CHOICES };
export default MediaInfo;
