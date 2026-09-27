import { useMemo, useRef, useState } from 'react';
import { ConfirmDialog, PromptDialog } from '../components/Dialogs.tsx';
import { IconCamera, IconCheck, IconClose, IconDoc, IconImport, IconMerge, IconSearch, IconSettings, IconTrash } from '../components/Icons.tsx';
import { toast } from '../components/Toast.tsx';
import { deleteDoc, getPage, listDocs, mergeDocs, type DocRecord } from '../db.ts';
import { fold, formatDate, plural } from '../lib/format.ts';
import { useBlobUrl, useDbQuery } from '../lib/hooks.ts';
import { importImages } from '../lib/pages.ts';
import { navigate } from '../lib/router.ts';

interface DocItem {
  doc: DocRecord;
  thumb?: Blob;
}

async function loadLibrary(): Promise<DocItem[]> {
  const docs = await listDocs();
  return Promise.all(
    docs.map(async (doc) => ({ doc, thumb: doc.pageIds[0] ? (await getPage(doc.pageIds[0]))?.thumb : undefined })),
  );
}

function DocCard({
  item,
  selecting,
  selected,
  onClick,
}: {
  item: DocItem;
  selecting: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const url = useBlobUrl(item.thumb);
  const n = item.doc.pageIds.length;
  return (
    <li>
      <button className={`doc-card${selected ? ' selected' : ''}`} onClick={onClick} aria-pressed={selecting ? selected : undefined}>
        <span className="doc-thumb">
          {url ? <img src={url} alt="" loading="lazy" /> : <IconDoc className="doc-thumb-empty" />}
          {n > 1 && <span className="doc-stack" aria-hidden="true" />}
          {selecting && <span className="doc-check">{selected && <IconCheck />}</span>}
        </span>
        <span className="doc-name">{item.doc.name}</span>
        <span className="doc-meta">
          {plural(n, 'página', 'páginas')} · {formatDate(item.doc.updatedAt)}
        </span>
      </button>
    </li>
  );
}

export function LibraryView() {
  const { data, loading } = useDbQuery(loadLibrary, []);
  const [query, setQuery] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const items = useMemo(() => {
    const q = fold(query.trim());
    if (!data) return [];
    return q ? data.filter((i) => q.split(/\s+/).every((t) => fold(i.doc.name).includes(t))) : data;
  }, [data, query]);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const exitSelect = () => {
    setSelecting(false);
    setSelected([]);
  };

  const onImport = async (files: FileList | null) => {
    if (!files?.length) return;
    setImporting('Importando…');
    const id = await importImages(Array.from(files), undefined, (d, t) => setImporting(`Importando ${d} de ${t}…`));
    setImporting(null);
    if (id) navigate({ name: 'doc', id });
    else toast('Nenhuma imagem pôde ser importada.');
  };

  // Nome sugerido ao juntar: o do primeiro selecionado, na ordem de toque.
  const firstSelectedName = data?.find((i) => i.doc.id === selected[0])?.doc.name ?? '';

  return (
    <div className="screen">
      <header className="bar">
        {selecting ? (
          <>
            <button className="icon-btn" onClick={exitSelect} aria-label="Cancelar seleção">
              <IconClose />
            </button>
            <h1 className="bar-title">{selected.length ? plural(selected.length, 'selecionado', 'selecionados') : 'Selecione'}</h1>
            <button
              className="icon-btn"
              disabled={selected.length < 2}
              onClick={() => setMergeOpen(true)}
              aria-label="Juntar documentos"
              title="Juntar"
            >
              <IconMerge />
            </button>
            <button
              className="icon-btn"
              disabled={!selected.length}
              onClick={() => setConfirmDelete(true)}
              aria-label="Excluir selecionados"
              title="Excluir"
            >
              <IconTrash />
            </button>
          </>
        ) : (
          <>
            <h1 className="bar-title brand">
              <img src="./icons/icon.svg" alt="" width="28" height="28" /> Scan Fly
            </h1>
            {!!data?.length && (
              <button className="text-btn" onClick={() => setSelecting(true)}>
                Selecionar
              </button>
            )}
            <button className="icon-btn" onClick={() => navigate({ name: 'settings' })} aria-label="Configurações">
              <IconSettings />
            </button>
          </>
        )}
      </header>

      <main className="content">
        {!!data?.length && (
          <label className="search">
            <IconSearch />
            <input
              type="search"
              placeholder="Buscar documentos"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Buscar documentos"
            />
          </label>
        )}

        {!loading && !data?.length && (
          <div className="empty">
            <div className="empty-art" aria-hidden="true">
              <IconDoc />
            </div>
            <h2>Nenhum documento ainda</h2>
            <p>
              Aponte a câmera para uma folha: as bordas são encontradas sozinhas, a perspectiva é corrigida e o
              resultado vira PDF. Tudo fica só neste aparelho.
            </p>
          </div>
        )}

        {!!data?.length && !items.length && <p className="muted center">Nada encontrado para “{query}”.</p>}

        <ul className="doc-grid">
          {items.map((item) => (
            <DocCard
              key={item.doc.id}
              item={item}
              selecting={selecting}
              selected={selected.includes(item.doc.id)}
              onClick={() => (selecting ? toggle(item.doc.id) : navigate({ name: 'doc', id: item.doc.id }))}
            />
          ))}
        </ul>
      </main>

      {!selecting && (
        <div className="fab-row">
          <button className="fab fab-secondary" onClick={() => fileInput.current?.click()} disabled={!!importing}>
            <IconImport />
            <span>{importing ?? 'Importar'}</span>
          </button>
          <button className="fab" onClick={() => navigate({ name: 'scan' })}>
            <IconCamera />
            <span>Digitalizar</span>
          </button>
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          onImport(e.target.files);
          e.target.value = '';
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Excluir documentos?"
        message={`${plural(selected.length, 'documento será apagado', 'documentos serão apagados')} deste aparelho, com todas as páginas. Não dá para desfazer.`}
        confirmLabel="Excluir"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          for (const id of selected) await deleteDoc(id);
          toast(plural(selected.length, 'documento excluído', 'documentos excluídos'));
          exitSelect();
        }}
      />

      <PromptDialog
        open={mergeOpen}
        title="Juntar documentos"
        label="Nome do documento combinado"
        initial={firstSelectedName}
        confirmLabel="Juntar"
        onCancel={() => setMergeOpen(false)}
        onSubmit={async (name) => {
          setMergeOpen(false);
          const id = await mergeDocs(selected, name);
          exitSelect();
          if (id) navigate({ name: 'doc', id });
        }}
      />
    </div>
  );
}
