import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BellRinging,
  BookOpenText,
  Broadcast,
  GearSix,
  Images,
  ListBullets,
  Moon,
  SignOut,
  SquaresFour,
  Sun,
  TelegramLogo,
  X,
  List,
} from '@phosphor-icons/react';
import { Dialog } from '@base-ui/react/dialog';
import { api } from '../lib/api';
import { IconButton } from './ui';

const navigation = [
  { to: '/', label: '总览', icon: SquaresFour },
  { to: '/sources', label: '通知入口', icon: Broadcast },
  { to: '/channels', label: '通知出口', icon: TelegramLogo },
  { to: '/events', label: '通知记录', icon: ListBullets },
  { to: '/assets', label: '图片素材', icon: Images },
  { to: '/guide', label: '新手指南', icon: BookOpenText },
  { to: '/settings', label: '系统设置', icon: GearSix },
];

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="navigation" aria-label="主导航">
      {navigation.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onNavigate}
            className={({ isActive }) => `navigation__item ${isActive ? 'is-active' : ''}`}
          >
            <Icon size={20} weight="duotone" />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

function readTheme(): 'light' | 'dark' {
  const stored = localStorage.getItem('easynotice-theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function AppShell({ onLoggedOut }: { onLoggedOut: () => void }) {
  const [theme, setTheme] = useState<'light' | 'dark'>(readTheme);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const currentLabel = useMemo(() => navigation.find((item) => item.to === location.pathname)?.label || 'EasyNotice', [location.pathname]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('easynotice-theme', theme);
  }, [theme]);

  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' });
    onLoggedOut();
    navigate('/');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand__mark"><BellRinging size={23} weight="fill" /></span>
          <div><strong>EasyNotice</strong><small>NAS 通知中枢</small></div>
        </div>
        <Navigation />
        <div className="sidebar__footer">
          <div className="service-state"><span />本地服务正常</div>
          <button type="button" className="navigation__item" onClick={logout}><SignOut size={20} />退出登录</button>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar__mobile">
            <IconButton label="打开导航" onClick={() => setMobileOpen(true)}><List size={21} /></IconButton>
            <strong>{currentLabel}</strong>
          </div>
          <div className="topbar__spacer" />
          <IconButton label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
          </IconButton>
        </header>
        <main className="content"><Outlet /></main>
      </div>

      <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="dialog-backdrop" />
          <Dialog.Viewport className="mobile-nav-viewport">
            <Dialog.Popup className="mobile-nav">
              <div className="mobile-nav__header">
                <div className="brand"><span className="brand__mark"><BellRinging size={23} weight="fill" /></span><strong>EasyNotice</strong></div>
                <Dialog.Close className="icon-button" aria-label="关闭导航"><X size={20} /></Dialog.Close>
              </div>
              <Navigation onNavigate={() => setMobileOpen(false)} />
              <button type="button" className="navigation__item" onClick={logout}><SignOut size={20} />退出登录</button>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
