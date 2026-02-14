import type { JSX } from 'solid-js';

interface AppLayoutProps {
  children?: JSX.Element;
}

/**
 * Shared mobile-first layout: consistent spacing, safe-area aware, max-width container.
 */
export function AppLayout(props: AppLayoutProps) {
  return (
    <div class="min-h-screen min-h-[100dvh] bg-slate-50 px-4 py-6 sm:px-6 sm:py-8">
      <main class="mx-auto max-w-2xl" role="main">
        {props.children}
      </main>
    </div>
  );
}
