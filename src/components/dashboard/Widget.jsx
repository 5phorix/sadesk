import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  MoreVertical, 
  Settings, 
  Trash2, 
  GripVertical,
  Calendar
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export default function Widget({ 
  widget, 
  onConfigure, 
  onRemove, 
  isDragging,
  dragHandleProps 
}) {
  return (
    <Card className={cn(
      "transition-all",
      isDragging && "opacity-50 rotate-2 scale-105"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div 
              {...dragHandleProps}
              className="cursor-grab active:cursor-grabbing p-1 hover:bg-slate-100 rounded"
            >
              <GripVertical className="h-4 w-4 text-slate-400" />
            </div>
            <CardTitle className="text-base">{widget.title}</CardTitle>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onConfigure(widget)}>
                <Settings className="h-4 w-4 mr-2" />
                Configurer
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => onRemove(widget.id)}
                className="text-red-600"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {widget.config?.period && (
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
            <Calendar className="h-3 w-3" />
            {widget.config.period === 'current_month' && 'Mois en cours'}
            {widget.config.period === 'last_month' && 'Mois dernier'}
            {widget.config.period === 'current_year' && 'Année en cours'}
            {widget.config.period === 'custom' && 'Période personnalisée'}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {widget.component}
      </CardContent>
    </Card>
  );
}