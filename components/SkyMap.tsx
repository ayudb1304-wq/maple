'use client';

import { useEffect, useRef, useState } from 'react';

import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * Presentational dark map (ARCHITECTURE.md "Client map").
 *
 * OpenFreeMap has no SLA, so degrading gracefully is mandatory, not optional:
 * any tile or style failure hides the whole block and leaves the verdict panel
 * untouched. MapLibre itself is imported inside the effect so its ~200KB never
 * lands in the landing page's initial JS.
 */

type Props = {
  latitude: number;
  longitude: number;
  label?: string | null;
};

const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';
/** If the style has not loaded by now, assume it is not coming. */
const LOAD_TIMEOUT_MS = 8_000;

export default function SkyMap({ latitude, longitude, label }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ remove: () => void; flyTo: (o: unknown) => void } | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    (async () => {
      try {
        const maplibre = (await import('maplibre-gl')).default;
        if (cancelled || !containerRef.current) return;

        const map = new maplibre.Map({
          container: containerRef.current,
          style: STYLE_URL,
          center: [longitude, latitude],
          zoom: 8.5,
          attributionControl: false,
          // Purely presentational in v1: no panning, no zooming, no scroll trap.
          interactive: false,
        });

        // Attribution is a hard requirement, not a default we can drop. The
        // OpenFreeMap style already declares OSM/OpenMapTiles credit on its
        // sources, so the control is added empty — passing customAttribution
        // here as well renders the same credits twice.
        map.addControl(new maplibre.AttributionControl({ compact: true }));

        new maplibre.Marker({ color: '#00d5be' }).setLngLat([longitude, latitude]).addTo(map);

        map.on('load', () => {
          if (!cancelled) {
            clearTimeout(timer);
            setReady(true);
          }
        });

        // Fired for style and tile failures alike. One is enough to give up:
        // a half-drawn map looks broken, an absent one just looks minimal.
        map.on('error', () => {
          if (!cancelled) {
            clearTimeout(timer);
            setFailed(true);
          }
        });

        timer = setTimeout(() => {
          if (!cancelled && !map.loaded()) setFailed(true);
        }, LOAD_TIMEOUT_MS);

        mapRef.current = map as unknown as typeof mapRef.current;
      } catch {
        // The chunk itself failed to load (offline, blocked). Same outcome.
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Rebuilding on coordinate change is fine: the map is only mounted once the
    // user has settled on a location.
  }, [latitude, longitude]);

  if (failed) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface">
      <div
        ref={containerRef}
        className="h-56 w-full sm:h-72"
        style={{ opacity: ready ? 1 : 0, transition: 'opacity 400ms ease' }}
        aria-label={label ? `Map of ${label}` : 'Map of the selected location'}
        role="img"
      />
    </div>
  );
}
