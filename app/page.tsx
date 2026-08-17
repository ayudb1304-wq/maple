import { SkyApp } from '@/components/SkyApp';
import { SiteFooter } from '@/components/SiteFooter';

/**
 * Landing page. The shell is a server component so the hero paints from HTML;
 * only the interactive part below it is a client island.
 */

export default function HomePage() {
  return (
    <>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-5 pb-16 pt-12 sm:pt-20">
        <header className="text-center">
          <p className="text-[0.7rem] uppercase tracking-[0.2em] text-brand">SkyTonight</p>
          <h1 className="mt-3 text-balance text-3xl font-semibold leading-tight sm:text-5xl">
            Is tonight&rsquo;s sky worth going outside for?
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-base text-muted sm:text-lg">
            One number for tonight, anywhere. Cloud cover, golden hour, moon phase and aurora
            chance.
          </p>
        </header>

        <SkyApp />
      </main>

      <SiteFooter />
    </>
  );
}
