import { DateTime } from 'luxon';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  escalaApi,
  funcionariosApi,
  padroesApi,
  setoresApi,
  turnosApi,
  type Funcionario,
  type GerarInput,
  type GerarResultado,
  type ModoConflito,
  type Padrao,
  type Previa,
  type Setor,
  type Turno,
} from '../api';
import { CabecalhoPagina, Campo, Carregando, Selo, Tabela, Vazio } from '../components/ui';
import { useToast } from '../contexts/ToastContext';
import { FUSO, agoraSP, fmtData, fmtDiaCurto, fmtHora, sp } from '../lib/datas';
import { useCarregar } from '../lib/hooks';
import { ROTULO_CONFLITO } from '../lib/rotulos';
import { descreverPadrao } from './PadroesPage';

function proximoMes() {
  const ini = agoraSP().plus({ months: 1 }).startOf('month');
  return { inicio: ini.toISODate()!, fim: ini.endOf('month').toISODate()! };
}

export default function GeradorPage() {
  const toast = useToast();
  const [setores] = useCarregar(() => setoresApi.listar({ ativo: true }), [], [] as Setor[]);
  const [funcionarios, carregandoFunc] = useCarregar(() => funcionariosApi.listar({ ativo: true }), [], [] as Funcionario[]);
  const [padroes] = useCarregar(() => padroesApi.listar({ ativo: true }), [], [] as Padrao[]);
  const [turnos] = useCarregar(() => turnosApi.listar({ ativo: true }), [], [] as Turno[]);

  const pm = useMemo(proximoMes, []);
  const [filtroSetor, setFiltroSetor] = useState('');
  const [buscaFunc, setBuscaFunc] = useState('');
  const [selecionados, setSelecionados] = useState<number[]>([]);
  const [padraoId, setPadraoId] = useState('');
  const [turnoId, setTurnoId] = useState('');
  const [periodoInicio, setPeriodoInicio] = useState(pm.inicio);
  const [periodoFim, setPeriodoFim] = useState(pm.fim);
  const [dataInicioCiclo, setDataInicioCiclo] = useState(pm.inicio);
  const [cicloManual, setCicloManual] = useState(false);
  const [setorPlantao, setSetorPlantao] = useState('');

  const [previa, setPrevia] = useState<Previa | null>(null);
  const [soConflitos, setSoConflitos] = useState(false);
  const [modo, setModo] = useState<ModoConflito>('PULAR');
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<GerarResultado | null>(null);

  const invalidar = () => {
    setPrevia(null);
    setResultado(null);
  };

  const funcsVisiveis = useMemo(() => {
    const b = buscaFunc.trim().toLowerCase();
    return funcionarios.filter(
      (f) => (!filtroSetor || f.setorId === Number(filtroSetor)) && (!b || f.nome.toLowerCase().includes(b)),
    );
  }, [funcionarios, filtroSetor, buscaFunc]);

  const padrao = padroes.find((p) => String(p.id) === padraoId);
  const turno = turnos.find((t) => String(t.id) === turnoId);

  // Ciclo com duração múltipla de 7 (ex.: 6x1) repete a semana: a folga cai sempre no mesmo dia.
  const avisoFolgaFixa = useMemo(() => {
    if (padrao?.tipo !== 'CICLO' || !dataInicioCiclo) return null;
    const t = padrao.diasTrabalho ?? 0;
    const f = padrao.diasFolga ?? 0;
    if (f < 1 || (t + f) % 7 !== 0) return null;
    const ini = DateTime.fromISO(dataInicioCiclo, { zone: FUSO });
    const dias = Array.from({ length: f }, (_, k) => ini.plus({ days: t + k }).toFormat('cccc'));
    return `Folga fixa toda semana: ${dias.join(' e ')} (o ciclo de ${t + f} dias repete a semana). Para variar o dia de folga entre as pessoas, gere em grupos com datas de início diferentes.`;
  }, [padrao, dataInicioCiclo]);

  const alternar = (id: number) => {
    invalidar();
    setSelecionados((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };
  const todosVisiveisMarcados = funcsVisiveis.length > 0 && funcsVisiveis.every((f) => selecionados.includes(f.id));
  const alternarTodos = () => {
    invalidar();
    const ids = funcsVisiveis.map((f) => f.id);
    setSelecionados((s) => (todosVisiveisMarcados ? s.filter((x) => !ids.includes(x)) : Array.from(new Set([...s, ...ids]))));
  };

  const montarInput = (): GerarInput | null => {
    if (!selecionados.length) return toast.erro('Selecione ao menos um funcionário.'), null;
    if (!padraoId) return toast.erro('Selecione o padrão de escala.'), null;
    if (!turnoId) return toast.erro('Selecione o turno.'), null;
    if (!periodoInicio || !periodoFim) return toast.erro('Informe o período.'), null;
    if (periodoFim < periodoInicio) return toast.erro('O fim do período deve ser igual ou posterior ao início.'), null;
    if (!dataInicioCiclo) return toast.erro('Informe a data de início do ciclo.'), null;
    return {
      funcionarioIds: selecionados,
      padraoId: Number(padraoId),
      turnoId: Number(turnoId),
      dataInicioCiclo,
      periodoInicio,
      periodoFim,
      setorId: setorPlantao ? Number(setorPlantao) : null,
    };
  };

  const preVisualizar = async () => {
    const input = montarInput();
    if (!input) return;
    setOcupado(true);
    setResultado(null);
    try {
      const r = await escalaApi.previa(input);
      setPrevia(r);
      setSoConflitos(false);
      if (r.total === 0) toast.info('Nenhum plantão seria gerado com esses parâmetros.');
    } catch (e) {
      toast.erro(e);
    } finally {
      setOcupado(false);
    }
  };

  const gerar = async () => {
    const input = montarInput();
    if (!input || !previa) return;
    const aCriar = estimativa;
    const msg =
      modo === 'SUBSTITUIR' && previa.comConflito > 0
        ? `Gerar a escala substituindo os plantões sobrepostos? Os plantões existentes em conflito serão APAGADOS. (Conflitos com ausência são sempre pulados.)`
        : `Gerar ${aCriar} plantão(ões)?`;
    if (!window.confirm(msg)) return;
    setOcupado(true);
    try {
      const r = await escalaApi.gerar({ ...input, modoConflito: modo });
      setResultado(r);
      setPrevia(null);
      toast.sucesso('Escala gerada.');
    } catch (e) {
      toast.erro(e);
    } finally {
      setOcupado(false);
    }
  };

  // Estimativa de quantos serão criados: PULAR ignora qualquer conflito; SUBSTITUIR só pula ausências.
  const estimativa = previa
    ? previa.itens.filter((i) =>
        modo === 'PULAR' ? i.conflitos.length === 0 : !i.conflitos.some((c) => c.tipo === 'AUSENCIA'),
      ).length
    : 0;

  const nomesSelecionados = funcionarios.filter((f) => selecionados.includes(f.id));
  const itensVisiveis = previa ? (soConflitos ? previa.itens.filter((i) => i.conflitos.length) : previa.itens) : [];

  const porFuncionario = useMemo(() => {
    const m = new Map<number, { nome: string; total: number; conflitos: number; horas: number }>();
    for (const i of previa?.itens ?? []) {
      const r = m.get(i.funcionarioId) ?? { nome: i.funcionarioNome, total: 0, conflitos: 0, horas: 0 };
      r.total++;
      if (i.conflitos.length) r.conflitos++;
      r.horas += sp(i.fim).diff(sp(i.inicio), 'hours').hours;
      m.set(i.funcionarioId, r);
    }
    return [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [previa]);

  return (
    <div>
      <CabecalhoPagina titulo="Gerar escala" subtitulo="Crie plantões em lote a partir de um padrão (ciclo ou semanal) e um turno." />

      <div className="gerador">
        <div className="cartao cartao-padding">
          <h3>1. Funcionários</h3>
          <div className="filtros filtros-compactos">
            <select
              value={filtroSetor}
              onChange={(e) => setFiltroSetor(e.target.value)}
              aria-label="Filtrar por setor"
            >
              <option value="">Todos os setores</option>
              {setores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
            <input type="search" placeholder="Buscar…" value={buscaFunc} onChange={(e) => setBuscaFunc(e.target.value)} />
          </div>
          {carregandoFunc ? (
            <Carregando />
          ) : funcsVisiveis.length === 0 ? (
            <Vazio>Nenhum funcionário ativo.</Vazio>
          ) : (
            <div className="lista-check lista-check-rolagem">
              <label className="lista-check-todos">
                <input type="checkbox" checked={todosVisiveisMarcados} onChange={alternarTodos} /> Selecionar todos ({funcsVisiveis.length})
              </label>
              {funcsVisiveis.map((f) => (
                <label key={f.id}>
                  <input type="checkbox" checked={selecionados.includes(f.id)} onChange={() => alternar(f.id)} /> {f.nome}{' '}
                  <span className="texto-suave texto-pequeno">— {f.setor?.nome}</span>
                </label>
              ))}
            </div>
          )}
          <p className="texto-pequeno">
            <strong>{selecionados.length}</strong> selecionado(s)
            {selecionados.length > 0 && (
              <>
                {' '}
                ·{' '}
                <button type="button" className="btn btn-link" onClick={() => (invalidar(), setSelecionados([]))}>
                  limpar
                </button>
              </>
            )}
          </p>
        </div>

        <div className="cartao cartao-padding">
          <h3>2. Padrão, turno e período</h3>
          <div className="form">
            <Campo rotulo="Padrão de escala" obrigatorio dica={padrao ? descreverPadrao(padrao) : undefined}>
              <select value={padraoId} onChange={(e) => (invalidar(), setPadraoId(e.target.value))}>
                <option value="">Selecione…</option>
                {padroes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo
              rotulo="Turno"
              obrigatorio
              dica={turno ? `${turno.horaInicio} às ${turno.horaFim}${turno.viraNoite ? ' (termina no dia seguinte)' : ''}` : undefined}
            >
              <select value={turnoId} onChange={(e) => (invalidar(), setTurnoId(e.target.value))}>
                <option value="">Selecione…</option>
                {turnos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome} ({t.horaInicio}–{t.horaFim})
                  </option>
                ))}
              </select>
            </Campo>
            <div className="grade-2">
              <Campo rotulo="Período — de" obrigatorio>
                <input
                  type="date"
                  value={periodoInicio}
                  onChange={(e) => {
                    invalidar();
                    setPeriodoInicio(e.target.value);
                    if (!cicloManual) setDataInicioCiclo(e.target.value);
                  }}
                />
              </Campo>
              <Campo rotulo="até" obrigatorio>
                <input type="date" value={periodoFim} min={periodoInicio} onChange={(e) => (invalidar(), setPeriodoFim(e.target.value))} />
              </Campo>
            </div>
            <Campo
              rotulo="Data de início do ciclo"
              obrigatorio
              dica={
                padrao?.tipo === 'SEMANAL'
                  ? 'Não influencia padrões semanais.'
                  : 'Primeiro dia de trabalho do ciclo. Use a data do último início de ciclo para dar continuidade a uma escala já existente.'
              }
            >
              <input
                type="date"
                value={dataInicioCiclo}
                onChange={(e) => {
                  invalidar();
                  setCicloManual(true);
                  setDataInicioCiclo(e.target.value);
                }}
              />
            </Campo>
            {avisoFolgaFixa && <p className="texto-pequeno texto-suave">{avisoFolgaFixa}</p>}
            <Campo rotulo="Setor dos plantões" dica="Normalmente o próprio setor de cada funcionário.">
              <select value={setorPlantao} onChange={(e) => (invalidar(), setSetorPlantao(e.target.value))}>
                <option value="">Setor de cada funcionário</option>
                {setores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <button type="button" className="btn btn-primario" onClick={() => void preVisualizar()} disabled={ocupado}>
              {ocupado && !previa ? 'Calculando…' : 'Pré-visualizar'}
            </button>
          </div>
        </div>
      </div>

      {resultado && (
        <div className="cartao cartao-padding resultado">
          <h3>Escala gerada</h3>
          <div className="totais">
            <div className="total">
              <span className="total-num">{resultado.criados}</span>
              <span>criados</span>
            </div>
            <div className="total">
              <span className="total-num">{resultado.pulados}</span>
              <span>pulados</span>
            </div>
            <div className="total">
              <span className="total-num">{resultado.substituidos}</span>
              <span>substituídos</span>
            </div>
          </div>
          <p>
            Período de {fmtData(periodoInicio)} a {fmtData(periodoFim)} para {nomesSelecionados.length} funcionário(s).
          </p>
          <Link to="/" className="btn btn-primario">
            Ver no calendário
          </Link>
        </div>
      )}

      {previa && (
        <div className="cartao cartao-padding">
          <h3>3. Pré-visualização</h3>
          <div className="totais">
            <div className="total">
              <span className="total-num">{previa.total}</span>
              <span>plantões</span>
            </div>
            <div className={`total ${previa.comConflito ? 'total-alerta' : ''}`}>
              <span className="total-num">{previa.comConflito}</span>
              <span>com conflito</span>
            </div>
            <div className="total">
              <span className="total-num">{previa.total - previa.comConflito}</span>
              <span>sem conflito</span>
            </div>
          </div>

          {porFuncionario.length > 0 && (
            <>
            <h4>Resumo por funcionário</h4>
            <Tabela compacta>
              <thead>
                <tr>
                  <th>Funcionário</th>
                  <th>Plantões</th>
                  <th>Horas</th>
                  <th>Conflitos</th>
                </tr>
              </thead>
              <tbody>
                {porFuncionario.map((r) => (
                  <tr key={r.nome}>
                    <td>{r.nome}</td>
                    <td>{r.total}</td>
                    <td>{Math.round(r.horas * 10) / 10}h</td>
                    <td>{r.conflitos ? <Selo cor="vermelho">{r.conflitos}</Selo> : '0'}</td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
            </>
          )}

          {previa.comConflito > 0 && (
            <label className="interruptor">
              <input type="checkbox" checked={soConflitos} onChange={(e) => setSoConflitos(e.target.checked)} />
              <span>Mostrar só os plantões com conflito</span>
            </label>
          )}

          {itensVisiveis.length === 0 ? (
            <Vazio>Nenhum plantão.</Vazio>
          ) : (
            <div className="tabela-rolagem previa-lista">
              <Tabela compacta>
                <thead>
                  <tr>
                    <th>Funcionário</th>
                    <th>Dia</th>
                    <th>Horário</th>
                    <th>Conflitos</th>
                  </tr>
                </thead>
                <tbody>
                  {itensVisiveis.map((i, idx) => (
                    <tr key={`${i.funcionarioId}-${i.inicio}-${idx}`} className={i.conflitos.length ? 'linha-conflito' : ''}>
                      <td>{i.funcionarioNome}</td>
                      <td className="nowrap">{fmtDiaCurto(i.inicio)}</td>
                      <td className="nowrap">
                        {fmtHora(i.inicio)} – {fmtHora(i.fim)}
                        {sp(i.fim).toISODate() !== sp(i.inicio).toISODate() && <span className="texto-suave"> (+1 dia)</span>}
                      </td>
                      <td>
                        {i.conflitos.map((c, k) => (
                          <div key={k} className="conflito-item">
                            <Selo cor={c.tipo === 'AUSENCIA' ? 'amarelo' : 'vermelho'}>{ROTULO_CONFLITO[c.tipo] ?? c.tipo}</Selo> {c.descricao}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Tabela>
            </div>
          )}

          {previa.total > 0 && (
            <div className="gerar-acoes">
              {previa.comConflito > 0 && (
                <div className="opcoes-radio opcoes-radio-bloco">
                  <strong>O que fazer com os plantões em conflito?</strong>
                  <label>
                    <input type="radio" checked={modo === 'PULAR'} onChange={() => setModo('PULAR')} />
                    <span>
                      <strong>Pular</strong> — não cria os plantões com conflito; os existentes ficam como estão.
                    </span>
                  </label>
                  <label>
                    <input type="radio" checked={modo === 'SUBSTITUIR'} onChange={() => setModo('SUBSTITUIR')} />
                    <span>
                      <strong>Substituir</strong> — apaga os plantões existentes que se sobrepõem e cria os novos. Conflitos com
                      ausência são sempre pulados.
                    </span>
                  </label>
                </div>
              )}
              <button type="button" className="btn btn-primario btn-grande" onClick={() => void gerar()} disabled={ocupado}>
                {ocupado ? 'Gerando…' : `Gerar ${estimativa} plantão(ões)`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
