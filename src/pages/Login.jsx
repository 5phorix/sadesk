import React, { useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isResetMode, setIsResetMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setIsSubmitting(true);

    if (!isSupabaseConfigured) {
      setError('Supabase n’est pas configuré. Ajoutez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env.local.');
      setIsSubmitting(false);
      return;
    }

    if (isResetMode) {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`
      });
      if (resetError) setError(resetError.message);
      else setMessage('Un lien de réinitialisation a été envoyé si cette adresse existe.');
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) setError(signInError.message);
    }
    setIsSubmitting(false);
  };

  return (
    <main className="min-h-screen flex bg-white">
      {/* Formulaire */}
      <section className="flex-1 flex items-center justify-center px-6 sm:px-12 lg:px-20 py-12">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center gap-3">
            <img src="/logo%20sadesk.png" alt="Sadesk Logo" className="h-16 w-16 object-contain" />
            <span className="text-3xl font-bold tracking-tight">
              <span className="text-[#142638]">SADESK</span><br /><span className="text-blue-600">Compta</span>
            </span>
          </div>

          <h1 className="text-2xl font-bold text-[#142638]">
            {isResetMode ? 'Réinitialiser le mot de passe' : 'Connexion'}
          </h1>
          <p className="mt-1 text-slate-500">
            {isResetMode
              ? 'Recevez un lien de réinitialisation par e-mail.'
              : 'Accédez à votre espace comptable'}
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <label className="relative block">
              <span className="sr-only">Email ou identifiant</span>
              <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="h-12 rounded-xl pl-11"
                placeholder="Email ou identifiant"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>

            {!isResetMode && (
              <label className="relative block">
                <span className="sr-only">Mot de passe</span>
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="h-12 rounded-xl pl-11 pr-11"
                  placeholder="Mot de passe"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </label>
            )}

            {!isResetMode && (
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 text-slate-600">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Se souvenir de moi
                </label>
                <button
                  type="button"
                  className="font-medium text-blue-600 hover:text-blue-700"
                  onClick={() => {
                    setIsResetMode(true);
                    setError('');
                    setMessage('');
                  }}
                >
                  Mot de passe oublié ?
                </button>
              </div>
            )}

            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
            {message && <p className="text-sm text-emerald-700" role="status">{message}</p>}

            <Button type="submit" className="h-12 w-full rounded-xl bg-blue-600 text-base font-semibold hover:bg-blue-700" disabled={isSubmitting}>
              {isSubmitting ? 'Envoi...' : isResetMode ? 'Envoyer le lien' : 'Se connecter'}
            </Button>

            {isResetMode && (
              <button
                type="button"
                className="w-full text-sm text-slate-600 underline underline-offset-4"
                onClick={() => { setIsResetMode(false); setError(''); setMessage(''); }}
              >
                Retour à la connexion
              </button>
            )}

            <p className="text-center text-sm text-slate-500">
              Pas encore de compte ? Contactez votre administrateur.
            </p>
          </form>
        </div>
      </section>

      {/* Panneau illustratif (masqué sur mobile) */}
      <div className="hidden lg:block lg:w-1/2 relative overflow-hidden">
        <img
          src="/sadesk-connexion-building.png"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-white/90 via-white/40 to-transparent p-10 pt-24">
          <p className="text-3xl font-bold text-[#142638]">Multi-sociétés</p>
          <ul className="mt-2 space-y-1 text-xl font-bold text-[#142638]">
            <li>• Sécurisé</li>
            <li className="relative inline-block">
              Performant
              <svg className="absolute -bottom-2 left-0 w-28" viewBox="0 0 120 12" fill="none">
                <path d="M2 8c20-10 40-10 58-2s58 8 58-2" stroke="#f5871f" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </li>
          </ul>
        </div>
      </div>
    </main>
  );
}
