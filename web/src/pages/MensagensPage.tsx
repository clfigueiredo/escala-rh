import { useState } from 'react';
import {
  funcionariosApi,
  mensagensApi,
  type DirecaoMensagem,
  type Funcionario,
  type Mensagem,
  type OrigemMensagem,
  type Paginado,
  type StatusMensagem,
} from '../api';
import { CabecalhoPagina, Carregando, Selo, Tabela, Vazio } from '../components/ui';
import { combinarDataHora, fmtDataHora } from '../lib/datas';
import { useCarregar } from '../lib/hooks';
import { fmtTelefone, ROTULO_DIRECAO, ROTULO_ORIGEM, ROTULO_STATUS_MSG } from '../lib/rotulos';

const POR_PAGINA = 50;

export default function MensagensPage() {
  const [pagina, setPagina] = useState(1);
  const [direcao, setDirecao] = useState<DirecaoMensagem | ''>('');
  const [origem, setOrigem] = useState<OrigemMensagem | ''>('');
  const [status, setStatus] = useState<StatusMensagem | ''>('');
  const [funcionarioId, setFuncionarioId] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [expandida, setExpandida] = useState<number | null>(null);

  const [funcionarios] = useCarregar(() => funcionariosApi.listar(), [], [] as Funcionario[]);
  const [dados, carregando, recarregar] = useCarregar(
    () =>
      mensagensApi.listar({
        pagina,
        porPagina: POR_PAGINA,
        direcao: direcao || undefined,
        origem: origem || undefined,
        status: status || undefined,
        funcionarioId: funcionarioId ? Number(funcionarioId) : undefined,
        // Datas do filtro são dias no fuso de SP: [início 00:00, fim+1 00:00)
        inicio: inicio ? combinarDataHora(inicio, '00:00').toUTC().toISO()! : undefined,
        fim: fim ? combinarDataHora(fim, '00:00').plus({ days: 1 }).toUTC().toISO()! : undefined,
      }),
    [pagina, direcao, origem, status, funcionarioId, inicio, fim],
    { itens: [], total: 0 } as Paginado<Mensagem>,
  );

  const totalPaginas = Math.max(1, Math.ceil(dados.total / POR_PAGINA));
  const filtrar = <T,>(setter: (v: T) => void) => (v: T) => {
    setPagina(1);
    setter(v);
  };
  const temFiltro = direcao || origem || status || funcionarioId || inicio || fim;

  return (
    <div>
      <CabecalhoPagina
        titulo="Mensagens"
        subtitulo="Histórico de mensagens enviadas (lembretes e respostas do bot) e recebidas."
        acoes={
          <button className="btn" onClick={() => void recarregar()} disabled={carregando}>
            Atualizar
          </button>
        }
      />
      <div className="filtros">
        <select value={direcao} onChange={(e) => filtrar(setDirecao)(e.target.value as DirecaoMensagem | '')} aria-label="Direção">
          <option value="">Enviadas e recebidas</option>
          <option value="ENVIADA">Enviadas</option>
          <option value="RECEBIDA">Recebidas</option>
        </select>
        <select value={origem} onChange={(e) => filtrar(setOrigem)(e.target.value as OrigemMensagem | '')} aria-label="Origem">
          <option value="">Todas as origens</option>
          <option value="LEMBRETE">Lembrete</option>
          <option value="BOT">Bot</option>
          <option value="MANUAL">Manual</option>
        </select>
        <select value={status} onChange={(e) => filtrar(setStatus)(e.target.value as StatusMensagem | '')} aria-label="Status">
          <option value="">Todos os status</option>
          <option value="OK">OK</option>
          <option value="FALHOU">Falhou</option>
        </select>
        <select value={funcionarioId} onChange={(e) => filtrar(setFuncionarioId)(e.target.value)} aria-label="Funcionário">
          <option value="">Todos os funcionários</option>
          {funcionarios.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </select>
        <label className="filtro-rotulado">
          De <input type="date" value={inicio} onChange={(e) => filtrar(setInicio)(e.target.value)} />
        </label>
        <label className="filtro-rotulado">
          até <input type="date" value={fim} onChange={(e) => filtrar(setFim)(e.target.value)} />
        </label>
        {temFiltro && (
          <button
            className="btn btn-link"
            onClick={() => {
              setPagina(1);
              setDirecao('');
              setOrigem('');
              setStatus('');
              setFuncionarioId('');
              setInicio('');
              setFim('');
            }}
          >
            Limpar filtros
          </button>
        )}
      </div>

      <div className="cartao">
        {carregando && dados.itens.length === 0 ? (
          <Carregando />
        ) : dados.itens.length === 0 ? (
          <Vazio>Nenhuma mensagem encontrada.</Vazio>
        ) : (
          <div className="tabela-rolagem">
            <Tabela>
              <thead>
                <tr>
                  <th>Data/hora</th>
                  <th>Direção</th>
                  <th>Funcionário / telefone</th>
                  <th>Origem</th>
                  <th>Mensagem</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {dados.itens.map((m) => {
                  const aberta = expandida === m.id;
                  return (
                    <tr key={m.id} className={m.status === 'FALHOU' ? 'linha-conflito' : ''}>
                      <td className="nowrap">{fmtDataHora(m.criadoEm)}</td>
                      <td className="nowrap">
                        <Selo cor={m.direcao === 'ENVIADA' ? 'azul' : 'cinza'}>
                          {m.direcao === 'ENVIADA' ? '↑' : '↓'} {ROTULO_DIRECAO[m.direcao] ?? m.direcao}
                        </Selo>
                      </td>
                      <td>
                        {m.funcionario?.nome ? <strong>{m.funcionario.nome}</strong> : <span className="texto-suave">Desconhecido</span>}
                        <div className="texto-suave texto-pequeno nowrap">{fmtTelefone(m.telefone)}</div>
                      </td>
                      <td>{ROTULO_ORIGEM[m.origem] ?? m.origem}</td>
                      <td>
                        <div
                          className={`mensagem-conteudo ${aberta ? 'aberta' : ''}`}
                          onClick={() => setExpandida(aberta ? null : m.id)}
                          title={aberta ? 'Clique para recolher' : 'Clique para ver completa'}
                        >
                          {m.conteudo}
                        </div>
                        {m.status === 'FALHOU' && m.erro && <div className="erro-texto">Erro: {m.erro}</div>}
                      </td>
                      <td>
                        <Selo cor={m.status === 'OK' ? 'verde' : 'vermelho'}>{ROTULO_STATUS_MSG[m.status] ?? m.status}</Selo>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Tabela>
          </div>
        )}
        <div className="paginacao">
          <span className="texto-suave texto-pequeno">
            {dados.total} mensagem(ns) · página {pagina} de {totalPaginas}
          </span>
          <div className="espaco" />
          <button className="btn btn-pequeno" disabled={pagina <= 1 || carregando} onClick={() => setPagina(1)}>
            « Primeira
          </button>
          <button className="btn btn-pequeno" disabled={pagina <= 1 || carregando} onClick={() => setPagina((p) => p - 1)}>
            ‹ Anterior
          </button>
          <button className="btn btn-pequeno" disabled={pagina >= totalPaginas || carregando} onClick={() => setPagina((p) => p + 1)}>
            Próxima ›
          </button>
        </div>
      </div>
    </div>
  );
}
