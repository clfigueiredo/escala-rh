import { useState, type FormEvent } from 'react';
import { padroesApi, type Padrao, type PadraoInput, type TipoPadrao } from '../api';
import { CabecalhoPagina, Campo, Carregando, Interruptor, Modal, Selo, SeloAtivo, Tabela, Vazio } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { DIAS_SEMANA_CURTO } from '../lib/datas';
import { useCarregar } from '../lib/hooks';

interface FormState {
  nome: string;
  tipo: TipoPadrao;
  diasTrabalho: string;
  diasFolga: string;
  diasSemana: number[];
  ativo: boolean;
}

export function descreverPadrao(p: Padrao): string {
  if (p.tipo === 'CICLO') return `Ciclo: ${p.diasTrabalho ?? 0} dia(s) de trabalho, ${p.diasFolga ?? 0} de folga`;
  const dias = [...(p.diasSemana ?? [])].sort((a, b) => a - b).map((d) => DIAS_SEMANA_CURTO[d]);
  return `Semanal: ${dias.join(', ') || '—'}`;
}

export default function PadroesPage() {
  const { ehAdmin } = useAuth();
  const toast = useToast();
  const [padroes, carregando, recarregar] = useCarregar(() => padroesApi.listar(), [], [] as Padrao[]);
  const [editando, setEditando] = useState<Padrao | 'novo' | null>(null);
  const [form, setForm] = useState<FormState>({ nome: '', tipo: 'CICLO', diasTrabalho: '1', diasFolga: '1', diasSemana: [], ativo: true });
  const [salvando, setSalvando] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const abrir = (p: Padrao | 'novo') => {
    setEditando(p);
    setForm(
      p === 'novo'
        ? { nome: '', tipo: 'CICLO', diasTrabalho: '1', diasFolga: '1', diasSemana: [1, 2, 3, 4, 5], ativo: true }
        : {
            nome: p.nome,
            tipo: p.tipo,
            diasTrabalho: String(p.diasTrabalho ?? 1),
            diasFolga: String(p.diasFolga ?? 0),
            diasSemana: p.diasSemana ?? [],
            ativo: p.ativo,
          },
    );
  };

  const alternarDia = (d: number) =>
    set('diasSemana', form.diasSemana.includes(d) ? form.diasSemana.filter((x) => x !== d) : [...form.diasSemana, d].sort((a, b) => a - b));

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    const dados: PadraoInput = { nome: form.nome.trim(), tipo: form.tipo, ativo: form.ativo };
    if (form.tipo === 'CICLO') {
      const t = Number(form.diasTrabalho);
      const f = Number(form.diasFolga);
      if (!Number.isInteger(t) || t < 1) return toast.erro('Dias de trabalho deve ser no mínimo 1.');
      if (!Number.isInteger(f) || f < 0) return toast.erro('Dias de folga deve ser 0 ou mais.');
      dados.diasTrabalho = t;
      dados.diasFolga = f;
    } else {
      if (!form.diasSemana.length) return toast.erro('Marque pelo menos um dia da semana.');
      dados.diasSemana = form.diasSemana;
    }
    setSalvando(true);
    try {
      if (editando === 'novo') await padroesApi.criar(dados);
      else await padroesApi.atualizar(editando.id, dados);
      toast.sucesso('Padrão salvo.');
      setEditando(null);
      void recarregar();
    } catch (err) {
      toast.erro(err);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div>
      <CabecalhoPagina
        titulo="Padrões de escala"
        subtitulo="Regras usadas pelo gerador: ciclo (X dias trabalha / Y folga) ou dias fixos da semana."
        acoes={
          ehAdmin && (
            <button className="btn btn-primario" onClick={() => abrir('novo')}>
              + Novo padrão
            </button>
          )
        }
      />
      <div className="cartao">
        {carregando ? (
          <Carregando />
        ) : padroes.length === 0 ? (
          <Vazio>Nenhum padrão cadastrado.</Vazio>
        ) : (
          <Tabela>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Regra</th>
                <th>Situação</th>
                {ehAdmin && <th className="acoes" />}
              </tr>
            </thead>
            <tbody>
              {padroes.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.nome}</strong>
                  </td>
                  <td>
                    <Selo cor="azul">{p.tipo === 'CICLO' ? 'Ciclo' : 'Semanal'}</Selo>
                  </td>
                  <td>{descreverPadrao(p)}</td>
                  <td>
                    <SeloAtivo ativo={p.ativo} />
                  </td>
                  {ehAdmin && (
                    <td className="acoes">
                      <button className="btn btn-pequeno" onClick={() => abrir(p)}>
                        Editar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </div>

      <Modal
        titulo={editando === 'novo' ? 'Novo padrão' : 'Editar padrão'}
        aberto={editando !== null}
        onFechar={() => setEditando(null)}
        rodape={
          <>
            <button className="btn" onClick={() => setEditando(null)}>
              Cancelar
            </button>
            <button type="submit" form="form-padrao" className="btn btn-primario" disabled={salvando}>
              Salvar
            </button>
          </>
        }
      >
        <form id="form-padrao" className="form" onSubmit={salvar}>
          <Campo rotulo="Nome" obrigatorio>
            <input value={form.nome} onChange={(e) => set('nome', e.target.value)} required autoFocus placeholder="Ex.: 12x36, 6x1, 5x2" />
          </Campo>
          <div className="opcoes-radio">
            <label>
              <input type="radio" checked={form.tipo === 'CICLO'} onChange={() => set('tipo', 'CICLO')} /> Ciclo (trabalha X dias, folga Y)
            </label>
            <label>
              <input type="radio" checked={form.tipo === 'SEMANAL'} onChange={() => set('tipo', 'SEMANAL')} /> Semanal (dias fixos)
            </label>
          </div>
          {form.tipo === 'CICLO' ? (
            <>
              <div className="grade-2">
                <Campo rotulo="Dias de trabalho" obrigatorio>
                  <input type="number" min={1} value={form.diasTrabalho} onChange={(e) => set('diasTrabalho', e.target.value)} required />
                </Campo>
                <Campo rotulo="Dias de folga" obrigatorio>
                  <input type="number" min={0} value={form.diasFolga} onChange={(e) => set('diasFolga', e.target.value)} required />
                </Campo>
              </div>
              <p className="texto-suave texto-pequeno">
                Exemplos: 12x36 = 1 trabalho / 1 folga (com turno de 12h); 6x1 = 6 / 1; 4x2 = 4 / 2. O ciclo começa na data de
                início escolhida no gerador.
              </p>
            </>
          ) : (
            <Campo rotulo="Dias da semana trabalhados" obrigatorio>
              <div className="dias-semana">
                {DIAS_SEMANA_CURTO.map((nome, d) => (
                  <label key={d} className={`dia-chip ${form.diasSemana.includes(d) ? 'marcado' : ''}`}>
                    <input type="checkbox" checked={form.diasSemana.includes(d)} onChange={() => alternarDia(d)} />
                    {nome}
                  </label>
                ))}
              </div>
            </Campo>
          )}
          <Interruptor marcado={form.ativo} onChange={(v) => set('ativo', v)} rotulo="Padrão ativo" />
        </form>
      </Modal>
    </div>
  );
}
