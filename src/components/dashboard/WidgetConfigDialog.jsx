import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

export default function WidgetConfigDialog({ open, widget, onClose, onSave }) {
  const [config, setConfig] = useState({});

  useEffect(() => {
    if (widget) {
      setConfig(widget.config || {});
    }
  }, [widget]);

  const handleSave = () => {
    onSave({ ...widget, config });
    onClose();
  };

  if (!widget) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configurer {widget.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Période</Label>
            <Select 
              value={config.period || 'current_month'} 
              onValueChange={(v) => setConfig(prev => ({ ...prev, period: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current_month">Mois en cours</SelectItem>
                <SelectItem value="last_month">Mois dernier</SelectItem>
                <SelectItem value="current_year">Année en cours</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {widget.type === 'expenses' && (
            <div className="space-y-2">
              <Label>Nombre de catégories</Label>
              <Select 
                value={config.limit?.toString() || '5'} 
                onValueChange={(v) => setConfig(prev => ({ ...prev, limit: parseInt(v) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">Top 3</SelectItem>
                  <SelectItem value="5">Top 5</SelectItem>
                  <SelectItem value="10">Top 10</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={handleSave} className="bg-[#1e3a5f] hover:bg-[#2d4a6f]">
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}