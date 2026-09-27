import { useEffect, useState } from 'react';
import { CropEditor } from '../components/CropEditor.tsx';
import { ConfirmDialog } from '../components/Dialogs.tsx';
import { Fitted } from '../components/Fitted.tsx';
import { IconBack, IconChevronLeft, IconChevronRight, IconCrop, IconRotateLeft, IconRotateRight, IconTrash } from '../components/Icons.tsx';
import { toast } from '../components/Toast.tsx';
import { deletePage, getDoc, getPage, savePage, type PageRecord } from '../db.ts';
import { useBlobUrl, useDbQuery } from '../lib/hooks.ts';
import { rebuildPage } from '../lib/pages.ts';
import { goBack, navigate } from '../lib/router.ts';
import { nextRotation } from '../scan/canvas.ts';
import { FILTERS } from '../scan/filters.ts';
import { filterPreviews } from '../scan/processor.ts';
import type { FilterId } from '../scan/types.ts';

function FilterChip({ label, blob, active, onClick }: { label: string; blob?: Blob; active: boolean; onClick: () => void }) {
  const url = useBlobUrl(blob);
  return (
    <button className={`filter-chip${active ? ' active' : ''}`} onClick={onClick} aria-pressed={active}>
      <span className="filter-preview">{url && <img src={url} alt="" />}</span>
      <span>{label}</span>
    </button>
  );
}

export function PageView({ docId, pageId }: { docId: string; pageId: string }) {
  const { data } = useDbQuery(async () => {
    const [doc, page] = await Promise.all([getDoc(docId), getPage(pageId)]);
    return doc && page ? { doc, page } : null;
  }, [docId, pageId]);
  const [busy, setBusy] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [previews, setPreviews] = useState<Partial<Record<FilterId, Blob>>>({});
  const page = data?.page;
  const url = useBlobUrl(page?.processed);

  // Amostras dos filtros: refeitas quando muda o recorte ou o giro.
  const quadKey = page ? JSON.stringify([page.quad, page.rotation, page.id]) : '';
  useEffect(() => {
    if (!page) return;
    let alive = true;
    filterPreviews(page.original, page.quad, page.rotation, FILTERS.map((f) => f.id))
      .then((p) => alive && setPreviews(p))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quadKey]);

  if (!data || !page) {
    return (
      <div className="screen dark">
        <header className="bar bar-dark">
          <button className="icon-btn" onClick={() => goBack({ name: 'doc', id: docId })} aria-label="Voltar">
            <IconBack />
          </button>
        </header>
      </div>
    );
  }
  const { doc } = data;
  const index = doc.pageIds.indexOf(page.id);
  const go = (i: number) => navigate({ name: 'page', docId, pageId: doc.pageIds[i] }, { replace: true });

  const apply = async (patch: Partial<Pick<PageRecord, 'quad' | 'rotation' | 'filter'>>) => {
    setBusy(true);
    try {
      await savePage(await rebuildPage(page, patch));
    } catch (e) {
      console.error(e);
      toast('Falha ao processar a página.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen dark">
      <header className="bar bar-dark">
        <button className="icon-btn" onClick={() => goBack({ name: 'doc', id: docId })} aria-label="Voltar">
          <IconBack />
        </button>
        <h1 className="bar-title">
          Página {index + 1} de {doc.pageIds.length}
        </h1>
        <button className="icon-btn" onClick={() => setDeleting(true)} aria-label="Excluir página">
          <IconTrash />
        </button>
      </header>

      <div className="page-stage">
        <button className="page-nav prev" onClick={() => go(index - 1)} disabled={index <= 0} aria-label="Página anterior">
          <IconChevronLeft />
        </button>
        <Fitted aspect={page.width / page.height} className="page-fit">
          {url && <img src={url} alt={`Página ${index + 1}`} className="page-image" />}
          {busy && <div className="busy" aria-label="Processando" />}
        </Fitted>
        <button
          className="page-nav next"
          onClick={() => go(index + 1)}
          disabled={index >= doc.pageIds.length - 1}
          aria-label="Próxima página"
        >
          <IconChevronRight />
        </button>
      </div>

      <div className="filter-row" role="radiogroup" aria-label="Filtro">
        {FILTERS.map((f) => (
          <FilterChip
            key={f.id}
            label={f.label}
            blob={previews[f.id]}
            active={page.filter === f.id}
            onClick={() => page.filter !== f.id && apply({ filter: f.id })}
          />
        ))}
      </div>

      <footer className="action-bar dark">
        <button className="action" onClick={() => apply({ rotation: nextRotation(page.rotation, -1) })} disabled={busy}>
          <IconRotateLeft />
          <span>Esquerda</span>
        </button>
        <button className="action" onClick={() => setCropping(true)} disabled={busy}>
          <IconCrop />
          <span>Recortar</span>
        </button>
        <button className="action" onClick={() => apply({ rotation: nextRotation(page.rotation, 1) })} disabled={busy}>
          <IconRotateRight />
          <span>Direita</span>
        </button>
      </footer>

      {cropping && (
        <div className="overlay-layer">
          <CropEditor
            image={page.original}
            width={page.originalWidth}
            height={page.originalHeight}
            initial={page.quad}
            onCancel={() => setCropping(false)}
            onConfirm={(quad) => {
              setCropping(false);
              apply({ quad });
            }}
          />
        </div>
      )}

      <ConfirmDialog
        open={deleting}
        title="Excluir página?"
        message="A página sai do documento e é apagada do aparelho."
        confirmLabel="Excluir"
        danger
        onCancel={() => setDeleting(false)}
        onConfirm={async () => {
          setDeleting(false);
          await deletePage(page);
          const rest = doc.pageIds.filter((id) => id !== page.id);
          if (rest.length) navigate({ name: 'page', docId, pageId: rest[Math.min(index, rest.length - 1)] }, { replace: true });
          else navigate({ name: 'doc', id: docId }, { replace: true });
        }}
      />
    </div>
  );
}
