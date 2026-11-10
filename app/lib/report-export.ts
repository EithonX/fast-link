export type ReportFormat = 'json' | 'text' | 'xml' | 'html';

const MIME_TYPES: Record<ReportFormat, string> = {
  json: 'application/json',
  text: 'text/plain',
  xml: 'application/xml',
  html: 'text/html',
};

export function mediaReportMimeType(format: ReportFormat): string {
  return MIME_TYPES[format] + ';charset=utf-8';
}

export function mediaReportFilename(
  name: string,
  format: ReportFormat,
): string {
  const basename = name.split(/[\\/]/).pop() || 'media-report';
  const cleaned = basename
    .replace(/[<>:"|?*]/g, '_')
    .replace(/\p{Cc}/gu, '_')
    .trim()
    .slice(0, 140) || 'media-report';

  return cleaned + '.mediainfo.' + (format === 'text' ? 'txt' : format);
}
