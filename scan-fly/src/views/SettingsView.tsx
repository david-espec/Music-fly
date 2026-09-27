import { useEffect, useState } from 'react';
import { IconBack } from '../components/Icons.tsx';
import { toast } from '../components/Toast.tsx';
import { formatBytes } from '../lib/format.ts';
import { goBack } from '../lib/router.ts';
import { QUALITY, setPrefs, usePrefs, type Prefs } from '../prefs.ts';
import { FILTERS } from '../scan/filters.ts';
import { PAGE_SIZES, type PageSize } from '../scan/pdf.ts';
import type { FilterId } from '../scan/types.ts';

function Select<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="setting">
      <span className="setting-text">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SettingsView() {
  const prefs = usePrefs();
  const [storage, setStorage] = useState<{ usage: number; quota: number; persisted: boolean } | null>(null);

  const refreshStorage = async () => {
    if (!navigator.storage?.estimate) return;
    const [est, persisted] = await Promise.all([navigator.storage.estimate(), navigator.storage.persisted?.() ?? false]);
    setStorage({ usage: est.usage ?? 0, quota: est.quota ?? 0, persisted });
  };
  useEffect(() => {
    refreshStorage();
  }, []);

  return (
    <div className="screen">
      <header className="bar">
        <button className="icon-btn" onClick={() => goBack({ name: 'library' })} aria-label="Voltar">
          <IconBack />
        </button>
        <h1 className="bar-title">Configurações</h1>
      </header>
      <main className="content narrow">
        <section className="settings-group">
          <h2>Digitalização</h2>
          <Select<FilterId>
            label="Filtro padrão"
            hint="Aplicado a cada página nova. Dá para trocar depois, página por página."
            value={prefs.defaultFilter}
            options={FILTERS}
            onChange={(defaultFilter) => setPrefs({ defaultFilter })}
          />
          <label className="setting">
            <span className="setting-text">
              <span>Captura automática</span>
              <small>Tira a foto sozinha quando a folha fica parada na mira.</small>
            </span>
            <input
              type="checkbox"
              className="switch"
              checked={prefs.autoCapture}
              onChange={(e) => setPrefs({ autoCapture: e.target.checked })}
            />
          </label>
          <Select<Prefs['quality']>
            label="Qualidade da imagem"
            hint="Alta para arquivar, baixa para mandar por e-mail. Vale para as páginas processadas daqui em diante."
            value={prefs.quality}
            options={(Object.keys(QUALITY) as Prefs['quality'][]).map((id) => ({ id, label: QUALITY[id].label }))}
            onChange={(quality) => setPrefs({ quality })}
          />
        </section>

        <section className="settings-group">
          <h2>PDF</h2>
          <Select<PageSize>
            label="Tamanho da página"
            hint="Automático segue o formato da folha; A4 e Carta encaixam a imagem na página."
            value={prefs.pageSize}
            options={PAGE_SIZES}
            onChange={(pageSize) => setPrefs({ pageSize })}
          />
        </section>

        <section className="settings-group">
          <h2>Aparência</h2>
          <Select<Prefs['theme']>
            label="Tema"
            value={prefs.theme}
            options={[
              { id: 'sistema', label: 'Igual ao sistema' },
              { id: 'claro', label: 'Claro' },
              { id: 'escuro', label: 'Escuro' },
            ]}
            onChange={(theme) => setPrefs({ theme })}
          />
        </section>

        <section className="settings-group">
          <h2>Armazenamento</h2>
          {storage ? (
            <div className="setting">
              <span className="setting-text">
                <span>{formatBytes(storage.usage)} em uso</span>
                <small>
                  {storage.persisted
                    ? 'Armazenamento persistente ligado: o navegador não apaga seus documentos para liberar espaço.'
                    : 'Sem armazenamento persistente, o navegador pode apagar os documentos se o aparelho ficar sem espaço.'}
                </small>
              </span>
              {!storage.persisted && navigator.storage?.persist && (
                <button
                  className="btn"
                  onClick={async () => {
                    const ok = await navigator.storage.persist();
                    toast(ok ? 'Armazenamento persistente ligado' : 'O navegador recusou o pedido');
                    refreshStorage();
                  }}
                >
                  Ligar
                </button>
              )}
            </div>
          ) : (
            <p className="muted">Este navegador não informa o espaço usado.</p>
          )}
        </section>

        <section className="settings-group about">
          <h2>Sobre</h2>
          <p>
            <strong>Scan Fly</strong> transforma fotos de papéis em PDFs limpos: encontra as bordas da folha, corrige a
            perspectiva, tira a sombra e deixa o fundo branco.
          </p>
          <p>
            Tudo acontece neste aparelho. As fotos não são enviadas a nenhum servidor, não há conta, anúncio nem
            rastreamento. Depois de aberto uma vez, o app funciona sem internet.
          </p>
        </section>
      </main>
    </div>
  );
}
