import React from 'react';
import {
  UploadCloud,
  PenSquare,
  ShieldCheck,
  BarChart3,
  Lightbulb,
  TrendingUp,
  ArrowRight,
} from 'lucide-react';

const STEPS = [
  { icon: UploadCloud, title: 'Collecter', subtitle: 'Vos documents' },
  { icon: PenSquare, title: 'Comptabiliser', subtitle: 'Vos écritures' },
  { icon: ShieldCheck, title: 'Contrôler', subtitle: 'Vos données' },
  { icon: BarChart3, title: 'Analyser', subtitle: 'Vos performances' },
  { icon: Lightbulb, title: 'Décider', subtitle: 'Avec des recommandations' },
];

function MiniKpi({ label, tone }) {
  return (
    <div className="rounded-md bg-white/10 p-1.5">
      <p className="text-[6px] uppercase tracking-wide text-white/50">{label}</p>
      <p className={`text-[8px] font-bold ${tone}`}>•••</p>
    </div>
  );
}

export default function Home({ onLogin }) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-[#142638] text-white overflow-hidden">
      <div className="mx-auto max-w-6xl px-6 py-8 lg:py-10">
        {/* Barre supérieure */}
        <div className="flex flex-wrap items-start justify-between gap-6 mb-10 lg:mb-14">
          <div className="flex items-center gap-3">
            <img src="/logo%20sadesk.png" alt="Sadesk Logo" className="h-12 w-12 object-contain" />
            <span className="text-2xl font-bold tracking-tight">
              <span className="font-extrabold">SADESK</span> Compta
            </span>
          </div>

          <div className="flex items-center gap-4">
            <p className="hidden sm:block relative italic text-[#ffb774] font-medium text-sm max-w-[220px] text-right pb-3">
              Plus qu'un logiciel, un vrai partenaire de gestion !
              <svg className="absolute -bottom-1 right-0 w-40" viewBox="0 0 160 12" fill="none">
                <path d="M2 8c26-10 52-10 78-2s52 8 78-2" stroke="#f5871f" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </p>
            <button
              type="button"
              onClick={onLogin}
              className="shrink-0 px-4 py-2 rounded-lg border border-white/20 bg-white/10 hover:bg-white/20 text-sm font-medium transition-colors"
            >
              Se connecter
            </button>
          </div>
        </div>

        <h1 className="text-2xl lg:text-4xl font-bold leading-tight max-w-2xl mb-10 lg:mb-14">
          Une comptabilité moderne, multi-sociétés, simple et puissante.
        </h1>

        {/* Mockups app (laptop + téléphone) */}
        <div className="flex flex-col lg:flex-row items-center justify-center gap-8 mb-14 lg:mb-20">
          {/* Laptop */}
          <div className="w-full max-w-2xl rounded-xl border border-white/15 bg-white text-slate-800 shadow-2xl shadow-black/40 overflow-hidden">
            <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 border-b border-slate-200">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <span className="ml-3 text-[10px] font-semibold text-slate-500">SADESK Compta</span>
            </div>
            <div className="flex">
              <div className="w-24 bg-[#142638] p-2 space-y-1.5">
                {['Tableau de bord', 'Comptes', 'Journaux', 'Écritures', 'États financiers', 'Trésorerie', 'Paramètres'].map((item, i) => (
                  <div key={item} className={`rounded px-1.5 py-1 text-[6px] font-medium ${i === 0 ? 'bg-[#f5871f] text-[#142638]' : 'text-slate-300'}`}>
                    {item}
                  </div>
                ))}
              </div>
              <div className="flex-1 p-3 space-y-2.5">
                <div>
                  <p className="text-[9px] font-bold text-slate-800">Bonjour, Chers</p>
                  <p className="text-[7px] text-slate-500">Voici un aperçu de votre activité</p>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { label: 'Trésorerie', tone: 'text-emerald-600' },
                    { label: "Chiffre d'affaires", tone: 'text-emerald-600' },
                    { label: 'Résultat', tone: 'text-blue-600' },
                    { label: 'Dettes', tone: 'text-amber-600' },
                  ].map((kpi) => (
                    <div key={kpi.label} className="rounded-md border border-slate-100 bg-slate-50 p-1.5">
                      <p className="text-[5px] uppercase tracking-wide text-slate-400">{kpi.label}</p>
                      <p className={`text-[7px] font-bold ${kpi.tone}`}>•••</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2 rounded-md border border-slate-100 p-2 flex items-end gap-1 h-14">
                    {[40, 60, 35, 70, 55, 80, 50].map((h, i) => (
                      <div key={i} className="flex-1 rounded-t bg-blue-500" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                  <div className="rounded-md border border-slate-100 flex items-center justify-center">
                    <div className="h-9 w-9 rounded-full" style={{ background: 'conic-gradient(#f5871f 0 42%, #2563eb 42% 70%, #64748b 70% 88%, #94a3b8 88% 100%)' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Téléphone */}
          <div className="w-32 shrink-0 rounded-2xl border border-white/15 bg-white text-slate-800 shadow-2xl shadow-black/40 overflow-hidden">
            <div className="bg-[#142638] px-2 py-2 text-center">
              <p className="text-[7px] font-bold text-white">SADESK Compta</p>
            </div>
            <div className="p-2 space-y-1.5">
              <p className="text-[6px] font-semibold text-slate-700">Tableau de bord ›</p>
              <div className="grid grid-cols-2 gap-1">
                <MiniKpi label="Trésorerie" tone="text-emerald-600" />
                <MiniKpi label="CA" tone="text-emerald-600" />
                <MiniKpi label="Résultat" tone="text-blue-600" />
                <MiniKpi label="Dettes" tone="text-amber-600" />
              </div>
              <div className="rounded-md border border-slate-100 p-1 flex items-end gap-0.5 h-8">
                {[30, 55, 40, 65, 50].map((h, i) => (
                  <div key={i} className="flex-1 rounded-t bg-[#f5871f]" style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
            <div className="flex items-center justify-around border-t border-slate-100 py-1.5">
              {[TrendingUp, BarChart3, ShieldCheck, ArrowRight].map((Icon, i) => (
                <Icon key={i} className="h-2.5 w-2.5 text-slate-400" />
              ))}
            </div>
          </div>
        </div>

        {/* Étapes */}
        <div className="grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-white/15 border-t border-white/15 pt-6">
          {STEPS.map(({ icon: Icon, title, subtitle }) => (
            <div key={title} className="flex flex-col items-center text-center gap-2 px-2 py-3">
              <div className="h-10 w-10 rounded-full border border-white/25 flex items-center justify-center">
                <Icon className="h-4.5 w-4.5 text-white" />
              </div>
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-[11px] text-white/60 leading-tight">{subtitle}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
