import ptBrLocale from '@fullcalendar/core/locales/pt-br';
import type { DatesSetArg, EventClickArg, EventContentArg, EventDropArg, EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin, { type DateClickArg, type EventResizeDoneArg } from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import luxonPlugin from '@fullcalendar/luxon3';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import { DateTime } from 'luxon';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { escalaApi, funcionariosApi, setoresApi, turnosApi, type Funcionario, type Plantao, type Setor, type Turno } from '../api';
import PlantaoModal, { type NovoPlantaoSugestao } from '../components/PlantaoModal';
import { CabecalhoPagina } from '../components/ui';
import { useToast } from '../contexts/ToastContext';
import { FUSO } from '../lib/datas';
import { useCarregar } from '../lib/hooks';
import { ROTULO_CONFLITO } from '../lib/rotulos';

// Celular e computador guardam a última visão separadamente: a grade semanal
// não cabe numa tela estreita, então lá o padrão é a lista da semana.
const CELULAR = '(max-width: 700px)';
const ehCelular = () => window.matchMedia(CELULAR).matches;
const chaveVisao = (celular: boolean) => (celular ? 'escala.calendario.visao.celular' : 'escala.calendario.visao');
const VISOES_CELULAR = ['listWeek', 'timeGridDay', 'dayGridMonth'];

function lerVisao(celular = ehCelular()): string {
  const padrao = celular ? 'listWeek' : 'timeGridWeek';
  try {
    const salva = localStorage.getItem(chaveVisao(celular));
    if (salva && (!celular || VISOES_CELULAR.includes(salva))) return salva;
    return padrao;
  } catch {
    return padrao;
  }
}

/** Converte a string de data emitida pelo FullCalendar (com offset do fuso) para ISO UTC. */
function paraUtc(str: string): string {
  return DateTime.fromISO(str, { zone: FUSO }).toUTC().toISO()!;
}

function textoConflitos(p: Plantao): string {
  return p.conflitos.map((c) => `⚠ ${ROTULO_CONFLITO[c.tipo] ?? c.tipo}: ${c.descricao}`).join('\n');
}

export default function CalendarioPage() {
  const toast = useToast();
  const [setorId, setSetorId] = useState('');
  const [funcionarioId, setFuncionarioId] = useState('');
  const [mostrarCancelados, setMostrarCancelados] = useState(false);
  const [intervalo, setIntervalo] = useState<{ inicio: string; fim: string } | null>(null);
  const [plantoes, setPlantoes] = useState<Plantao[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [versao, setVersao] = useState(0);

  const [setores] = useCarregar(() => setoresApi.listar({ ativo: true }), [], [] as Setor[]);
  const [funcionarios] = useCarregar(() => funcionariosApi.listar({ ativo: true }), [], [] as Funcionario[]);
  const [turnos] = useCarregar(() => turnosApi.listar(), [], [] as Turno[]);

  const [editando, setEditando] = useState<Plantao | null>(null);
  const [novo, setNovo] = useState<NovoPlantaoSugestao | null>(null);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  const [celular, setCelular] = useState(ehCelular);
  useEffect(() => {
    const mq = window.matchMedia(CELULAR);
    const aoMudar = () => setCelular(mq.matches);
    mq.addEventListener('change', aoMudar);
    return () => mq.removeEventListener('change', aoMudar);
  }, []);

  useEffect(() => {
    if (!intervalo) return;
    let cancelado = false;
    setCarregando(true);
    escalaApi
      .listar({
        inicio: intervalo.inicio,
        fim: intervalo.fim,
        setorId: setorId ? Number(setorId) : undefined,
        funcionarioId: funcionarioId ? Number(funcionarioId) : undefined,
        status: mostrarCancelados ? undefined : 'AGENDADO',
      })
      .then((r) => !cancelado && setPlantoes(r))
      .catch((e) => !cancelado && toast.erro(e))
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [intervalo, setorId, funcionarioId, mostrarCancelados, versao, toast]);

  const funcsDoSetor = useMemo(
    () => (setorId ? funcionarios.filter((f) => f.setorId === Number(setorId)) : funcionarios),
    [funcionarios, setorId],
  );

  const eventos = useMemo<EventInput[]>(
    () =>
      plantoes.map((p) => {
        const cor = p.turno?.cor || '#64748b';
        const conflito = p.conflitos.length > 0;
        const cancelado = p.status === 'CANCELADO';
        return {
          id: String(p.id),
          title: p.funcionario.nome,
          start: p.inicio,
          end: p.fim,
          backgroundColor: cor,
          borderColor: cor,
          textColor: '#1d2527',
          classNames: [conflito ? 'evento-conflito' : '', cancelado ? 'evento-cancelado' : ''].filter(Boolean),
          extendedProps: { plantao: p },
        };
      }),
    [plantoes],
  );

  const aoMudarDatas = (arg: DatesSetArg) => {
    const inicio = paraUtc(arg.startStr);
    const fim = paraUtc(arg.endStr);
    setIntervalo((atual) => (atual && atual.inicio === inicio && atual.fim === fim ? atual : { inicio, fim }));
    try {
      localStorage.setItem(chaveVisao(celular), arg.view.type);
    } catch {
      /* armazenamento indisponível */
    }
  };

  const moverOuRedimensionar = async (arg: EventDropArg | EventResizeDoneArg) => {
    const p = arg.event.extendedProps.plantao as Plantao;
    if (!arg.event.startStr || !arg.event.endStr) {
      arg.revert();
      return;
    }
    const inicio = paraUtc(arg.event.startStr);
    const fim = paraUtc(arg.event.endStr);
    try {
      await escalaApi.atualizar(p.id, { inicio, fim });
      toast.sucesso(`Plantão de ${p.funcionario.nome} atualizado.`);
      recarregar();
    } catch (e) {
      arg.revert();
      toast.erro(e);
    }
  };

  const aoClicarData = (arg: DateClickArg) => {
    setEditando(null);
    setNovo({
      inicio: arg.allDay ? arg.dateStr.slice(0, 10) : arg.dateStr,
      funcionarioId: funcionarioId ? Number(funcionarioId) : undefined,
      setorId: setorId ? Number(setorId) : undefined,
    });
  };

  const aoClicarEvento = (arg: EventClickArg) => {
    setNovo(null);
    setEditando(arg.event.extendedProps.plantao as Plantao);
  };

  const renderEvento = (arg: EventContentArg) => {
    const p = arg.event.extendedProps.plantao as Plantao;
    const conflito = p.conflitos.length > 0;
    const mes = arg.view.type === 'dayGridMonth';
    const lista = arg.view.type.startsWith('list');
    const dica = [
      `${p.funcionario.nome} — ${p.setor.nome}`,
      p.turno ? `Turno: ${p.turno.nome}` : 'Horário avulso',
      p.status === 'CANCELADO' ? 'CANCELADO' : '',
      p.observacao ? `Obs.: ${p.observacao}` : '',
      textoConflitos(p),
    ]
      .filter(Boolean)
      .join('\n');
    return (
      <div className="evento-conteudo" title={dica}>
        {arg.timeText && !lista && <span className="evento-hora">{arg.timeText}</span>}
        <span className="evento-titulo">
          {conflito && <span className="evento-alerta" aria-label="Conflito">⚠</span>}
          {p.funcionario.nome}
        </span>
        {!mes && p.turno && <span className="evento-sub">{p.turno.nome}</span>}
        {!mes && !setorId && <span className="evento-sub">{p.setor.nome}</span>}
      </div>
    );
  };

  const totalConflitos = plantoes.filter((p) => p.conflitos.length > 0).length;

  const fechar = () => {
    setEditando(null);
    setNovo(null);
  };

  return (
    <div>
      <CabecalhoPagina
        titulo="Calendário da escala"
        subtitulo={
          celular
            ? 'Toque num plantão para editar ou mudar o horário.'
            : 'Clique num plantão para editar, arraste para mover, ou clique num horário vazio para criar.'
        }
        acoes={
          <>
            <Link to="/gerador" className="btn">
              Gerar escala
            </Link>
            <button
              className="btn btn-primario"
              onClick={() => {
                setEditando(null);
                setNovo({
                  inicio: DateTime.now().setZone(FUSO).toISODate()!,
                  funcionarioId: funcionarioId ? Number(funcionarioId) : undefined,
                  setorId: setorId ? Number(setorId) : undefined,
                });
              }}
            >
              + Novo plantão
            </button>
          </>
        }
      />

      <div className="filtros">
        <select
          value={setorId}
          onChange={(e) => {
            setSetorId(e.target.value);
            setFuncionarioId('');
          }}
          aria-label="Setor"
        >
          <option value="">Todos os setores</option>
          {setores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome}
            </option>
          ))}
        </select>
        <select value={funcionarioId} onChange={(e) => setFuncionarioId(e.target.value)} aria-label="Funcionário">
          <option value="">Todos os funcionários</option>
          {funcsDoSetor.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </select>
        <label className="interruptor">
          <input type="checkbox" checked={mostrarCancelados} onChange={(e) => setMostrarCancelados(e.target.checked)} />
          <span>Mostrar cancelados</span>
        </label>
        <div className="espaco" />
        {carregando && <span className="texto-suave texto-pequeno">Atualizando…</span>}
        {totalConflitos > 0 && (
          <span className="selo selo-vermelho" title="Plantões com borda vermelha têm conflito (sobreposição ou ausência)">
            ⚠ {totalConflitos} plantão(ões) com conflito
          </span>
        )}
      </div>

      {turnos.some((t) => t.ativo) && (
        <div className="legenda">
          {turnos
            .filter((t) => t.ativo)
            .map((t) => (
              <span key={t.id} className="legenda-item">
                <span className="cor-amostra" style={{ background: t.cor }} />
                {t.nome} ({t.horaInicio}–{t.horaFim})
              </span>
            ))}
          <span className="legenda-item">
            <span className="cor-amostra cor-conflito" /> Conflito
          </span>
        </div>
      )}

      <div className="cartao calendario">
        <FullCalendar
          key={celular ? 'celular' : 'computador'}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, luxonPlugin]}
          locale={ptBrLocale}
          timeZone={FUSO}
          initialView={lerVisao(celular)}
          headerToolbar={
            celular
              ? { left: 'prev,next today', center: 'title', right: 'listWeek,timeGridDay,dayGridMonth' }
              : { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }
          }
          buttonText={{ today: 'Hoje', month: 'Mês', week: 'Semana', day: 'Dia', list: 'Lista' }}
          noEventsText="Nenhum plantão neste período."
          contentHeight={celular ? 'auto' : 680}
          expandRows
          allDaySlot={false}
          nowIndicator
          scrollTime="06:00:00"
          slotDuration="00:30:00"
          slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          nextDayThreshold="09:00:00"
          dayMaxEvents={4}
          editable={!celular}
          eventDurationEditable={!celular}
          eventStartEditable={!celular}
          events={eventos}
          datesSet={aoMudarDatas}
          eventClick={aoClicarEvento}
          dateClick={aoClicarData}
          eventDrop={(a) => void moverOuRedimensionar(a)}
          eventResize={(a) => void moverOuRedimensionar(a)}
          eventContent={renderEvento}
          eventDidMount={(a) => a.el.style.setProperty('--cor-turno', a.event.backgroundColor || '#64748b')}
        />
      </div>

      <PlantaoModal
        plantao={editando}
        novo={novo}
        funcionarios={funcionarios}
        setores={setores}
        turnos={turnos}
        onFechar={fechar}
        onSalvo={() => {
          fechar();
          recarregar();
        }}
      />
    </div>
  );
}
