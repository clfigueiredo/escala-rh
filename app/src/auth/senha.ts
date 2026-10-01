import bcrypt from 'bcryptjs';

const CUSTO = 10;

export function gerarHashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, CUSTO);
}

export function conferirSenha(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}

/** Hash fictício para comparar quando o e-mail não existe (tempo constante). */
export const HASH_FICTICIO = bcrypt.hashSync('senha-ficticia-nao-usada', CUSTO);
