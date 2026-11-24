// "Today · 14:30" style labels for scheduled orders.
const pad = (n) => String(n).padStart(2, '0');
const KU_DAYS = ['یەکشەمب', 'دووشەمب', 'سێشەمب', 'چارشەمب', 'پێنجشەمب', 'ئەینی', 'شەمبی'];

export function whenLabel(value, lang, t, now = new Date()) {
  const d = new Date(value);
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(d) - startOf(now)) / 86400000);
  let day;
  if (diff === 0) day = t('today');
  else if (diff === 1) day = t('tomorrow');
  else if (lang === 'ku') day = `${KU_DAYS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
  else day = `${new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en-GB', { weekday: 'long' }).format(d)} ${d.getDate()}/${d.getMonth() + 1}`;
  return `${day} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
