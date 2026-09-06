import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import AmountDisplay from '../common/AmountDisplay';

export default function EntryValidator({ entries }) {
  const totalDebit = entries.reduce((sum, e) => sum + (parseFloat(e.debit) || 0), 0);
  const totalCredit = entries.reduce((sum, e) => sum + (parseFloat(e.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01; // Tolérance pour les arrondis

  return (
    <Card className={`border-2 ${isBalanced ? 'border-emerald-500 bg-emerald-50/50' : 'border-red-500 bg-red-50/50'}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          {isBalanced ? (
            <CheckCircle2 className="h-6 w-6 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-6 w-6 text-red-600 flex-shrink-0" />
          )}
          <div className="flex-1">
            <h3 className={`font-semibold ${isBalanced ? 'text-emerald-900' : 'text-red-900'}`}>
              {isBalanced ? 'Partie double respectée ✓' : 'Déséquilibre détecté'}
            </h3>
            <div className="flex items-center gap-4 mt-2 text-sm">
              <div>
                <span className="text-slate-600">Total Débit: </span>
                <AmountDisplay amount={totalDebit} size="sm" className="font-semibold" />
              </div>
              <div>
                <span className="text-slate-600">Total Crédit: </span>
                <AmountDisplay amount={totalCredit} size="sm" className="font-semibold" />
              </div>
              {!isBalanced && (
                <div>
                  <span className="text-red-600 font-semibold">Écart: </span>
                  <AmountDisplay 
                    amount={Math.abs(totalDebit - totalCredit)} 
                    size="sm" 
                    className="font-bold text-red-700" 
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}