import { createClient } from '@supabase/supabase-js';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';
const MAX_FILES = 5;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const SIGNED_URL_TTL = 120;

const isUuid = (value) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

// Les chemins proviennent du client : on n'accepte que ceux du bucket de la societe (anti-SSRF/traversal).
const isPathOwnedByCompany = (path, companyId) =>
  typeof path === 'string' &&
  !path.includes('..') &&
  path.startsWith(`${companyId}/`);

const guessMimeType = (path) => {
  const extension = path.split('.').pop()?.toLowerCase();
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  return null;
};

async function buildFileContent(adminClient, companyId, filePaths) {
  const parts = [];

  for (const path of filePaths) {
    if (!isPathOwnedByCompany(path, companyId)) {
      const error = new Error('Chemin de fichier invalide');
      error.statusCode = 400;
      throw error;
    }

    const mimeType = guessMimeType(path);
    if (!mimeType) {
      const error = new Error('Format de fichier non supporte (PDF, PNG, JPEG, WEBP ou GIF attendu)');
      error.statusCode = 400;
      throw error;
    }

    const { data: signed, error: signedError } = await adminClient.storage
      .from('documents')
      .createSignedUrl(path, SIGNED_URL_TTL);
    if (signedError) {
      const error = new Error('Fichier introuvable dans le stockage');
      error.statusCode = 404;
      throw error;
    }

    const fileResponse = await fetch(signed.signedUrl);
    if (!fileResponse.ok) {
      const error = new Error('Lecture du fichier impossible');
      error.statusCode = 502;
      throw error;
    }

    const buffer = Buffer.from(await fileResponse.arrayBuffer());
    if (buffer.byteLength > MAX_FILE_BYTES) {
      const error = new Error('Fichier trop volumineux pour l\'analyse IA (max 15 Mo)');
      error.statusCode = 413;
      throw error;
    }

    const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
    if (mimeType === 'application/pdf') {
      parts.push({ type: 'file', file: { filename: path.split('/').pop(), file_data: dataUrl } });
    } else {
      parts.push({ type: 'image_url', image_url: { url: dataUrl } });
    }
  }

  return parts;
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });

  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return response.status(401).json({ error: 'Non authentifie' });

  try {
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const aiApiKey = process.env.AI_API_KEY;
    if (!url || !anonKey || !serviceRoleKey) throw new Error('Supabase server environment is not configured');
    if (!aiApiKey) return response.status(503).json({ error: 'Service IA non configure' });

    const authClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const adminClient = createClient(url, serviceRoleKey);

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return response.status(401).json({ error: 'Non authentifie' });

    const {
      company_id: companyId,
      prompt,
      file_paths: filePaths = [],
      response_json_schema: responseJsonSchema
    } = request.body || {};

    if (!isUuid(companyId)) return response.status(400).json({ error: 'company_id requis' });
    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      return response.status(400).json({ error: 'prompt requis' });
    }
    if (!Array.isArray(filePaths) || filePaths.length > MAX_FILES) {
      return response.status(400).json({ error: `file_paths invalide (max ${MAX_FILES} fichiers)` });
    }

    const { data: membership, error: membershipError } = await adminClient
      .from('company_users')
      .select('role')
      .eq('company_id', companyId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return response.status(403).json({ error: 'Acces refuse' });

    const content = [{ type: 'text', text: prompt }];
    content.push(...(await buildFileContent(adminClient, companyId, filePaths)));

    const body = {
      model: process.env.AI_MODEL || DEFAULT_MODEL,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: 'Tu es un assistant expert-comptable francais. Tu extrais uniquement les donnees presentes dans les documents fournis et tu n\'inventes jamais de valeur.'
        },
        { role: 'user', content }
      ]
    };

    if (responseJsonSchema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: { name: 'extraction', schema: responseJsonSchema }
      };
    }

    const aiResponse = await fetch(`${process.env.AI_BASE_URL || DEFAULT_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${aiApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!aiResponse.ok) {
      const details = await aiResponse.text();
      console.error('AI provider error:', aiResponse.status, details);
      return response.status(502).json({ error: 'Le service d\'analyse IA est indisponible' });
    }

    const payload = await aiResponse.json();
    const text = payload.choices?.[0]?.message?.content ?? '';

    if (!responseJsonSchema) {
      return response.status(200).json({ text });
    }

    try {
      return response.status(200).json({ data: JSON.parse(text) });
    } catch {
      return response.status(502).json({ error: 'Reponse IA illisible, veuillez reessayer' });
    }
  } catch (error) {
    console.error('AI invoke failed:', error);
    const status = error.statusCode || 500;
    return response.status(status).json({
      error: status === 500 ? 'Erreur interne lors de l\'analyse IA' : error.message
    });
  }
}
