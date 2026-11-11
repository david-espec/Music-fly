import { useRef, useState } from 'react';
import { useApp } from '../store/AppStore';
import { useToast } from '../components/Toast';
import { IconBook, IconNext } from '../components/Icons';
import { importBackup } from '../lib/backup';

export function WelcomeView() {
  const { updateSettings, reload, settings } = useApp();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState(settings.yearlyGoal);
  const fileRef = useRef<HTMLInputElement>(null);

  const finish = async () => {
    const n = name.trim() || 'Leitor';
    await updateSettings({ name: n, handle: n.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, ''), yearlyGoal: goal, onboarded: true });
  };

  return (
    <div className="welcome">
      <div className="welcome-bg" aria-hidden="true">
        <div className="welcome-shelves" />
        <div className="welcome-lamp" />
      </div>
      {step === 0 ? (
        <div className="welcome-content fade-up">
          <div className="welcome-brand">
            <IconBook size={64} strokeWidth={1.2} />
            <h1 className="logo-word big">D Libery</h1>
            <p>Sua biblioteca,<br />em um só lugar.</p>
          </div>
          <div className="welcome-actions">
            <button className="btn btn-light btn-lg" onClick={() => setStep(1)}>Começar <IconNext size={20} /></button>
            <button className="link-light" onClick={() => fileRef.current?.click()}>Restaurar um backup</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const n = await importBackup(f);
                await reload();
                toast(`${n} livros restaurados`);
              } catch (err) { toast((err as Error).message); }
            }} />
          </div>
        </div>
      ) : (
        <form className="welcome-content welcome-form fade-up" onSubmit={(e) => { e.preventDefault(); finish(); }}>
          <div>
            <h2 className="serif">Vamos montar sua estante</h2>
            <p className="welcome-sub">Tudo fica guardado neste aparelho. Sem cadastro, sem anúncios.</p>
          </div>
          <label className="field dark">
            <span>Como quer ser chamado?</span>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" maxLength={40} />
          </label>
          <label className="field dark">
            <span>Quantos livros quer ler em {new Date().getFullYear()}?</span>
            <input type="number" min={1} max={365} value={goal} onChange={(e) => setGoal(Math.max(1, Number(e.target.value) || 1))} />
          </label>
          <button className="btn btn-light btn-lg" type="submit">Abrir minha biblioteca <IconNext size={20} /></button>
        </form>
      )}
    </div>
  );
}
