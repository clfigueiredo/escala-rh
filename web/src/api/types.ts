// Tipos espelhando o contrato da API (docs/08-api.md).
// Datas/horas: timestamptz → ISO UTC; date → "YYYY-MM-DD"; time → "HH:mm".

export type Perfil = 'ADMIN' | 'GESTOR';

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
  setorIds: number[];
}

export interface UsuarioInput {
  nome: string;
  email: string;
  senha?: string;
  perfil: Perfil;
  setorIds: number[];
  ativo: boolean;
}

export interface Setor {
  id: number;
  nome: string;
  ativo: boolean;
}

export interface SetorInput {
  nome: string;
  ativo: boolean;
}

export interface Referencia {
  id: number;
  nome: string;
}

export interface Funcionario {
  id: number;
  nome: string;
  telefone: string;
  telefoneAlt: string | null;
  setorId: number;
  setor: Referencia;
  cargo: string | null;
  observacoes: string | null;
  ativo: boolean;
}

export interface FuncionarioInput {
  nome: string;
  telefone: string;
  setorId: number;
  cargo?: string | null;
  observacoes?: string | null;
  ativo: boolean;
}

export interface Turno {
  id: number;
  nome: string;
  horaInicio: string;
  horaFim: string;
  cor: string;
  ativo: boolean;
  viraNoite: boolean;
}

export interface TurnoInput {
  nome: string;
  horaInicio: string;
  horaFim: string;
  cor: string;
  ativo: boolean;
}

export type TipoPadrao = 'CICLO' | 'SEMANAL';

export interface Padrao {
  id: number;
  nome: string;
  tipo: TipoPadrao;
  diasTrabalho: number | null;
  diasFolga: number | null;
  diasSemana: number[] | null;
  ativo: boolean;
}

export interface PadraoInput {
  nome: string;
  tipo: TipoPadrao;
  diasTrabalho?: number;
  diasFolga?: number;
  diasSemana?: number[];
  ativo: boolean;
}

export type TipoConflito = 'SOBREPOSICAO' | 'AUSENCIA';

export interface Conflito {
  tipo: TipoConflito;
  descricao: string;
  plantaoId?: number;
}

export type StatusPlantao = 'AGENDADO' | 'CANCELADO';
export type OrigemPlantao = 'GERADO' | 'MANUAL';

export interface Plantao {
  id: number;
  funcionarioId: number;
  setorId: number;
  turnoId: number | null;
  inicio: string;
  fim: string;
  status: StatusPlantao;
  origem: OrigemPlantao;
  observacao: string | null;
  funcionario: Referencia;
  setor: Referencia;
  turno: { id: number; nome: string; cor: string } | null;
  conflitos: Conflito[];
}

export interface PlantaoCriar {
  funcionarioId: number;
  setorId?: number;
  turnoId?: number | null;
  inicio: string;
  fim: string;
  observacao?: string | null;
}

export interface PlantaoAtualizar {
  funcionarioId?: number;
  setorId?: number;
  turnoId?: number | null;
  inicio?: string;
  fim?: string;
  status?: StatusPlantao;
  observacao?: string | null;
}

export interface EscalaFiltro {
  inicio: string;
  fim: string;
  setorId?: number;
  funcionarioId?: number;
  status?: StatusPlantao;
}

export interface GerarInput {
  funcionarioIds: number[];
  padraoId: number;
  turnoId: number;
  dataInicioCiclo: string;
  periodoInicio: string;
  periodoFim: string;
  setorId: number | null;
}

export type ModoConflito = 'PULAR' | 'SUBSTITUIR';

export interface PreviaItem {
  funcionarioId: number;
  funcionarioNome: string;
  inicio: string;
  fim: string;
  conflitos: Conflito[];
}

export interface Previa {
  itens: PreviaItem[];
  total: number;
  comConflito: number;
}

export interface GerarResultado {
  criados: number;
  pulados: number;
  substituidos: number;
}

export type TipoAusencia = 'FERIAS' | 'ATESTADO' | 'FOLGA' | 'OUTRO';

export interface Ausencia {
  id: number;
  funcionarioId: number;
  funcionario: Referencia;
  tipo: TipoAusencia;
  dataInicio: string;
  dataFim: string;
  observacao: string | null;
}

export interface AusenciaInput {
  funcionarioId: number;
  tipo: TipoAusencia;
  dataInicio: string;
  dataFim: string;
  observacao?: string | null;
}

export type TipoRegra = 'ANTECEDENCIA' | 'VESPERA';

export interface RegraLembrete {
  id: number;
  nome: string;
  tipo: TipoRegra;
  minutos: number | null;
  horario: string | null;
  template: string;
  ativo: boolean;
}

export interface RegraLembreteInput {
  nome: string;
  tipo: TipoRegra;
  minutos?: number;
  horario?: string;
  template: string;
  ativo: boolean;
}

export interface NumeroDesconhecido {
  acao: 'ignorar' | 'responder';
  texto: string;
}

export interface Configuracoes {
  'bot.menu': string;
  'bot.numero_desconhecido': NumeroDesconhecido;
  'bot.sem_turno': string;
}

export type EstadoWhatsApp = 'open' | 'connecting' | 'close' | 'inexistente' | 'erro';

export interface WhatsAppStatus {
  estado: EstadoWhatsApp;
  numero?: string;
  erro?: string;
}

export interface WhatsAppConectar {
  estado: EstadoWhatsApp;
  qrcode?: string;
}

export type DirecaoMensagem = 'ENVIADA' | 'RECEBIDA';
export type OrigemMensagem = 'LEMBRETE' | 'BOT' | 'MANUAL';
export type StatusMensagem = 'OK' | 'FALHOU';

export interface Mensagem {
  id: number;
  direcao: DirecaoMensagem;
  telefone: string;
  funcionarioId: number | null;
  funcionario?: Referencia | null;
  conteudo: string;
  origem: OrigemMensagem;
  status: StatusMensagem;
  erro: string | null;
  criadoEm: string;
}

export interface MensagensFiltro {
  pagina: number;
  porPagina: number;
  direcao?: DirecaoMensagem;
  origem?: OrigemMensagem;
  status?: StatusMensagem;
  funcionarioId?: number;
  inicio?: string;
  fim?: string;
}

export interface Paginado<T> {
  itens: T[];
  total: number;
}
