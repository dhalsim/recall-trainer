import { createEffect, createSignal, For, Match, onMount, Show, Switch } from 'solid-js';

import { t } from '../i18n';
import type { TestSessionSnapshot, VocabEntry } from '../store';
import { store } from '../store';

const QUESTIONS_PER_ROUND = 5;

type Direction = 'source_to_target' | 'target_to_source';
type Phase = 'idle' | 'question' | 'round_summary' | 'finished';

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

  let answerInputRef: HTMLInputElement | undefined;

  const entries = () => store.state().entries;
  const entriesToPractice = () =>
    entries().filter((e) => !e.correctSourceToTarget || !e.correctTargetToSource);
  const hasNoEntryToPractice = () => entriesToPractice().length === 0;

  const buildSnapshot = (phase: 'question' | 'round_summary'): TestSessionSnapshot => ({
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
      snapshot.roundResults.map((r) => ({
        entry: entriesById[r.entryId],
        correct: r.correct,
        userAnswer: r.userAnswer,
      })).filter((r): r is RoundResult => r.entry != null),
    );
    setTotalQuestionsAtStart(snapshot.totalQuestionsAtStart ?? 0);
    setTotalBatchesAtStart(snapshot.totalBatchesAtStart ?? 1);
    setCurrentBatchIndex(snapshot.currentBatchIndex ?? 1);
    setPhase(snapshot.phase);
    store.clearTestSession();
  };

  onMount(() => {
    const snapshot = store.testSession();
    if (snapshot != null) {
      console.log('onMount snapshot', snapshot.phase);
      restoreSession(snapshot);
      console.log('onMount snapshot restored', snapshot.phase);

    }
  });

  const startTest = () => {
    const all = entries();
    const needSourceToTarget = all.filter((e) => !e.correctSourceToTarget);
    const needTargetToSource = all.filter((e) => !e.correctTargetToSource);
    setSourceToTarget([...needSourceToTarget]);
    setTargetToSource([...needTargetToSource]);
    setDirection('source_to_target');
    setTotalCorrect(0);
    setTotalIncorrect(0);
    setRoundResults([]);

    const totalQuestions = needSourceToTarget.length + needTargetToSource.length;
    setTotalQuestionsAtStart(totalQuestions);
    setTotalBatchesAtStart(Math.ceil(totalQuestions / QUESTIONS_PER_ROUND) || 1);
    setCurrentBatchIndex(1);

    let firstBatch = needSourceToTarget.slice(0, QUESTIONS_PER_ROUND);
    let startDir: Direction = 'source_to_target';
    
    if (firstBatch.length === 0 && needTargetToSource.length > 0) {
      startDir = 'target_to_source';
      firstBatch = needTargetToSource.slice(-QUESTIONS_PER_ROUND).reverse();
    }
    
    if (firstBatch.length === 0) {
      store.clearTestSession();
      setPhase('finished');
      
      return;
    }
    
    setDirection(startDir);
    setCurrentRoundQuestions(firstBatch);
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
    if (!entry) return;

    const answer = userInput().trim();
    const isSourceToTarget = direction() === 'source_to_target';
    const correctAnswer = isSourceToTarget ? entry.target : entry.source;
    const correct = answer === correctAnswer;

    setRoundResults((prev) => [...prev, { entry, correct, userAnswer: answer }]);

    if (correct) {
      setTotalCorrect((c) => c + 1);
      setSourceToTarget((prev) => (isSourceToTarget ? removeFromList(prev, entry.id) : prev));
      setTargetToSource((prev) => (!isSourceToTarget ? removeFromList(prev, entry.id) : prev));
    } else {
      setTotalIncorrect((c) => c + 1);
    }

    setUserInput('');

    if (idx + 1 < questions.length) {
      setCurrentIndex(idx + 1);
      store.setTestSession(buildSnapshot('question'));
    } else {
      setPhase('round_summary');
      console.log('phase set to', phase())

      store.setTestSession(buildSnapshot('round_summary'));
    }

    store.recordAnswer(entry.id, correct, direction());
  };

  const nextRound = () => {
    const s2t = sourceToTarget();
    const t2s = targetToSource();

    if (s2t.length === 0 && t2s.length === 0) {
      store.clearTestSession();
      setPhase('finished');
      return;
    }

    const nextDir: Direction = direction() === 'source_to_target' ? 'target_to_source' : 'source_to_target';
    setDirection(nextDir);

    const list = nextDir === 'source_to_target' ? s2t : t2s;
    const batch = list.slice(-QUESTIONS_PER_ROUND).reverse();

    if (batch.length === 0) {
      store.clearTestSession();
      setPhase('finished');
      return;
    }

    setCurrentRoundQuestions(batch);
    setCurrentIndex(0);
    setRoundResults([]);
    setCurrentBatchIndex((i) => i + 1);
    setPhase('question');
    setUserInput('');
    store.setTestSession(buildSnapshot('question'));
  };

  const handleBack = () => {
    store.clearTestSession();
    store.goToModeSelection();
  };

  const currentEntry = () => currentRoundQuestions()[currentIndex()];
  const isSourceToTarget = () => direction() === 'source_to_target';
  const promptText = () => (currentEntry() ? (isSourceToTarget() ? currentEntry()!.source : currentEntry()!.target) : '');
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
            <p class="text-slate-600">{t('All entries are correct. Add more words or practice again later.')}</p>
            <button
              type="button"
              onClick={() => store.setScreen('word_entry')}
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
                : t('{{count}} vocabulary entries to practice.', { count: entriesToPractice().length })}{' '}
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
          <Show
            when={currentEntry()}
            fallback={null}
          >
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
                  {t('Batch {{current}} of {{total}}', {
                    current: currentBatchIndex(),
                    total: totalBatchesAtStart(),
                  })}
                  {' · '}
                  {t('{{total}} words total', { total: totalQuestionsAtStart() })}
                  {' · '}
                  {t('{{count}} left', { count: wordsLeft() })}
                </p>
                <p>
                  {t('Answering batch #{{n}}', { n: currentBatchIndex() })}
                  {' — '}
                  {t('Question {{current}} of {{total}}', { current: currentNum(), total: totalNum() })}
                  {isSourceToTarget() ? ' (Source → Target)' : ' (Target → Source)'}
                </p>
              </div>
              <div class="rounded-lg border-2 border-slate-200 bg-white p-4">
                <p class="text-lg font-medium text-slate-800">{promptText()}</p>
              </div>
              <div>
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
                  class="mt-1 w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2 text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
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

        <Match when={phase() === 'round_summary'}>
          {(() => {
            console.log('round_summary Match rendering', roundResults())

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
                              {isSourceToTargetRound ? r.entry.source : r.entry.target} →
                            </p>
                            <p class="text-slate-600">
                              {t('Your answer')}: {r.userAnswer}
                            </p>
                            <p class="text-success-500">
                              {t('Correct answer')}: {isSourceToTargetRound ? r.entry.target : r.entry.source}
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
                            {isSourceToTargetRound ? r.entry.source : r.entry.target} →{' '}
                            {isSourceToTargetRound ? r.entry.target : r.entry.source}
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
                : t('Review the words you got wrong and try again.')}
            </p>
            <button
              type="button"
              onClick={handleBack}
              class="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              ← {t('Back')}
            </button>
          </div>
        </Match>
      </Switch>
    </Show>
  );
}
