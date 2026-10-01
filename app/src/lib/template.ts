/**
 * Renderização dos templates de lembrete (docs/05-whatsapp.md).
 * Variáveis: {nome} {data} {dia_semana} {inicio} {fim} {turno} {setor}.
 * Datas/horas sempre no fuso America/Sao_Paulo (lib/datas).
 * Variável desconhecida fica como está no texto (ajuda o admin a perceber o erro na prévia).
 */
import { combinarDataHora, diaSemanaExtenso, formatarData, formatarHora, hojeSP, somarDias } from './datas';

export const VARIAVEIS_TEMPLATE = ['nome', 'data', 'dia_semana', 'inicio', 'fim', 'turno', 'setor'] as const;

export interface DadosTemplate {
  nome: string;
  inicio: Date;
  fim: Date;
  /** Nome do turno; null = horário avulso. */
  turno: string | null;
  setor: string;
}

export function variaveisTemplate(d: DadosTemplate): Record<string, string> {
  return {
    nome: d.nome,
    data: formatarData(d.inicio),
    dia_semana: diaSemanaExtenso(d.inicio),
    inicio: formatarHora(d.inicio),
    fim: formatarHora(d.fim),
    turno: d.turno ?? 'Horário avulso',
    setor: d.setor,
  };
}

export function renderizarTemplate(template: string, dados: DadosTemplate): string {
  const vars = variaveisTemplate(dados);
  return template.replace(/\{([a-z_]+)\}/g, (orig, nome: string) =>
    Object.prototype.hasOwnProperty.call(vars, nome) ? vars[nome] : orig,
  );
}

/** Dados fictícios para a prévia no painel: plantão de amanhã, 07:00–19:00. */
export function dadosExemplo(hoje = hojeSP()): DadosTemplate {
  const amanha = somarDias(hoje, 1);
  return {
    nome: 'Maria Silva',
    inicio: combinarDataHora(amanha, '07:00'),
    fim: combinarDataHora(amanha, '19:00'),
    turno: 'Plantão dia',
    setor: 'Recepção',
  };
}
