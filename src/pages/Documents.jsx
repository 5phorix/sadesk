import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Upload, 
  File, 
  Download, 
  Trash2, 
  Search,
  FileText,
  Loader2,
  FolderOpen
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { toastSupabaseError } from '@/lib/supabase-errors';
import { createPageUrl } from '../utils';
import { cn } from '@/lib/utils';
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

const CATEGORIES = [
  { value: 'all', label: 'Tous les documents', icon: FolderOpen },
  { value: 'factures', label: 'Factures', icon: FileText },
  { value: 'contrats', label: 'Contrats', icon: File },
  { value: 'relevés', label: 'Relevés bancaires', icon: File },
  { value: 'justificatifs', label: 'Justificatifs', icon: File },
  { value: 'fiscalité', label: 'Fiscalité', icon: File },
  { value: 'autres', label: 'Autres', icon: File }
];

export default function Documents() {
  const { user } = useUser();
  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState('all');
  const [uploading, setUploading] = useState(false);
  const [deleteDoc, setDeleteDoc] = useState(null);
  const fileInputRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['documents', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('company_id', user.active_company_id)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id,
    staleTime: 30000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('documents').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast.success('Document supprimé');
      setDeleteDoc(null);
    }
  });

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    try {
      for (const file of files) {
        const filePath = `${user.active_company_id}/${crypto.randomUUID()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, file, { upsert: false });
        if (uploadError) throw uploadError;
        const { data: fileData } = supabase.storage.from('documents').getPublicUrl(filePath);
        
        const { error } = await supabase.from('documents').insert({
          company_id: user.active_company_id,
          title: file.name,
          file_url: fileData.publicUrl,
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
          category: 'autres',
          date: format(new Date(), 'yyyy-MM-dd')
        });
        if (error) throw error;
      }
      
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast.success(`${files.length} document(s) téléversé(s)`);
    } catch (error) {
      toastSupabaseError(error, "Le téléversement des documents a échoué.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownload = (doc) => {
    if (doc.file_url === '/documentation') {
      window.location.href = createPageUrl('Documentation');
    } else {
      window.open(doc.file_url, '_blank');
    }
  };

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = 
      doc.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.tags?.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesCategory = category === 'all' || doc.category === category;
    
    return matchesSearch && matchesCategory;
  });

  const formatFileSize = (bytes) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (fileType) => {
    if (fileType?.includes('pdf')) return '📄';
    if (fileType?.includes('image')) return '🖼️';
    if (fileType?.includes('word') || fileType?.includes('document')) return '📝';
    if (fileType?.includes('excel') || fileType?.includes('sheet')) return '📊';
    return '📎';
  };

  const stats = {
    total: documents.length,
    size: documents.reduce((sum, doc) => sum + (doc.file_size || 0), 0)
  };

  return (
    <div className="space-y-6 pb-16">
      {/* En-tête coloré avec identité Sky/Cyan */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">
              Gestion Électronique des Documents (GED)
            </h1>
            <Badge variant="outline" className="font-mono text-xs px-2.5 py-1 bg-sky-50 text-sky-800 border-sky-300">
              GED & Archivage
            </Badge>
          </div>
          <p className="text-slate-500 mt-1 text-sm lg:text-base">
            Classement centralisé, factures scannées, contrats et justificatifs comptables
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="gap-2 bg-sky-600 hover:bg-sky-700 text-white shadow-sm"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {uploading ? 'Téléversement...' : 'Téléverser des documents'}
          </Button>
        </div>
      </div>

      {/* Stats KPI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="rounded-2xl border-slate-200/80 bg-white shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Documents</span>
              <div className="p-2 rounded-xl bg-sky-50 text-sky-700">
                <File className="h-5 w-5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
            <p className="text-xs text-slate-500 mt-1">Fichiers stockés dans la GED</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200/80 bg-white shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Volume Stocké</span>
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
                <FolderOpen className="h-5 w-5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-emerald-950 font-mono">
              {formatFileSize(stats.size)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Espace utilisé par votre société</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200/80 bg-white shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Ajoutés ce mois</span>
              <div className="p-2 rounded-xl bg-indigo-50 text-indigo-700">
                <Upload className="h-5 w-5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-indigo-950">
              {documents.filter(d => {
                const docDate = new Date(d.date || d.created_at);
                const now = new Date();
                return docDate.getMonth() === now.getMonth() && 
                       docDate.getFullYear() === now.getFullYear();
              }).length}
            </div>
            <p className="text-xs text-slate-500 mt-1">Dépôts récents sur la période</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Recherche */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Rechercher par titre, type, mot-clé..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-10 bg-white border-slate-200 rounded-xl"
            />
          </div>

          {/* Filtres par catégorie avec pastilles de couleur */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {CATEGORIES.map(cat => (
              <button
                key={cat.value}
                type="button"
                onClick={() => setCategory(cat.value)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 border",
                  category === cat.value
                    ? "bg-sky-600 text-white border-sky-600 shadow-xs"
                    : "border-slate-200/80 bg-slate-50 text-slate-600 hover:bg-slate-100"
                )}
              >
                <cat.icon className="h-3.5 w-3.5 shrink-0" />
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Documents Grid */}
      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : filteredDocuments.length === 0 ? (
        <Card className="rounded-3xl border-slate-200 p-12 text-center shadow-xs">
          <CardContent className="p-0">
            <FolderOpen className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <h3 className="font-semibold text-slate-800">Aucun document trouvé</h3>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              {searchTerm || category !== 'all' 
                ? 'Aucun document ne correspond à vos filtres actuels.' 
                : 'Commencez par téléverser vos premières pièces justificatives ou factures scannées.'}
            </p>
            <Button
              onClick={() => fileInputRef.current?.click()}
              className="bg-sky-600 hover:bg-sky-700 text-white gap-2 text-xs"
            >
              <Upload className="h-4 w-4" />
              Téléverser un document
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredDocuments.map((doc) => (
            <Card key={doc.id} className="rounded-2xl border-slate-200/90 hover:border-sky-300 hover:shadow-md transition-all bg-white overflow-hidden shadow-xs">
              <CardContent className="p-4 flex flex-col justify-between h-full">
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div className="p-2.5 bg-sky-50 rounded-xl text-2xl border border-sky-100">
                      {getFileIcon(doc.file_type)}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-sky-700 hover:text-sky-900 hover:bg-sky-50 rounded-lg"
                        onClick={() => handleDownload(doc)}
                        title="Télécharger / Visualiser"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg"
                        onClick={() => setDeleteDoc(doc)}
                        title="Supprimer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <h3 className="font-bold text-sm text-slate-900 mb-1 truncate" title={doc.title}>
                    {doc.title}
                  </h3>
                  
                  <div className="space-y-1 text-xs text-slate-500 mt-2">
                    <div className="flex items-center justify-between font-mono">
                      <span>Taille :</span>
                      <span>{formatFileSize(doc.file_size)}</span>
                    </div>
                    {doc.date && (
                      <div className="flex items-center justify-between">
                        <span>Date :</span>
                        <span className="font-mono">{doc.date}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-600 border-slate-200 capitalize">
                    {doc.category || 'autres'}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-sky-700 hover:bg-sky-50 h-7 px-2"
                    onClick={() => handleDownload(doc)}
                  >
                    Ouvrir
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal confirmation suppression */}
      <AlertDialog open={!!deleteDoc} onOpenChange={() => setDeleteDoc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le document</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer définitivement <strong>{deleteDoc?.title}</strong> ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(deleteDoc.id)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}