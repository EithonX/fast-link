/**
 * Type definitions for the MediaInfoLib WASM module.
 * Replaces all `any` types in MediaInfo.ts.
 */

/** Instance created by `new module.MediaInfo(format, coverData, full)` */
export interface MediaInfoModuleInstance {
  Option(option: string, value: string): string;
  inform(): string;
  open_buffer_init(size: number, offset: number): void;
  open_buffer_continue(data: Uint8Array, size: number): number;
  open_buffer_continue_goto_get_lower(): number;
  open_buffer_continue_goto_get_upper(): number;
  open_buffer_finalize(): void;
  close(): void;
  delete(): void;
}

/** The WASM module itself (loaded by mediainfo-factory) */
export interface MediaInfoModule {
  MediaInfo: new (
    format: string,
    coverData: boolean,
    full: boolean,
  ) => MediaInfoModuleInstance;
}
