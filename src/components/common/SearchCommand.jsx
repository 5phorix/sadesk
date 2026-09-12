import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { FileText, Users, Receipt } from 'lucide-react';

export default function SearchCommand({ open, onOpenChange }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { user } = useUser();

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices'],
    queryFn: async () => { const { data, error } = await supabase.from('invoices').select('*').eq('company_id', user.active_company_id).order('date', { ascending: false }).limit(100); if (error) throw error; return data; },
    enabled: open && !!user?.active_company_id,
  });

  const { data: thirdParties = [] } = useQuery({
    queryKey: ['third-parties'],
    queryFn: async () => { const { data, error } = await supabase.from('third_parties').select('*').eq('company_id', user.active_company_id).order('name'); if (error) throw error; return data; },
    enabled: open && !!user?.active_company_id,
  });

  const { data: entries = [] } = useQuery({
    queryKey: ['entries'],
    queryFn: async () => { const { data, error } = await supabase.from('accounting_entries').select('*').eq('company_id', user.active_company_id).order('date', { ascending: false }).limit(100); if (error) throw error; return data; },
    enabled: open && !!user?.active_company_id,
  });

  useEffect(() => {
    const down = (e) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(true);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [onOpenChange]);

  const filteredInvoices = invoices.filter(inv =>
    inv.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
    inv.third_party_name?.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 5);

  const filteredThirdParties = thirdParties.filter(tp =>
    tp.name?.toLowerCase().includes(search.toLowerCase()) ||
    tp.code?.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 5);

  const filteredEntries = entries.filter(e =>
    e.label?.toLowerCase().includes(search.toLowerCase()) ||
    e.account_code?.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 5);

  const handleSelect = (type, item) => {
    onOpenChange(false);
    if (type === 'invoice') {
      navigate(createPageUrl('Invoices'));
    } else if (type === 'thirdparty') {
      navigate(createPageUrl('ThirdParties'));
    } else if (type === 'entry') {
      navigate(createPageUrl('Entries'));
    }
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput 
        placeholder="Rechercher des factures, tiers, écritures..." 
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>Aucun résultat trouvé.</CommandEmpty>

        {filteredInvoices.length > 0 && (
          <CommandGroup heading="Factures">
            {filteredInvoices.map((inv) => (
              <CommandItem
                key={inv.id}
                onSelect={() => handleSelect('invoice', inv)}
                className="flex items-center gap-3"
              >
                <FileText className="h-4 w-4 text-slate-400" />
                <div className="flex-1">
                  <p className="font-medium">{inv.invoice_number}</p>
                  <p className="text-xs text-slate-500">{inv.third_party_name}</p>
                </div>
                <span className="text-sm font-semibold">{inv.amount_ttc?.toFixed(2)} €</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {filteredThirdParties.length > 0 && (
          <CommandGroup heading="Tiers">
            {filteredThirdParties.map((tp) => (
              <CommandItem
                key={tp.id}
                onSelect={() => handleSelect('thirdparty', tp)}
                className="flex items-center gap-3"
              >
                <Users className="h-4 w-4 text-slate-400" />
                <div className="flex-1">
                  <p className="font-medium">{tp.name}</p>
                  <p className="text-xs text-slate-500">{tp.code}</p>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {filteredEntries.length > 0 && (
          <CommandGroup heading="Écritures">
            {filteredEntries.map((entry) => (
              <CommandItem
                key={entry.id}
                onSelect={() => handleSelect('entry', entry)}
                className="flex items-center gap-3"
              >
                <Receipt className="h-4 w-4 text-slate-400" />
                <div className="flex-1">
                  <p className="font-medium">{entry.label}</p>
                  <p className="text-xs text-slate-500">{entry.account_code} - {entry.date}</p>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}