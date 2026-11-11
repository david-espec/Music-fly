import { navigate } from '../lib/router';
import { IconChart, IconHome, IconHomeOutline, IconPlus, IconSearch, IconUser } from './Icons';

export type Tab = 'home' | 'search' | 'stats' | 'profile' | null;

/** Barra inferior: Biblioteca, Pesquisa, (+) adicionar, Estatisticas, Perfil. */
export function BottomNav({ tab, onAdd }: { tab: Tab; onAdd: () => void }) {
  const item = (id: Exclude<Tab, null>, to: string, label: string, icon: React.ReactNode) => (
    <button className={`nav-item ${tab === id ? 'active' : ''}`} onClick={() => navigate(to)} aria-current={tab === id ? 'page' : undefined}>
      {icon}
      <span>{label}</span>
    </button>
  );
  return (
    <nav className="bottom-nav" aria-label="Navegação principal">
      {item('home', '', 'Biblioteca', tab === 'home' ? <IconHome size={22} /> : <IconHomeOutline size={22} />)}
      {item('search', 'pesquisa', 'Pesquisa', <IconSearch size={22} />)}
      <button className="nav-add" onClick={onAdd} aria-label="Adicionar livro"><IconPlus size={24} /></button>
      {item('stats', 'estatisticas', 'Estatísticas', <IconChart size={22} />)}
      {item('profile', 'perfil', 'Perfil', <IconUser size={22} />)}
    </nav>
  );
}
