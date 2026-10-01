import { http } from './client';
import type {
  Ausencia,
  AusenciaInput,
  Configuracoes,
  EscalaFiltro,
  Funcionario,
  FuncionarioInput,
  GerarInput,
  GerarResultado,
  Mensagem,
  MensagensFiltro,
  ModoConflito,
  Padrao,
  PadraoInput,
  Paginado,
  Plantao,
  PlantaoAtualizar,
  PlantaoCriar,
  Previa,
  RegraLembrete,
  RegraLembreteInput,
  Setor,
  SetorInput,
  Turno,
  TurnoInput,
  Usuario,
  UsuarioInput,
  WhatsAppConectar,
  WhatsAppStatus,
} from './types';

export * from './types';
export { ApiError, mensagemDeErro } from './client';

// ---------- Autenticação ----------
export const authApi = {
  login: (email: string, senha: string) =>
    http.post<{ usuario: Usuario }>('/auth/login', { email, senha }, { semRedirecionar401: true }),
  logout: () => http.post<void>('/auth/logout', undefined, { semRedirecionar401: true }),
  me: () => http.get<{ usuario: Usuario }>('/auth/me', undefined, { semRedirecionar401: true }),
  trocarSenha: (senhaAtual: string, novaSenha: string) =>
    http.post<void>('/auth/senha', { senhaAtual, novaSenha }),
};

// ---------- Cadastros ----------
export const usuariosApi = {
  listar: () => http.get<Usuario[]>('/usuarios'),
  criar: (dados: UsuarioInput) => http.post<Usuario>('/usuarios', dados),
  atualizar: (id: number, dados: UsuarioInput) => http.put<Usuario>(`/usuarios/${id}`, dados),
};

export const setoresApi = {
  listar: (q?: { ativo?: boolean }) => http.get<Setor[]>('/setores', q),
  criar: (dados: SetorInput) => http.post<Setor>('/setores', dados),
  atualizar: (id: number, dados: SetorInput) => http.put<Setor>(`/setores/${id}`, dados),
};

export const funcionariosApi = {
  listar: (q?: { setorId?: number; ativo?: boolean; busca?: string }) =>
    http.get<Funcionario[]>('/funcionarios', q),
  obter: (id: number) => http.get<Funcionario>(`/funcionarios/${id}`),
  criar: (dados: FuncionarioInput) => http.post<Funcionario>('/funcionarios', dados),
  atualizar: (id: number, dados: FuncionarioInput) => http.put<Funcionario>(`/funcionarios/${id}`, dados),
};

export const turnosApi = {
  listar: (q?: { ativo?: boolean }) => http.get<Turno[]>('/turnos', q),
  criar: (dados: TurnoInput) => http.post<Turno>('/turnos', dados),
  atualizar: (id: number, dados: TurnoInput) => http.put<Turno>(`/turnos/${id}`, dados),
};

export const padroesApi = {
  listar: (q?: { ativo?: boolean }) => http.get<Padrao[]>('/padroes', q),
  criar: (dados: PadraoInput) => http.post<Padrao>('/padroes', dados),
  atualizar: (id: number, dados: PadraoInput) => http.put<Padrao>(`/padroes/${id}`, dados),
};

// ---------- Escala ----------
export const escalaApi = {
  listar: (f: EscalaFiltro) => http.get<Plantao[]>('/escala', { ...f }),
  criar: (dados: PlantaoCriar) => http.post<Plantao>('/escala', dados),
  atualizar: (id: number, dados: PlantaoAtualizar) => http.put<Plantao>(`/escala/${id}`, dados),
  excluir: (id: number) => http.del(`/escala/${id}`),
  previa: (dados: GerarInput) => http.post<Previa>('/escala/gerar/previa', dados),
  gerar: (dados: GerarInput & { modoConflito: ModoConflito }) =>
    http.post<GerarResultado>('/escala/gerar', dados),
};

// ---------- Ausências ----------
export const ausenciasApi = {
  listar: (q?: { funcionarioId?: number; setorId?: number; inicio?: string; fim?: string }) =>
    http.get<Ausencia[]>('/ausencias', q),
  criar: (dados: AusenciaInput) => http.post<Ausencia>('/ausencias', dados),
  atualizar: (id: number, dados: AusenciaInput) => http.put<Ausencia>(`/ausencias/${id}`, dados),
  excluir: (id: number) => http.del(`/ausencias/${id}`),
};

// ---------- WhatsApp ----------
export const regrasApi = {
  listar: () => http.get<RegraLembrete[]>('/regras-lembrete'),
  criar: (dados: RegraLembreteInput) => http.post<RegraLembrete>('/regras-lembrete', dados),
  atualizar: (id: number, dados: RegraLembreteInput) =>
    http.put<RegraLembrete>(`/regras-lembrete/${id}`, dados),
  excluir: (id: number) => http.del(`/regras-lembrete/${id}`),
  previa: (template: string) => http.post<{ texto: string }>('/regras-lembrete/previa', { template }),
};

export const configuracoesApi = {
  obter: () => http.get<Configuracoes>('/configuracoes'),
  salvar: (dados: Partial<Configuracoes>) => http.put<Configuracoes>('/configuracoes', dados),
};

export const whatsappApi = {
  status: () => http.get<WhatsAppStatus>('/whatsapp/status'),
  conectar: () => http.post<WhatsAppConectar>('/whatsapp/conectar'),
  desconectar: () => http.post<void>('/whatsapp/desconectar'),
};

export const mensagensApi = {
  listar: (f: MensagensFiltro) => http.get<Paginado<Mensagem>>('/mensagens', { ...f }),
};
