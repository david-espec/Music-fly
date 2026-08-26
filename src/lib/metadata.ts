import { parseBlob, type IAudioMetadata } from 'music-metadata';
import type { LyricLine, Track } from '../types';
import { uid } from './format';
import { parsePlain } from './lrc';

export interface EmbeddedLyrics {
  lines: LyricLine[];
  synced: boolean;
}

export interface ParsedFile {
  track: Track;
  cover: Blob | null;
  lyrics: EmbeddedLyrics | null;
}

/** ID3v2 SYLT: timestamps em milissegundos. */
const TIMESTAMP_MILLISECONDS = 2;

/**
 * Le a letra gravada dentro do arquivo. SYLT traz linhas com tempo; USLT traz
 * apenas o texto corrido.
 */
function readEmbeddedLyrics(meta: IAudioMetadata): EmbeddedLyrics | null {
  for (const tag of meta.common.lyrics ?? []) {
    const synced = tag.syncText?.filter((entry) => entry.timestamp !== undefined) ?? [];
    // So da para sincronizar quando os tempos estao em milissegundos; os outros
    // formatos do ID3 contam quadros MPEG, que nao conseguimos converter aqui.
    if (synced.length > 0 && tag.timeStampFormat === TIMESTAMP_MILLISECONDS) {
      return {
        lines: synced.map((entry) => ({
          time: (entry.timestamp as number) / 1000,
          text: entry.text.replace(/\r?\n/g, ' ').trim(),
        })),
        synced: true,
      };
    }
    if (tag.text?.trim()) {
      return { lines: parsePlain(tag.text), synced: false };
    }
  }
  return null;
}

const AUDIO_EXTENSIONS = /\.(mp3|m4a|aac|flac|ogg|oga|opus|wav|wma|aiff?|webm)$/i;

export function isAudioFile(file: File): boolean {
  return file.type.startsWith('audio/') || AUDIO_EXTENSIONS.test(file.name);
}

/** Ultimo recurso: deduz artista e titulo a partir de "Artista - Titulo.mp3". */
function guessFromFilename(fileName: string): { artist: string; title: string } {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
  const parts = base.split(/\s+-\s+/);
  if (parts.length >= 2) {
    const artist = parts[0].trim();
    const title = parts.slice(1).join(' - ').trim();
    // Descarta uma numeracao de faixa inicial ("01 - Titulo").
    if (/^\d{1,3}$/.test(artist)) return { artist: 'Artista desconhecido', title };
    return { artist, title };
  }
  return { artist: 'Artista desconhecido', title: base || fileName };
}

/**
 * Le a duracao com um elemento <audio> quando o parser de tags nao consegue
 * determina-la (comum em MP3 com bitrate variavel sem cabecalho Xing).
 */
export function probeDuration(src: Blob | string): Promise<number> {
  return new Promise((resolve) => {
    const url = typeof src === 'string' ? src : URL.createObjectURL(src);
    const audio = new Audio();
    const cleanup = () => {
      audio.removeAttribute('src');
      audio.load();
      if (typeof src !== 'string') URL.revokeObjectURL(url);
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve(0);
    }, 15000);
    audio.preload = 'metadata';
    audio.addEventListener('loadedmetadata', () => {
      clearTimeout(timer);
      const value = Number.isFinite(audio.duration) ? audio.duration : 0;
      cleanup();
      resolve(value);
    });
    audio.addEventListener('error', () => {
      clearTimeout(timer);
      cleanup();
      resolve(0);
    });
    audio.src = url;
  });
}

/** Extrai tags, capa e duracao de um arquivo escolhido pelo usuario. */
export async function readLocalFile(file: File): Promise<ParsedFile> {
  const fallback = guessFromFilename(file.name);
  const track: Track = {
    id: uid(),
    source: 'local',
    title: fallback.title,
    artist: fallback.artist,
    album: 'Album desconhecido',
    duration: 0,
    addedAt: Date.now(),
    fileName: file.name,
    mimeType: file.type || 'audio/mpeg',
    size: file.size,
    hasCover: false,
    hasLyrics: false,
    offline: true,
  };

  let cover: Blob | null = null;
  let lyrics: EmbeddedLyrics | null = null;

  try {
    const meta = await parseBlob(file, { duration: true });
    const common = meta.common;
    if (common.title?.trim()) track.title = common.title.trim();
    if (common.artist?.trim()) track.artist = common.artist.trim();
    else if (common.albumartist?.trim()) track.artist = common.albumartist.trim();
    if (common.album?.trim()) track.album = common.album.trim();
    if (common.year) track.year = common.year;
    if (common.track?.no) track.trackNo = common.track.no;
    if (meta.format.duration) track.duration = meta.format.duration;

    const picture = common.picture?.[0];
    if (picture) {
      cover = new Blob([new Uint8Array(picture.data)], {
        type: picture.format || 'image/jpeg',
      });
      track.hasCover = true;
    }

    lyrics = readEmbeddedLyrics(meta);
    track.hasLyrics = lyrics !== null;
  } catch {
    // Formato sem tags ou corrompido: seguimos com os dados do nome do arquivo.
  }

  if (!track.duration) track.duration = await probeDuration(file);

  return { track, cover, lyrics };
}
