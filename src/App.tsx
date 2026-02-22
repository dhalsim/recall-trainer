import { Navigate, Route, Router } from '@solidjs/router';

import { NostrAuthProvider } from './contexts/NostrAuthContext';
import {
  HomeRoute,
  ModeRoute,
  MyStudySetsRoute,
  RootLayout,
  StudySetCreateRoute,
  StudySetsDiscoverRoute,
  TestRoute,
  WordsRoute,
} from './routes';

function RedirectToHome() {
  return <Navigate href="/" />;
}

export default function App() {
  return (
    <NostrAuthProvider>
      <Router root={RootLayout}>
        <Route path="/" component={HomeRoute} />
        <Route path="/mode" component={ModeRoute} />
        <Route path="/words" component={WordsRoute} />
        <Route path="/test" component={TestRoute} />
        <Route path="/study-sets/discover" component={StudySetsDiscoverRoute} />
        <Route path="/study-sets/my" component={MyStudySetsRoute} />
        <Route path="/study-sets/create" component={StudySetCreateRoute} />
        <Route path="*" component={RedirectToHome} />
      </Router>
    </NostrAuthProvider>
  );
}
