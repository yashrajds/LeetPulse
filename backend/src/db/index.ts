import type { Store } from './store.js';
import { SqliteStore } from './sqlite.js';
import { FirestoreStore } from './firestore.js';

export * from './store.js';

let _store: Store | null = null;

export function dbProvider(): string {
  const explicit = (process.env.DB_PROVIDER ?? '').toLowerCase();
  if (explicit === 'firestore' || explicit === 'sqlite') return explicit;
  if (process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_APPLICATION_CREDENTIALS) return 'firestore';
  return 'sqlite';
}

export function getStore(): Store {
  if (_store) return _store;
  _store = dbProvider() === 'firestore' ? new FirestoreStore() : new SqliteStore();
  return _store;
}

/** For tests: inject a store (e.g. SqliteStore on a temp file). */
export function setStore(s: Store | null) {
  _store = s;
}
