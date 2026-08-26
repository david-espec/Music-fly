import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Playlist, Track } from '../types';

interface MusicFlyDB extends DBSchema {
  tracks: {
    key: string;
    value: Track;
    indexes: { 'by-addedAt': number; 'by-source': string };
  };
  /** Audio completo das faixas disponiveis offline. */
  audio: { key: string; value: Blob };
  /** Capas de album (arte embutida ou baixada do acervo). */
  covers: { key: string; value: Blob };
  playlists: { key: string; value: Playlist };
  /** Preferencias e estado da ultima sessao. */
  prefs: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<MusicFlyDB>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<MusicFlyDB>('music-fly', 1, {
      upgrade(database) {
        const tracks = database.createObjectStore('tracks', { keyPath: 'id' });
        tracks.createIndex('by-addedAt', 'addedAt');
        tracks.createIndex('by-source', 'source');
        database.createObjectStore('audio');
        database.createObjectStore('covers');
        database.createObjectStore('playlists', { keyPath: 'id' });
        database.createObjectStore('prefs');
      },
    });
  }
  return dbPromise;
}

// --- Faixas -----------------------------------------------------------------

export async function getAllTracks(): Promise<Track[]> {
  return (await db()).getAllFromIndex('tracks', 'by-addedAt');
}

export async function getTrack(id: string): Promise<Track | undefined> {
  return (await db()).get('tracks', id);
}

export async function putTrack(track: Track): Promise<void> {
  await (await db()).put('tracks', track);
}

/**
 * Grava faixa, audio e capa numa unica transacao, para que uma falha no meio
 * nao deixe uma faixa registrada sem o audio correspondente.
 */
export async function saveTrackWithAssets(
  track: Track,
  audio: Blob | null,
  cover: Blob | null,
): Promise<void> {
  const database = await db();
  const tx = database.transaction(['tracks', 'audio', 'covers'], 'readwrite');
  await Promise.all([
    tx.objectStore('tracks').put(track),
    audio ? tx.objectStore('audio').put(audio, track.id) : Promise.resolve(),
    cover ? tx.objectStore('covers').put(cover, track.id) : Promise.resolve(),
    tx.done,
  ]);
}

export async function deleteTrack(id: string): Promise<void> {
  const database = await db();
  const tx = database.transaction(['tracks', 'audio', 'covers'], 'readwrite');
  await Promise.all([
    tx.objectStore('tracks').delete(id),
    tx.objectStore('audio').delete(id),
    tx.objectStore('covers').delete(id),
    tx.done,
  ]);
  revokeCachedUrl(id);

  // Remove a faixa de todas as playlists que a referenciavam.
  const playlists = await getPlaylists();
  await Promise.all(
    playlists
      .filter((p) => p.trackIds.includes(id))
      .map((p) =>
        putPlaylist({
          ...p,
          trackIds: p.trackIds.filter((t) => t !== id),
          updatedAt: Date.now(),
        }),
      ),
  );
}

export async function getAudioBlob(id: string): Promise<Blob | undefined> {
  return (await db()).get('audio', id);
}

export async function putAudioBlob(id: string, blob: Blob): Promise<void> {
  await (await db()).put('audio', blob, id);
}

/** Remove somente o audio, mantendo a faixa na biblioteca como stream. */
export async function removeAudioBlob(id: string): Promise<void> {
  await (await db()).delete('audio', id);
  revokeCachedUrl(id);
}

export async function putCoverBlob(id: string, blob: Blob): Promise<void> {
  await (await db()).put('covers', blob, id);
}

export async function getCoverBlob(id: string): Promise<Blob | undefined> {
  return (await db()).get('covers', id);
}

// --- Playlists --------------------------------------------------------------

export async function getPlaylists(): Promise<Playlist[]> {
  const all = await (await db()).getAll('playlists');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function putPlaylist(playlist: Playlist): Promise<void> {
  await (await db()).put('playlists', playlist);
}

export async function deletePlaylist(id: string): Promise<void> {
  await (await db()).delete('playlists', id);
}

// --- Preferencias -----------------------------------------------------------

export async function getPref<T>(key: string, fallback: T): Promise<T> {
  const value = await (await db()).get('prefs', key);
  return (value as T | undefined) ?? fallback;
}

export async function setPref(key: string, value: unknown): Promise<void> {
  await (await db()).put('prefs', value, key);
}

// --- Cache de object URLs ---------------------------------------------------
// Object URLs de capas sao reaproveitados durante a sessao; recria-los a cada
// render causaria vazamento de memoria e piscar de imagem.

const coverUrls = new Map<string, string>();

export async function getCoverUrl(id: string): Promise<string | null> {
  const cached = coverUrls.get(id);
  if (cached) return cached;
  const blob = await getCoverBlob(id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  coverUrls.set(id, url);
  return url;
}

export function revokeCachedUrl(id: string): void {
  const url = coverUrls.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    coverUrls.delete(id);
  }
}

// --- Uso de espaco ----------------------------------------------------------

export async function estimateUsage(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usage, quota };
}

/**
 * Pede armazenamento persistente para que o navegador nao descarte a
 * biblioteca offline quando o espaco ficar apertado.
 */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
