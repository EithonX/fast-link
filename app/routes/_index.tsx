import { useEffect, useState } from 'react';
import type { MetaFunction } from 'react-router';

import { FastLinkForm } from '../components/fastlink-form';

export const meta: MetaFunction = () => {
  return [
    { title: 'FastLink - Fast Download Links' },
    {
      name: 'description',
      content:
        'Generate fast download links through Cloudflare with media info and analysis.',
    },
  ];
};

export default function Index() {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return (
      <div className="flex min-h-screen flex-col">
        <div className="border-b px-4 py-3">
          <div className="bg-muted h-8 w-24 animate-pulse rounded" />
        </div>
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="w-full max-w-xl space-y-4">
            <div className="bg-muted h-16 animate-pulse rounded-lg" />
            <div className="bg-muted h-12 animate-pulse rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  return <FastLinkForm />;
}
