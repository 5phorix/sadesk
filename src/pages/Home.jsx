import React from 'react';
import { BarChart3, Lightbulb, PenSquare, ShieldCheck, UploadCloud } from 'lucide-react';

const STEPS = [
  { icon: UploadCloud, title: 'Collecter', subtitle: 'Vos documents' },
  { icon: PenSquare, title: 'Comptabiliser', subtitle: 'Vos écritures' },
  { icon: ShieldCheck, title: 'Contrôler', subtitle: 'Vos données' },
  { icon: BarChart3, title: 'Analyser', subtitle: 'Vos performances' },
  { icon: Lightbulb, title: 'Décider', subtitle: 'Avec des recommandations' },
];

export default function Home({ onLogin }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#003b73] text-white">
      <div className="pointer-events-none absolute -left-[12%] -top-[42%] h-[92%] w-[76%] rounded-[48%] bg-[#07569a]/80" />
      <div className="pointer-events-none absolute -bottom-[52%] right-0 h-[96%] w-[94%] rounded-[50%] bg-[#075da7]/90 lg:-right-[19%]" />
      <div className="pointer-events-none absolute -bottom-[47%] -left-[24%] h-[66%] w-[88%] rounded-[50%] border-t-[5px] border-[#0c78c1]/65" />

      <div className="relative mx-auto flex min-h-screen max-w-[1488px] flex-col px-7 py-8 sm:px-10 sm:py-10 lg:px-11 lg:py-[72px]">
        <header className="flex flex-col items-stretch gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <img src="/logo_sadesk.png" alt="Sadesk Logo" className="h-14 w-14 shrink-0 object-contain sm:h-[120px] sm:w-[120px]" />
            <span className="h-14 shrink-0 border-l-2 border-cyan-300/80 sm:h-[120px]" />
            <span className="whitespace-nowrap text-xl font-light tracking-tight sm:text-5xl lg:text-[68px]">
              <strong className="font-bold">SADESK</strong> Compta
            </span>
          </div>

          <button
            type="button"
            onClick={onLogin}
            className="relative self-end rounded-lg bg-[#f9a400] px-4 py-2.5 text-xs font-bold text-[#142638] shadow-[0_8px_20px_rgba(0,0,0,0.22)] ring-2 ring-white/50 transition-all hover:-translate-y-0.5 hover:bg-[#ffb52e] hover:shadow-[0_10px_24px_rgba(0,0,0,0.28)] sm:px-5 sm:py-3 sm:text-sm lg:absolute lg:right-11 lg:top-3"
          >
            Se connecter
          </button>

          <p className="relative z-10 hidden w-[320px] shrink-0 -translate-y-12 -rotate-3 text-right text-2xl font-semibold leading-[1.05] text-white lg:mr-36 lg:block lg:text-[26px]" style={{ fontFamily: '"Comic Sans MS", "Segoe Print", cursive' }}>
            Plus qu&apos;un logiciel,
            <br />
            un vrai partenaire
            <br />
            de gestion !
            <span className="mt-1 block -rotate-2 text-right text-5xl leading-3 text-[#f9a400]">⌒</span>
          </p>
        </header>

        <section className="flex flex-1 flex-col justify-center gap-8 pb-8 pt-14 lg:relative lg:h-[364px] lg:flex-none lg:gap-0 lg:pt-0">
          <h1 className="max-w-[700px] text-3xl font-bold leading-[1.45] tracking-tight sm:text-5xl lg:absolute lg:left-0 lg:top-[72px] lg:w-[52%] lg:text-[42px] xl:text-[48px]">
            Une comptabilité moderne,
            <br />
            multi-sociétés, simple et puissante.
          </h1>

          <div className="flex justify-center lg:absolute lg:right-0 lg:top-[-31px] lg:w-[48%] lg:justify-end">
            <img src="/image_-page-accueil-rem.png" alt="SADESK Compta sur ordinateur et mobile" className="h-auto w-full max-w-[700px] object-contain lg:max-w-[760px]" />
          </div>
        </section>

        <section className="grid grid-cols-2 border-t border-cyan-300/80 pt-6 md:grid-cols-3 lg:mt-0 lg:grid-cols-5 lg:divide-x lg:divide-cyan-300/80 lg:border-t-0 lg:pt-0">
          {STEPS.map(({ icon: Icon, title, subtitle }) => (
            <div key={title} className="flex min-h-[142px] flex-col items-center justify-center gap-2 px-3 py-4 text-center sm:min-h-0 sm:py-0">
              <Icon className="h-12 w-12 stroke-[1.7] text-white sm:h-14 sm:w-14" />
              <p className="text-xl font-semibold sm:text-2xl">{title}</p>
              <p className="text-base text-white/90 sm:text-xl">{subtitle}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
