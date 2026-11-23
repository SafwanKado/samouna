import { createApiClient, wsUrlFrom } from '@samouna/shared/api';
import { createLiveHub, createSessionStore } from '@samouna/shared/react';

const baseUrl = import.meta.env.VITE_API_URL || '';

export const session = createSessionStore('samouna.bakery.session');
export const live = createLiveHub();
export const wsUrl = wsUrlFrom(baseUrl);

export const api = createApiClient({
  baseUrl,
  getToken: () => session.get()?.token,
  onUnauthorized: () => session.set(null),
});
