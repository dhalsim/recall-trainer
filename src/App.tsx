import { LanguageSelection } from './screens/LanguageSelection';
import { ModeSelection } from './screens/ModeSelection';
import { TestMode } from './screens/TestMode';
import { WordEntry } from './screens/WordEntry';
import { store } from './store';

function App() {
  const showLanguageSelection = () => {
    const s = store.state();

    return !s.languageSelectionComplete || s.mainLanguage === null || s.targetLanguage === null;
  };

  const renderScreen = () => {
    if (showLanguageSelection()) {
      return <LanguageSelection />;
    }

    const screen = store.state().screen;
    switch (screen) {
      case 'mode_selection':
        return <ModeSelection />;
      case 'word_entry':
        return <WordEntry />;
      case 'test':
        return <TestMode />;
      default:
        return <ModeSelection />;
    }
  };

  return <div class="min-h-screen bg-slate-50 p-6">{renderScreen()}</div>;
}

export default App;
