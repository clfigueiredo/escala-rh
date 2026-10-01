import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  escalaApi,
  type Funcionario,
  type Plantao,
  type PlantaoAtualizar,
  type Setor,
  type StatusPlantao,
  type Turno,
} from '../api';
import { useToast } from '../contexts/ToastContext';
import { horarioDoTurno, inputLocalParaIso, isoParaInputLocal, sp } from '../lib/datas';
import { ROTULO_CONFLITO } from '../lib/rotulos';
import { Campo, Modal, Selo } from './ui';

export interface NovoPlantaoSugestao {
  /** ISO (com fuso) do início sugerido, ou data "YYYY-MM-DD" (dia inteiro clicado no mês). */
  inicio: string;
  fim?: string;
  funcionarioId?: number;
  setorId?: number;
}

interface Props {
  plantao: Plantao | null;
  novo: NovoPlantaoSugestao | null;
  funcionarios: Funcionario[];
  setores: Setor[];
  turnos: Turno[];
  onFechar: () => void;
  onSalvo: () => void;
}

interface FormState {
  funcionarioId: string;
  setorId: string;
  turnoId: string;
  inicio: string; // datetime-local em SP
  fim: string;
  status: StatusPlantao;
  observacao: string;
}

export default function PlantaoModal({ plantao, novo, funcionarios, setores, turnos, onFechar, onSalvo }: Props) {
  const toast = useToast();
  const aberto = plantao !== null || novo !== null;
  const [form, setForm] = useState<FormState>({
    funcionarioId: '',
    setorId: '',
    turnoId: '',
    inicio: '',
    fim: '',
    status: 'AGENDADO',
    observacao: '',
  });
  const [salvando, setSalvando] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const turnosAtivos = useMemo(() => turnos.filter((t) => t.ativo), [turnos]);

  useEffect(() => {
    if (plantao) {
      setForm({
        funcionarioId: String(plantao.funcionarioId),
        setorId: String(plantao.setorId),
        turnoId: plantao.turnoId ? String(plantao.turnoId) : '',
        inicio: isoParaInputLocal(plantao.inicio),
        fim: isoParaInputLocal(plantao.fim),
        status: plantao.status,
        observacao: plantao.observacao ?? '',
      });
    } else if (novo) {
      const func = novo.funcionarioId ? funcionarios.find((f) => f.id === novo.funcionarioId) : undefined;
      let inicio: string;
      let fim: string;
      let turnoId = '';
      if (novo.inicio.length === 10) {
        // Clique num dia (visão mês): usa o primeiro turno ativo, se houver.
        const t = turnosAtivos[0];
        if (t) {
          const h = horarioDoTurno(novo.inicio, t.horaInicio, t.horaFim);
          inicio = h.inicio.toFormat("yyyy-MM-dd'T'HH:mm");
          fim = h.fim.toFormat("yyyy-MM-dd'T'HH:mm");
          turnoId = String(t.id);
        } else {
          inicio = `${novo.inicio}T07:00`;
          fim = `${novo.inicio}T19:00`;
        }
      } else {
        const ini = sp(novo.inicio);
        inicio = ini.toFormat("yyyy-MM-dd'T'HH:mm");
        fim = (novo.fim ? sp(novo.fim) : ini.plus({ hours: 1 })).toFormat("yyyy-MM-dd'T'HH:mm");
      }
      setForm({
        funcionarioId: func ? String(func.id) : '',
        setorId: novo.setorId ? String(novo.setorId) : func ? String(func.setorId) : '',
        turnoId,
        inicio,
        fim,
        status: 'AGENDADO',
        observacao: '',
      });
    }
    // Só reinicia o formulário quando muda o plantão/sugestão (não quando listas recarregam).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantao, novo]);

  const escolherFuncionario = (id: string) => {
    const f = funcionarios.find((x) => String(x.id) === id);
    setForm((s) => ({ ...s, funcionarioId: id, setorId: f ? String(f.setorId) : s.setorId }));
  };

  const escolherTurno = (id: string) => {
    const t = turnos.find((x) => String(x.id) === id);
    if (!t) {
      set('turnoId', '');
      return;
    }
    const data = form.inicio ? form.inicio.slice(0, 10) : sp(new Date().toISOString()).toISODate()!;
    const h = horarioDoTurno(data, t.horaInicio, t.horaFim);
    setForm((s) => ({
      ...s,
      turnoId: id,
      inicio: h.inicio.toFormat("yyyy-MM-dd'T'HH:mm"),
      fim: h.fim.toFormat("yyyy-MM-dd'T'HH:mm"),
    }));
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const inicio = inputLocalParaIso(form.inicio);
    const fim = inputLocalParaIso(form.fim);
    if (!inicio || !fim) return toast.erro('Informe início e fim.');
    if (fim <= inicio) return toast.erro('O fim deve ser depois do início.');
    if (!form.funcionarioId) return toast.erro('Selecione o funcionário.');
    setSalvando(true);
    try {
      if (plantao) {
        const dados: PlantaoAtualizar = {
          funcionarioId: Number(form.funcionarioId),
          setorId: form.setorId ? Number(form.setorId) : undefined,
          turnoId: form.turnoId ? Number(form.turnoId) : null,
          inicio,
          fim,
          status: form.status,
          observacao: form.observacao.trim() || null,
        };
        await escalaApi.atualizar(plantao.id, dados);
        toast.sucesso('Plantão atualizado.');
      } else {
        await escalaApi.criar({
          funcionarioId: Number(form.funcionarioId),
          setorId: form.setorId ? Number(form.setorId) : undefined,
          turnoId: form.turnoId ? Number(form.turnoId) : null,
          inicio,
          fim,
          observacao: form.observacao.trim() || null,
        });
        toast.sucesso('Plantão criado.');
      }
      onSalvo();
    } catch (err) {
      toast.erro(err);
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async () => {
    if (!plantao) return;
    if (!window.confirm(`Excluir o plantão de ${plantao.funcionario.nome}? Esta ação não pode ser desfeita.`)) return;
    setSalvando(true);
    try {
      await escalaApi.excluir(plantao.id);
      toast.sucesso('Plantão excluído.');
      onSalvo();
    } catch (err) {
      toast.erro(err);
    } finally {
      setSalvando(false);
    }
  };

  // Garante que o funcionário/setor/turno do plantão apareçam mesmo se inativos ou fora do filtro.
  const opcoesFunc =
    plantao && !funcionarios.some((f) => f.id === plantao.funcionarioId)
      ? [{ id: plantao.funcionarioId, nome: plantao.funcionario.nome, ativo: false }, ...funcionarios]
      : funcionarios;
  const opcoesSetor =
    plantao && !setores.some((s) => s.id === plantao.setorId)
      ? [{ id: plantao.setorId, nome: plantao.setor.nome, ativo: false }, ...setores]
      : setores;
  const opcoesTurno = turnos.filter((t) => t.ativo || String(t.id) === form.turnoId);

  const conflitos = plantao?.conflitos ?? [];

  return (
    <Modal
      titulo={plantao ? 'Editar plantão' : 'Novo plantão'}
      aberto={aberto}
      onFechar={onFechar}
      rodape={
        <>
          {plantao && (
            <button type="button" className="btn btn-perigo" onClick={() => void excluir()} disabled={salvando}>
              Excluir
            </button>
          )}
          <div className="espaco" />
          <button type="button" className="btn" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" form="form-plantao" className="btn btn-primario" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      {conflitos.length > 0 && (
        <div className="alerta alerta-erro">
          <strong>⚠ Conflitos neste plantão:</strong>
          <ul>
            {conflitos.map((c, i) => (
              <li key={i}>
                <strong>{ROTULO_CONFLITO[c.tipo] ?? c.tipo}:</strong> {c.descricao}
              </li>
            ))}
          </ul>
        </div>
      )}
      <form id="form-plantao" className="form" onSubmit={salvar}>
        <Campo rotulo="Funcionário" obrigatorio>
          <select value={form.funcionarioId} onChange={(e) => escolherFuncionario(e.target.value)} required autoFocus={!plantao}>
            <option value="">Selecione…</option>
            {opcoesFunc.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
                {!f.ativo ? ' (inativo)' : ''}
              </option>
            ))}
          </select>
        </Campo>
        <div className="grade-2">
          <Campo rotulo="Setor" dica={!plantao ? 'Padrão: setor do funcionário.' : undefined}>
            <select value={form.setorId} onChange={(e) => set('setorId', e.target.value)}>
              {!plantao && <option value="">(setor do funcionário)</option>}
              {opcoesSetor.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Turno" dica="Ao escolher, preenche o horário.">
            <select value={form.turnoId} onChange={(e) => escolherTurno(e.target.value)}>
              <option value="">Horário avulso</option>
              {opcoesTurno.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome} ({t.horaInicio}–{t.horaFim})
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <div className="grade-2">
          <Campo rotulo="Início" obrigatorio>
            <input type="datetime-local" value={form.inicio} onChange={(e) => set('inicio', e.target.value)} required />
          </Campo>
          <Campo rotulo="Fim" obrigatorio>
            <input type="datetime-local" value={form.fim} min={form.inicio} onChange={(e) => set('fim', e.target.value)} required />
          </Campo>
        </div>
        <p className="texto-suave texto-pequeno">Horários no fuso de Brasília (America/Sao_Paulo).</p>
        {plantao && (
          <Campo rotulo="Status">
            <select value={form.status} onChange={(e) => set('status', e.target.value as StatusPlantao)}>
              <option value="AGENDADO">Agendado</option>
              <option value="CANCELADO">Cancelado (não gera lembrete)</option>
            </select>
          </Campo>
        )}
        <Campo rotulo="Observação">
          <textarea rows={2} value={form.observacao} onChange={(e) => set('observacao', e.target.value)} />
        </Campo>
        {plantao && (
          <p className="texto-suave texto-pequeno">
            Origem: <Selo>{plantao.origem === 'GERADO' ? 'Gerado' : 'Manual'}</Selo> · Alterar o horário libera um novo lembrete para
            o horário novo.
          </p>
        )}
      </form>
    </Modal>
  );
}
