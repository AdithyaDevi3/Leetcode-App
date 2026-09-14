'use client';

import { useEffect, useState } from 'react';

export type Viewer = {
  id: string;
  email: string | null;
  displayName: string | null;
};

export function useViewer(): Viewer | null {
  const [viewer, setViewer] = useState<Viewer | null>(null);

  useEffect(() => {
    let current = true;
    void fetch('/api/viewer')
      .then(async (response) => response.ok ? response.json() : { viewer: null })
      .then((body: { viewer?: Viewer | null }) => {
        if (current) setViewer(body.viewer ?? null);
      })
      .catch(() => {
        if (current) setViewer(null);
      });
    return () => { current = false; };
  }, []);

  return viewer;
}
