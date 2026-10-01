import { useState, type FormEvent } from 'react';
import { ausenciasApi, funcionariosApi, setoresApi, type Ausencia, type Funcionario, type Setor, type TipoAusencia } from '../api';
import { CabecalhoPagina, Campo, Carregando, Modal, Selo, Tabela, Vazio } from '../components/ui';
import { useToast } from '../contexts/ToastContext';
import { fmtData, hojeISO } from '../lib/datas';
import { useCarregar } from '../lib/hooks';
import { ROTULO_AUSENCIA } from '../lib/rotulos';

interface FormState {
  funcionarioId: string;
  tipo: TipoAusencia;
  dataInicio: string;
  dataFim: string;
  observacao: string;
}

const COR_TIPO: Record<TipoAusencia, 'azul' | 'vermelho' | 'verde' | 'cinza'> = {
  FERIAS: 'azul',
  ATESTADO: 'vermelho',
  FOLGA: 'verde',
  OUTRO: 'cinza',
};

function dias(ini: string, fim: string) {
  const a = new Date(`${ini}T00:00:00Z`).getTime();
  const b = new Date(`${fim}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

export default function AusenciasPage() {
  const toast = useToast();
  const [fFuncionario, setFFuncionario] = useState('');
  const [fSetor, setFSetor] = useState('');
  const [fInicio, setFInicio] = useState('');
  const [fFim, setFFim] = useState('');

  const [setores] = useCarregar(() => setoresApi.listar(), [], [] as Setor[]);
  const [funcionarios] = useCarregar(() => funcionariosApi.listar({ ativo: true }), [], [] as Funcionario[]);
  const [lista, carregando, recarregar] = useCarregar(
    () =>
      ausenciasApi.listar({
        funcionarioId: fFuncionario ? Number(fFuncionario) : undefined,
        setorId: fSetor ? Number(fSetor) : undefined,
        inicio: fInicio || undefined,
        fim: fFim || undefined,
      }),
    [fFuncionario, fSetor, fInicio, fFim],
    [] as Ausencia[],
  );

  const [editando, setEditando] = useState<Ausencia | 'novo' | null>(null);
  const [form, setForm] = useState<FormState>({ funcionarioId: '', tipo: 'FERIAS', dataInicio: '', dataFim: '', observacao: '' });
  const [salvando, setSalvando] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const funcsFiltro = fSetor ? funcionarios.filter((f) => f.setorId === Number(fSetor)) : funcionarios;

  const abrir = (a: Ausencia | 'novo') => {
    setEditando(a);
    setForm(
      a === 'novo'
        ? { funcionarioId: fFuncionario, tipo: 'FERIAS', dataInicio: hojeISO(), dataFim: hojeISO(), observacao: '' }
        : {
            funcionarioId: String(a.funcionarioId),
            tipo: a.tipo,
            dataInicio: a.dataInicio.slice(0, 10),
            dataFim: a.dataFim.slice(0, 10),
            observacao: a.observacao ?? '',
          },
    );
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    if (form.dataFim < form.dataInicio) return toast.erro('A data final deve ser igual ou posterior à inicial.');
    setSalvando(true);
    try {
      const dados = {
        funcionarioId: Number(form.funcionarioId),
        tipo: form.tipo,
        dataInicio: form.dataInicio,
        dataFim: form.dataFim,
        observacao: form.observacao.trim() || null,
      };
      if (editando === 'novo') await ausenciasApi.criar(dados);
      else await ausenciasApi.atualizar(editando.id, dados);
      toast.sucesso('Ausência salva. Plantões no período ficarão sinalizados como conflito.');
      setEditando(null);
      void recarregar();
    } catch (err) {
      toast.erro(err);
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (a: Ausencia) => {
    if (!window.confirm(`Excluir a ausência de ${a.funcionario?.nome} (${fmtData(a.dataInicio)} a ${fmtData(a.dataFim)})?`)) return;
    try {
      await ausenciasApi.excluir(a.id);
      toast.sucesso('Ausência excluída.');
      void recarregar();
    } catch (err) {
      toast.erro(err);
    }
  };

  // Funcionário da ausência em edição pode estar inativo: garantir que apareça no select.
  const opcoesFunc =
    editando && editando !== 'novo' && !funcionarios.some((f) => f.id === editando.funcionarioId)
      ? [{ id: editando.funcionarioId, nome: editando.funcionario?.nome ?? `#${editando.funcionarioId}` }, ...funcionarios]
      : funcionarios;

  return (
    <div>
      <CabecalhoPagina
        titulo="Ausências"
        subtitulo="Férias, atestados e folgas. Plantões que caem numa ausência ficam em conflito e não geram lembrete."
        acoes={
          <button className="btn btn-primario" onClick={() => abrir('novo')}>
            + Nova ausência
          </button>
        }
      />
      <div className="filtros">
        <select value={fSetor} onChange={(e) => { setFSetor(e.target.value); setFFuncionario(''); }} aria-label="Setor">
          <option value="">Todos os setores</option>
          {setores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome}
            </option>
          ))}
        </select>
        <select value={fFuncionario} onChange={(e) => setFFuncionario(e.target.value)} aria-label="Funcionário">
          <option value="">Todos os funcionários</option>
          {funcsFiltro.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </select>
        <label className="filtro-rotulado">
          De <input type="date" value={fInicio} onChange={(e) => setFInicio(e.target.value)} />
        </label>
        <label className="filtro-rotulado">
          até <input type="date" value={fFim} onChange={(e) => setFFim(e.target.value)} />
        </label>
        {(fInicio || fFim || fFuncionario || fSetor) && (
          <button className="btn btn-link" onClick={() => { setFInicio(''); setFFim(''); setFFuncionario(''); setFSetor(''); }}>
            Limpar filtros
          </button>
        )}
      </div>
      <div className="cartao">
        {carregando && lista.length === 0 ? (
          <Carregando />
        ) : lista.length === 0 ? (
          <Vazio>Nenhuma ausência encontrada.</Vazio>
        ) : (
          <div className="tabela-rolagem">
            <Tabela>
              <thead>
                <tr>
                  <th>Funcionário</th>
                  <th>Tipo</th>
                  <th>Período</th>
                  <th>Dias</th>
                  <th>Observação</th>
                  <th className="acoes" />
                </tr>
              </thead>
              <tbody>
                {lista.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.funcionario?.nome}</strong>
                    </td>
                    <td>
                      <Selo cor={COR_TIPO[a.tipo]}>{ROTULO_AUSENCIA[a.tipo]}</Selo>
                    </td>
                    <td className="nowrap">
                      {fmtData(a.dataInicio)} a {fmtData(a.dataFim)}
                    </td>
                    <td>{dias(a.dataInicio.slice(0, 10), a.dataFim.slice(0, 10))}</td>
                    <td>{a.observacao || '—'}</td>
                    <td className="acoes">
                      <button className="btn btn-pequeno" onClick={() => abrir(a)}>
                        Editar
                      </button>
                      <button className="btn btn-pequeno btn-perigo-texto" onClick={() => void excluir(a)}>
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          </div>
        )}
      </div>

      <Modal
        titulo={editando === 'novo' ? 'Nova ausência' : 'Editar ausência'}
        aberto={editando !== null}
        onFechar={() => setEditando(null)}
        rodape={
          <>
            <button className="btn" onClick={() => setEditando(null)}>
              Cancelar
            </button>
            <button type="submit" form="form-ausencia" className="btn btn-primario" disabled={salvando}>
              Salvar
            </button>
          </>
        }
      >
        <form id="form-ausencia" className="form" onSubmit={salvar}>
          <Campo rotulo="Funcionário" obrigatorio>
            <select value={form.funcionarioId} onChange={(e) => set('funcionarioId', e.target.value)} required>
              <option value="">Selecione…</option>
              {opcoesFunc.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Tipo" obrigatorio>
            <select value={form.tipo} onChange={(e) => set('tipo', e.target.value as TipoAusencia)}>
              {(Object.keys(ROTULO_AUSENCIA) as TipoAusencia[]).map((t) => (
                <option key={t} value={t}>
                  {ROTULO_AUSENCIA[t]}
                </option>
              ))}
            </select>
          </Campo>
          <div className="grade-2">
            <Campo rotulo="Data inicial" obrigatorio>
              <input
                type="date"
                value={form.dataInicio}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => ({ ...f, dataInicio: v, dataFim: f.dataFim && f.dataFim >= v ? f.dataFim : v }));
                }}
                required
              />
            </Campo>
            <Campo rotulo="Data final (inclusive)" obrigatorio>
              <input type="date" value={form.dataFim} min={form.dataInicio} onChange={(e) => set('dataFim', e.target.value)} required />
            </Campo>
          </div>
          <Campo rotulo="Observação">
            <textarea rows={2} value={form.observacao} onChange={(e) => set('observacao', e.target.value)} />
          </Campo>
        </form>
      </Modal>
    </div>
  );
}
