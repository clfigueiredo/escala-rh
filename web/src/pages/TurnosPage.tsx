import { useState, type FormEvent } from 'react';
import { turnosApi, type Turno } from '../api';
import { CabecalhoPagina, Campo, Carregando, Interruptor, Modal, Selo, SeloAtivo, Tabela, Vazio } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useCarregar } from '../lib/hooks';

const CORES_SUGERIDAS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#0ea5e9', '#14b8a6', '#6366f1', '#ec4899', '#64748b'];

interface FormState {
  nome: string;
  horaInicio: string;
  horaFim: string;
  cor: string;
  ativo: boolean;
}

function duracao(ini: string, fim: string): string {
  if (!ini || !fim) return '';
  const [h1, m1] = ini.split(':').map(Number);
  const [h2, m2] = fim.split(':').map(Number);
  let min = h2 * 60 + m2 - (h1 * 60 + m1);
  if (min <= 0) min += 24 * 60;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${m ? String(m).padStart(2, '0') : ''}`;
}

export default function TurnosPage() {
  const { ehAdmin } = useAuth();
  const toast = useToast();
  const [turnos, carregando, recarregar] = useCarregar(() => turnosApi.listar(), [], [] as Turno[]);
  const [editando, setEditando] = useState<Turno | 'novo' | null>(null);
  const [form, setForm] = useState<FormState>({ nome: '', horaInicio: '07:00', horaFim: '19:00', cor: CORES_SUGERIDAS[0], ativo: true });
  const [salvando, setSalvando] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const abrir = (t: Turno | 'novo') => {
    setEditando(t);
    setForm(
      t === 'novo'
        ? { nome: '', horaInicio: '07:00', horaFim: '19:00', cor: CORES_SUGERIDAS[turnos.length % CORES_SUGERIDAS.length], ativo: true }
        : { nome: t.nome, horaInicio: t.horaInicio, horaFim: t.horaFim, cor: t.cor, ativo: t.ativo },
    );
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    if (form.horaInicio === form.horaFim) {
      // horaFim <= horaInicio significa virar a noite; igual = turno de 24h.
      if (!window.confirm('Início e fim iguais: o turno terá 24 horas. Confirmar?')) return;
    }
    setSalvando(true);
    try {
      const dados = { ...form, nome: form.nome.trim() };
      if (editando === 'novo') await turnosApi.criar(dados);
      else await turnosApi.atualizar(editando.id, dados);
      toast.sucesso('Turno salvo.');
      setEditando(null);
      void recarregar();
    } catch (err) {
      toast.erro(err);
    } finally {
      setSalvando(false);
    }
  };

  const viraNoite = form.horaFim <= form.horaInicio;

  return (
    <div>
      <CabecalhoPagina
        titulo="Turnos"
        subtitulo="Horários de trabalho usados na escala. A cor aparece no calendário."
        acoes={
          ehAdmin && (
            <button className="btn btn-primario" onClick={() => abrir('novo')}>
              + Novo turno
            </button>
          )
        }
      />
      <div className="cartao">
        {carregando ? (
          <Carregando />
        ) : turnos.length === 0 ? (
          <Vazio>Nenhum turno cadastrado.</Vazio>
        ) : (
          <Tabela>
            <thead>
              <tr>
                <th>Turno</th>
                <th>Horário</th>
                <th>Duração</th>
                <th>Situação</th>
                {ehAdmin && <th className="acoes" />}
              </tr>
            </thead>
            <tbody>
              {turnos.map((t) => (
                <tr key={t.id}>
                  <td>
                    <span className="cor-amostra" style={{ background: t.cor }} /> {t.nome}
                  </td>
                  <td className="nowrap">
                    {t.horaInicio} – {t.horaFim}{' '}
                    {t.viraNoite && (
                      <Selo cor="azul" title="Termina no dia seguinte">
                        vira a noite
                      </Selo>
                    )}
                  </td>
                  <td>{duracao(t.horaInicio, t.horaFim)}</td>
                  <td>
                    <SeloAtivo ativo={t.ativo} />
                  </td>
                  {ehAdmin && (
                    <td className="acoes">
                      <button className="btn btn-pequeno" onClick={() => abrir(t)}>
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
        titulo={editando === 'novo' ? 'Novo turno' : 'Editar turno'}
        aberto={editando !== null}
        onFechar={() => setEditando(null)}
        rodape={
          <>
            <button className="btn" onClick={() => setEditando(null)}>
              Cancelar
            </button>
            <button type="submit" form="form-turno" className="btn btn-primario" disabled={salvando}>
              Salvar
            </button>
          </>
        }
      >
        <form id="form-turno" className="form" onSubmit={salvar}>
          <Campo rotulo="Nome" obrigatorio>
            <input value={form.nome} onChange={(e) => set('nome', e.target.value)} required autoFocus placeholder="Ex.: Plantão dia" />
          </Campo>
          <div className="grade-2">
            <Campo rotulo="Hora de início" obrigatorio>
              <input type="time" value={form.horaInicio} onChange={(e) => set('horaInicio', e.target.value)} required />
            </Campo>
            <Campo rotulo="Hora de fim" obrigatorio>
              <input type="time" value={form.horaFim} onChange={(e) => set('horaFim', e.target.value)} required />
            </Campo>
          </div>
          <p className="texto-suave texto-pequeno">
            Duração: <strong>{duracao(form.horaInicio, form.horaFim)}</strong>
            {viraNoite && ' — termina no dia seguinte (vira a noite).'}
          </p>
          <Campo rotulo="Cor no calendário">
            <div className="seletor-cor">
              {CORES_SUGERIDAS.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={`cor-opcao ${form.cor.toLowerCase() === c ? 'selecionada' : ''}`}
                  style={{ background: c }}
                  onClick={() => set('cor', c)}
                  aria-label={`Cor ${c}`}
                />
              ))}
              <input type="color" value={form.cor} onChange={(e) => set('cor', e.target.value)} aria-label="Cor personalizada" />
            </div>
          </Campo>
          <Interruptor marcado={form.ativo} onChange={(v) => set('ativo', v)} rotulo="Turno ativo" />
        </form>
      </Modal>
    </div>
  );
}
