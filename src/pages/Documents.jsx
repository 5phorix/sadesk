import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import PageHeader from '../components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { toastSupabaseError } from '@/lib/supabase-errors';
import { createPageUrl } from '../utils';
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
    <div>
      <PageHeader
        title="Documents"
        subtitle="Gestion centralisée de tous vos documents"
        actions={
          <>
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
              className="gap-2 bg-gradient-to-r from-[#1e3a5f] to-[#2d4a6f] hover:opacity-90"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {uploading ? 'Téléversement...' : 'Téléverser'}
            </Button>
          </>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card className="shadow-sm border-slate-100">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total documents</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{stats.total}</p>
              </div>
              <div className="h-12 w-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <File className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-100">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Espace utilisé</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">
                  {formatFileSize(stats.size)}
                </p>
              </div>
              <div className="h-12 w-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                <FolderOpen className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-100">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Ce mois</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">
                  {documents.filter(d => {
                    const docDate = new Date(d.created_date);
                    const now = new Date();
                    return docDate.getMonth() === now.getMonth() && 
                           docDate.getFullYear() === now.getFullYear();
                  }).length}
                </p>
              </div>
              <div className="h-12 w-12 bg-purple-100 rounded-xl flex items-center justify-center">
                <Upload className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6 mb-6">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Rechercher un document..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          
          <Tabs value={category} onValueChange={setCategory} className="w-auto">
            <TabsList className="flex-wrap h-auto">
              {CATEGORIES.map(cat => (
                <TabsTrigger key={cat.value} value={cat.value} className="gap-2">
                  <cat.icon className="h-4 w-4" />
                  {cat.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Documents Grid */}
      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : filteredDocuments.length === 0 ? (
        <Card className="shadow-sm border-slate-100">
          <CardContent className="p-12 text-center">
            <FolderOpen className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">
              {searchTerm || category !== 'all' 
                ? 'Aucun document trouvé' 
                : 'Aucun document. Commencez par téléverser des fichiers.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredDocuments.map((doc) => (
            <Card key={doc.id} className="shadow-sm border-slate-100 hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="text-3xl">{getFileIcon(doc.file_type)}</div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      onClick={() => handleDownload(doc)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setDeleteDoc(doc)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <h3 className="font-semibold text-sm text-slate-800 mb-1 truncate" title={doc.title}>
                  {doc.title}
                </h3>
                
                <div className="space-y-1 text-xs text-slate-500">
                  <p>{formatFileSize(doc.file_size)}</p>
                  {doc.date && (
                    <p>{format(new Date(doc.date), 'dd MMM yyyy', { locale: fr })}</p>
                  )}
                  {doc.category && (
                    <span className="inline-block px-2 py-0.5 bg-slate-100 rounded-md text-slate-600">
                      {CATEGORIES.find(c => c.value === doc.category)?.label || doc.category}
                    </span>
                  )}
                </div>
                
                {doc.description && (
                  <p className="text-xs text-slate-500 mt-2 line-clamp-2">
                    {doc.description}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteDoc} onOpenChange={() => setDeleteDoc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le document</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer "{deleteDoc?.title}" ? 
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteMutation.mutate(deleteDoc.id)}
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