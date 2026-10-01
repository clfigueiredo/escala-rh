import type { ReactNode, SVGProps } from 'react';

// Ícones de linha (24×24, traço 1.8) — herdam a cor do texto via currentColor.
function Svg({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

type P = SVGProps<SVGSVGElement>;

export const IconeCalendario = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Svg>
);
export const IconeLivro = (p: P) => (
  <Svg {...p}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" />
    <path d="M7 8h1.5M7 11h1.5M15.5 8H17M15.5 11H17" />
  </Svg>
);
export const IconeGerar = (p: P) => (
  <Svg {...p}>
    <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5" />
  </Svg>
);
export const IconeAusencia = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4M9.5 13.5l5 5M14.5 13.5l-5 5" />
  </Svg>
);
export const IconePessoas = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="8.5" r="3.5" />
    <path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 5.2a3.5 3.5 0 0 1 0 6.6M18 14.8c1.8.7 3 2.5 3.5 5.2" />
  </Svg>
);
export const IconeSetor = (p: P) => (
  <Svg {...p}>
    <path d="M4 20.5V5.5l8-2.5v17.5M12 8.5l8 2.5v9.5M2.5 20.5h19M7.5 8h1M7.5 12h1M7.5 16h1M15.5 13h1M15.5 16.5h1" />
  </Svg>
);
export const IconeRelogio = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);
export const IconeCiclo = (p: P) => (
  <Svg {...p}>
    <path d="M17 3.5l3 3-3 3M20 6.5H8a4 4 0 0 0-4 4V12M7 20.5l-3-3 3-3M4 17.5h12a4 4 0 0 0 4-4V12" />
  </Svg>
);
export const IconeChave = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="15" r="4.5" />
    <path d="M11.2 11.8L20 3M16.5 6.5l2.5 2.5M14 9l2 2" />
  </Svg>
);
export const IconeMensagens = (p: P) => (
  <Svg {...p}>
    <path d="M20.5 11.5a8.5 8.5 0 0 1-12.4 7.6L3.5 20.5l1.4-4.4A8.5 8.5 0 1 1 20.5 11.5z" />
    <path d="M8.5 10h7M8.5 13.5h4.5" />
  </Svg>
);
export const IconeCelular = (p: P) => (
  <Svg {...p}>
    <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
    <path d="M10.5 18.5h3" />
  </Svg>
);
export const IconeSino = (p: P) => (
  <Svg {...p}>
    <path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" />
  </Svg>
);
export const IconeAjustes = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </Svg>
);
export const IconeMenu = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);

// Marca: um relógio dividido entre dia (sol, coral) e noite (lua) — os dois lados do plantão.
export function Marca({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.5" />
      <path d="M20 4a16 16 0 0 0 0 32z" fill="#ff5530" />
      <path d="M28 13a7 7 0 1 0 0 14a9 9 0 0 1 0-14z" fill="currentColor" />
    </svg>
  );
}
