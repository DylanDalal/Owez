'use client';

/**
 * Anonymous guest identity — random string stored in localStorage so a guest
 * can remove their own claims across page refreshes without a login.
 */
export function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem('owez-session');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('owez-session', id);
  }
  return id;
}

export function getSavedGuestName(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('owez-guest-name') ?? '';
}

export function saveGuestName(name: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('owez-guest-name', name);
}
