import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { RepeatMode, Track } from '../types';
import { getAudioBlob, getCoverUrl, getPref, setPref } from '../db';
import { useToast } from '../components/Toast';
import { on, emit } from '../lib/bus';
import { emptyQueue, queueReducer } from './queueReducer';

interface PlayerValue {
  queue: Track[];
  current: Track | null;
  /** Posicao da faixa atual dentro de `queue`. */
  currentQueuePosition: number;
  /**
   * A fila na ordem em que vai tocar. Com o modo aleatorio ligado, essa ordem
   * difere de `queue`, que guarda as faixas como foram enfileiradas.
   */
  orderedQueue: { track: Track; position: number }[];
  /** Indice da faixa atual dentro de `orderedQueue`. */
  currentOrderIndex: number;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
  /** Continuar a musica de onde parou (RN18). */
  resumeEnabled: boolean;
  setResumeEnabled: (value: boolean) => void;

  /**
   * Tempo exato do audio agora. A letra sincronizada le isto a cada quadro:
   * `currentTime` do estado so muda com o evento timeupdate (~4x por segundo),
   * frequencia baixa demais para o destaque acompanhar a musica.
   */
  getCurrentTime: () => number;

  playTracks: (tracks: Track[], startIndex?: number) => void;
  addToQueue: (tracks: Track[]) => void;
  playNextInQueue: (tracks: Track[]) => void;
  removeFromQueue: (queuePosition: number) => void;
  /** Move uma faixa dentro da fila, pela posicao de exibicao (RF27). */
  moveInQueue: (from: number, to: number) => void;
  clearQueue: () => void;
  jumpTo: (queuePosition: number) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  seekBy: (delta: number) => void;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  cycleRepeat: () => void;
  toggleShuffle: () => void;
}

const PlayerContext = createContext<PlayerValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const notify = useToast();

  const audioRef = useRef<HTMLAudioElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  /** Impede que um carregamento lento sobrescreva outro mais recente. */
  const loadTokenRef = useRef(0);
  /** Se a proxima troca de faixa deve comecar tocando. */
  const shouldPlayRef = useRef(false);
  /** Ultima faixa ja contabilizada no historico; evita recontar ao despausar. */
  const playedRef = useRef<string | null>(null);
  /** Posicao do ultimo aviso de progresso, para medir quanto foi ouvido. */
  const lastReportRef = useRef(0);
  /** Retomar a posicao salva vale so para a primeira carga da faixa. */
  const resumeToRef = useRef<number | null>(null);

  const [state, dispatch] = useReducer(queueReducer, emptyQueue);
  const { queue, order, index } = state;

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMuted] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');
  const [shuffle, setShuffle] = useState(false);
  const [resumeEnabled, setResumeEnabled] = useState(true);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const currentQueuePosition = index >= 0 ? order[index] ?? -1 : -1;
  const orderedQueue = useMemo(
    () =>
      order
        .map((position) => ({ track: queue[position], position }))
        .filter((item) => item.track !== undefined),
    [order, queue],
  );
  const current = currentQueuePosition >= 0 ? queue[currentQueuePosition] ?? null : null;

  // --- Preferencias persistidas ---------------------------------------------

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [savedVolume, savedRepeat, savedShuffle, savedMuted, savedResume] = await Promise.all([
        getPref('volume', 1),
        getPref<RepeatMode>('repeat', 'off'),
        getPref('shuffle', false),
        getPref('muted', false),
        getPref('resume', true),
      ]);
      if (!alive) return;
      setVolumeState(savedVolume);
      setRepeat(savedRepeat);
      setShuffle(savedShuffle);
      setMuted(savedMuted);
      setResumeEnabled(savedResume);
      setPrefsLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!prefsLoaded) return;
    void setPref('volume', volume);
    void setPref('repeat', repeat);
    void setPref('shuffle', shuffle);
    void setPref('muted', muted);
    void setPref('resume', resumeEnabled);
  }, [prefsLoaded, volume, repeat, shuffle, muted, resumeEnabled]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [volume, muted]);

  // --- Navegacao -------------------------------------------------------------

  const restartCurrent = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    shouldPlayRef.current = true;
    void audio.play().catch(() => setIsPlaying(false));
  }, []);

  const advance = useCallback(
    (step: number, auto: boolean) => {
      if (index < 0 || order.length === 0) return;
      const target = index + step;

      if (target >= order.length) {
        if (repeat !== 'all') {
          shouldPlayRef.current = false;
          if (auto) setIsPlaying(false);
          return;
        }
        // Fila de uma faixa so: nao ha troca, entao reiniciamos na mao.
        if (order.length === 1) {
          restartCurrent();
          return;
        }
        shouldPlayRef.current = true;
        dispatch({ type: 'setIndex', index: 0 });
        return;
      }

      if (target < 0) {
        if (repeat === 'all' && order.length > 1) {
          shouldPlayRef.current = true;
          dispatch({ type: 'setIndex', index: order.length - 1 });
        } else {
          restartCurrent();
        }
        return;
      }

      shouldPlayRef.current = true;
      dispatch({ type: 'setIndex', index: target });
    },
    [index, order.length, repeat, restartCurrent],
  );

  /**
   * Informa quanto foi ouvido desde o ultimo aviso. O tempo ouvido e medido
   * pelo avanco da posicao, e nao pelo relogio: assim pular para frente nao
   * conta como escuta, e ouvir o mesmo trecho de novo conta de novo.
   */
  const reportProgress = useCallback((completed = false) => {
    const audio = audioRef.current;
    const id = playedRef.current;
    if (!audio || !id) return;

    const position = audio.currentTime;
    const delta = position - lastReportRef.current;
    lastReportRef.current = position;
    // Saltos para tras, ou pulos longos para frente, nao sao escuta.
    const listened = delta > 0 && delta < 30 ? delta : 0;

    if (listened === 0 && !completed) return;
    emit('playback-progress', { id, position, listened, completed });
  }, []);

  const next = useCallback(() => advance(1, false), [advance]);

  const previous = useCallback(() => {
    const audio = audioRef.current;
    // Convencao usual: passados 3s, "anterior" reinicia a faixa atual.
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setCurrentTime(0);
      return;
    }
    advance(-1, false);
  }, [advance]);

  // --- Carregamento da faixa atual -------------------------------------------

  const currentId = current?.id ?? null;
  const currentTitle = current?.title ?? '';
  const currentStreamUrl = current?.streamUrl ?? null;
  const currentDuration = current?.duration ?? 0;
  const currentProgress = current?.progressSeconds ?? 0;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!currentId) {
      audio.removeAttribute('src');
      audio.load();
      setDuration(0);
      setCurrentTime(0);
      return;
    }

    const token = ++loadTokenRef.current;
    setIsLoading(true);

    void (async () => {
      let src: string | null = null;
      try {
        const blob = await getAudioBlob(currentId);
        if (blob) src = URL.createObjectURL(blob);
      } catch {
        // Falha de leitura no IndexedDB: tentamos o stream abaixo.
      }
      if (!src) src = currentStreamUrl;

      // Um carregamento mais novo comecou enquanto liamos o disco.
      if (token !== loadTokenRef.current) {
        if (src?.startsWith('blob:')) URL.revokeObjectURL(src);
        return;
      }

      if (!src) {
        setIsLoading(false);
        setIsPlaying(false);
        notify(`"${currentTitle}" nao esta disponivel offline.`, 'erro');
        return;
      }

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      if (src.startsWith('blob:')) objectUrlRef.current = src;

      // RN18: continuar de onde parou. Os limites sao proporcionais a faixa,
      // e nao um numero fixo de segundos: 15 s sao muito numa vinheta de 30 s e
      // pouco numa musica de 6 min. Retomar quase no comeco ou quase no fim
      // atrapalha mais do que ajuda, entao esses casos comecam do zero.
      const minima = Math.max(3, currentDuration * 0.05);
      const limite = currentDuration > 0 ? currentDuration * 0.95 : Number.POSITIVE_INFINITY;
      const valeRetomar = currentProgress > minima && currentProgress < limite;
      resumeToRef.current = resumeEnabled && valeRetomar ? currentProgress : null;

      audio.src = src;
      audio.load();
      setCurrentTime(0);
      setDuration(currentDuration);

      if (shouldPlayRef.current) {
        try {
          await audio.play();
        } catch {
          // Autoplay bloqueado ou faixa trocada durante o play().
          if (token === loadTokenRef.current) setIsPlaying(false);
        }
      }
    })();
  }, [currentId, currentStreamUrl, currentTitle, currentDuration, currentProgress, resumeEnabled, notify]);

  // Libera o ultimo object URL ao desmontar.
  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    },
    [],
  );

  // --- Eventos do elemento de audio ------------------------------------------

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => {
      setIsPlaying(true);
      if (currentId && playedRef.current !== currentId) {
        playedRef.current = currentId;
        lastReportRef.current = audio.currentTime;
        emit('track-played', currentId);
      }
    };
    const onPause = () => {
      setIsPlaying(false);
      // Guarda a posicao ao pausar: e o momento em que o usuario "parou".
      reportProgress();
    };
    const onWaiting = () => setIsLoading(true);
    const onPlaying = () => setIsLoading(false);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);

    const onLoadedMetadata = () => {
      setIsLoading(false);
      // So aqui a duracao existe e definir currentTime tem efeito.
      if (resumeToRef.current !== null) {
        audio.currentTime = resumeToRef.current;
        lastReportRef.current = resumeToRef.current;
        setCurrentTime(resumeToRef.current);
        resumeToRef.current = null;
      }
      if (!Number.isFinite(audio.duration)) return;
      setDuration(audio.duration);
      // Faixas do acervo costumam chegar sem duracao confiavel nos metadados.
      if (currentId && Math.abs(currentDuration - audio.duration) > 1) {
        emit('duration-resolved', { id: currentId, duration: audio.duration });
      }
    };

    const onEnded = () => {
      reportProgress(true);
      if (repeat === 'one') {
        restartCurrent();
        return;
      }
      advance(1, true);
    };

    const onError = () => {
      setIsLoading(false);
      setIsPlaying(false);
      if (!currentId) return;
      const hint = navigator.onLine
        ? ''
        : ' Voce esta offline; baixe a faixa para ouvir sem internet.';
      notify(`Nao foi possivel tocar "${currentTitle}".${hint}`, 'erro');
    };

    // Um aviso a cada 5 s mantem as estatisticas em dia sem escrever no banco
    // a cada quadro.
    const ticker = window.setInterval(() => {
      if (!audio.paused) reportProgress();
    }, 5000);

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    return () => {
      window.clearInterval(ticker);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [advance, currentDuration, currentId, currentTitle, notify, repeat, reportProgress, restartCurrent]);

  useEffect(
    () =>
      on('duration-resolved', ({ id, duration: value }) =>
        dispatch({ type: 'updateDuration', id, duration: value }),
      ),
    [],
  );

  useEffect(() => on('track-removed', (id) => dispatch({ type: 'removeById', id })), []);

  useEffect(() => on('track-updated', (track) => dispatch({ type: 'replaceTrack', track })), []);

  // --- Acoes -----------------------------------------------------------------

  const playTracks = useCallback(
    (tracks: Track[], startIndex = 0) => {
      if (tracks.length === 0) return;
      shouldPlayRef.current = true;
      dispatch({ type: 'play', tracks, startIndex, shuffle });
    },
    [shuffle],
  );

  const addToQueue = useCallback(
    (tracks: Track[]) => dispatch({ type: 'append', tracks }),
    [],
  );

  const playNextInQueue = useCallback(
    (tracks: Track[]) => dispatch({ type: 'insertNext', tracks }),
    [],
  );

  const removeFromQueue = useCallback(
    (position: number) => dispatch({ type: 'removeAt', position }),
    [],
  );

  const moveInQueue = useCallback(
    (from: number, to: number) => dispatch({ type: 'moveInOrder', from, to }),
    [],
  );

  const clearQueue = useCallback(() => {
    shouldPlayRef.current = false;
    audioRef.current?.pause();
    dispatch({ type: 'clear' });
  }, []);

  const jumpTo = useCallback((position: number) => {
    shouldPlayRef.current = true;
    dispatch({ type: 'jumpTo', position });
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentId) return;
    if (audio.paused) {
      shouldPlayRef.current = true;
      void audio.play().catch(() => setIsPlaying(false));
    } else {
      shouldPlayRef.current = false;
      audio.pause();
    }
  }, [currentId]);

  const getCurrentTime = useCallback(() => audioRef.current?.currentTime ?? 0, []);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(seconds)) return;
    audio.currentTime = Math.max(0, seconds);
    setCurrentTime(audio.currentTime);
  }, []);

  const seekBy = useCallback((delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const limit = Number.isFinite(audio.duration) ? audio.duration : Infinity;
    audio.currentTime = Math.max(0, Math.min(limit, audio.currentTime + delta));
    setCurrentTime(audio.currentTime);
  }, []);

  const setVolume = useCallback((value: number) => {
    const clamped = Math.max(0, Math.min(1, value));
    setVolumeState(clamped);
    if (clamped > 0) setMuted(false);
  }, []);

  const toggleMute = useCallback(() => setMuted((value) => !value), []);

  const cycleRepeat = useCallback(
    () => setRepeat((mode) => (mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off')),
    [],
  );

  const toggleShuffle = useCallback(() => {
    const enabled = !shuffle;
    setShuffle(enabled);
    dispatch({ type: 'setShuffle', enabled });
  }, [shuffle]);

  // --- Controles do sistema (tela de bloqueio, teclas de midia) --------------

  useEffect(() => {
    const session = navigator.mediaSession;
    if (!session) return;
    if (!current) {
      session.metadata = null;
      session.playbackState = 'none';
      return;
    }

    let cancelled = false;
    void (async () => {
      const localCover = current.hasCover ? await getCoverUrl(current.id) : null;
      if (cancelled) return;
      session.metadata = new MediaMetadata({
        title: current.title,
        artist: current.artist,
        album: current.album,
        artwork: [
          {
            src: localCover ?? current.remoteCoverUrl ?? './icons/icon-512.png',
            sizes: '512x512',
          },
        ],
      });
    })();

    session.playbackState = isPlaying ? 'playing' : 'paused';
    return () => {
      cancelled = true;
    };
  }, [current, isPlaying]);

  useEffect(() => {
    const session = navigator.mediaSession;
    if (!session) return;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', toggle],
      ['pause', toggle],
      ['nexttrack', next],
      ['previoustrack', previous],
      ['seekbackward', () => seekBy(-10)],
      ['seekforward', () => seekBy(10)],
      ['seekto', (details) => details.seekTime != null && seek(details.seekTime)],
      ['stop', clearQueue],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Nem todo navegador implementa todas as acoes.
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {
          /* ignorado */
        }
      }
    };
  }, [clearQueue, next, previous, seek, seekBy, toggle]);

  useEffect(() => {
    const session = navigator.mediaSession;
    if (!session?.setPositionState || !duration || !Number.isFinite(duration)) return;
    try {
      session.setPositionState({
        duration,
        position: Math.min(currentTime, duration),
        playbackRate: 1,
      });
    } catch {
      // Posicao invalida durante a troca de faixa.
    }
  }, [currentTime, duration]);

  const value = useMemo<PlayerValue>(
    () => ({
      queue,
      current,
      currentQueuePosition,
      orderedQueue,
      currentOrderIndex: index,
      isPlaying,
      isLoading,
      currentTime,
      duration,
      volume,
      muted,
      repeat,
      shuffle,
      resumeEnabled,
      setResumeEnabled,
      getCurrentTime,
      playTracks,
      addToQueue,
      playNextInQueue,
      removeFromQueue,
      moveInQueue,
      clearQueue,
      jumpTo,
      toggle,
      next,
      previous,
      seek,
      seekBy,
      setVolume,
      toggleMute,
      cycleRepeat,
      toggleShuffle,
    }),
    [
      queue, current, currentQueuePosition, orderedQueue, index, isPlaying, isLoading, currentTime, duration,
      volume, muted, repeat, shuffle, resumeEnabled, getCurrentTime, playTracks, addToQueue, playNextInQueue,
      removeFromQueue, moveInQueue, clearQueue, jumpTo, toggle, next, previous, seek, seekBy,
      setVolume, toggleMute, cycleRepeat, toggleShuffle,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>
      {/* Um unico elemento de audio para todo o app, montado junto do provider. */}
      <audio ref={audioRef} preload="metadata" hidden />
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerValue {
  const context = useContext(PlayerContext);
  if (!context) throw new Error('usePlayer precisa estar dentro de <PlayerProvider>');
  return context;
}
