const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export function isSafeTestTarget(rawUrl, {
  allowRemote = process.env.SUPABASE_TEST_ALLOW_REMOTE === 'true',
  projectRef = process.env.SUPABASE_TEST_PROJECT_REF,
} = {}) {
  let url;
  try {
    url = new URL(rawUrl || '');
  } catch {
    return false;
  }

  if (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)) return true;
  return url.protocol === 'https:'
    && allowRemote
    && Boolean(projectRef)
    && url.hostname === `${projectRef}.supabase.co`;
}