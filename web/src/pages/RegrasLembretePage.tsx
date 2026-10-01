import { useRef, useState, type FormEvent } from 'react';
import { regrasApi, type RegraLembrete, type RegraLembreteInput, type TipoRegra } from '../api';
import { CabecalhoPagina, Campo, Carregando, Interruptor, Modal, Selo, SeloAtivo, Tabela, Vazio } from '../components/ui';
import { useToast } from '../contexts/ToastContext';
import { useCarregar } from '../lib/hooks';
import { fmtMinutos } from '../lib/rotulos';

const VARIAVEIS: { chave: string; descricao: string }[] = [
  { chave: '{nome}', descricao: 'Nome do funcionário' },
  { chave: '{data}', descricao: 'Data do turno (dd/mm)' },
  { chave: '{dia_semana}', descricao: 'Dia da semana' },
  { chave: '{inicio}', descricao: 'Hora de início (HH:mm)' },
  { chave: '{fim}', descricao: 'Hora de fim (HH:mm)' },
  { chave: '{turno}', descricao: 'Nome do turno' },
  { chave: '{setor}', descricao: 'Setor' },
];

const TEMPLATE_PADRAO = 'Olá {nome}! 👋\nLembrete: seu turno começa hoje às {inicio} (até {fim}) no setor {setor}.\nBom trabalho!';
const TEMPLATE_VESPERA = 'Olá {nome}! 👋\nLembrete: amanhã, {dia_semana} {data}, você trabalha das {inicio} às {fim} no setor {setor}.\nBom descanso!';

interface FormState {
  nome: string;
  tipo: TipoRegra;
  minutos: string;
  horario: string;
  template: string;
  ativo: boolean;
}

function descreverRegra(r: RegraLembrete): string {
  return r.tipo === 'ANTECEDENCIA' ? fmtMinutos(r.minutos) : `Na véspera, às ${r.horario ?? '—'}`;
}

export default function RegrasLembretePage() {
  const toast = useToast();
  const [regras, carregando, recarregar] = useCarregar(() => regrasApi.listar(), [], [] as RegraLembrete[]);
  const [editando, setEditando] = useState<RegraLembrete | 'novo' | null>(null);
  const [form, setForm] = useState<FormState>({ nome: '', tipo: 'ANTECEDENCIA', minutos: '60', horario: '18:00', template: TEMPLATE_PADRAO, ativo: true });
  const [salvando, setSalvando] = useState(false);
  const [previa, setPrevia] = useState<string | null>(null);
  const [gerandoPrevia, setGerandoPrevia] = useState(false);
  const textoRef = useRef<HTMLTextAreaElement>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const abrir = (r: RegraLembrete | 'novo') => {
    setEditando(r);
    setPrevia(null);
    setForm(
      r === 'novo'
        ? { nome: '', tipo: 'ANTECEDENCIA', minutos: '60', horario: '18:00', template: TEMPLATE_PADRAO, ativo: true }
        : {
            nome: r.nome,
            tipo: r.tipo,
            minutos: String(r.minutos ?? 60),
            horario: r.horario ?? '18:00',
            template: r.template,
            ativo: r.ativo,
          },
    );
  };

  const inserirVariavel = (v: string) => {
    const el = textoRef.current;
    if (!el) {
      set('template', form.template + v);
      return;
    }
    const ini = el.selectionStart ?? form.template.length;
    const fim = el.selectionEnd ?? ini;
    const novo = form.template.slice(0, ini) + v + form.template.slice(fim);
    set('template', novo);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(ini + v.length, ini + v.length);
    });
  };

  const gerarPrevia = async () => {
    if (!form.template.trim()) return toast.erro('Escreva o texto da mensagem.');
    setGerandoPrevia(true);
    try {
      const r = await regrasApi.previa(form.template);
      setPrevia(r.texto);
    } catch (e) {
      toast.erro(e);
    } finally {
      setGerandoPrevia(false);
    }
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    const dados: RegraLembreteInput = { nome: form.nome.trim(), tipo: form.tipo, template: form.template, ativo: form.ativo };
    if (form.tipo === 'ANTECEDENCIA') {
      const m = Number(form.minutos);
      if (!Number.isInteger(m) || m < 1) return toast.erro('Informe os minutos de antecedência (mínimo 1).');
      dados.minutos = m;
    } else {
      if (!form.horario) return toast.erro('Informe o horário de envio na véspera.');
      dados.horario = form.horario;
    }
    if (!form.template.trim()) return toast.erro('Escreva o texto da mensagem.');
    setSalvando(true);
    try {
      if (editando === 'novo') await regrasApi.criar(dados);
      else await regrasApi.atualizar(editando.id, dados);
      toast.sucesso('Regra salva.');
      setEditando(null);
      void recarregar();
    } catch (err) {
      toast.erro(err);
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (r: RegraLembrete) => {
    if (!window.confirm(`Excluir a regra "${r.nome}"? Para apenas pausar, prefira desativá-la.`)) return;
    try {
      await regrasApi.excluir(r.id);
      toast.sucesso('Regra excluída.');
      void recarregar();
    } catch (err) {
      toast.erro(err);
    }
  };

  return (
    <div>
      <CabecalhoPagina
        titulo="Regras de lembrete"
        subtitulo="Quando e com qual texto o funcionário é avisado pelo WhatsApp antes do turno. Pode haver várias regras ativas."
        acoes={
          <button className="btn btn-primario" onClick={() => abrir('novo')}>
            + Nova regra
          </button>
        }
      />
      <div className="cartao">
        {carregando ? (
          <Carregando />
        ) : regras.length === 0 ? (
          <Vazio>Nenhuma regra cadastrada. Sem regras ativas, nenhum lembrete é enviado.</Vazio>
        ) : (
          <div className="tabela-rolagem">
            <Tabela>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Quando</th>
                  <th>Mensagem</th>
                  <th>Situação</th>
                  <th className="acoes" />
                </tr>
              </thead>
              <tbody>
                {regras.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.nome}</strong>
                    </td>
                    <td className="nowrap">
                      <Selo cor="azul">{r.tipo === 'ANTECEDENCIA' ? 'Antecedência' : 'Véspera'}</Selo> {descreverRegra(r)}
                    </td>
                    <td>
                      <div className="template-resumo">{r.template}</div>
                    </td>
                    <td>
                      <SeloAtivo ativo={r.ativo} />
                    </td>
                    <td className="acoes">
                      <button className="btn btn-pequeno" onClick={() => abrir(r)}>
                        Editar
                      </button>
                      <button className="btn btn-pequeno btn-perigo-texto" onClick={() => void excluir(r)}>
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
        titulo={editando === 'novo' ? 'Nova regra de lembrete' : 'Editar regra de lembrete'}
        aberto={editando !== null}
        onFechar={() => setEditando(null)}
        largura="larga"
        rodape={
          <>
            <button className="btn" onClick={() => setEditando(null)}>
              Cancelar
            </button>
            <button type="submit" form="form-regra" className="btn btn-primario" disabled={salvando}>
              Salvar
            </button>
          </>
        }
      >
        <form id="form-regra" className="form" onSubmit={salvar}>
          <Campo rotulo="Nome" obrigatorio>
            <input value={form.nome} onChange={(e) => set('nome', e.target.value)} required autoFocus placeholder="Ex.: 1 hora antes" />
          </Campo>
          <div className="opcoes-radio">
            <label>
              <input type="radio" checked={form.tipo === 'ANTECEDENCIA'} onChange={() => set('tipo', 'ANTECEDENCIA')} /> Antecedência (X minutos
              antes do início)
            </label>
            <label>
              <input
                type="radio"
                checked={form.tipo === 'VESPERA'}
                onChange={() => {
                  setForm((f) => ({ ...f, tipo: 'VESPERA', template: f.template === TEMPLATE_PADRAO ? TEMPLATE_VESPERA : f.template }));
                }}
              />{' '}
              Véspera (dia anterior, em horário fixo)
            </label>
          </div>
          {form.tipo === 'ANTECEDENCIA' ? (
            <Campo rotulo="Minutos antes do início" obrigatorio dica={Number(form.minutos) > 0 ? `= ${fmtMinutos(Number(form.minutos))}` : undefined}>
              <input type="number" min={1} step={1} value={form.minutos} onChange={(e) => set('minutos', e.target.value)} required />
            </Campo>
          ) : (
            <Campo rotulo="Horário de envio (no dia anterior)" obrigatorio>
              <input type="time" value={form.horario} onChange={(e) => set('horario', e.target.value)} required />
            </Campo>
          )}

          <Campo rotulo="Texto da mensagem" obrigatorio dica="Clique numa variável para inserir na posição do cursor.">
            <div className="variaveis">
              {VARIAVEIS.map((v) => (
                <button type="button" key={v.chave} className="btn btn-pequeno btn-variavel" title={v.descricao} onClick={() => inserirVariavel(v.chave)}>
                  {v.chave}
                </button>
              ))}
            </div>
            <textarea
              ref={textoRef}
              rows={6}
              value={form.template}
              onChange={(e) => {
                set('template', e.target.value);
                setPrevia(null);
              }}
              required
              className="textarea-mensagem"
            />
          </Campo>

          <div className="previa-bloco">
            <button type="button" className="btn" onClick={() => void gerarPrevia()} disabled={gerandoPrevia}>
              {gerandoPrevia ? 'Gerando…' : 'Pré-visualizar mensagem'}
            </button>
            {previa !== null && (
              <div className="balao-whatsapp">
                <div className="balao-texto">{previa}</div>
                <div className="texto-suave texto-pequeno">Prévia com dados de exemplo</div>
              </div>
            )}
          </div>

          <Interruptor marcado={form.ativo} onChange={(v) => set('ativo', v)} rotulo="Regra ativa" />
        </form>
      </Modal>
    </div>
  );
}
