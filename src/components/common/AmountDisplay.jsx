import React, { memo, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useUser } from '@/components/hooks/useUser';

const CURRENCY_SYMBOLS = {
  'EUR': '€',
  'USD': '$',
  'GBP': '£',
  'CHF': 'CHF',
  'CAD': 'CAD',
  'XOF': 'FCFA',
  'XAF': 'FCFA',
  'MAD': 'MAD',
  'TND': 'TND',
  'DZD': 'DZD'
};

const AmountDisplay = memo(function AmountDisplay({ 
  amount, 
  currency,
  showSign = false,
  size = 'default',
  className 
}) {
  const { user } = useUser();
  const userCurrency = user?.active_company_currency || 'EUR';

  const displayCurrency = currency || userCurrency || 'EUR';
  const currencySymbol = CURRENCY_SYMBOLS[displayCurrency] || displayCurrency;
  const isPositive = amount >= 0;
  const formattedAmount = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Math.abs(amount));

  const sizes = {
    sm: 'text-sm',
    default: 'text-base',
    lg: 'text-lg font-semibold',
    xl: 'text-xl font-bold'
  };

  return (
    <span className={cn(
      sizes[size],
      "tabular-nums",
      showSign && (isPositive ? "text-emerald-600" : "text-red-600"),
      className
    )}>
      {showSign && !isPositive && '-'}
      {formattedAmount} {currencySymbol}
    </span>
  );
});

export default AmountDisplay;