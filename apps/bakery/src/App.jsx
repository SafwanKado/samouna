import { session } from './lib.js';
import Dashboard from './screens/Dashboard.jsx';
import Login from './screens/Login.jsx';

export default function App() {
  const auth = session.useSession();
  return auth ? <Dashboard auth={auth} /> : <Login />;
}
