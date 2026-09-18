import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import PageHeader from '@/components/common/PageHeader';
import TaskForm from '@/components/tasks/TaskForm';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  Plus, 
  Search, 
  MoreVertical, 
  Pencil, 
  Trash2,
  CheckCircle2,
  Circle,
  Clock,
  User,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { format, parseISO, isPast } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { usePagination } from '@/components/common/usePagination';
import PaginationBar from '@/components/common/PaginationBar';

export default function Tasks() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [deleteTask, setDeleteTask] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('company_id', user.active_company_id)
        .order('due_date', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setDeleteTask(null);
      toast.success('Tâche supprimée');
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }) => {
      const { error } = await supabase.from('tasks').update({
      status,
      completed_date: status === 'done' ? new Date().toISOString().split('T')[0] : null
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Statut mis à jour');
    }
  });

  const handleSave = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    setFormOpen(false);
    setSelectedTask(null);
    toast.success('Tâche enregistrée');
  };

  const filteredTasks = tasks.filter(task => {
    const matchSearch = !searchTerm || 
      task.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.assigned_to_name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchStatus = statusFilter === 'all' || task.status === statusFilter;
    
    return matchSearch && matchStatus;
  });

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'low': return 'bg-slate-100 text-slate-800 border-slate-200';
      default: return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'done': return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'in_progress': return <Clock className="h-5 w-5 text-blue-600" />;
      default: return <Circle className="h-5 w-5 text-slate-400" />;
    }
  };

  const isOverdue = (task) => {
    if (task.status === 'done' || !task.due_date) return false;
    try {
      return isPast(parseISO(task.due_date));
    } catch {
      return false;
    }
  };

  const sortedTasks = [...filteredTasks].sort((a, b) => {
    // Priorité : urgentes > en retard > en cours > à faire > terminées
    const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
    const statusOrder = { in_progress: 3, todo: 2, done: 1 };
    
    if (a.status === 'done' && b.status !== 'done') return 1;
    if (b.status === 'done' && a.status !== 'done') return -1;
    
    const aOverdue = isOverdue(a);
    const bOverdue = isOverdue(b);
    if (aOverdue && !bOverdue) return -1;
    if (bOverdue && !aOverdue) return 1;
    
    const priorityDiff = (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
    if (priorityDiff !== 0) return priorityDiff;
    
    return (statusOrder[b.status] || 0) - (statusOrder[a.status] || 0);
  });

  const stats = {
    todo: tasks.filter(t => t.status === 'todo').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    done: tasks.filter(t => t.status === 'done').length,
    overdue: tasks.filter(t => isOverdue(t)).length
  };

  const { paginatedItems: pagedTasks, currentPage, totalPages, totalItems, goToPrevious, goToNext } = usePagination(sortedTasks, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tâches"
        subtitle="Gérez vos actions et suivez leur avancement"
        actions={
          <Button 
            onClick={() => { setSelectedTask(null); setFormOpen(true); }}
            className="gap-2 bg-gradient-to-r from-[#1e3a5f] to-[#2d4a6f]"
          >
            <Plus className="h-4 w-4" />
            Nouvelle tâche
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">À faire</p>
                <p className="text-2xl font-bold text-slate-900">{stats.todo}</p>
              </div>
              <Circle className="h-8 w-8 text-slate-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">En cours</p>
                <p className="text-2xl font-bold text-blue-600">{stats.in_progress}</p>
              </div>
              <Clock className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Terminées</p>
                <p className="text-2xl font-bold text-green-600">{stats.done}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">En retard</p>
                <p className="text-2xl font-bold text-red-600">{stats.overdue}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtres */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Rechercher une tâche..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            <TabsTrigger value="all">Toutes</TabsTrigger>
            <TabsTrigger value="todo">À faire</TabsTrigger>
            <TabsTrigger value="in_progress">En cours</TabsTrigger>
            <TabsTrigger value="done">Terminées</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Liste des tâches */}
      {isLoading ? (
        <div className="grid gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-6">
                <div className="h-20 bg-slate-200 rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : sortedTasks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-slate-400">Aucune tâche trouvée</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {pagedTasks.map(task => (
            <Card 
              key={task.id} 
              className={`hover:shadow-lg transition-all ${
                task.status === 'done' ? 'opacity-60' : ''
              } ${isOverdue(task) ? 'border-red-300 border-2' : ''}`}
            >
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <button 
                    onClick={() => updateStatusMutation.mutate({ 
                      id: task.id, 
                      status: task.status === 'done' ? 'todo' : task.status === 'in_progress' ? 'done' : 'in_progress'
                    })}
                    className="mt-1"
                  >
                    {getStatusIcon(task.status)}
                  </button>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <h3 className={`font-semibold text-slate-900 mb-1 ${
                          task.status === 'done' ? 'line-through text-slate-500' : ''
                        }`}>
                          {task.title}
                        </h3>
                        {task.description && (
                          <p className="text-sm text-slate-600 mb-3">{task.description}</p>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setSelectedTask(task); setFormOpen(true); }}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Modifier
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDeleteTask(task)} className="text-red-600">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={getPriorityColor(task.priority)}>
                        {task.priority === 'urgent' && '🚨 '}
                        {task.priority === 'high' && '⚠️ '}
                        {task.priority === 'urgent' ? 'Urgent' : 
                         task.priority === 'high' ? 'Haute' : 
                         task.priority === 'medium' ? 'Moyenne' : 'Basse'}
                      </Badge>
                      
                      {task.assigned_to_name && (
                        <Badge variant="outline" className="gap-1">
                          <User className="h-3 w-3" />
                          {task.assigned_to_name}
                        </Badge>
                      )}
                      
                      {task.due_date && (
                        <Badge 
                          variant="outline" 
                          className={`gap-1 ${isOverdue(task) ? 'border-red-500 text-red-600' : ''}`}
                        >
                          <Calendar className="h-3 w-3" />
                          {format(parseISO(task.due_date), 'dd MMM yyyy', { locale: fr })}
                          {isOverdue(task) && ' - En retard'}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PaginationBar currentPage={currentPage} totalPages={totalPages} totalItems={totalItems} pageSize={10} onPrevious={goToPrevious} onNext={goToNext} />

      <TaskForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setSelectedTask(null); }}
        task={selectedTask}
        onSave={handleSave}
      />

      <AlertDialog open={!!deleteTask} onOpenChange={() => setDeleteTask(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la tâche</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer "{deleteTask?.title}" ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteMutation.mutate(deleteTask.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}