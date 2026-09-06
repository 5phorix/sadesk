import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
import { Plus, Trash2, AlertTriangle, Package, TrendingDown } from 'lucide-react';
import AmountDisplay from '@/components/common/AmountDisplay';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function StockManagement() {
  const { user } = useUser();
  const [showForm, setShowForm] = useState(false);
  const [editingStock, setEditingStock] = useState(null);
  const [deleteStock, setDeleteStock] = useState(null);
  const [search, setSearch] = useState('');

  const queryClient = useQueryClient();

  const { data: stocks = [] } = useQuery({
    queryKey: ['stocks', user?.active_company_id],
    queryFn: async () => { const { data, error } = await supabase.from('stock_items').select('*').eq('company_id', user.active_company_id).order('product_name'); if (error) throw error; return data; },
    enabled: !!user?.active_company_id,
  });

  const createMutation = useMutation({
    mutationFn: async (data) => { const { error } = await supabase.from('stock_items').insert({ ...data, company_id: user.active_company_id }); if (error) throw error; },
    onSuccess: () => {
      queryClient.invalidateQueries(['stocks']);
      setShowForm(false);
      setEditingStock(null);
      toast.success('Produit créé');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => { const { error } = await supabase.from('stock_items').update(data).eq('id', id).eq('company_id', user.active_company_id); if (error) throw error; },
    onSuccess: () => {
      queryClient.invalidateQueries(['stocks']);
      setShowForm(false);
      setEditingStock(null);
      toast.success('Produit modifié');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => { const { error } = await supabase.from('stock_items').delete().eq('id', id).eq('company_id', user.active_company_id); if (error) throw error; },
    onSuccess: () => {
      queryClient.invalidateQueries(['stocks']);
      setDeleteStock(null);
      toast.success('Produit supprimé');
    },
  });

  const stockStats = useMemo(() => {
    const totalValue = stocks.reduce((sum, s) => sum + ((s.quantity || 0) * (s.unit_price || 0)), 0);
    const lowStock = stocks.filter(s => s.quantity <= (s.min_quantity || 0)).length;
    const totalProducts = stocks.length;
    const totalQuantity = stocks.reduce((sum, s) => sum + (s.quantity || 0), 0);

    return { totalValue, lowStock, totalProducts, totalQuantity };
  }, [stocks]);

  const filteredStocks = stocks.filter(s => 
    s.product_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.product_code?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = (formData) => {
    const data = {
      ...formData,
      total_value: (formData.quantity || 0) * (formData.unit_price || 0)
    };

    if (editingStock) {
      updateMutation.mutate({ id: editingStock.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestion des Stocks"
        subtitle="Suivi des produits et inventaire"
        actions={
          <Button onClick={() => { setEditingStock(null); setShowForm(true); }} className="gap-2">
            <Plus className="h-4 w-4" />
            Nouveau produit
          </Button>
        }
      />

      {/* Statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4 text-blue-500" />
              Produits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-800">{stockStats.totalProducts}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Valeur totale</CardTitle>
          </CardHeader>
          <CardContent>
            <AmountDisplay amount={stockStats.totalValue} size="xl" className="text-slate-800" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Quantité totale</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-800">{stockStats.totalQuantity}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Stock faible
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-red-600">{stockStats.lowStock}</p>
          </CardContent>
        </Card>
      </div>

      {/* Recherche */}
      <div className="flex items-center gap-4">
        <Input
          placeholder="Rechercher un produit..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
      </div>

      {/* Liste des stocks */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredStocks.map(stock => {
          const isLowStock = stock.quantity <= (stock.min_quantity || 0);
          const totalValue = (stock.quantity || 0) * (stock.unit_price || 0);

          return (
            <Card key={stock.id} className={isLowStock ? 'border-red-300' : ''}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-base">{stock.product_name}</CardTitle>
                    <p className="text-sm text-slate-500 mt-1">{stock.product_code}</p>
                    {stock.category && (
                      <p className="text-xs text-slate-400 mt-1">{stock.category}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => { setEditingStock(stock); setShowForm(true); }}
                    >
                      ✏️
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-700"
                      onClick={() => setDeleteStock(stock)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {isLowStock && (
                    <div className="flex items-center gap-2 p-2 bg-red-50 text-red-700 rounded-lg text-sm">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="font-medium">Stock faible !</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Quantité</span>
                    <span className={cn(
                      "text-lg font-bold",
                      isLowStock ? "text-red-600" : "text-slate-800"
                    )}>
                      {stock.quantity}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Prix unitaire</span>
                    <AmountDisplay amount={stock.unit_price} size="sm" className="font-semibold" />
                  </div>

                  <div className="pt-2 border-t">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-slate-700">Valeur totale</span>
                      <AmountDisplay amount={totalValue} size="default" className="font-bold text-blue-600" />
                    </div>
                  </div>

                  {stock.location && (
                    <p className="text-xs text-slate-500">📍 {stock.location}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Formulaire */}
      <StockForm
        open={showForm}
        onOpenChange={setShowForm}
        stock={editingStock}
        onSubmit={handleSubmit}
      />

      {/* Dialog suppression */}
      <AlertDialog open={!!deleteStock} onOpenChange={() => setDeleteStock(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce produit ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(deleteStock.id)}
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

function StockForm({ open, onOpenChange, stock, onSubmit }) {
  const [formData, setFormData] = useState({
    product_code: '',
    product_name: '',
    category: '',
    quantity: 0,
    unit_price: 0,
    min_quantity: 0,
    max_quantity: 0,
    location: '',
    notes: ''
  });

  React.useEffect(() => {
    if (stock) {
      setFormData(stock);
    } else {
      setFormData({
        product_code: '',
        product_name: '',
        category: '',
        quantity: 0,
        unit_price: 0,
        min_quantity: 0,
        max_quantity: 0,
        location: '',
        notes: ''
      });
    }
  }, [stock, open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{stock ? 'Modifier' : 'Nouveau'} produit</SheetTitle>
          <SheetDescription>
            Gérez les informations du produit en stock
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          <div className="space-y-2">
            <Label>Code produit *</Label>
            <Input
              value={formData.product_code}
              onChange={(e) => setFormData({...formData, product_code: e.target.value})}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Nom du produit *</Label>
            <Input
              value={formData.product_name}
              onChange={(e) => setFormData({...formData, product_name: e.target.value})}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Catégorie</Label>
            <Input
              value={formData.category}
              onChange={(e) => setFormData({...formData, category: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Quantité *</Label>
              <Input
                type="number"
                value={formData.quantity}
                onChange={(e) => setFormData({...formData, quantity: parseFloat(e.target.value) || 0})}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Prix unitaire *</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.unit_price}
                onChange={(e) => setFormData({...formData, unit_price: parseFloat(e.target.value) || 0})}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Stock minimum</Label>
              <Input
                type="number"
                value={formData.min_quantity}
                onChange={(e) => setFormData({...formData, min_quantity: parseFloat(e.target.value) || 0})}
              />
            </div>

            <div className="space-y-2">
              <Label>Stock maximum</Label>
              <Input
                type="number"
                value={formData.max_quantity}
                onChange={(e) => setFormData({...formData, max_quantity: parseFloat(e.target.value) || 0})}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Emplacement</Label>
            <Input
              value={formData.location}
              onChange={(e) => setFormData({...formData, location: e.target.value})}
            />
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Input
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
            />
          </div>

          <div className="p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-slate-600">Valeur totale</p>
            <p className="text-xl font-bold text-blue-700">
              {((formData.quantity || 0) * (formData.unit_price || 0)).toLocaleString('fr-FR')} €
            </p>
          </div>

          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Annuler
            </Button>
            <Button type="submit" className="flex-1 bg-[#1e3a5f] hover:bg-[#2d4a6f]">
              {stock ? 'Modifier' : 'Créer'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}