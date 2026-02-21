import { For, Show } from 'solid-js';

import { t } from '../i18n';
import { clearAppLogs, getAppLogs } from '../utils/logger';

interface AppLogsProps {
  open: boolean;
  onClose: () => void;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

export function AppLogs(props: AppLogsProps) {
  const logs = () => [...getAppLogs()].reverse();

  return (
    <Show when={props.open}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-logs-title"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            props.onClose();
          }
        }}
      >
        <div
          class="fixed inset-0 bg-slate-900/50"
          aria-hidden="true"
          onClick={() => props.onClose()}
        />
        <div
          class="relative z-10 w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="flex items-center justify-between">
            <h2 id="app-logs-title" class="text-lg font-semibold text-slate-900">
              {t('App logs')}
            </h2>
            <button
              type="button"
              onClick={clearAppLogs}
              class="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {t('Clear')}
            </button>
          </div>

          <div class="mt-4 max-h-[60vh] overflow-y-auto rounded-lg border border-slate-200 p-3">
            <Show
              when={logs().length > 0}
              fallback={<p class="text-sm text-slate-500">{t('No logs yet')}</p>}
            >
              <ul class="space-y-2">
                <For each={logs()}>
                  {(entry) => (
                    <li class="rounded border border-slate-200 bg-slate-50 p-2">
                      <p class="text-xs text-slate-500">
                        {entry.type.toUpperCase()} · {formatTimestamp(entry.timestamp)}
                      </p>
                      <p class="mt-1 break-words text-sm text-slate-800">{entry.msg}</p>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </div>

          <div class="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => props.onClose()}
              class="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {t('Close')}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
