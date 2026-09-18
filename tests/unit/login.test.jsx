// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import Login from '@/pages/Login';

afterEach(cleanup);

describe('parcours de connexion', () => {
  it('permet de basculer vers la reinitialisation puis de revenir', () => {
    render(<Login />);

    expect(screen.getByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mot de passe oublié ?' }));
    expect(screen.getByRole('heading', { name: 'Réinitialiser le mot de passe' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Mot de passe')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retour à la connexion' }));
    expect(screen.getByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
  });

  it('n’expose pas de formulaire d’auto-inscription (compte cree par un administrateur)', () => {
    render(<Login />);
    expect(screen.queryByRole('button', { name: 'Créer un compte' })).not.toBeInTheDocument();
    expect(screen.getByText('Pas encore de compte ? Contactez votre administrateur.')).toBeInTheDocument();
  });
});
