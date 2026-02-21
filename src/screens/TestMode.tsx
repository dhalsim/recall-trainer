import { useNavigate } from '@solidjs/router';
import { createEffect, createSignal, For, Match, onCleanup, onMount, Show, Switch } from 'solid-js';

import { t } from '../i18n';
import type { AppLanguage, TestSessionSnapshot, VocabEntry } from '../store';
import {
  getEntriesWithDueSide,
  isSourceDue,
  isTargetDue,
  MAX_SESSION_ROUNDS,
  store,
} from '../store';
import { logger } from '../utils/logger';
const { log } = logger();

type Direction = 'source_to_target' | 'target_to_source';
type Phase = 'idle' | 'question' | 'answer_feedback' | 'round_summary' | 'finished';

/** Trim and locale-aware lowercasing for word comparison. */
function normalizeForCompare(text: string, locale: AppLanguage | null): string {
  return text.trim().toLocaleLowerCase(locale ?? undefined);
}

interface RoundResult {
  entry: VocabEntry;
  correct: boolean;
  userAnswer: string;
}

export function TestMode() {
  const [sourceToTarget, setSourceToTarget] = createSignal<VocabEntry[]>([]);
  const [targetToSource, setTargetToSource] = createSignal<VocabEntry[]>([]);
  const [direction, setDirection] = createSignal<Direction>('source_to_target');
  const [currentRoundQuestions, setCurrentRoundQuestions] = createSignal<VocabEntry[]>([]);
  const [currentIndex, setCurrentIndex] = createSignal(0);
  const [roundResults, setRoundResults] = createSignal<RoundResult[]>([]);
  const [totalCorrect, setTotalCorrect] = createSignal(0);
  const [totalIncorrect, setTotalIncorrect] = createSignal(0);
  const [phase, setPhase] = createSignal<Phase>('idle');
  const [userInput, setUserInput] = createSignal('');
  const [totalQuestionsAtStart, setTotalQuestionsAtStart] = createSignal(0);
  const [totalBatchesAtStart, setTotalBatchesAtStart] = createSignal(0);
  const [currentBatchIndex, setCurrentBatchIndex] = createSignal(1);
  const [sessionBatchIds, setSessionBatchIds] = createSignal<string[]>([]);

  let answerInputRef: HTMLInputElement | undefined;

  const entries = () => store.state().entries;
  const questionsPerSession = () => store.state().questionsPerSession;
  const entriesToPractice = () => getEntriesWithDueSide(entries());
  const hasNoEntryToPractice = () => entriesToPractice().length === 0;

  const buildSnapshot = (
    phase: 'question' | 'answer_feedback' | 'round_summary',
  ): TestSessionSnapshot => ({
    phase,
    direction: direction(),
    sourceToTargetIds: sourceToTarget().map((e) => e.id),
    targetToSourceIds: targetToSource().map((e) => e.id),
    currentRoundEntryIds: currentRoundQuestions().map((e) => e.id),
    currentIndex: currentIndex(),
    totalCorrect: totalCorrect(),
    totalIncorrect: totalIncorrect(),
    roundResults: roundResults().map((r) => ({
      entryId: r.entry.id,
      correct: r.correct,
      userAnswer: r.userAnswer,
    })),
    totalQuestionsAtStart: totalQuestionsAtStart(),
    totalBatchesAtStart: totalBatchesAtStart(),
    currentBatchIndex: currentBatchIndex(),
    sessionBatchIds: sessionBatchIds(),
  });

  const restoreSession = (snapshot: TestSessionSnapshot): void => {
    const entriesById = Object.fromEntries(store.state().entries.map((e) => [e.id, e]));

    const byIds = (ids: string[]) =>
      ids.map((id) => entriesById[id]).filter((e): e is VocabEntry => e != null);

    setDirection(snapshot.direction);
    setSourceToTarget(byIds(snapshot.sourceToTargetIds));
    setTargetToSource(byIds(snapshot.targetToSourceIds));
    setCurrentRoundQuestions(byIds(snapshot.currentRoundEntryIds));
    setCurrentIndex(snapshot.currentIndex);
    setTotalCorrect(snapshot.totalCorrect);
    setTotalIncorrect(snapshot.totalIncorrect);

    setRoundResults(
      snapshot.roundResults
        .map((r) => ({
          entry: entriesById[r.entryId],
          correct: r.correct,
          userAnswer: r.userAnswer,
        }))
        .filter((r): r is RoundResult => r.entry != null),
    );

    setTotalQuestionsAtStart(snapshot.totalQuestionsAtStart ?? 0);
    setTotalBatchesAtStart(snapshot.totalBatchesAtStart ?? 1);
    setCurrentBatchIndex(snapshot.currentBatchIndex ?? 1);

    const batchIds =
      (snapshot.sessionBatchIds?.length ?? 0) > 0
        ? snapshot.sessionBatchIds
        : [...new Set([...snapshot.sourceToTargetIds, ...snapshot.targetToSourceIds])];

    setSessionBatchIds(batchIds ?? []);
    setPhase(snapshot.phase);
    store.clearTestSession();
  };

  onMount(() => {
    const snapshot = store.testSession();

    if (snapshot != null) {
      log(`onMount snapshot ${snapshot.phase}`);
      restoreSession(snapshot);
      log(`onMount snapshot restored ${snapshot.phase}`);
    }
  });

  createEffect(() => {
    if (phase() !== 'answer_feedback') {
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        goToNextAfterFeedback();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    onCleanup(() => window.removeEventListener('keydown', onKeyDown));
  });

  createEffect(() => {
    if (phase() !== 'round_summary') {
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        nextRound();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    onCleanup(() => window.removeEventListener('keydown', onKeyDown));
  });

  const startTest = () => {
    const toPractice = entriesToPractice();
    const n = questionsPerSession();
    const sessionBatch = toPractice.slice(0, n);

    if (sessionBatch.length === 0) {
      store.clearTestSession();
      setPhase('finished');

      return;
    }

    const ids = sessionBatch.map((e) => e.id);
    setSessionBatchIds(ids);
    setTotalCorrect(0);
    setTotalIncorrect(0);
    setRoundResults([]);
    setTotalQuestionsAtStart(sessionBatch.length);
    setTotalBatchesAtStart(MAX_SESSION_ROUNDS);
    setCurrentBatchIndex(1);

    const needS2T = sessionBatch.filter(isSourceDue).reverse();
    const needT2S = sessionBatch.filter(isTargetDue);
    setSourceToTarget([...needS2T]);
    setTargetToSource([...needT2S]);

    if (needS2T.length > 0) {
      setDirection('source_to_target');
      setCurrentRoundQuestions(needS2T);
    } else if (needT2S.length > 0) {
      setDirection('target_to_source');
      setCurrentRoundQuestions([...needT2S].reverse());
    } else {
      store.clearTestSession();
      setPhase('finished');

      return;
    }

    setCurrentIndex(0);
    setPhase('question');
    setUserInput('');
    store.setTestSession(buildSnapshot('question'));
  };

  const removeFromList = (list: VocabEntry[], id: string): VocabEntry[] =>
    list.filter((e) => e.id !== id);

  const submitAnswer = () => {
    const questions = currentRoundQuestions();
    const idx = currentIndex();
    const entry = questions[idx];

    if (!entry) {
      return;
    }

    const rawInput = userInput().trim();
    const isSourceToTarget = direction() === 'source_to_target';
    const correctAnswerRaw = isSourceToTarget ? entry.target.text : entry.source.text;

    const answerLocale = isSourceToTarget
      ? store.state().targetLanguage
      : store.state().mainLanguage;

    const correct =
      normalizeForCompare(rawInput, answerLocale) ===
      normalizeForCompare(correctAnswerRaw, answerLocale);

    const answer = rawInput;

    setRoundResults((prev) => [...prev, { entry, correct, userAnswer: answer }]);

    if (correct) {
      setTotalCorrect((c) => c + 1);
      setSourceToTarget((prev) => (isSourceToTarget ? removeFromList(prev, entry.id) : prev));
      setTargetToSource((prev) => (!isSourceToTarget ? removeFromList(prev, entry.id) : prev));
    } else {
      setTotalIncorrect((c) => c + 1);
    }

    setUserInput('');
    setPhase('answer_feedback');
    store.setTestSession(buildSnapshot('answer_feedback'));
    store.recordAnswer(entry.id, correct, direction());
  };

  const goToNextAfterFeedback = () => {
    const questions = currentRoundQuestions();
    const idx = currentIndex();

    if (idx + 1 < questions.length) {
      setCurrentIndex(idx + 1);
      setPhase('question');
      store.setTestSession(buildSnapshot('question'));
    } else {
      setPhase('round_summary');
      store.setTestSession(buildSnapshot('round_summary'));
    }
  };

  const refilterBatchFromStore = (): { needS2T: VocabEntry[]; needT2S: VocabEntry[] } => {
    const entriesById = Object.fromEntries(entries().map((e) => [e.id, e]));

    const batchEntries = sessionBatchIds()
      .map((id) => entriesById[id])
      .filter((e): e is VocabEntry => e != null);

    const needS2T = batchEntries.filter(isSourceDue).reverse();
    const needT2S = batchEntries.filter(isTargetDue);

    return { needS2T, needT2S };
  };

  const nextRound = () => {
    if (direction() === 'source_to_target') {
      const t2s = targetToSource();

      if (t2s.length > 0) {
        setDirection('target_to_source');
        setCurrentRoundQuestions([...t2s].reverse());
        setCurrentIndex(0);
        setRoundResults([]);
        setPhase('question');
        setUserInput('');
        store.setTestSession(buildSnapshot('question'));

        return;
      }
    }

    const { needS2T, needT2S } = refilterBatchFromStore();

    if (needS2T.length === 0 && needT2S.length === 0) {
      store.clearTestSession();
      setPhase('finished');

      return;
    }

    if (currentBatchIndex() >= MAX_SESSION_ROUNDS) {
      store.clearTestSession();
      setPhase('finished');

      return;
    }

    setCurrentBatchIndex((i) => i + 1);
    setSourceToTarget([...needS2T]);
    setTargetToSource([...needT2S]);

    if (needS2T.length > 0) {
      setDirection('source_to_target');
      setCurrentRoundQuestions(needS2T);
    } else {
      setDirection('target_to_source');
      setCurrentRoundQuestions(needT2S);
    }

    setCurrentIndex(0);
    setRoundResults([]);
    setPhase('question');
    setUserInput('');
    store.setTestSession(buildSnapshot('question'));
  };

  const navigate = useNavigate();

  const handleBack = () => {
    store.clearTestSession();
    store.goToModeSelection();
    navigate('/mode');
  };

  const currentEntry = () => currentRoundQuestions()[currentIndex()];
  const isSourceToTarget = () => direction() === 'source_to_target';

  const promptText = () =>
    currentEntry()
      ? isSourceToTarget()
        ? currentEntry()!.source.text
        : currentEntry()!.target.text
      : '';

  const currentNum = () => currentIndex() + 1;
  const totalNum = () => currentRoundQuestions().length;
  const wordsLeft = () => sourceToTarget().length + targetToSource().length;

  createEffect(() => {
    if (phase() === 'question' && currentEntry()) {
      queueMicrotask(() => answerInputRef?.focus());
    }
  });

  return (
    <Show
      when={entries().length > 0}
      fallback={
        <div class="mx-auto max-w-md space-y-6">
          <button
            type="button"
            onClick={handleBack}
            class="text-sm font-medium text-blue-600 hover:text-blue-800 focus:outline-none focus:underline"
          >
            ← {t('Back')}
          </button>
          <h1 class="text-2xl font-bold text-slate-900">Recall Trainer</h1>
          <p class="text-slate-600">{t('No vocabulary entries yet. Add some words first.')}</p>
        </div>
      }
    >
      <Switch fallback={null}>
        <Match when={phase() === 'idle' && hasNoEntryToPractice()}>
          <div class="mx-auto max-w-md space-y-6">
            <button
              type="button"
              onClick={handleBack}
              class="text-sm font-medium text-blue-600 hover:text-blue-800 focus:outline-none focus:underline"
            >
              ← {t('Back')}
            </button>
            <h1 class="text-2xl font-bold text-slate-900">Recall Trainer</h1>
            <p class="text-slate-600">
              {t('No reviews due today. Add more words or practice again later.')}
            </p>
            <button
              type="button"
              onClick={() => {
                store.setScreen('word_entry');
                navigate('/words');
              }}
              class="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {t('Enter words I struggle with')}
            </button>
          </div>
        </Match>

        <Match when={phase() === 'idle'}>
          <div class="mx-auto max-w-md space-y-6">
            <button
              type="button"
              onClick={handleBack}
              class="text-sm font-medium text-blue-600 hover:text-blue-800 focus:outline-none focus:underline"
            >
              ← {t('Back')}
            </button>
            <h1 class="text-2xl font-bold text-slate-900">Recall Trainer</h1>
            <p class="text-slate-600">
              {entriesToPractice().length === 1
                ? t('1 vocabulary entry to practice.')
                : t('{{count}} vocabulary entries to practice.', {
                    count: entriesToPractice().length,
                  })}{' '}
              {t('Start test')}?
            </p>
            <button
              type="button"
              onClick={startTest}
              class="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {t('Start test')}
            </button>
          </div>
        </Match>

        <Match when={phase() === 'question'}>
          <Show when={currentEntry()} fallback={null}>
            <div class="mx-auto max-w-md space-y-6">
              <button
                type="button"
                onClick={handleBack}
                class="text-sm font-medium text-blue-600 hover:text-blue-800 focus:outline-none focus:underline"
              >
                ← {t('Back')}
              </button>
              <div class="space-y-1 text-sm text-slate-500">
                <p>
                  {t('Round {{current}} of {{max}}', {
                    current: currentBatchIndex(),
                    max: totalBatchesAtStart(),
                  })}
                  {' · '}
                  {t('{{total}} words in session', { total: totalQuestionsAtStart() })}
                  {' · '}
                  {t('{{count}} left', { count: wordsLeft() })}
                </p>
                <p>
                  {t('Question {{current}} of {{total}}', {
                    current: currentNum(),
                    total: totalNum(),
                  })}
                  {isSourceToTarget() ? ' (Source → Target)' : ' (Target → Source)'}
                </p>
              </div>
              <div class="rounded-lg border-2 border-slate-200 bg-white p-4">
                <p class="text-lg font-medium text-slate-800">{promptText()}</p>
              </div>
              <div class="space-y-1">
                <label for="test-answer" class="block text-sm font-medium text-slate-700">
                  {t('Enter your answer.')}
                </label>
                <input
                  ref={answerInputRef}
                  id="test-answer"
                  type="text"
                  autocomplete="off"
                  value={userInput()}
                  onInput={(e) => setUserInput(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      submitAnswer();
                    }
                  }}
                  class="w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2.5 text-slate-800 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>
              <button
                type="button"
                onClick={submitAnswer}
                class="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {t('Check')}
              </button>
            </div>
          </Show>
        </Match>

        <Match when={phase() === 'answer_feedback'}>
          {(() => {
            const results = roundResults();
            const last = results.length > 0 ? results[results.length - 1] : null;

            return (
              <Show when={last}>
                {(getItem) => {
                  const item = getItem();
                  const isSourceToTargetRound = direction() === 'source_to_target';

                  const correctAnswerText = isSourceToTargetRound
                    ? item.entry.target.text
                    : item.entry.source.text;

                  return (
                    <div class="mx-auto max-w-md space-y-6">
                      <button
                        type="button"
                        onClick={handleBack}
                        class="text-sm font-medium text-blue-600 hover:text-blue-800 focus:outline-none focus:underline"
                      >
                        ← {t('Back')}
                      </button>
                      <div
                        class="rounded-lg border-2 p-4"
                        classList={{
                          'border-success-300 bg-success-50': item.correct,
                          'border-error-300 bg-error-50': !item.correct,
                        }}
                      >
                        {item.correct ? (
                          <p class="text-lg font-semibold text-success-800">{t('Correct')}</p>
                        ) : (
                          <div class="space-y-1">
                            <p class="text-lg font-semibold text-error-800">{t('Incorrect')}</p>
                            <p class="text-sm text-slate-700">
                              {t('Correct answer')}: {correctAnswerText}
                            </p>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={goToNextAfterFeedback}
                        class="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      >
                        {t('Next')}
                      </button>
                    </div>
                  );
                }}
              </Show>
            );
          })()}
        </Match>

        <Match when={phase() === 'round_summary'}>
          {(() => {
            const results = roundResults();
            const incorrect = results.filter((r) => !r.correct);
            const correct = results.filter((r) => r.correct);
            const isSourceToTargetRound = direction() === 'source_to_target';

            return (
              <div class="mx-auto max-w-md space-y-6">
                <h1 class="text-2xl font-bold text-slate-900">{t('Round summary')}</h1>
                <p class="text-slate-600">
                  {t('Correct')}: {correct.length} — {t('Incorrect')}: {incorrect.length}
                </p>

                {incorrect.length > 0 && (
                  <div class="space-y-2">
                    <h2 class="text-sm font-semibold text-error-500">{t('Incorrect')}</h2>
                    <div class="space-y-2">
                      <For each={incorrect}>
                        {(r) => (
                          <div class="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                            <p class="font-medium text-slate-800">
                              {isSourceToTargetRound ? r.entry.source.text : r.entry.target.text} →
                            </p>
                            <p class="text-slate-600">
                              {t('Your answer')}: {r.userAnswer}
                            </p>
                            <p class="text-success-500">
                              {t('Correct answer')}:{' '}
                              {isSourceToTargetRound ? r.entry.target.text : r.entry.source.text}
                            </p>
                            <p class="mt-1 text-slate-400 italic">Explanation placeholder</p>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                )}

                {correct.length > 0 && (
                  <div class="space-y-2">
                    <h2 class="text-sm font-semibold text-success-500">{t('Correct')}</h2>
                    <div class="space-y-1">
                      <For each={correct}>
                        {(r) => (
                          <div class="rounded border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                            {isSourceToTargetRound ? r.entry.source.text : r.entry.target.text} →{' '}
                            {isSourceToTargetRound ? r.entry.target.text : r.entry.source.text}
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={nextRound}
                  class="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  {t('Next Batch')}
                </button>
              </div>
            );
          })()}
        </Match>

        <Match when={phase() === 'finished'}>
          <div class="mx-auto max-w-md space-y-6">
            <h1 class="text-2xl font-bold text-slate-900">{t('Test complete!')}</h1>
            <p class="text-slate-600">
              {t('You got {{correct}} correct and {{incorrect}} incorrect.', {
                correct: totalCorrect(),
                incorrect: totalIncorrect(),
              })}
            </p>
            <p
              class="rounded-lg border px-3 py-2 text-sm font-medium"
              classList={{
                'border-success-200 bg-success-50 text-success-800': totalIncorrect() === 0,
                'border-amber-200 bg-amber-50 text-amber-800': totalIncorrect() > 0,
              }}
            >
              {totalIncorrect() === 0
                ? t('All answers correct in both directions. Well done!')
                : t("You had wrong answers. Don't forget to review them later.")}
            </p>
            <button
              type="button"
              onClick={handleBack}
              class="w-full rounded-lg border-2 border-slate-200 bg-white px-4 py-3 font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              ← {t('Back')}
            </button>
          </div>
        </Match>
      </Switch>
    </Show>
  );
}
