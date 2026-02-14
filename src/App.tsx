import { Navigate, Route, Router } from '@solidjs/router';

import { HomeRoute, ModeRoute, RootLayout, TestRoute, WordsRoute } from './routes';

function RedirectToHome() {
  return <Navigate href="/" />;
}

export default function App() {
  return (
    <Router root={RootLayout}>
      <Route path="/" component={HomeRoute} />
      <Route path="/mode" component={ModeRoute} />
      <Route path="/words" component={WordsRoute} />
      <Route path="/test" component={TestRoute} />
      <Route path="*" component={RedirectToHome} />
    </Router>
  );
}
