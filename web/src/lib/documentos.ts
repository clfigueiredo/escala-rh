/**
 * Documentação do sistema exibida no painel (menu Administração › Documentação).
 * Fonte única: os arquivos Markdown de `docs/` e o README do repositório — o painel só os
 * renderiza. Os textos entram no build como chunks carregados sob demanda; as imagens do
 * tutorial (`docs/tutorial/img`) viram assets do Vite.
 */
import { Marked, type Tokens } from 'marked';

export interface Documento {
  slug: string;
  arquivo: string;
  titulo: string;
  resumo: string;
}

export const GRUPOS_DOCUMENTOS: { titulo: string; docs: Documento[] }[] = [
  {
    titulo: 'Uso do painel',
    docs: [
      { slug: 'tutorial', arquivo: '11-tutorial.md', titulo: 'Tutorial completo', resumo: 'Passo a passo ilustrado para RH e gestores: cadastros, gerar a escala, calendário, ausências, WhatsApp e perguntas frequentes.' },
      { slug: 'guia-rh', arquivo: '09-guia-rh.md', titulo: 'Guia rápido do RH', resumo: 'Resumo do uso do painel, sem imagens — bom para consulta rápida.' },
    ],
  },
  {
    titulo: 'Sistema',
    docs: [
      { slug: 'visao-geral', arquivo: '01-visao-geral.md', titulo: 'Visão geral', resumo: 'Escopo, funcionalidades, perfis de usuário e o que ficou para depois.' },
      { slug: 'whatsapp', arquivo: '05-whatsapp.md', titulo: 'WhatsApp: lembretes e bot', resumo: 'Como saem os lembretes, o que o bot responde e como o telefone é tratado.' },
      { slug: 'arquitetura', arquivo: '02-arquitetura.md', titulo: 'Arquitetura', resumo: 'Componentes e fluxos: lembrete, bot e geração de escala.' },
      { slug: 'banco-de-dados', arquivo: '04-banco-de-dados.md', titulo: 'Banco de dados', resumo: 'Tabelas, campos e regras do modelo de dados.' },
      { slug: 'api', arquivo: '08-api.md', titulo: 'API', resumo: 'Rotas, payloads e permissões da API usada pelo painel.' },
      { slug: 'fases', arquivo: '06-fases.md', titulo: 'Fases do projeto', resumo: 'Roadmap com o que já foi entregue.' },
    ],
  },
  {
    titulo: 'Servidor',
    docs: [
      { slug: 'instalacao', arquivo: 'README.md', titulo: 'Instalação', resumo: 'Passo a passo para instalar o sistema num servidor novo.' },
      { slug: 'infraestrutura', arquivo: '03-infraestrutura.md', titulo: 'Infraestrutura', resumo: 'Docker Compose, Caddy, firewall, portas e variáveis de ambiente.' },
      { slug: 'operacao', arquivo: '07-operacao.md', titulo: 'Operação', resumo: 'Deploy, logs, backup/restore e solução de problemas.' },
    ],
  },
];

export const DOCUMENTOS = GRUPOS_DOCUMENTOS.flatMap((g) => g.docs);

const textosDocs = import.meta.glob<string>(
  ['../../../docs/*.md', '!../../../docs/README.md', '!../../../docs/10-roteiro-tutorial.md'],
  { query: '?raw', import: 'default' },
);
const textoReadme = import.meta.glob<string>('../../../README.md', { query: '?raw', import: 'default' });
const imagens = import.meta.glob<string>('../../../docs/tutorial/img/*', { query: '?url', import: 'default', eager: true });

const URL_REPOSITORIO = 'https://github.com/clfigueiredo/escala-rh/blob/main/';

export async function carregarTexto(doc: Documento): Promise<string> {
  const carregar =
    doc.arquivo === 'README.md' ? textoReadme['../../../README.md'] : textosDocs[`../../../docs/${doc.arquivo}`];
  if (!carregar) throw new Error(`Documento não encontrado: ${doc.arquivo}`);
  return carregar();
}

/** Âncora no estilo do GitHub, para os sumários dos .md funcionarem no painel e no repositório. */
export function ancora(texto: string): string {
  return texto
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Caminho do link relativo ao repositório (o README está na raiz; os demais em docs/). */
function caminhoNoRepositorio(doc: Documento, href: string): string {
  const base = doc.arquivo === 'README.md' ? [] : ['docs'];
  for (const parte of href.split('/')) {
    if (parte === '..') base.pop();
    else if (parte !== '.' && parte !== '') base.push(parte);
  }
  return base.join('/');
}

/** Link interno do painel para um .md da lista, ou link para o arquivo no GitHub. */
function resolverLink(doc: Documento, href: string): { href: string; externo: boolean } {
  if (href.startsWith('#')) return { href, externo: false };
  if (/^[a-z]+:/i.test(href)) return { href, externo: true };
  const [arquivo, hash] = href.split('#');
  const caminho = caminhoNoRepositorio(doc, arquivo);
  const alvo = DOCUMENTOS.find((d) => (d.arquivo === 'README.md' ? 'README.md' : `docs/${d.arquivo}`) === caminho);
  if (alvo) return { href: `/documentacao/${alvo.slug}${hash ? `#${hash}` : ''}`, externo: false };
  return { href: URL_REPOSITORIO + caminho + (hash ? `#${hash}` : ''), externo: true };
}

export interface Titulo {
  id: string;
  texto: string;
  nivel: number;
}

/** Converte o Markdown em HTML (com âncoras nos títulos) e devolve o sumário (níveis 2 e 3). */
export function renderizar(doc: Documento, markdown: string): { html: string; titulos: Titulo[] } {
  const titulos: Titulo[] = [];
  const usados = new Map<string, number>();
  const md = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth, text }: Tokens.Heading) {
        const conteudo = this.parser.parseInline(tokens);
        let id = ancora(text.replace(/[*`_]/g, ''));
        const n = usados.get(id) ?? 0;
        usados.set(id, n + 1);
        if (n) id = `${id}-${n}`;
        if (depth === 2 || depth === 3) titulos.push({ id, texto: conteudo.replace(/<[^>]+>/g, ''), nivel: depth });
        return `<h${depth} id="${escapar(id)}">${conteudo}</h${depth}>\n`;
      },
      link({ href, title, tokens }: Tokens.Link) {
        const r = resolverLink(doc, href);
        const t = title ? ` title="${escapar(title)}"` : '';
        const alvo = r.externo ? ' target="_blank" rel="noopener noreferrer"' : '';
        return `<a href="${escapar(r.href)}"${t}${alvo}>${this.parser.parseInline(tokens)}</a>`;
      },
      image({ href, title, text }: Tokens.Image) {
        const nome = href.split('/').pop() ?? '';
        const url = imagens[`../../../docs/tutorial/img/${nome}`];
        if (!url) return `<span class="doc-imagem-faltando">[imagem: ${escapar(text)}]</span>`;
        const t = title ? ` title="${escapar(title)}"` : '';
        return `<a href="${escapar(url)}" target="_blank" rel="noopener" class="doc-imagem"><img src="${escapar(url)}" alt="${escapar(text)}"${t} loading="lazy" /></a>`;
      },
    },
  });
  const html = md.parse(markdown, { async: false });
  return { html, titulos };
}
