import { useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isResetMode, setIsResetMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    <main className="min-h-screen bg-slate-100 px-4 py-12">
      <section className="mx-auto w-full max-w-md rounded-xl border bg-white p-8 shadow-sm">
        <div className="mb-8">
          <p className="text-sm font-medium uppercase tracking-wider text-slate-500">Sadesk Compta</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">
            {isResetMode ? 'Réinitialiser le mot de passe' : 'Connexion'}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {isResetMode ? 'Recevez un lien de réinitialisation par e-mail.' : 'Accédez à votre espace comptable.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <label className="block text-sm font-medium text-slate-700">
            Adresse e-mail
            <Input
              className="mt-2"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>

          {!isResetMode && (
            <label className="block text-sm font-medium text-slate-700">
              Mot de passe
              <Input
                className="mt-2"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
          )}

          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          {message && <p className="text-sm text-emerald-700" role="status">{message}</p>}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Envoi...' : isResetMode ? 'Envoyer le lien' : 'Se connecter'}
          </Button>

          <button
            type="button"
            className="w-full text-sm text-slate-600 underline underline-offset-4"
            onClick={() => { setIsResetMode(!isResetMode); setError(''); setMessage(''); }}
          >
            {isResetMode ? 'Retour à la connexion' : 'Mot de passe oublié ?'}
          </button>
        </form>
      </section>
    </main>
  );
}
