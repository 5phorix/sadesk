import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronDown, ChevronRight, History, Search } from 'lucide-react';

const ACTION_STYLES = {
  insert: { label: 'Création', className: 'bg-emerald-100 text-emerald-800' },
  update: { label: 'Modification', className: 'bg-blue-100 text-blue-800' },
  delete: { label: 'Suppression', className: 'bg-red-100 text-red-800' },
};

const ENTITY_LABELS = {
  accounting_entries: 'Écriture',
  invoices: 'Facture',
  company_users: 'Utilisateur',
  companies: 'Société',
  fiscal_years: 'Exercice',
  third_parties: 'Tiers',
  accounts: 'Compte',
  budgets: 'Budget',
  monthly_closings: 'Clôture',
};

const formatValue = (value) => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'oui' : 'non';
  return String(value);
};

function ChangeDetails({ log }) {
  if (log.action === 'update') {
    return (
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="py-1 font-medium">Champ</th>
            <th className="py-1 font-medium">Avant</th>
            <th className="py-1 font-medium">Après</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(log.changes).map(([field, [before, after]]) => (
            <tr key={field} className="border-t">
              <td className="py-1 font-medium text-slate-700">{field}</td>
              <td className="py-1 text-red-700">{formatValue(before)}</td>
              <td className="py-1 text-emerald-700">{formatValue(after)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <table className="w-full text-xs">
      <tbody>
        {Object.entries(log.changes)
          .filter(([field]) => !['id', 'company_id', 'created_at', 'updated_at'].includes(field))
          .map(([field, value]) => (
            <tr key={field} className="border-t">
              <td className="w-1/3 py-1 font-medium text-slate-700">{field}</td>
              <td className="py-1 text-slate-600">{formatValue(value)}</td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}

export default function AuditLog() {
  const { user } = useUser();
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('all');
  const [action, setAction] = useState('all');
  const [expanded, setExpanded] = useState(null);

  const companyId = user?.active_company_id;

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['audit-logs', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return logs.filter((log) => {
      if (entityType !== 'all' && log.entity_type !== entityType) return false;
      if (action !== 'all' && log.action !== action) return false;
      if (!needle) return true;
      return (
        (log.entity_label || '').toLowerCase().includes(needle) ||
        (log.user_email || '').toLowerCase().includes(needle)
      );
    });
  }, [logs, search, entityType, action]);

  return (
    <ProtectedRoute permission="audit:read">
      <div>
        <PageHeader
          title="Journal d'audit"
          subtitle="Historique des actions sensibles sur la société"
          actions={
            <>
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les objets</SelectItem>
                  {Object.entries(ENTITY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={action} onValueChange={setAction}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les actions</SelectItem>
                  {Object.entries(ACTION_STYLES).map(([key, value]) => (
                    <SelectItem key={key} value={key}>
                      {value.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          }
        />

        <div className="relative mb-4 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="Rechercher un libellé ou un utilisateur…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <p className="py-8 text-center text-sm text-slate-500">Chargement…</p>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                <History className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                Aucune action enregistrée sur ce périmètre.
              </div>
            ) : (
              <div className="space-y-1">
                {filtered.map((log) => {
                  const style = ACTION_STYLES[log.action];
                  const isOpen = expanded === log.id;

                  return (
                    <div key={log.id} className="rounded-lg border">
                      <button
                        className="flex w-full items-center gap-3 p-3 text-left hover:bg-slate-50"
                        onClick={() => setExpanded(isOpen ? null : log.id)}
                      >
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                        )}

                        <Badge className={style.className}>{style.label}</Badge>

                        <span className="text-sm font-medium text-slate-900">
                          {ENTITY_LABELS[log.entity_type] || log.entity_type}
                        </span>

                        <span className="flex-1 truncate text-sm text-slate-600">
                          {log.entity_label || '—'}
                        </span>

                        <span className="hidden text-sm text-slate-500 sm:block">
                          {log.user_email || 'système'}
                        </span>

                        <span className="whitespace-nowrap text-xs text-slate-400">
                          {format(parseISO(log.created_at), 'dd MMM yyyy HH:mm', { locale: fr })}
                        </span>
                      </button>

                      {isOpen && (
                        <div className="border-t bg-slate-50 p-3">
                          <ChangeDetails log={log} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {logs.length >= 500 && (
          <p className="mt-3 text-center text-xs text-slate-500">
            Seules les 500 actions les plus récentes sont affichées.
          </p>
        )}
      </div>
    </ProtectedRoute>
  );
}
