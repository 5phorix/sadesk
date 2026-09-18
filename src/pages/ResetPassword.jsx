import React, { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Lock } from 'lucide-react';

export default function ResetPassword() {
  const { clearPasswordRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (password !== passwordConfirmation) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    setIsSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setIsSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setIsDone(true);
  };

  const handleContinue = async () => {
    await supabase.auth.signOut();
    clearPasswordRecovery();
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-white px-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <img src="/logo%20sadesk.png" alt="Sadesk Logo" className="h-16 w-16 object-contain" />
          <span className="text-3xl font-bold tracking-tight">
            <span className="text-[#142638]">SADESK</span><br /><span className="text-blue-600">Compta</span>
          </span>
        </div>

        {isDone ? (
          <>
            <h1 className="text-2xl font-bold text-[#142638]">Mot de passe mis à jour</h1>
            <p className="mt-1 text-slate-500">Vous pouvez désormais vous connecter avec votre nouveau mot de passe.</p>
            <Button onClick={handleContinue} className="mt-8 h-12 w-full rounded-xl bg-blue-600 text-base font-semibold hover:bg-blue-700">
              Retour à la connexion
            </Button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-[#142638]">Nouveau mot de passe</h1>
            <p className="mt-1 text-slate-500">Choisissez un nouveau mot de passe pour votre compte.</p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <label className="relative block">
                <span className="sr-only">Nouveau mot de passe</span>
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="h-12 rounded-xl pl-11"
                  placeholder="Nouveau mot de passe"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </label>

              <label className="relative block">
                <span className="sr-only">Confirmer le mot de passe</span>
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="h-12 rounded-xl pl-11"
                  placeholder="Confirmer le mot de passe"
                  type="password"
                  value={passwordConfirmation}
                  onChange={(event) => setPasswordConfirmation(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </label>

              {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

              <Button type="submit" className="h-12 w-full rounded-xl bg-blue-600 text-base font-semibold hover:bg-blue-700" disabled={isSubmitting}>
                {isSubmitting ? 'Mise à jour...' : 'Mettre à jour le mot de passe'}
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
