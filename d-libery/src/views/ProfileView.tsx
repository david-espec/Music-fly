import { useMemo, useRef, useState } from 'react';
import { useApp } from '../store/AppStore';
import { useImage } from '../store/useImage';
import { navigate } from '../lib/router';
import { computeStats } from '../lib/stats';
import { compressCover } from '../lib/image';
import { putImage, deleteImage, clearAll } from '../lib/db';
import { exportBackup, importBackup } from '../lib/backup';
import { fmtInt, fmtRating } from '../lib/format';
import { StatCard } from '../components/StatCard';
import { Confirm, Sheet } from '../components/Dialog';
import { useToast } from '../components/Toast';
import {
  IconBook, IconBookmark, IconClock, IconDownload, IconHeart, IconInfo, IconKey, IconLibrary, IconMoon, IconNext,
  IconPen, IconStar, IconTarget, IconTrash, IconUpload, IconUser,
} from '../components/Icons';
import type { ThemeMode } from '../types';

function Row({ icon, label, onClick, right }: { icon: React.ReactNode; label: string; onClick?: () => void; right?: React.ReactNode }) {
  return (
    <button className="menu-row" onClick={onClick}>
      <span className="menu-ico">{icon}</span>
      <span className="menu-label">{label}</span>
      {right ?? <IconNext size={16} className="muted" />}
    </button>
  );
}

export function ProfileView() {
  const { books, settings, updateSettings, reload } = useApp();
  const toast = useToast();
  const s = useMemo(() => computeStats(books), [books]);
  const avatar = useImage(settings.avatarId);
  const avatarRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [sheet, setSheet] = useState<null | 'profile' | 'goal' | 'theme' | 'api' | 'about'>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [name, setName] = useState(settings.name);
  const [handle, setHandle] = useState(settings.handle);
  const [goal, setGoal] = useState(settings.yearlyGoal);
  const [apiKey, setApiKey] = useState(settings.googleApiKey);

  const isDark = document.documentElement.dataset.theme === 'dark';
  const THEMES: [ThemeMode, string][] = [['system', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']];

  return (
    <div className="page">
      <header className="profile-head">
        <button className="avatar" onClick={() => avatarRef.current?.click()} aria-label="Trocar foto de perfil">
          {avatar ? <img src={avatar} alt="" /> : <IconUser size={34} />}
        </button>
        <div className="profile-names">
          <h1>{settings.name}</h1>
          {settings.handle && <span className="muted">@{settings.handle}</span>}
        </div>
        <button className="icon-btn" onClick={() => { setName(settings.name); setHandle(settings.handle); setSheet('profile'); }} aria-label="Editar perfil"><IconPen size={20} /></button>
        <input ref={avatarRef} type="file" accept="image/*" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          const blob = await compressCover(f, 400);
          if (settings.avatarId) await deleteImage(settings.avatarId);
          await updateSettings({ avatarId: await putImage(blob) });
        }} />
      </header>

      <StatCard items={[
        { icon: <IconBook size={20} />, value: fmtInt(s.total), label: 'Livros' },
        { icon: <IconClock size={20} />, value: `${fmtInt(s.hours)}h`, label: 'Lidas (est.)' },
        { icon: <IconStar size={20} />, value: s.avgRating ? fmtRating(s.avgRating) : '–', label: 'Avaliação' },
      ]} />

      <div className="menu">
        <Row icon={<IconLibrary size={20} />} label="Minha biblioteca" onClick={() => navigate('estante')} />
        <Row icon={<IconHeart size={20} />} label="Favoritos" onClick={() => navigate('estante?s=fav')} />
        <Row icon={<IconBookmark size={18} />} label="Lista de desejos" onClick={() => navigate('estante?s=want')} />
        <Row icon={<IconTarget size={20} />} label="Meta anual" onClick={() => { setGoal(settings.yearlyGoal); setSheet('goal'); }}
          right={<span className="muted small">{settings.yearlyGoal} livros <IconNext size={14} /></span>} />
      </div>

      <div className="menu">
        <Row icon={<IconMoon size={20} />} label="Modo escuro" onClick={() => updateSettings({ theme: isDark ? 'light' : 'dark' })}
          right={<span className={`switch ${isDark ? 'on' : ''}`} role="switch" aria-checked={isDark}><span /></span>} />
        <Row icon={<IconMoon size={20} />} label="Tema" onClick={() => setSheet('theme')}
          right={<span className="muted small">{THEMES.find((t) => t[0] === settings.theme)?.[1]} <IconNext size={14} /></span>} />
        <Row icon={<IconKey size={20} />} label="Chave do Google Books (opcional)" onClick={() => { setApiKey(settings.googleApiKey); setSheet('api'); }}
          right={<span className="muted small">{settings.googleApiKey ? 'Configurada' : 'Não'} <IconNext size={14} /></span>} />
      </div>

      <div className="menu">
        <Row icon={<IconDownload size={20} />} label="Exportar backup" onClick={async () => {
          try { const r = await exportBackup(); toast(`Backup com ${r.count} livros salvo em ${r.where}`); }
          catch (e) { toast(`Não foi possível salvar o backup: ${(e as Error).message}`); }
        }} />
        <Row icon={<IconUpload size={20} />} label="Restaurar backup" onClick={() => importRef.current?.click()} />
        <Row icon={<IconInfo size={20} />} label="Sobre o app" onClick={() => setSheet('about')} />
        <Row icon={<IconTrash size={20} />} label="Apagar todos os dados" onClick={() => setConfirmWipe(true)} />
      </div>
      <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        try { const n = await importBackup(f); await reload(); toast(`${n} livros restaurados`); }
        catch (err) { toast((err as Error).message); }
      }} />

      <Sheet open={sheet === 'profile'} onClose={() => setSheet(null)} title="Editar perfil">
        <label className="field"><span>Nome</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} /></label>
        <label className="field"><span>Usuário</span><input value={handle} onChange={(e) => setHandle(e.target.value.replace(/[^a-zA-Z0-9_.]/g, '').toLowerCase())} maxLength={30} /></label>
        {settings.avatarId && <button className="btn btn-ghost" onClick={async () => { await deleteImage(settings.avatarId!); await updateSettings({ avatarId: undefined }); }}>Remover foto</button>}
        <div className="sheet-actions">
          <button className="btn btn-ghost" onClick={() => setSheet(null)}>Cancelar</button>
          <button className="btn btn-primary" onClick={async () => { await updateSettings({ name: name.trim() || 'Leitor', handle }); setSheet(null); }}>Salvar</button>
        </div>
      </Sheet>

      <Sheet open={sheet === 'goal'} onClose={() => setSheet(null)} title={`Meta de leitura de ${new Date().getFullYear()}`}>
        <div className="goal-picker">
          <button className="round-btn" onClick={() => setGoal((g) => Math.max(1, g - 1))}>−</button>
          <input type="number" min={1} max={365} value={goal} onChange={(e) => setGoal(Math.max(1, Number(e.target.value) || 1))} aria-label="Livros por ano" />
          <button className="round-btn" onClick={() => setGoal((g) => g + 1)}>+</button>
        </div>
        <p className="muted small center">livros por ano · cerca de {(goal / 12).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} por mês</p>
        <div className="sheet-actions">
          <button className="btn btn-ghost" onClick={() => setSheet(null)}>Cancelar</button>
          <button className="btn btn-primary" onClick={async () => { await updateSettings({ yearlyGoal: goal }); setSheet(null); }}>Salvar</button>
        </div>
      </Sheet>

      <Sheet open={sheet === 'theme'} onClose={() => setSheet(null)} title="Tema">
        <div className="segmented">
          {THEMES.map(([id, label]) => (
            <button key={id} className={settings.theme === id ? 'active' : ''} onClick={() => updateSettings({ theme: id })}>{label}</button>
          ))}
        </div>
        <p className="muted small">“Automático” acompanha o modo claro/escuro do aparelho.</p>
      </Sheet>

      <Sheet open={sheet === 'api'} onClose={() => setSheet(null)} title="Chave do Google Books">
        <p className="muted small">
          A pesquisa funciona sem chave. Se aparecer aviso de “limite de consultas”, crie uma chave gratuita no
          Google Cloud Console (API “Books”) e cole aqui. Ela fica salva só neste aparelho e não entra no backup.
        </p>
        <label className="field"><span>Chave da API</span><input value={apiKey} onChange={(e) => setApiKey(e.target.value.trim())} placeholder="AIza…" autoComplete="off" /></label>
        <div className="sheet-actions">
          <button className="btn btn-ghost" onClick={() => setSheet(null)}>Cancelar</button>
          <button className="btn btn-primary" onClick={async () => { await updateSettings({ googleApiKey: apiKey }); setSheet(null); toast('Chave salva'); }}>Salvar</button>
        </div>
      </Sheet>

      <Sheet open={sheet === 'about'} onClose={() => setSheet(null)} title="Sobre o D Libery">
        <p className="small">Sua biblioteca digital pessoal. Pesquise livros, fotografe capas, organize sua estante e acompanhe suas leituras.</p>
        <ul className="about-list small">
          <li>Dados de livros: <b>Google Books</b> e <b>Open Library</b>.</li>
          <li>Leitura de capas (OCR) feita no próprio aparelho, com <b>Tesseract</b>. Suas fotos não são enviadas a nenhum servidor.</li>
          <li>Seus livros, capas e anotações ficam guardados só neste aparelho. Use o backup para levar para outro.</li>
          <li>O app não guarda nem distribui livros protegidos: os links “ler grátis” apontam apenas para versões legais (domínio público ou empréstimo).</li>
        </ul>
      </Sheet>

      <Confirm open={confirmWipe} onClose={() => setConfirmWipe(false)} danger confirmLabel="Apagar tudo" title="Apagar todos os dados?"
        text="Todos os livros, capas, anotações e configurações deste aparelho serão apagados. Exporte um backup antes, se quiser guardar."
        onConfirm={async () => { await clearAll(); await reload(); toast('Dados apagados'); }} />
    </div>
  );
}
