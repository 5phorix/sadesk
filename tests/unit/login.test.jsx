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

  it('bloque une confirmation de mot de passe incoherente avant le reseau', async () => {
    render(<Login />);
    fireEvent.click(screen.getByRole('button', { name: 'Créer un compte' }));
    fireEvent.change(screen.getByLabelText('Adresse e-mail'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'secret' } });
    fireEvent.change(screen.getByLabelText('Confirmer le mot de passe'), { target: { value: 'different' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Les mots de passe ne correspondent pas');
  });
});
