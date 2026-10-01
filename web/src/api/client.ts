// Cliente HTTP do painel. Todas as chamadas vão para caminhos relativos /api/...
// com cookie de sessão (credentials: 'include').

export class ApiError extends Error {
  status: number;
  detalhes?: unknown;

  constructor(status: number, mensagem: string, detalhes?: unknown) {
    super(mensagem);
    this.name = 'ApiError';
    this.status = status;
    this.detalhes = detalhes;
  }
}

type Handler = () => void;
let aoNaoAutenticado: Handler | null = null;

/** Registrado pelo AuthProvider: limpa a sessão e leva para /login. */
export function definirHandlerNaoAutenticado(fn: Handler | null) {
  aoNaoAutenticado = fn;
}

export type Query = Record<string, string | number | boolean | null | undefined>;

export function montarQuery(q?: Query): string {
  if (!q) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === '') continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

const MENSAGENS_PADRAO: Record<number, string> = {
  400: 'Dados inválidos.',
  401: 'Sessão expirada. Faça login novamente.',
  403: 'Você não tem permissão para esta ação.',
  404: 'Registro não encontrado.',
  409: 'Conflito: registro duplicado.',
  429: 'Muitas tentativas. Aguarde um instante e tente de novo.',
};

interface Opcoes {
  query?: Query;
  body?: unknown;
  /** Não disparar o redirecionamento para /login em caso de 401 (ex.: login, /me). */
  semRedirecionar401?: boolean;
}

async function requisicao<T>(metodo: string, caminho: string, opcoes: Opcoes = {}): Promise<T> {
  const url = `/api${caminho}${montarQuery(opcoes.query)}`;
  const init: RequestInit = {
    method: metodo,
    credentials: 'include',
    headers: { Accept: 'application/json' },
  };
  if (opcoes.body !== undefined) {
    init.headers = { ...init.headers, 'Content-Type': 'application/json' };
    init.body = JSON.stringify(opcoes.body);
  }

  let resp: Response;
  try {
    resp = await fetch(url, init);
  } catch {
    throw new ApiError(0, 'Não foi possível conectar ao servidor. Verifique sua conexão.');
  }

  if (resp.status === 204) return undefined as T;

  const texto = await resp.text();
  let dados: unknown = null;
  if (texto) {
    try {
      dados = JSON.parse(texto);
    } catch {
      dados = null;
    }
  }

  if (!resp.ok) {
    const corpo = (dados ?? {}) as { erro?: string; detalhes?: unknown };
    const msg = corpo.erro || MENSAGENS_PADRAO[resp.status] || `Erro inesperado (HTTP ${resp.status}).`;
    if (resp.status === 401 && !opcoes.semRedirecionar401) {
      if (aoNaoAutenticado) aoNaoAutenticado();
      else if (window.location.pathname !== '/login') window.location.assign('/login');
    }
    throw new ApiError(resp.status, msg, corpo.detalhes);
  }

  return dados as T;
}

export const http = {
  get: <T>(caminho: string, query?: Query, extra?: Omit<Opcoes, 'query' | 'body'>) =>
    requisicao<T>('GET', caminho, { query, ...extra }),
  post: <T>(caminho: string, body?: unknown, extra?: Omit<Opcoes, 'query' | 'body'>) =>
    requisicao<T>('POST', caminho, { body: body ?? {}, ...extra }),
  put: <T>(caminho: string, body: unknown) => requisicao<T>('PUT', caminho, { body }),
  del: (caminho: string) => requisicao<void>('DELETE', caminho),
};

export function mensagemDeErro(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Erro inesperado.';
}
