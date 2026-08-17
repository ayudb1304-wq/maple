/**
 * Attribution is a condition of free commercial use for several of our
 * providers (docs/API_REFERENCE.md), so these links are load-bearing, not
 * decoration. SunriseSunset.io and Open-Meteo both require a visible credit.
 */

export function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-3xl px-5 pb-10 text-xs leading-relaxed text-muted">
      <p>
        Sun &amp; moon times by{' '}
        <a href="https://sunrisesunset.io" className="underline hover:text-foreground" target="_blank" rel="noreferrer">
          SunriseSunset.io
        </a>
        . Weather data by{' '}
        <a href="https://open-meteo.com" className="underline hover:text-foreground" target="_blank" rel="noreferrer">
          Open-Meteo.com
        </a>
        . Aurora data:{' '}
        <a href="https://www.swpc.noaa.gov" className="underline hover:text-foreground" target="_blank" rel="noreferrer">
          NOAA SWPC
        </a>
        . Map data ©{' '}
        <a
          href="https://www.openstreetmap.org/copyright"
          className="underline hover:text-foreground"
          target="_blank"
          rel="noreferrer"
        >
          OpenStreetMap contributors
        </a>
        , tiles by{' '}
        <a href="https://openfreemap.org" className="underline hover:text-foreground" target="_blank" rel="noreferrer">
          OpenFreeMap
        </a>{' '}
        and OpenMapTiles.
      </p>
    </footer>
  );
}
