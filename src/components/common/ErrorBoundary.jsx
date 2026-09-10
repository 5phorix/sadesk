import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Capture les erreurs de rendu React pour éviter l'écran blanc
 * et proposer une action de récupération à l'utilisateur.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Erreur non gérée dans l\'interface:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  handleGoHome = () => {
    window.location.assign('/');
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Une erreur inattendue est survenue
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600">
              La page n&apos;a pas pu s&apos;afficher correctement. Vos données comptables ne sont pas
              affectées. Vous pouvez réessayer ou revenir au tableau de bord.
            </p>

            {import.meta.env.DEV && (
              <pre className="max-h-48 overflow-auto rounded-md bg-slate-100 p-3 text-xs text-slate-700">
                {error.message}
              </pre>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={this.handleReset}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Réessayer
              </Button>
              <Button variant="outline" onClick={this.handleGoHome}>
                <Home className="mr-2 h-4 w-4" />
                Tableau de bord
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}
