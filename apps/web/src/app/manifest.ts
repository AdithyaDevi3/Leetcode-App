import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Method',
    short_name: 'Method',
    description: 'A pseudocode-first practice workspace for algorithms and system design.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#0f172a',
  };
}
