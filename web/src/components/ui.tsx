import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';

// ---------- Modal ----------
interface ModalProps {
  titulo: string;
  aberto: boolean;
  onFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
  largura?: 'normal' | 'larga';
}

export function Modal({ titulo, aberto, onFechar, children, rodape, largura = 'normal' }: ModalProps) {
  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [aberto, onFechar]);

  if (!aberto) return null;
  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className={`modal ${largura === 'larga' ? 'modal-larga' : ''}`} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="modal-cabecalho">
          <h2>{titulo}</h2>
          <button type="button" className="btn-icone" onClick={onFechar} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="modal-corpo">{children}</div>
        {rodape && <div className="modal-rodape">{rodape}</div>}
      </div>
    </div>
  );
}

// ---------- Tabela ----------
// No celular (CSS) cada linha vira um cartão; o rótulo de cada célula vem do
// cabeçalho da coluna, copiado aqui para `data-rotulo` a cada renderização.
export function Tabela({ children, compacta }: { children: ReactNode; compacta?: boolean }) {
  const ref = useRef<HTMLTableElement>(null);
  useLayoutEffect(() => {
    const tabela = ref.current;
    if (!tabela) return;
    const rotulos = Array.from(tabela.tHead?.rows[0]?.cells ?? [], (c) => c.textContent?.trim() ?? '');
    for (const corpo of Array.from(tabela.tBodies)) {
      for (const linha of Array.from(corpo.rows)) {
        Array.from(linha.cells).forEach((celula, i) => {
          if (rotulos[i]) celula.dataset.rotulo = rotulos[i];
          else delete celula.dataset.rotulo;
        });
      }
    }
  });
  return (
    <table ref={ref} className={`tabela tabela-responsiva ${compacta ? 'tabela-compacta' : ''}`}>
      {children}
    </table>
  );
}

// ---------- Campo de formulário ----------
interface CampoProps {
  rotulo: string;
  children: ReactNode;
  dica?: ReactNode;
  obrigatorio?: boolean;
  className?: string;
}

export function Campo({ rotulo, children, dica, obrigatorio, className }: CampoProps) {
  return (
    <label className={`campo ${className ?? ''}`}>
      <span className="campo-rotulo">
        {rotulo}
        {obrigatorio && <span className="obrigatorio"> *</span>}
      </span>
      {children}
      {dica && <span className="campo-dica">{dica}</span>}
    </label>
  );
}

// ---------- Cabeçalho de página ----------
export function CabecalhoPagina({ titulo, subtitulo, acoes }: { titulo: string; subtitulo?: string; acoes?: ReactNode }) {
  return (
    <div className="pagina-cabecalho">
      <div>
        <h1>{titulo}</h1>
        {subtitulo && <p className="subtitulo">{subtitulo}</p>}
      </div>
      {acoes && <div className="pagina-acoes">{acoes}</div>}
    </div>
  );
}

// ---------- Selo (badge) ----------
export function Selo({ cor = 'cinza', children, title }: { cor?: 'verde' | 'vermelho' | 'amarelo' | 'azul' | 'cinza'; children: ReactNode; title?: string }) {
  return (
    <span className={`selo selo-${cor}`} title={title}>
      {children}
    </span>
  );
}

export function SeloAtivo({ ativo }: { ativo: boolean }) {
  return <Selo cor={ativo ? 'verde' : 'cinza'}>{ativo ? 'Ativo' : 'Inativo'}</Selo>;
}

// ---------- Estados de lista ----------
export function Vazio({ children }: { children: ReactNode }) {
  return <div className="vazio">{children}</div>;
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return <div className="carregando">{texto}</div>;
}

// ---------- Filtro "ativo" ----------
export type FiltroAtivo = 'todos' | 'ativos' | 'inativos';

export function filtroAtivoParaQuery(f: FiltroAtivo): boolean | undefined {
  return f === 'todos' ? undefined : f === 'ativos';
}

export function SelectAtivo({ valor, onChange }: { valor: FiltroAtivo; onChange: (v: FiltroAtivo) => void }) {
  return (
    <select value={valor} onChange={(e) => onChange(e.target.value as FiltroAtivo)} aria-label="Situação">
      <option value="ativos">Somente ativos</option>
      <option value="inativos">Somente inativos</option>
      <option value="todos">Todos</option>
    </select>
  );
}

export function Interruptor({ marcado, onChange, rotulo }: { marcado: boolean; onChange: (v: boolean) => void; rotulo: string }) {
  return (
    <label className="interruptor">
      <input type="checkbox" checked={marcado} onChange={(e) => onChange(e.target.checked)} />
      <span>{rotulo}</span>
    </label>
  );
}
