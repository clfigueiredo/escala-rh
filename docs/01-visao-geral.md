# 1. Visão geral e escopo

## Objetivo

Permitir que o RH e os gestores montem a escala de trabalho da equipe de forma simples e que cada funcionário seja **avisado pelo WhatsApp antes do turno**, podendo também **consultar a própria escala pelo bot**.

## Quem usa

| Ator | Acesso | O que faz |
|---|---|---|
| **Admin** | Painel web | Tudo: usuários, setores, funcionários, turnos, padrões, escalas, configurações, conexão do WhatsApp |
| **Gestor** | Painel web | Gerencia funcionários, escalas e ausências e vê o histórico de mensagens **apenas dos setores vinculados a ele** |
| **Funcionário** | Somente WhatsApp | Recebe lembretes e consulta a escala pelo bot. Não tem login. |

A quantidade de usuários do painel é livre (cadastro pelo admin). Turnos, padrões e setores são cadastrados só pelo admin; o gestor os vê, mas não altera. Conexão do WhatsApp, regras de lembrete, configurações do bot e usuários são telas só do admin.

Guia de uso para o RH/gestores: [09-guia-rh.md](09-guia-rh.md).

## Funcionalidades — Versão 1

### Cadastros
- **Usuários do painel** — nome, e-mail, senha, perfil (admin/gestor), setores permitidos (gestor), ativo.
- **Setores** — nome, ativo.
- **Funcionários** — nome, WhatsApp, setor, cargo, observações, ativo.
- **Turnos** — nome, hora início, hora fim, cor no calendário. Aceita turno que vira a noite (19:00–07:00).
- **Padrões de escala** (configuráveis, sem mexer em código):
  - **Ciclo:** X dias trabalha, Y dias folga, repetindo. Ex.: 12x36 = 1/1 com turno de 12h; 6x1 = 6/1; 4x2 = 4/2.
  - **Semanal:** dias fixos da semana. Ex.: 5x2 = seg a sex; 6x1 fixo = seg a sáb.

### Escala
- **Gerador:** escolhe funcionário(s) + padrão + turno + data de início do ciclo + período (até 93 dias) → prévia com conflitos → sistema cria os plantões (pulando ou substituindo os conflitantes).
- **Calendário** (mês/semana/dia), filtro por setor e funcionário; cada plantão pode ser editado, arrastado, redimensionado, cancelado (não gera lembrete) ou excluído; plantão avulso (sem turno) pelo botão "Novo plantão".
- **Ausências** — férias, atestado, folga, outro (período de datas). Plantões que caem numa ausência ficam sinalizados como conflito e não geram lembrete.
- Alerta visual de conflitos: plantão sobreposto do mesmo funcionário, plantão dentro de ausência.

### WhatsApp
- **Lembretes configuráveis:** uma ou mais regras, cada uma com:
  - tipo *antecedência* (X minutos antes do início) ou *véspera* (dia anterior em horário fixo);
  - texto com variáveis `{nome}`, `{data}`, `{dia_semana}`, `{inicio}`, `{fim}`, `{turno}`, `{setor}`.
- **Bot de consulta** para o funcionário:
  - `1` — meu próximo turno
  - `2` — minha escala da semana
  - `3` — minha escala do mês
- **Conexão do WhatsApp** pelo painel (QR Code + status da conexão).
- **Histórico de mensagens** enviadas e recebidas, com status e erro.

### Configurações gerais
- Regras de lembrete e textos.
- Mensagem de boas-vindas/menu do bot.
- Comportamento com número desconhecido: ignorar ou responder mensagem padrão.

## Fase 2 (fora do escopo agora)

Só entram quando o usuário pedir:
- Confirmação de presença respondendo "1" ao lembrete + painel de quem confirmou.
- Envio automático da escala da semana (ex.: todo domingo).
- Pedido de troca de turno entre funcionários com aprovação do gestor.
- Exportação da escala em PDF/Excel.
- Alertas de regras da CLT (interjornada mínima de 11h, descanso semanal).
- Log de auditoria (quem alterou o quê).

## Premissas

- Um número de WhatsApp **dedicado** ao sistema (Evolution API usa conexão não oficial — número dedicado reduz risco para a empresa).
- Fuso horário único: `America/Sao_Paulo`.
- Sistema hospedado no próprio servidor, domínio `escala.seudominio.com.br`.
