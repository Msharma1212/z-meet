import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { 
  Video, 
  PlusSquare, 
  Calendar, 
  History, 
  User, 
  LogOut, 
  LayoutDashboard,
  Settings,
  Shield
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useTranslation } from '../hooks/useTranslation';

const SidebarItem = ({ icon: Icon, label, href, active }: any) => (
  <Link
    to={href}
    className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
      active 
        ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" 
        : "text-slate-400 hover:bg-slate-800 hover:text-white"
    )}
  >
    <Icon className={cn("w-5 h-5", active ? "text-white" : "group-hover:text-white")} />
    <span className="font-medium">{label}</span>
  </Link>
);

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname.substring(1);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  useEffect(() => {
    if (!user?._id) return;

    const socket = io();
    
    // Register the current dynamic user session
    socket.emit("register-session", { userId: user._id });

    // Handle force-logout on ban/kick trigger
    socket.on("force-logout", (payload: any) => {
      console.log("Force logout triggered:", payload);
      toast.error(payload.reason || "You have been logged out by an administrator.");
      logout();
      navigate('/login');
    });

    return () => {
      socket.disconnect();
    };
  }, [user?._id, logout, navigate]);

  if (!user) return <>{children}</>;

  const isMeeting = path.startsWith('meeting/');

  const getPageTitle = () => {
    if (!path || path === 'dashboard') return t.dashboard;
    if (path === 'history') return t.meetingHistory;
    if (path === 'settings') return t.settings;
    if (isMeeting) return t.liveSession;
    return path.charAt(0).toUpperCase() + path.slice(1);
  };

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-slate-950 font-sans text-slate-200 overflow-hidden">
      {/* Sidebar - Desktop */}
      {!isMeeting && (
        <nav className="hidden md:flex w-20 bg-slate-900 border-r border-slate-800 flex-col items-center py-8 space-y-8">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 mb-4">
            <Video className="w-8 h-8 text-white" />
          </div>
          
          <Link 
            to="/dashboard"
            title={t.dashboard}
            className={cn(
              "p-3 rounded-xl transition-all",
              location.pathname === '/dashboard' || location.pathname === '/' ? "text-blue-500 bg-slate-800" : "text-slate-500 hover:bg-slate-800 hover:text-white"
            )}
          >
            <LayoutDashboard className="w-6 h-6" />
          </Link>

          <Link 
            to="/history"
            title={t.history}
            className={cn(
              "p-3 rounded-xl transition-all",
              location.pathname === '/history' ? "text-blue-500 bg-slate-800" : "text-slate-500 hover:bg-slate-800 hover:text-white"
            )}
          >
            <History className="w-6 h-6" />
          </Link>

          <Link 
            to="/settings"
            title={t.settings}
            className={cn(
              "p-3 rounded-xl transition-all",
              location.pathname === '/settings' ? "text-blue-500 bg-slate-800" : "text-slate-500 hover:bg-slate-800 hover:text-white"
            )}
          >
            <Settings className="w-6 h-6" />
          </Link>

          {(user?.role === 'admin' || user?.role === 'developer' || user?.role === 'co-admin') && (
            <Link 
              to="/admin"
              title="Admin Panel"
              className={cn(
                "p-3 rounded-xl transition-all",
                location.pathname === '/admin' ? "text-orange-500 bg-slate-800" : "text-slate-500 hover:bg-slate-800 hover:text-white"
              )}
            >
              <Shield className="w-6 h-6" />
            </Link>
          )}
          
          <button 
            onClick={handleLogout}
            title={t.logout}
            className="p-3 text-slate-500 hover:bg-red-500/10 hover:text-red-500 rounded-xl mt-auto transition-all"
          >
            <LogOut className="w-6 h-6" />
          </button>
        </nav>
      )}

      {/* Bottom Nav - Mobile */}
      {!isMeeting && (
        <nav className="md:hidden fixed bottom-4 left-4 right-4 h-14 bg-slate-900/90 backdrop-blur-2xl border border-white/10 flex items-center justify-around px-2 z-[60] shadow-2xl rounded-2xl">
          <Link to="/dashboard" className={cn("flex flex-col items-center justify-center w-12 h-10 transition-all duration-300 rounded-lg", (location.pathname === '/dashboard' || location.pathname === '/') ? "text-blue-500 bg-blue-500/10" : "text-slate-500")}>
            <LayoutDashboard className="w-5 h-5" />
            <span className="text-[8px] font-black uppercase tracking-tighter mt-0.5">Home</span>
          </Link>
          <Link to="/history" className={cn("flex flex-col items-center justify-center w-12 h-10 transition-all duration-300 rounded-lg", location.pathname === '/history' ? "text-blue-500 bg-blue-500/10" : "text-slate-500")}>
            <History className="w-5 h-5" />
            <span className="text-[8px] font-black uppercase tracking-tighter mt-0.5">History</span>
          </Link>
          <Link to="/settings" className={cn("flex flex-col items-center justify-center w-12 h-10 transition-all duration-300 rounded-lg", location.pathname === '/settings' ? "text-blue-500 bg-blue-500/10" : "text-slate-500")}>
            <Settings className="w-5 h-5" />
            <span className="text-[8px] font-black uppercase tracking-tighter mt-0.5">Settings</span>
          </Link>
          {(user?.role === 'admin' || user?.role === 'developer' || user?.role === 'co-admin') && (
            <Link to="/admin" className={cn("flex flex-col items-center justify-center w-12 h-10 transition-all duration-300 rounded-lg", location.pathname === '/admin' ? "text-orange-500 bg-orange-500/10" : "text-slate-500")}>
              <Shield className="w-5 h-5" />
              <span className="text-[8px] font-black uppercase tracking-tighter mt-0.5">
                Admin
              </span>
            </Link>
          )}
          <button onClick={handleLogout} className="flex flex-col items-center justify-center w-12 h-10 text-slate-500 hover:text-red-500 transition-all">
            <LogOut className="w-5 h-5" />
            <span className="text-[8px] font-black uppercase tracking-tighter mt-0.5">Exit</span>
          </button>
        </nav>
      )}

      {/* Main Content */}
      <main className={cn("flex-1 flex flex-col overflow-y-auto", isMeeting ? "p-0 pb-0" : "p-4 md:p-8 pb-20 md:pb-8")}>
        {!isMeeting && (
          <header className="flex flex-row justify-between items-center gap-4 mb-6 md:mb-8 shrink-0">
            <div className="flex flex-col overflow-hidden">
              {path === 'dashboard' || path === '' || path === 'settings' || path === 'history' ? (
                <h1 className="text-xl md:text-2xl font-black text-white uppercase tracking-tighter truncate">
                  {getPageTitle()}
                </h1>
              ) : null}
              <p className="text-slate-500 text-[10px] md:text-sm font-bold uppercase tracking-widest truncate">
                {path === 'history' ? t.reviewSessions : 
                 path === 'settings' ? t.manageAccount : 
                 `${t.welcomeBack} ${user?.name || 'User'}`}
              </p>
            </div>
            <div className="flex items-center space-x-2 md:space-x-4">
              <div className="hidden sm:flex bg-slate-900 border border-slate-800 rounded-full px-3 md:px-4 py-1 md:py-2 items-center space-x-2">
                <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                <span className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest">{t.systemOnline}</span>
              </div>
              <Link to="/settings" className="w-9 h-9 md:w-11 md:h-11 rounded-xl md:rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center font-black text-white text-base md:text-lg shadow-lg shadow-blue-600/20 ring-2 ring-white/5 shrink-0 transition-transform active:scale-95 hover:scale-105">
                {user?.name?.charAt(0).toUpperCase() || '?'}
              </Link>
            </div>
          </header>
        )}

        <div className="flex-1">
          {children}
        </div>
      </main>
    </div>
  );
};
