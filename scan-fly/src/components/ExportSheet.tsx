import { useState } from 'react';
import type { DocRecord, PageRecord } from '../db.ts';
import { canShareFiles, download, makeJpegs, makePdf, shareFiles } from '../lib/export.ts';
import { formatBytes, plural } from '../lib/format.ts';
import { setPrefs, usePrefs } from '../prefs.ts';
import { PAGE_SIZES, type PageSize } from '../scan/pdf.ts';
import { Sheet } from './Dialogs.tsx';
import { IconDownload, IconShare } from './Icons.tsx';
import { toast } from './Toast.tsx';

export function ExportSheet({
  open,
  onClose,
  doc,
  pages,
}: {
  open: boolean;
  onClose: () => void;
  doc: DocRecord;
  pages: PageRecord[];
}) {
  const prefs = usePrefs();
  const [format, setFormat] = useState<'pdf' | 'jpeg'>('pdf');
  const [busy, setBusy] = useState(false);
  const bytes = pages.reduce((s, p) => s + p.processed.size, 0);
  // Teste de compartilhamento com um arquivo de mentira: canShare olha o tipo.
  const probe = [new File([], format === 'pdf' ? 'a.pdf' : 'a.jpg', { type: format === 'pdf' ? 'application/pdf' : 'image/jpeg' })];
  const shareable = canShareFiles(probe);

  const files = async () => (format === 'pdf' ? [await makePdf(doc, pages, prefs.pageSize)] : makeJpegs(doc, pages));

  const run = async (how: 'share' | 'download') => {
    setBusy(true);
    try {
      const f = await files();
      if (how === 'share') {
        if (await shareFiles(f, doc.name)) onClose();
      } else {
        f.forEach(download);
        toast(f.length === 1 ? `${f[0].name} salvo` : `${f.length} imagens salvas`);
        onClose();
      }
    } catch (e) {
      console.error(e);
      toast('Não foi possível exportar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Exportar">
      <p className="sheet-text">
        {doc.name} · {plural(pages.length, 'página', 'páginas')} · cerca de {formatBytes(bytes)}
      </p>
      <div className="segmented" role="radiogroup" aria-label="Formato">
        {(['pdf', 'jpeg'] as const).map((f) => (
          <button key={f} role="radio" aria-checked={format === f} className={format === f ? 'on' : ''} onClick={() => setFormat(f)}>
            {f === 'pdf' ? 'PDF' : pages.length > 1 ? 'Imagens JPEG' : 'Imagem JPEG'}
          </button>
        ))}
      </div>
      {format === 'pdf' && (
        <label className="field">
          <span>Tamanho da página</span>
          <select value={prefs.pageSize} onChange={(e) => setPrefs({ pageSize: e.target.value as PageSize })}>
            {PAGE_SIZES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="sheet-actions">
        <button className="btn" onClick={() => run('download')} disabled={busy}>
          <IconDownload /> Baixar
        </button>
        {shareable && (
          <button className="btn btn-primary" onClick={() => run('share')} disabled={busy}>
            <IconShare /> Compartilhar
          </button>
        )}
      </div>
      {busy && <p className="muted center">Gerando…</p>}
    </Sheet>
  );
}
