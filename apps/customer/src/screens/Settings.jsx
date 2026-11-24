import { useState } from 'react';
import { errorMessage } from '@samouna/shared/api';
import { Icon, LanguageList, useConfirm } from '@samouna/shared/components';
import { formatIraqiMobile } from '@samouna/shared/phone';
import { useI18n } from '@samouna/shared/react';
import { api, session } from '../lib.js';

export default function Settings({ auth, setGuest, notify, navigate }) {
  const { t } = useI18n();
  const [ask, dialog] = useConfirm();

  async function logout() {
    if (await ask({ icon: 'logout', tone: 'danger', title: t('logout'), message: t('logoutConfirm'), confirmLabel: t('logout') })) {
      session.set(null);
      setGuest(true);
      navigate('/');
    }
  }

  return (
    <div className="page">
      <h2 className="screen-title">{t('settingsTab')}</h2>

      <h3 className="section-title">{t('account')}</h3>
      {auth ? <Profile auth={auth} notify={notify} /> : (
        <div className="card stack guest-card">
          <div className="row"><Icon name="user" size={26} className="text-accent" /><h3>{t('guestTitle')}</h3></div>
          <p className="muted">{t('guestText')}</p>
          <a href="#/login/settings" className="btn btn-primary btn-big">{t('login')}</a>
          <a href="#/register/settings" className="btn btn-outline-accent btn-big">{t('registerNow')}</a>
        </div>
      )}

      <h3 className="section-title">{t('language')}</h3>
      <LanguageList />

      {auth && (
        <button type="button" className="btn btn-danger btn-big logout-btn" onClick={logout}>
          <Icon name="logout" size={22} flip />{t('logout')}
        </button>
      )}
      <p className="muted small about">{t('aboutApp')} · v1.1</p>
      {dialog}
    </div>
  );
}

function Profile({ auth, notify }) {
  const { t } = useI18n();
  const { user } = auth;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.fullName);
  const [email, setEmail] = useState(user.email || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api.patch('/auth/me', { fullName: name.trim(), email: email.trim() });
      session.set((s) => ({ ...s, user: r.user }));
      setEditing(false);
      notify(t('saved'), 'ok');
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card stack">
      <div className="profile-row">
        <div className="avatar" aria-hidden="true">{user.fullName.trim().charAt(0).toUpperCase()}</div>
        <div className="grow">
          <h3>{user.fullName}</h3>
          <p className="muted num small">{formatIraqiMobile(user.phone)}</p>
          {user.email && <p className="muted small profile-email">{user.email}</p>}
        </div>
      </div>
      {!editing && <button type="button" className="btn btn-outline-accent profile-edit" onClick={() => setEditing(true)}>{t('editProfile')}</button>}
      {editing && (
        <form className="stack" onSubmit={save} noValidate>
          <label className="field">{t('name')}<input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
          <label className="field">{t('emailOptional')}<input id="pf-email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="row">
            <button type="button" className="btn grow" onClick={() => { setEditing(false); setName(user.fullName); setEmail(user.email || ''); }}>{t('cancel')}</button>
            <button className="btn btn-primary grow" disabled={busy}>{t('save')}</button>
          </div>
        </form>
      )}
    </div>
  );
}
