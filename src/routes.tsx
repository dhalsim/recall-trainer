import type { RouteSectionProps } from '@solidjs/router';
import { Navigate } from '@solidjs/router';
import { Show } from 'solid-js';

import { AppLayout } from './components/AppLayout';
import { LanguageSelection } from './screens/LanguageSelection';
import { ModeSelection } from './screens/ModeSelection';
import { TestMode } from './screens/TestMode';
import { WordEntry } from './screens/WordEntry';
import { store } from './store';

function languageSelectionComplete(): boolean {
  const s = store.state();

  return Boolean(s.languageSelectionComplete && s.mainLanguage && s.targetLanguage);
}

/** Home: show language or mode selection (same content as /mode, no redirect). */
export function HomeRoute() {
  return (
    <Show when={languageSelectionComplete()} fallback={<LanguageSelection />}>
      <ModeSelection />
    </Show>
  );
}

/** Wrapper that redirects to /mode when languages are not set. */
function RequireLanguage(props: { children: import('solid-js').JSX.Element }) {
  return (
    <Show when={languageSelectionComplete()} fallback={<Navigate href="/mode" />}>
      {props.children}
    </Show>
  );
}

/** Mode: show language selection or mode selection so this route always renders content. */
export function ModeRoute() {
  return (
    <Show when={languageSelectionComplete()} fallback={<LanguageSelection />}>
      <ModeSelection />
    </Show>
  );
}

export function WordsRoute() {
  return (
    <RequireLanguage>
      <WordEntry />
    </RequireLanguage>
  );
}

export function TestRoute() {
  return (
    <RequireLanguage>
      <TestMode />
    </RequireLanguage>
  );
}

export function RootLayout(props: RouteSectionProps) {
  return <AppLayout>{props.children}</AppLayout>;
}
