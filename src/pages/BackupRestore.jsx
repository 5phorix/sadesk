import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Loader2, Upload } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { BACKUP_TABLES, createBackup, validateBackup } from '@/lib/backup';

export default function BackupRestore() {
  const { user } = useUser();
  const companyId = user?.active_company_id;
  const queryClient = useQueryClient();
  const [working, setWorking] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoreSummary, setRestoreSummary] = useState(null);
  const canRestore = ['owner', 'admin'].includes(user?.role);

  const { data: counts = {} } = useQuery({
    queryKey: ['backup-counts', companyId],
    queryFn: async () => {
      const result = {};
      for (const table of BACKUP_TABLES) {
        const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('company_id', companyId);
        if (error) throw error;
        result[table] = count || 0;
      }
      return result;
    },
    enabled: !!companyId,
  });

  const downloadBackup = async () => {
    setWorking(true);
    try {
      const tables = {};
      for (const table of BACKUP_TABLES) {
        const { data, error } = await supabase.from(table).select('*').eq('company_id', companyId);
        if (error) throw error;
        tables[table] = data || [];
      }
      const backup = createBackup(companyId, tables);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sadesk-compta-${companyId}-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Sauvegarde téléchargée');
    } catch (error) {
      toast.error(error.message || 'La sauvegarde n’a pas pu être créée');
    } finally {
      setWorking(false);
    }
  };

  const inspectRestore = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      const validation = validateBackup(backup, companyId);
      if (!validation.valid) throw new Error(validation.error);
      setRestoreFile(backup);
      setRestoreSummary(Object.fromEntries(BACKUP_TABLES.map((table) => [table, backup.tables[table]?.length || 0])));
    } catch (error) {
      setRestoreFile(null);
      setRestoreSummary(null);
      toast.error(error.message || 'Fichier de sauvegarde invalide');
    }
  };

  const restoreBackup = async () => {
    if (!restoreFile || !canRestore) return;
    if (!window.confirm('La restauration peut remplacer des données existantes. Continuer ?')) return;
    setWorking(true);
    try {
      for (const table of BACKUP_TABLES) {
        const rows = restoreFile.tables[table] || [];
        if (!rows.length) continue;
        const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
        if (error) throw error;
      }
      queryClient.invalidateQueries();
      toast.success('Restauration terminée');
    } catch (error) {
      toast.error(error.message || 'La restauration a échoué');
    } finally {
      setWorking(false);
    }
  };

  return <ProtectedRoute><div className="space-y-6"><PageHeader title="Sauvegarde et restauration" subtitle="Exportez ou restaurez les données de la société active." /><div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Download className="h-5 w-5" />Sauvegarde</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-slate-600">Format JSON versionné incluant les données comptables, bancaires, stocks et immobilisations.</p><div className="flex flex-wrap gap-2">{BACKUP_TABLES.slice(0, 8).map((table) => <Badge key={table} variant="outline">{table} : {counts[table] || 0}</Badge>)}</div><Button onClick={downloadBackup} disabled={working} className="gap-2"><Download className="h-4 w-4" />{working ? 'Préparation...' : 'Télécharger la sauvegarde'}</Button></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" />Restauration</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-slate-600">La restauration est réservée aux propriétaires et administrateurs. Vérifiez le fichier avant confirmation.</p><input type="file" accept="application/json,.json" onChange={inspectRestore} disabled={!canRestore || working} />{restoreSummary && <div className="flex flex-wrap gap-2">{Object.entries(restoreSummary).filter(([, count]) => count > 0).map(([table, count]) => <Badge key={table} variant="secondary">{table} : {count}</Badge>)}</div>}<Button onClick={restoreBackup} disabled={!restoreFile || !canRestore || working} variant="outline" className="gap-2"><Loader2 className={`h-4 w-4 ${working ? 'animate-spin' : 'hidden'}`} />Restaurer les données</Button></CardContent></Card></div></div></ProtectedRoute>;
}
