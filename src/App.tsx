import { useState } from 'react';
import { Database, Package, FileText, ArrowLeftRight, ArrowUpRight, ClipboardList, User, LogOut, Key, ChevronDown } from 'lucide-react';
import { useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import ChangePassword from './components/ChangePassword';
import Templates from './components/Templates';
import WarehouseEntry from './components/WarehouseEntry';
import WarehouseList from './components/WarehouseList';
import WarehouseTransfer from './components/WarehouseTransfer';
import WarehouseExit from './components/WarehouseExit';
import InventoryCount from './components/InventoryCount';

type Page = 'templates' | 'entry' | 'list' | 'transfer' | 'exit' | 'count';

export default function App() {
  const { user, loading, signOut } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>('templates');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Yüklənir...</div>
      </div>
    );
  }

  if (!user && !isAuthenticated) {
    return <Login onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  const handleLogout = async () => {
    await signOut();
    setIsAuthenticated(false);
    setShowUserMenu(false);
  };

  const navigation = [
    { id: 'templates' as Page, name: 'Şablonlar', icon: Database },
    { id: 'entry' as Page, name: 'Anbara Giriş', icon: ArrowUpRight },
    { id: 'list' as Page, name: 'Anbar Siyahısı', icon: Package },
    { id: 'transfer' as Page, name: 'Anbarlar Arası Transfer', icon: ArrowLeftRight },
    { id: 'exit' as Page, name: 'Anbardan Çıxış', icon: FileText },
    { id: 'count' as Page, name: 'Anbar Sayımı', icon: ClipboardList },
  ];

  const renderPage = () => {
    switch (currentPage) {
      case 'templates':
        return <Templates />;
      case 'entry':
        return <WarehouseEntry />;
      case 'list':
        return <WarehouseList />;
      case 'transfer':
        return <WarehouseTransfer />;
      case 'exit':
        return <WarehouseExit />;
      case 'count':
        return <InventoryCount />;
      default:
        return <Templates />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-semibold text-gray-900">Anbar ERP</h1>
          <p className="text-sm text-gray-500 mt-1">İdarəetmə Sistemi</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentPage(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-blue-700' : 'text-gray-400'}`} />
                <span className="text-sm">{item.name}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-200">
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <User className="w-5 h-5 text-gray-600" />
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-900">
                    {user?.email?.split('@')[0] || 'İstifadəçi'}
                  </p>
                  <p className="text-xs text-gray-500">İstifadəçi</p>
                </div>
              </div>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${
                showUserMenu ? 'rotate-180' : ''
              }`} />
            </button>

            {showUserMenu && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg">
                <button
                  onClick={() => {
                    setShowChangePassword(true);
                    setShowUserMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-t-lg"
                >
                  <Key className="w-4 h-4" />
                  Şifrəni Dəyişdir
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-b-lg"
                >
                  <LogOut className="w-4 h-4" />
                  Çıxış
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        {renderPage()}
      </main>

      {showChangePassword && (
        <ChangePassword onClose={() => setShowChangePassword(false)} />
      )}
    </div>
  );
}
