import React, { memo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

const variants = {
  default: 'bg-white',
  primary: 'bg-gradient-to-br from-[#1e3a5f] to-[#2d4a6f] text-white',
  success: 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white',
  danger: 'bg-gradient-to-br from-red-500 to-red-600 text-white',
};

const StatCard = memo(function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  trendValue, 
  variant = 'default',
  className 
}) {
  const isLight = variant === 'default';

  return (
    <div className={cn(
      "rounded-2xl p-6 transition-all duration-300 hover:shadow-xl hover:-translate-y-1",
      variants[variant],
      isLight ? "shadow-sm border border-slate-100" : "shadow-lg",
      className
    )}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className={cn(
            "text-sm font-medium",
            isLight ? "text-slate-500" : "text-white/80"
          )}>
            {title}
          </p>
          <p className={cn(
            "text-2xl lg:text-3xl font-bold tracking-tight",
            isLight ? "text-slate-800" : "text-white"
          )}>
            {value}
          </p>
          {trend && (
            <div className="flex items-center gap-1.5">
              <span className={cn(
                "text-xs font-medium px-2 py-0.5 rounded-full",
                trend === 'up' 
                  ? isLight ? "bg-emerald-100 text-emerald-700" : "bg-white/20 text-white"
                  : isLight ? "bg-red-100 text-red-700" : "bg-white/20 text-white"
              )}>
                {trend === 'up' ? '↑' : '↓'} {trendValue}
              </span>
              <span className={cn(
                "text-xs",
                isLight ? "text-slate-400" : "text-white/60"
              )}>
                vs mois dernier
              </span>
            </div>
          )}
        </div>
        {Icon && (
          <div className={cn(
            "h-12 w-12 rounded-xl flex items-center justify-center",
            isLight ? "bg-slate-100" : "bg-white/20"
          )}>
            <Icon className={cn(
              "h-6 w-6",
              isLight ? "text-slate-600" : "text-white"
            )} />
          </div>
        )}
      </div>
    </div>
  );
});

export default StatCard;