// Deliberately NOT a store barrel.
//
// `export *` from nine store modules meant that importing any single store
// through this file evaluated — and hydrated — all nine, on whichever screen
// happened to be reached first. Import the concrete store module instead
// (`../stores/bibleStore`, `../stores/progressStore`, …); only the shared MMKV
// plumbing is re-exported here, because it has no store of its own.
export { zustandStorage, mmkvInstance, getPersistedLanguagePreference } from './mmkvStorage';
