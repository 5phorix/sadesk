import { supabase } from '@/api/supabaseClient';

const DOCUMENTS_BUCKET = 'documents';

async function getAccessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Session expirée, veuillez vous reconnecter.');
  }
  return session.access_token;
}

/**
 * Envoie un fichier dans le bucket `documents`, cloisonné par société.
 * Retourne le chemin de stockage (à passer à l'IA) et une URL signée d'aperçu.
 */
export async function uploadDocument(file, companyId) {
  if (!companyId) throw new Error('Aucune société sélectionnée.');

  const safeName = file.name.replace(/[^\w.\-]/g, '_');
  const path = `${companyId}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (uploadError) throw uploadError;

  const { data: signed, error: signedError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (signedError) throw signedError;

  return { path, url: signed.signedUrl };
}

/**
 * Crée une URL signée temporaire pour relire un document déjà stocké.
 */
export async function getDocumentUrl(path, expiresInSeconds = 3600) {
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

async function callAi({ companyId, prompt, filePaths = [], responseJsonSchema }) {
  const token = await getAccessToken();

  const response = await fetch('/api/ai-invoke', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      company_id: companyId,
      prompt,
      file_paths: filePaths,
      response_json_schema: responseJsonSchema
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Le service d'analyse IA est indisponible.");
  }
  return payload;
}

/**
 * Analyse un ou plusieurs documents et retourne un objet conforme au schéma JSON fourni.
 */
export async function extractStructuredData({ companyId, prompt, filePaths = [], schema }) {
  const { data } = await callAi({ companyId, prompt, filePaths, responseJsonSchema: schema });
  if (!data) throw new Error("Aucune donnée n'a pu être extraite du document.");
  return data;
}

/**
 * Analyse textuelle libre (pas de schéma) : retourne du texte Markdown.
 */
export async function generateText({ companyId, prompt }) {
  const { text } = await callAi({ companyId, prompt });
  if (!text) throw new Error("L'analyse IA n'a retourné aucun résultat.");
  return text;
}
