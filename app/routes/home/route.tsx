import type { MetaFunction } from 'react-router';

import { FastLinkForm } from '~/components/fastlink-form';

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
  return <FastLinkForm />;
}
