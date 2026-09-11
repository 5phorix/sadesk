export const DEFAULT_DASHBOARD_PREFERENCES = {
  stats: true,
  evolution: true,
  invoiceSummary: true,
  alerts: true,
  recentActivity: true,
};

const storageKey = (companyId) => `sadesk-dashboard-preferences:${companyId}`;

export function loadDashboardPreferences(companyId) {
  if (!companyId || typeof window === 'undefined') return DEFAULT_DASHBOARD_PREFERENCES;

  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey(companyId)) || '{}');
    return { ...DEFAULT_DASHBOARD_PREFERENCES, ...stored };
  } catch {
    return DEFAULT_DASHBOARD_PREFERENCES;
  }
}

export function saveDashboardPreferences(companyId, preferences) {
  if (!companyId || typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey(companyId), JSON.stringify(preferences));
}

export function resetDashboardPreferences(companyId) {
  if (!companyId || typeof window === 'undefined') return;
  window.localStorage.removeItem(storageKey(companyId));
}
