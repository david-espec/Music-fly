/**
 * Cliente do Radio Browser - catalogo aberto de radios da internet, sem chave
 * e sem cadastro.
 *
 * A radio resolve o que o acervo nao resolve: a estacao ja paga a licenca do
 * que toca, entao uma radio de funk carioca toca os MCs do momento sem que o
 * app precise hospedar ou baixar nada. Em troca, e ao vivo: nao da para pular,
 * voltar, guardar offline nem saber quanto falta.
 */
import type { RadioStation, Track } from '../types';
import { uid } from './format';

const API = 'https://all.api.radio-browser.info/json';

/**
 * Estilos oferecidos como atalho, na ordem em que se procura por aqui. Cada um
 * vira uma consulta por etiqueta; as etiquetas do Radio Browser sao livres e
 * minusculas, e as brasileiras costumam estar em portugues mesmo.
 */
export const RADIO_TAGS: { id: string; label: string; tag: string }[] = [
  { id: 'funk', label: 'Funk', tag: 'funk carioca' },
  { id: 'sertanejo', label: 'Sertanejo', tag: 'sertanejo' },
  { id: 'pagode', label: 'Pagode', tag: 'pagode' },
  { id: 'samba', label: 'Samba', tag: 'samba' },
  { id: 'mpb', label: 'MPB', tag: 'mpb' },
  { id: 'forro', label: 'Forro', tag: 'forro' },
  { id: 'axe', label: 'Axe', tag: 'axe' },
  { id: 'gospel', label: 'Gospel', tag: 'gospel' },
  { id: 'rap', label: 'Rap', tag: 'rap' },
  { id: 'pop', label: 'Pop', tag: 'pop' },
  { id: 'rock', label: 'Rock', tag: 'rock' },
  { id: 'eletronica', label: 'Eletronica', tag: 'electronic' },
  { id: 'reggae', label: 'Reggae', tag: 'reggae' },
  { id: 'jazz', label: 'Jazz', tag: 'jazz' },
  { id: 'blues', label: 'Blues', tag: 'blues' },
  { id: 'classica', label: 'Classica', tag: 'classical' },
  { id: 'metal', label: 'Metal', tag: 'metal' },
  { id: 'country', label: 'Country', tag: 'country' },
  { id: 'lofi', label: 'Lo-fi', tag: 'lounge' },
  { id: 'noticias', label: 'Noticias', tag: 'news' },
];

interface StationDoc {
  stationuuid: string;
  name?: string;
  url?: string;
  url_resolved?: string;
  homepage?: string;
  favicon?: string;
  tags?: string;
  country?: string;
  countrycode?: string;
  language?: string;
  codec?: string;
  bitrate?: number;
  votes?: number;
  clickcount?: number;
  lastcheckok?: number;
}

/**
 * O app e servido por HTTPS, e o navegador recusa audio em HTTP dentro de uma
 * pagina HTTPS (conteudo misto). Nao ha contorno do lado do cliente: uma
 * estacao so em HTTP simplesmente nao toca, entao ela nem entra na lista.
 */
function playableUrl(doc: StationDoc): string | null {
  const url = doc.url_resolved?.trim() || doc.url?.trim() || '';
  return url.startsWith('https://') ? url : null;
}

/** "funk carioca,baile funk,brasil" -> ["Funk carioca", "Baile funk", "Brasil"] */
function parseTags(tags: string | undefined): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const bruto of (tags ?? '').split(',')) {
    const limpo = bruto.trim();
    if (!limpo || vistos.has(limpo.toLowerCase())) continue;
    vistos.add(limpo.toLowerCase());
    saida.push(limpo.charAt(0).toUpperCase() + limpo.slice(1));
  }
  return saida;
}

export async function searchStations(
  options: { query?: string; tag?: string; onlyBrazil?: boolean; limit?: number },
  signal?: AbortSignal,
): Promise<RadioStation[]> {
  const params = new URLSearchParams({
    // Pedimos mais do que mostramos: o filtro de HTTPS corta boa parte, e sem
    // essa folga a lista chegaria quase vazia.
    limit: String((options.limit ?? 40) * 4),
    hidebroken: 'true',
    order: 'clickcount',
    reverse: 'true',
  });

  const termo = options.query?.trim();
  if (termo) params.set('name', termo);
  if (options.tag) params.set('tagList', options.tag);
  if (options.onlyBrazil) params.set('countrycode', 'BR');

  const response = await fetch(`${API}/stations/search?${params}`, { signal });
  if (!response.ok) throw new Error(`Busca de radios falhou (${response.status})`);
  const docs = (await response.json()) as StationDoc[];

  const saida: RadioStation[] = [];
  const vistos = new Set<string>();
  for (const doc of Array.isArray(docs) ? docs : []) {
    const url = playableUrl(doc);
    const nome = doc.name?.trim();
    if (!url || !nome || doc.lastcheckok === 0) continue;
    // O catalogo tem a mesma estacao cadastrada mais de uma vez.
    const chave = nome.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    saida.push({
      uuid: doc.stationuuid,
      name: nome,
      streamUrl: url,
      homepage: doc.homepage?.trim() || undefined,
      favicon: doc.favicon?.startsWith('https://') ? doc.favicon : undefined,
      tags: parseTags(doc.tags),
      country: doc.country?.trim() || undefined,
      countryCode: doc.countrycode?.trim() || undefined,
      codec: doc.codec?.trim() || undefined,
      bitrate: doc.bitrate || undefined,
      clicks: doc.clickcount,
    });
    if (saida.length >= (options.limit ?? 40)) break;
  }
  return saida;
}

/**
 * O Radio Browser pede que quem toca avise, e e assim que a lista de mais
 * ouvidas se mantem util para todo mundo. E cortesia, nao requisito: se
 * falhar, a estacao toca do mesmo jeito.
 */
export function registerListen(uuid: string): void {
  void fetch(`${API}/url/${encodeURIComponent(uuid)}`).catch(() => {});
}

/**
 * A estacao vira uma faixa efemera: toca pelo mesmo player, mas nao e salva na
 * biblioteca nem entra nas estatisticas. Duracao 0 e o que marca "ao vivo" -
 * e o player usa isso para nao oferecer barra de progresso nem retomada.
 */
export function stationToTrack(station: RadioStation): Track {
  const descricao = [station.tags[0], station.country].filter(Boolean).join(' · ');
  return {
    id: uid(),
    source: 'radio',
    title: station.name,
    artist: descricao || 'Radio ao vivo',
    album: 'Radio',
    duration: 0,
    addedAt: Date.now(),
    streamUrl: station.streamUrl,
    remoteCoverUrl: station.favicon,
    radioUuid: station.uuid,
    hasCover: false,
    hasLyrics: false,
    offline: false,
  };
}
