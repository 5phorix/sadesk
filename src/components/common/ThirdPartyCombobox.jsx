import React, { useEffect, useState } from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export default function ThirdPartyCombobox({
  parties,
  value,
  onSelect,
  onCreate,
  placeholder = 'Rechercher un client...',
  createLabel = 'Créer ce client dans Tiers',
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selectedParty = parties.find((party) => party.id === value);
  const normalizedSearch = search.trim().toLocaleLowerCase('fr');
  const hasExactMatch = parties.some((party) => party.name.trim().toLocaleLowerCase('fr') === normalizedSearch);

  useEffect(() => {
    if (selectedParty) setSearch(selectedParty.name);
    else if (!value) setSearch('');
  }, [selectedParty, value]);

  const handleSelect = (partyId) => {
    onSelect(partyId);
    const party = parties.find((item) => item.id === partyId);
    setSearch(party?.name || '');
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn('truncate', !selectedParty && 'text-muted-foreground')}>
            {selectedParty?.name || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder={placeholder}
            aria-label={placeholder}
          />
          <CommandList>
            {normalizedSearch && !parties.some((party) => party.name.toLocaleLowerCase('fr').includes(normalizedSearch)) && (
              <p className="px-3 py-2 text-sm text-muted-foreground">Aucun client ne correspond.</p>
            )}
            {parties.length > 0 && (
              <CommandGroup heading="Clients existants">
                {parties
                  .filter((party) => !normalizedSearch || party.name.trim().toLocaleLowerCase('fr').includes(normalizedSearch))
                  .map((party) => (
                    <CommandItem key={party.id} value={party.id} onSelect={() => handleSelect(party.id)}>
                      <Check className={cn('h-4 w-4', value === party.id ? 'opacity-100' : 'opacity-0')} />
                      <span>{party.name}</span>
                      {party.code && <span className="ml-auto text-xs text-muted-foreground">{party.code}</span>}
                    </CommandItem>
                  ))}
              </CommandGroup>
            )}
            {normalizedSearch && !hasExactMatch && (
              <CommandGroup>
                <CommandItem
                  value={`create-${normalizedSearch}`}
                  onSelect={() => {
                    setOpen(false);
                    onCreate(search.trim());
                  }}
                  className="text-primary"
                >
                  <Plus className="h-4 w-4" />
                  {createLabel} « {search.trim()} »
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
