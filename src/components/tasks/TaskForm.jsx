import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

export default function TaskForm({ open, onClose, task, onSave }) {
  const { user } = useUser();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    assigned_to: '',
    assigned_to_name: '',
    due_date: '',
    tags: []
  });

  const { data: companyUsers = [] } = useQuery({
    queryKey: ['company-users', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_users')
        .select('*')
        .eq('company_id', user.active_company_id)
        .eq('status', 'active');
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id && open
  });

  useEffect(() => {
    if (task) {
      setFormData(task);
    } else {
      setFormData({
        title: '',
        description: '',
        status: 'todo',
        priority: 'medium',
        assigned_to: '',
        assigned_to_name: '',
        due_date: '',
        tags: []
      });
    }
  }, [task, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const dataToSave = {
      ...formData,
      company_id: user.active_company_id
    };

    if (task?.id) {
      const { error } = await supabase.from('tasks').update(dataToSave).eq('id', task.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('tasks').insert(dataToSave);
      if (error) throw error;
    }
    
    onSave();
  };

  const handleUserChange = (userEmail) => {
    const selectedUser = companyUsers.find(u => u.user_email === userEmail);
    setFormData({
      ...formData,
      assigned_to: userEmail,
      assigned_to_name: selectedUser?.user_name || ''
    });
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{task ? 'Modifier la tâche' : 'Nouvelle tâche'}</SheetTitle>
        </SheetHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label htmlFor="title">Titre *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">Statut</Label>
              <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">À faire</SelectItem>
                  <SelectItem value="in_progress">En cours</SelectItem>
                  <SelectItem value="done">Terminé</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priorité</Label>
              <Select value={formData.priority} onValueChange={(value) => setFormData({ ...formData, priority: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Basse</SelectItem>
                  <SelectItem value="medium">Moyenne</SelectItem>
                  <SelectItem value="high">Haute</SelectItem>
                  <SelectItem value="urgent">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="assigned">Assigner à</Label>
            <Select value={formData.assigned_to} onValueChange={handleUserChange}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un utilisateur" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>Non assigné</SelectItem>
                {companyUsers.map(u => (
                  <SelectItem key={u.id} value={u.user_email}>
                    {u.user_name} ({u.user_email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="due_date">Date d'échéance</Label>
            <Input
              id="due_date"
              type="date"
              value={formData.due_date}
              onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Annuler
            </Button>
            <Button type="submit" className="flex-1 bg-gradient-to-r from-[#1e3a5f] to-[#2d4a6f]">
              {task ? 'Mettre à jour' : 'Créer'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}