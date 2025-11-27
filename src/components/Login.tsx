import { useState } from 'react';
import { LogIn, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Login({ onLoginSuccess }: { onLoginSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMessage, setResetMessage] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        if (signInError.message.includes('Invalid login credentials')) {
          setError('E-mail və ya şifrə yanlışdır');
        } else {
          setError('Giriş zamanı xəta baş verdi');
        }
        setLoading(false);
        return;
      }

      if (data.user) {
        onLoginSuccess();
      }
    } catch (err) {
      setError('Gözlənilməz xəta baş verdi');
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResetMessage('');
    setLoading(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetError) {
        setError('Şifrə sıfırlama linki göndərilmədi');
      } else {
        setResetMessage('Şifrə sıfırlama linki e-mail ünvanınıza göndərildi');
      }
    } catch (err) {
      setError('Xəta baş verdi');
    }

    setLoading(false);
  };

  if (showForgotPassword) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Şifrəni Unutmuşam</h2>
            <p className="text-sm text-gray-600 mt-2">
              E-mail ünvanınızı daxil edin və şifrə sıfırlama linki göndərəcəyik
            </p>
          </div>

          {resetMessage && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-700">{resetMessage}</p>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                E-mail ünvanı
              </label>
              <input
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="email@example.com"
                required
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowForgotPassword(false);
                  setError('');
                  setResetMessage('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Geri
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Göndərilir...' : 'Link Göndər'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-8">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">Medlab Anbar ERP</h1>
          <p className="text-sm text-gray-600 mt-2">İdarəetmə Sisteminə Giriş</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              E-mail ünvanı
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="email@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Şifrə
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="••••••••"
              required
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Məni xatırla</span>
            </label>

            <button
              type="button"
              disabled
              onClick={() => setShowForgotPassword(true)}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Şifrəni unutmuşam
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <LogIn className="w-4 h-4" />
            {loading ? 'Giriş edilir...' : 'Daxil ol'}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-gray-200 text-center">
          <p className="text-xs text-gray-500">
            Anbar İdarəetmə Sistemi v1.0
            <br>
            Neyman Badalov 2025
          </p>
        </div>
      </div>
    </div>
  );
}
