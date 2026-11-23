import { LanguagePicker } from '@samouna/shared/components';
import { useI18n } from '@samouna/shared/react';
import { session } from './lib.js';
import Dashboard from './screens/Dashboard.jsx';
import Login from './screens/Login.jsx';

export default function App() {
  const { t, hasChosenLang } = useI18n();
  const auth = session.useSession();
  if (!hasChosenLang) return <LanguagePicker title={t('bakeryAppName')} />;
  return auth ? <Dashboard auth={auth} /> : <Login />;
}
