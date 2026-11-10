import { TriangleAlert } from 'lucide-react';

import type { MediaTrackJSON } from '~/types/media';

import { MediaDetailItem } from './media-detail-item';

interface GeneralSectionProps {
  generalTrack?: MediaTrackJSON;
}

export function GeneralSection({ generalTrack }: GeneralSectionProps) {
  if (!generalTrack) return null;

  const archiveWarning =
    generalTrack['Archive_Sizing_Status'] === 'estimated'
      ? typeof generalTrack['Archive_Sizing_Warning'] === 'string'
        ? generalTrack['Archive_Sizing_Warning']
        : 'The archive entry size could not be verified. Size and bitrate values may be inaccurate.'
      : null;

  return (
    <section className="space-y-4">
      <div className="text-foreground mb-2 flex items-center gap-2">
        <h2 className="mb-3 text-xl font-semibold tracking-tight">Container</h2>
      </div>
      {archiveWarning && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-amber-300/60 bg-amber-50/60 p-4 text-sm text-amber-950 dark:border-amber-700/50 dark:bg-amber-950/20 dark:text-amber-100"
        >
          <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold">Archive metadata is estimated</p>
            <p className="opacity-85">{archiveWarning}</p>
          </div>
        </div>
      )}
      <div className="border-border grid gap-x-8 gap-y-6 rounded-lg border p-6 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {(generalTrack['Format'] || generalTrack['Format_Profile']) && (
          <MediaDetailItem label="Format">
            <div className="flex flex-col">
              {(generalTrack['Format_Info'] || generalTrack['Format']) && (
                <span className="text-foreground/85 font-semibold">
                  {generalTrack['Format_Info'] || generalTrack['Format']}
                </span>
              )}
              {generalTrack['Format_Profile'] && (
                <span className="text-muted-foreground text-xs font-normal">
                  {generalTrack['Format_Profile']}
                </span>
              )}
              {generalTrack['Format_Version'] && (
                <span className="text-muted-foreground text-xs font-normal">
                  Version {generalTrack['Format_Version']}
                </span>
              )}
            </div>
          </MediaDetailItem>
        )}

        {(generalTrack['CodecID'] || generalTrack['CodecID_Compatible']) && (
          <MediaDetailItem label="Codec ID">
            <div className="flex flex-col">
              {generalTrack['CodecID'] && (
                <span className="text-foreground/85 font-semibold">
                  {generalTrack['CodecID']}
                </span>
              )}
              {generalTrack['CodecID_Compatible'] && (
                <span className="text-muted-foreground text-xs font-normal">
                  {generalTrack['CodecID_Compatible']}
                </span>
              )}
            </div>
          </MediaDetailItem>
        )}

        {generalTrack['Archive_Name'] && (
          <MediaDetailItem label="Inside archive" value={String(generalTrack['Archive_Name'])} />
        )}

        {generalTrack['Encoded_Date'] && (
          <MediaDetailItem
            label="Encoded Date"
            value={generalTrack['Encoded_Date']}
          />
        )}

        {generalTrack['Encoded_Application'] && (
          <MediaDetailItem
            label="Encoded Application"
            value={generalTrack['Encoded_Application']}
          />
        )}
      </div>
    </section>
  );
}
