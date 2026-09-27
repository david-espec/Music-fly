import { useRef, useState } from 'react';
import { ConfirmDialog, PromptDialog } from '../components/Dialogs.tsx';
import { ExportSheet } from '../components/ExportSheet.tsx';
import { IconBack, IconCamera, IconChevronLeft, IconChevronRight, IconEdit, IconImport, IconShare, IconTrash } from '../components/Icons.tsx';
import { toast } from '../components/Toast.tsx';
import { deleteDoc, getDoc, getPages, updateDoc, type PageRecord } from '../db.ts';
import { formatDate, plural } from '../lib/format.ts';
import { useBlobUrl, useDbQuery } from '../lib/hooks.ts';
import { importImages } from '../lib/pages.ts';
import { goBack, navigate } from '../lib/router.ts';

function PageThumb({
  page,
  index,
  total,
  reordering,
  onOpen,
  onMove,
}: {
  page: PageRecord;
  index: number;
  total: number;
  reordering: boolean;
  onOpen: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const url = useBlobUrl(page.thumb);
  return (
    <li className="page-cell">
      <button className="page-thumb" onClick={onOpen} disabled={reordering} aria-label={`Página ${index + 1}`}>
        {url && <img src={url} alt="" style={{ aspectRatio: `${page.width} / ${page.height}` }} />}
      </button>
      {reordering ? (
        <div className="page-move">
          <button className="icon-btn small" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Mover para antes">
            <IconChevronLeft />
          </button>
          <span>{index + 1}</span>
          <button className="icon-btn small" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="Mover para depois">
            <IconChevronRight />
          </button>
        </div>
      ) : (
        <span className="page-num">{index + 1}</span>
      )}
    </li>
  );
}

export function DocumentView({ id }: { id: string }) {
  const { data, loading } = useDbQuery(async () => {
    const doc = await getDoc(id);
    return doc ? { doc, pages: await getPages(doc) } : null;
  }, [id]);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  if (loading && !data) return <div className="screen" />;
  if (!data) {
    return (
      <div className="screen">
        <header className="bar">
          <button className="icon-btn" onClick={() => navigate({ name: 'library' }, { replace: true })} aria-label="Voltar">
            <IconBack />
          </button>
          <h1 className="bar-title">Documento</h1>
        </header>
        <p className="muted center">Este documento não existe mais.</p>
      </div>
    );
  }
  const { doc, pages } = data;

  const move = (index: number, dir: -1 | 1) => {
    const ids = doc.pageIds.slice();
    const j = index + dir;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    updateDoc(doc.id, { pageIds: ids });
  };

  return (
    <div className="screen">
      <header className="bar">
        <button className="icon-btn" onClick={() => goBack({ name: 'library' })} aria-label="Voltar">
          <IconBack />
        </button>
        <button className="bar-title title-btn" onClick={() => setRenaming(true)} title="Renomear">
          <span>{doc.name}</span>
          <IconEdit className="title-edit" />
        </button>
        <button className="icon-btn" onClick={() => setDeleting(true)} aria-label="Excluir documento">
          <IconTrash />
        </button>
      </header>

      <main className="content">
        <div className="doc-summary">
          <span className="muted">
            {plural(pages.length, 'página', 'páginas')} · criado {formatDate(doc.createdAt).toLowerCase()}
          </span>
          {pages.length > 1 && (
            <button className="text-btn" onClick={() => setReordering((r) => !r)}>
              {reordering ? 'Pronto' : 'Reordenar'}
            </button>
          )}
        </div>
        {!pages.length && <p className="muted center">Documento vazio. Adicione páginas pela câmera ou importando imagens.</p>}
        <ul className="page-grid">
          {pages.map((p, i) => (
            <PageThumb
              key={p.id}
              page={p}
              index={i}
              total={pages.length}
              reordering={reordering}
              onOpen={() => navigate({ name: 'page', docId: doc.id, pageId: p.id })}
              onMove={(dir) => move(i, dir)}
            />
          ))}
        </ul>
      </main>

      <footer className="action-bar">
        <button className="action" onClick={() => navigate({ name: 'scan', docId: doc.id })}>
          <IconCamera />
          <span>Adicionar</span>
        </button>
        <button className="action" onClick={() => fileInput.current?.click()} disabled={importing}>
          <IconImport />
          <span>{importing ? 'Importando…' : 'Importar'}</span>
        </button>
        <button className="action primary" onClick={() => setExporting(true)} disabled={!pages.length}>
          <IconShare />
          <span>Exportar</span>
        </button>
      </footer>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (!files.length) return;
          setImporting(true);
          await importImages(files, doc.id);
          setImporting(false);
        }}
      />

      <PromptDialog
        open={renaming}
        title="Renomear"
        label="Nome do documento"
        initial={doc.name}
        onCancel={() => setRenaming(false)}
        onSubmit={(name) => {
          setRenaming(false);
          updateDoc(doc.id, { name });
        }}
      />
      <ConfirmDialog
        open={deleting}
        title="Excluir documento?"
        message={`“${doc.name}” e ${plural(pages.length, 'página', 'páginas')} serão apagados deste aparelho. Não dá para desfazer.`}
        confirmLabel="Excluir"
        danger
        onCancel={() => setDeleting(false)}
        onConfirm={async () => {
          setDeleting(false);
          await deleteDoc(doc.id);
          toast('Documento excluído');
          navigate({ name: 'library' }, { replace: true });
        }}
      />
      <ExportSheet open={exporting} onClose={() => setExporting(false)} doc={doc} pages={pages} />
    </div>
  );
}
