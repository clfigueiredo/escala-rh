import { useEffect, useState, type MouseEvent } from 'react';
import { Link, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { CabecalhoPagina, Carregando, Vazio } from '../components/ui';
import { DOCUMENTOS, GRUPOS_DOCUMENTOS, carregarTexto, renderizar, type Documento, type Titulo } from '../lib/documentos';

/** Administração › Documentação: tutorial, guia do RH e documentação técnica (arquivos de docs/). */
export default function DocumentacaoPage() {
  const { slug } = useParams();
  const doc = slug ? DOCUMENTOS.find((d) => d.slug === slug) : undefined;
  const navigate = useNavigate();

  return (
    <div>
      <CabecalhoPagina
        titulo="Documentação"
        subtitulo="Tutorial do painel e documentação completa do sistema."
        acoes={
          doc && (
            <button type="button" className="btn" onClick={() => window.print()}>
              Imprimir / salvar PDF
            </button>
          )
        }
      />
      <select
        className="docs-seletor"
        aria-label="Documento"
        value={doc?.slug ?? ''}
        onChange={(e) => navigate(`/documentacao/${e.target.value}`)}
      >
        <option value="">Início</option>
        {GRUPOS_DOCUMENTOS.map((g) => (
          <optgroup key={g.titulo} label={g.titulo}>
            {g.docs.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.titulo}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <div className="docs">
        <nav className="docs-indice cartao" aria-label="Documentos">
          <NavLink to="/documentacao" end className={({ isActive }) => `docs-link ${isActive ? 'ativo' : ''}`}>
            Início
          </NavLink>
          {GRUPOS_DOCUMENTOS.map((g) => (
            <div key={g.titulo} className="docs-grupo">
              <div className="docs-grupo-titulo">{g.titulo}</div>
              {g.docs.map((d) => (
                <NavLink key={d.slug} to={`/documentacao/${d.slug}`} className={({ isActive }) => `docs-link ${isActive ? 'ativo' : ''}`}>
                  {d.titulo}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="docs-conteudo cartao">
          {!slug ? <Inicio /> : doc ? <Leitor key={doc.slug} doc={doc} /> : <Vazio>Documento não encontrado.</Vazio>}
        </div>
      </div>
    </div>
  );
}

function Inicio() {
  return (
    <div className="doc-markdown">
      <p>
        Toda a documentação do Escala RH num só lugar. Para aprender a usar o painel, comece pelo{' '}
        <Link to="/documentacao/tutorial">Tutorial completo</Link>. Os documentos de <strong>Sistema</strong> e{' '}
        <strong>Servidor</strong> são técnicos: servem para quem mantém a instalação.
      </p>
      {GRUPOS_DOCUMENTOS.map((g) => (
        <section key={g.titulo}>
          <h2>{g.titulo}</h2>
          <div className="docs-cartoes">
            {g.docs.map((d) => (
              <Link key={d.slug} to={`/documentacao/${d.slug}`} className="docs-cartao">
                <strong>{d.titulo}</strong>
                <span>{d.resumo}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Leitor({ doc }: { doc: Documento }) {
  const [conteudo, setConteudo] = useState<{ html: string; titulos: Titulo[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const navigate = useNavigate();
  const { hash } = useLocation();

  useEffect(() => {
    let vivo = true;
    carregarTexto(doc)
      .then((md) => vivo && setConteudo(renderizar(doc, md)))
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : 'Falha ao carregar o documento.'));
    return () => {
      vivo = false;
    };
  }, [doc]);

  // Ao abrir (ou mudar a âncora), rola até o título indicado; sem âncora, vai para o topo.
  useEffect(() => {
    if (!conteudo) return;
    const alvo = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
    if (alvo) alvo.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [conteudo, hash]);

  // Links para outros documentos e âncoras navegam sem recarregar a página.
  const aoClicar = (e: MouseEvent<HTMLElement>) => {
    const a = (e.target as HTMLElement).closest('a');
    const href = a?.getAttribute('href');
    if (!a || !href || a.target === '_blank' || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (href.startsWith('#') || href.startsWith('/documentacao')) {
      e.preventDefault();
      navigate(href.startsWith('#') ? { hash: href } : href);
    }
  };

  if (erro) return <Vazio>{erro}</Vazio>;
  if (!conteudo) return <Carregando texto="Carregando documento…" />;
  return (
    <>
      {conteudo.titulos.length > 3 && (
        <details className="docs-sumario">
          <summary>Neste documento</summary>
          <ul>
            {conteudo.titulos.map((t) => (
              <li key={t.id} className={t.nivel === 3 ? 'nivel-3' : ''}>
                <a href={`#${t.id}`} onClick={aoClicar}>
                  {t.texto}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
      <article className="doc-markdown" onClick={aoClicar} dangerouslySetInnerHTML={{ __html: conteudo.html }} />
    </>
  );
}
