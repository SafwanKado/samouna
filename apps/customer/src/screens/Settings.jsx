import { useState } from 'react';
import { errorMessage } from '@samouna/shared/api';
import { Button, Icon, LanguageList, TextField, ThemeToggle, useConfirm } from '@samouna/shared/components';
import { formatIraqiMobile } from '@samouna/shared/phone';
import { useI18n } from '@samouna/shared/react';
import { api, session } from '../lib.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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
      <h1 className="screen-title">{t('settingsTab')}</h1>

      <h2 className="section-title">{t('account')}</h2>
      {auth ? <Profile auth={auth} notify={notify} /> : (
        <div className="card stack guest-card">
          <div className="row"><div className="avatar"><Icon name="user" size={24} /></div><div><h3>{t('guestTitle')}</h3><p className="muted small">{t('guestText')}</p></div></div>
          <div className="two-col">
            <a href="#/login/settings" className="btn btn-primary btn-lg">{t('login')}</a>
            <a href="#/register/settings" className="btn btn-lg">{t('registerNow')}</a>
          </div>
        </div>
      )}

      <h2 className="section-title">{t('theme')}</h2>
      <ThemeToggle />

      <h2 className="section-title">{t('language')}</h2>
      <LanguageList />

      {auth && <button type="button" className="btn btn-danger btn-lg btn-block logout-btn" onClick={logout}><Icon name="logout" size={20} flip />{t('logout')}</button>}
      <p className="muted xs about">{t('aboutApp')} · v1.2</p>
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
  const nameOk = name.trim().length >= 2;
  const emailError = email.trim() && !EMAIL_RE.test(email.trim()) ? t('err_invalid_email') : '';
  const dirty = name.trim() !== user.fullName || email.trim() !== (user.email || '');

  async function save(e) {
    e.preventDefault();
    if (!nameOk || emailError) return;
    setBusy(true);
    setError('');
    try {
      const r = await api.patch('/auth/me', { fullName: name.trim(), email: email.trim() });
      session.set((s) => ({ ...s, user: r.user }));
      setEditing(false);
      notify(t('saved'), 'success');
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
          <p className="muted small num">{formatIraqiMobile(user.phone)}</p>
          {user.email && <p className="muted small profile-email">{user.email}</p>}
        </div>
        {!editing && <button type="button" className="icon-btn" aria-label={t('editProfile')} onClick={() => setEditing(true)}><Icon name="edit" size={18} /></button>}
      </div>
      {editing && (
        <form className="stack rise" onSubmit={save} noValidate>
          <TextField id="pf-name" label={t('name')} icon="user" value={name} onChange={setName} valid={nameOk} error={!nameOk && t('err_name_required')} showErrors />
          <TextField id="pf-email" label={t('emailOptional')} icon="mail" type="email" dir="ltr" value={email} onChange={setEmail} error={emailError} valid={Boolean(email) && !emailError} showErrors />
          {error && <div className="form-error" role="alert"><Icon name="alert" size={18} />{error}</div>}
          <div className="two-col">
            <button type="button" className="btn btn-lg" onClick={() => { setEditing(false); setName(user.fullName); setEmail(user.email || ''); }}>{t('cancel')}</button>
            <Button type="submit" className="btn-primary btn-lg" loading={busy} disabled={!dirty || !nameOk || Boolean(emailError)}>{t('save')}</Button>
          </div>
        </form>
      )}
    </div>
  );
}
