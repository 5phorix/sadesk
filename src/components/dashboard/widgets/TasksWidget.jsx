import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { Badge } from '@/components/ui/badge';
import { Circle, Clock, Calendar } from 'lucide-react';
import { format, parseISO, isPast } from 'date-fns';
import { fr } from 'date-fns/locale';
import { createPageUrl } from '@/utils';

export default function TasksWidget() {
  const { user } = useUser();

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', user?.active_company_id],
    queryFn: async () => { const { data, error } = await supabase.from('tasks').select('*').eq('company_id', user.active_company_id); if (error) throw error; return data; },
    enabled: !!user?.active_company_id
  });

  const activeTasks = tasks
    .filter(t => t.status !== 'done')
    .sort((a, b) => {
      const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
      const aOverdue = t => t.due_date && isPast(parseISO(t.due_date));
      
      if (aOverdue(a) && !aOverdue(b)) return -1;
      if (aOverdue(b) && !aOverdue(a)) return 1;
      
      return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
    })
    .slice(0, 5);

  const stats = {
    todo: tasks.filter(t => t.status === 'todo').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    overdue: tasks.filter(t => t.status !== 'done' && t.due_date && isPast(parseISO(t.due_date))).length
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center p-3 bg-slate-50 rounded-lg">
          <Circle className="h-5 w-5 text-slate-400 mx-auto mb-1" />
          <p className="text-sm font-semibold text-slate-900">{stats.todo}</p>
          <p className="text-xs text-slate-500">À faire</p>
        </div>
        <div className="text-center p-3 bg-blue-50 rounded-lg">
          <Clock className="h-5 w-5 text-blue-600 mx-auto mb-1" />
          <p className="text-sm font-semibold text-blue-900">{stats.in_progress}</p>
          <p className="text-xs text-blue-600">En cours</p>
        </div>
        <div className="text-center p-3 bg-red-50 rounded-lg">
          <Calendar className="h-5 w-5 text-red-600 mx-auto mb-1" />
          <p className="text-sm font-semibold text-red-900">{stats.overdue}</p>
          <p className="text-xs text-red-600">En retard</p>
        </div>
      </div>

      <div className="space-y-2">
        {activeTasks.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">Aucune tâche active</p>
        ) : (
          activeTasks.map(task => {
            const isOverdue = task.due_date && isPast(parseISO(task.due_date));
            return (
              <a
                key={task.id}
                href={createPageUrl('Tasks')}
                className={`block p-3 rounded-lg border transition-all hover:shadow-md ${
                  isOverdue ? 'bg-red-50 border-red-200' : 'bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start gap-2">
                  {task.status === 'in_progress' ? (
                    <Clock className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Circle className="h-4 w-4 text-slate-400 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{task.title}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {task.priority === 'urgent' && (
                        <Badge className="bg-red-100 text-red-800 text-xs">Urgent</Badge>
                      )}
                      {task.priority === 'high' && (
                        <Badge className="bg-orange-100 text-orange-800 text-xs">Haute</Badge>
                      )}
                      {task.due_date && (
                        <span className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                          {format(parseISO(task.due_date), 'dd MMM', { locale: fr })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </a>
            );
          })
        )}
      </div>

      <a 
        href={createPageUrl('Tasks')} 
        className="block text-center text-sm text-[#1e3a5f] hover:underline font-medium"
      >
        Voir toutes les tâches →
      </a>
    </div>
  );
}