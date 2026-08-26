import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Playlist, Track } from '../types';
import {
  deletePlaylist as dbDeletePlaylist,
  deleteTrack as dbDeleteTrack,
  getAllTracks,
  getPlaylists,
  putAudioBlob,
  putCoverBlob,
  putPlaylist,
  putTrack,
  removeAudioBlob,
  saveTrackWithAssets,
} from '../db';
import { isAudioFile, readLocalFile } from '../lib/metadata';
import { uid } from '../lib/format';
import { useToast } from '../components/Toast';
import { emit, on } from '../lib/bus';

export interface ImportProgress {
  done: number;
  total: number;
  currentName: string;
}

interface LibraryValue {
  tracks: Track[];
  playlists: Playlist[];
  loading: boolean;
  importProgress: ImportProgress | null;
  /** id da faixa -> progresso do download offline (0..1). */
  downloading: Record<string, number>;

  importFiles: (files: File[]) => Promise<void>;
  removeTrack: (id: string) => Promise<void>;
  saveArchiveTracks: (tracks: Track[]) => Promise<Track[]>;
  downloadForOffline: (track: Track) => Promise<void>;
  removeOffline: (track: Track) => Promise<void>;

  createPlaylist: (name: string, trackIds?: string[]) => Promise<Playlist>;
  renamePlaylist: (id: string, name: string) => Promise<void>;
  removePlaylist: (id: string) => Promise<void>;
  addToPlaylist: (playlistId: string, trackIds: string[]) => Promise<void>;
  removeFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  movePlaylistTrack: (playlistId: string, from: number, to: number) => Promise<void>;
}

const LibraryContext = createContext<LibraryValue | null>(null);

/** Assinatura usada para nao importar o mesmo arquivo duas vezes. */
const signature = (track: Track) =>
  `${track.fileName ?? ''}|${track.size ?? 0}|${track.duration.toFixed(1)}`;

export function LibraryProvider({ children }: { children: ReactNode }) {
  const notify = useToast();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [downloading, setDownloading] = useState<Record<string, number>>({});

  useEffect(() => {
    void (async () => {
      try {
        const [savedTracks, savedPlaylists] = await Promise.all([getAllTracks(), getPlaylists()]);
        setTracks(savedTracks);
        setPlaylists(savedPlaylists);
      } catch {
        notify('Nao foi possivel abrir a biblioteca local.', 'erro');
      } finally {
        setLoading(false);
      }
    })();
  }, [notify]);

  // A duracao real so aparece quando a faixa toca; guardamos para a proxima vez.
  useEffect(
    () =>
      on('duration-resolved', ({ id, duration }) => {
        setTracks((current) => {
          const found = current.find((track) => track.id === id);
          if (!found || Math.abs(found.duration - duration) < 1) return current;
          void putTrack({ ...found, duration });
          return current.map((track) => (track.id === id ? { ...track, duration } : track));
        });
      }),
    [],
  );

  // --- Importacao de arquivos locais -----------------------------------------

  const importFiles = useCallback(
    async (files: File[]) => {
      const audioFiles = files.filter(isAudioFile);
      if (audioFiles.length === 0) {
        notify('Nenhum arquivo de audio reconhecido.', 'erro');
        return;
      }

      const existing = new Set(tracks.map(signature));
      const added: Track[] = [];
      // Um unico instante para o lote todo: assim um album importado de uma vez
      // aparece na ordem das faixas, e nao invertido pelos milissegundos.
      const batchAddedAt = Date.now();
      let skipped = 0;
      let failed = 0;

      for (const [i, file] of audioFiles.entries()) {
        setImportProgress({ done: i, total: audioFiles.length, currentName: file.name });
        try {
          const { track: parsed, cover } = await readLocalFile(file);
          const track = { ...parsed, addedAt: batchAddedAt };
          if (existing.has(signature(track))) {
            skipped += 1;
            continue;
          }
          await saveTrackWithAssets(track, file, cover);
          existing.add(signature(track));
          added.push(track);
        } catch {
          failed += 1;
        }
      }

      setImportProgress(null);
      if (added.length > 0) setTracks((current) => [...current, ...added]);

      const parts: string[] = [];
      if (added.length) parts.push(`${added.length} adicionada(s)`);
      if (skipped) parts.push(`${skipped} ja estava(m) na biblioteca`);
      if (failed) parts.push(`${failed} com erro`);
      notify(parts.join(', ') || 'Nada a importar.', failed && !added.length ? 'erro' : 'sucesso');
    },
    [notify, tracks],
  );

  const removeTrack = useCallback(
    async (id: string) => {
      await dbDeleteTrack(id);
      emit('track-removed', id);
      setTracks((current) => current.filter((track) => track.id !== id));
      setPlaylists((current) =>
        current.map((playlist) =>
          playlist.trackIds.includes(id)
            ? { ...playlist, trackIds: playlist.trackIds.filter((t) => t !== id) }
            : playlist,
        ),
      );
    },
    [],
  );

  // --- Acervo livre ----------------------------------------------------------

  /**
   * Guarda faixas do acervo na biblioteca como streams. Faixas ja salvas do
   * mesmo item sao reaproveitadas para nao duplicar.
   */
  const saveArchiveTracks = useCallback(
    async (incoming: Track[]) => {
      const known = new Map(
        tracks
          .filter((track) => track.source === 'acervo' && track.streamUrl)
          .map((track) => [track.streamUrl as string, track]),
      );

      const fresh: Track[] = [];
      const result: Track[] = [];
      for (const track of incoming) {
        const existing = track.streamUrl ? known.get(track.streamUrl) : undefined;
        if (existing) {
          result.push(existing);
        } else {
          fresh.push(track);
          result.push(track);
        }
      }

      if (fresh.length > 0) {
        await Promise.all(fresh.map((track) => putTrack(track)));
        setTracks((current) => [...current, ...fresh]);
      }
      return result;
    },
    [tracks],
  );

  const downloadForOffline = useCallback(
    async (track: Track) => {
      if (!track.streamUrl || track.offline) return;
      setDownloading((current) => ({ ...current, [track.id]: 0 }));
      try {
        const response = await fetch(track.streamUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const total = Number(response.headers.get('content-length')) || 0;
        let blob: Blob;

        if (response.body && total > 0) {
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let received = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.length;
            setDownloading((current) => ({ ...current, [track.id]: received / total }));
          }
          blob = new Blob(chunks as BlobPart[], {
            type: response.headers.get('content-type') ?? 'audio/mpeg',
          });
        } else {
          blob = await response.blob();
        }

        await putAudioBlob(track.id, blob);

        // Guarda tambem a capa, para que o album apareca completo sem internet.
        let hasCover = track.hasCover;
        if (!hasCover && track.remoteCoverUrl) {
          try {
            const coverResponse = await fetch(track.remoteCoverUrl);
            if (coverResponse.ok) {
              await putCoverBlob(track.id, await coverResponse.blob());
              hasCover = true;
            }
          } catch {
            // Capa e opcional; o audio ja esta salvo.
          }
        }

        const updated: Track = { ...track, offline: true, hasCover, size: blob.size };
        await putTrack(updated);
        setTracks((current) => {
          const known = current.some((item) => item.id === track.id);
          return known
            ? current.map((item) => (item.id === track.id ? updated : item))
            : [...current, updated];
        });
        notify(`"${track.title}" disponivel offline.`, 'sucesso');
      } catch {
        notify(`Falha ao baixar "${track.title}".`, 'erro');
      } finally {
        setDownloading((current) => {
          const { [track.id]: _removed, ...rest } = current;
          return rest;
        });
      }
    },
    [notify],
  );

  const removeOffline = useCallback(
    async (track: Track) => {
      // Sem stream de origem, apagar o audio apagaria a faixa por completo.
      if (track.source === 'local') {
        await dbDeleteTrack(track.id);
        emit('track-removed', track.id);
        setTracks((current) => current.filter((item) => item.id !== track.id));
        return;
      }
      await removeAudioBlob(track.id);
      const updated: Track = { ...track, offline: false };
      await putTrack(updated);
      setTracks((current) => current.map((item) => (item.id === track.id ? updated : item)));
      notify(`"${track.title}" voltou a tocar por streaming.`);
    },
    [notify],
  );

  // --- Playlists -------------------------------------------------------------

  const persistPlaylist = useCallback(async (playlist: Playlist) => {
    await putPlaylist(playlist);
    setPlaylists((current) => {
      const known = current.some((item) => item.id === playlist.id);
      const merged = known
        ? current.map((item) => (item.id === playlist.id ? playlist : item))
        : [...current, playlist];
      return merged.sort((a, b) => b.updatedAt - a.updatedAt);
    });
  }, []);

  const createPlaylist = useCallback(
    async (name: string, trackIds: string[] = []) => {
      const now = Date.now();
      const playlist: Playlist = {
        id: uid(),
        name: name.trim() || 'Nova playlist',
        trackIds,
        createdAt: now,
        updatedAt: now,
      };
      await persistPlaylist(playlist);
      return playlist;
    },
    [persistPlaylist],
  );

  const updatePlaylist = useCallback(
    async (id: string, change: (playlist: Playlist) => Playlist) => {
      const playlist = playlists.find((item) => item.id === id);
      if (!playlist) return;
      await persistPlaylist({ ...change(playlist), updatedAt: Date.now() });
    },
    [persistPlaylist, playlists],
  );

  const renamePlaylist = useCallback(
    (id: string, name: string) =>
      updatePlaylist(id, (playlist) => ({ ...playlist, name: name.trim() || playlist.name })),
    [updatePlaylist],
  );

  const removePlaylist = useCallback(async (id: string) => {
    await dbDeletePlaylist(id);
    setPlaylists((current) => current.filter((playlist) => playlist.id !== id));
  }, []);

  const addToPlaylist = useCallback(
    async (playlistId: string, trackIds: string[]) => {
      let addedCount = 0;
      await updatePlaylist(playlistId, (playlist) => {
        const known = new Set(playlist.trackIds);
        const fresh = trackIds.filter((id) => !known.has(id));
        addedCount = fresh.length;
        return { ...playlist, trackIds: [...playlist.trackIds, ...fresh] };
      });
      notify(
        addedCount > 0
          ? `${addedCount} musica(s) adicionada(s) a playlist.`
          : 'Essas musicas ja estavam na playlist.',
        addedCount > 0 ? 'sucesso' : 'info',
      );
    },
    [notify, updatePlaylist],
  );

  const removeFromPlaylist = useCallback(
    (playlistId: string, trackId: string) =>
      updatePlaylist(playlistId, (playlist) => ({
        ...playlist,
        trackIds: playlist.trackIds.filter((id) => id !== trackId),
      })),
    [updatePlaylist],
  );

  const movePlaylistTrack = useCallback(
    (playlistId: string, from: number, to: number) =>
      updatePlaylist(playlistId, (playlist) => {
        const ids = [...playlist.trackIds];
        if (from < 0 || from >= ids.length || to < 0 || to >= ids.length) return playlist;
        const [moved] = ids.splice(from, 1);
        ids.splice(to, 0, moved);
        return { ...playlist, trackIds: ids };
      }),
    [updatePlaylist],
  );

  const value = useMemo<LibraryValue>(
    () => ({
      tracks,
      playlists,
      loading,
      importProgress,
      downloading,
      importFiles,
      removeTrack,
      saveArchiveTracks,
      downloadForOffline,
      removeOffline,
      createPlaylist,
      renamePlaylist,
      removePlaylist,
      addToPlaylist,
      removeFromPlaylist,
      movePlaylistTrack,
    }),
    [
      tracks, playlists, loading, importProgress, downloading, importFiles, removeTrack,
      saveArchiveTracks, downloadForOffline, removeOffline, createPlaylist, renamePlaylist,
      removePlaylist, addToPlaylist, removeFromPlaylist, movePlaylistTrack,
    ],
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryValue {
  const context = useContext(LibraryContext);
  if (!context) throw new Error('useLibrary precisa estar dentro de <LibraryProvider>');
  return context;
}
