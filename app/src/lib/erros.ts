/**
 * Erro HTTP com mensagem em pt-BR. Lance em qualquer rota/serviço;
 * o handler global converte para `{ erro, detalhes? }` com o status.
 */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly detalhes?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (msg = 'Requisição inválida', detalhes?: unknown) =>
  new HttpError(400, msg, detalhes);
export const unauthorized = (msg = 'Não autenticado') => new HttpError(401, msg);
export const forbidden = (msg = 'Sem permissão') => new HttpError(403, msg);
export const notFound = (msg = 'Não encontrado') => new HttpError(404, msg);
export const conflict = (msg = 'Conflito', detalhes?: unknown) => new HttpError(409, msg, detalhes);
