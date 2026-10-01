# 10. Roteiro para gerar o tutorial do sistema (instruções para o Claude Code)

> **Para quem é este arquivo:** uma sessão do Claude Code rodando em outra máquina, com acesso a um navegador
> (MCP do Chrome DevTools ou Playwright). A tarefa é **abrir o painel em produção, percorrer todas as telas e escrever
> um tutorial completo, com exemplos e capturas de tela**, para o RH e os gestores aprenderem a usar o sistema.
>
> Este arquivo é a fonte de verdade sobre **o que o sistema faz**. Use-o junto com `docs/09-guia-rh.md`
> (guia resumido já existente) e confira tudo na tela de verdade — se a tela divergir deste texto, vale a tela, e anote a divergência.

---

## 0. Antes de começar — pergunte ao usuário

Não adivinhe nada disto; pergunte ao usuário no início da sessão:

1. **URL do painel** em produção (o repositório é público, por isso o endereço real não está aqui).
2. **E-mail e senha** de um usuário **administrador** (e, se possível, de um **gestor** para mostrar a visão restrita).
3. **Um número de WhatsApp de teste** (o do próprio usuário) para cadastrar como funcionário de exemplo e testar o bot.
4. Se pode **criar dados de exemplo** no sistema em produção e se deve **removê-los/desativá-los no fim**.
5. Formato de saída desejado (padrão: `TUTORIAL.md` + pasta `tutorial/img/` com capturas em PNG).

## 1. Regras de segurança (produção!)

- **Nunca** clique em **Desconectar** na tela WhatsApp › Conexão, nem gere novo QR Code se estiver *Conectado*.
  Derrubar a conexão para todos os lembretes da empresa.
- **Não altere nem exclua dados reais** (funcionários, plantões, regras de lembrete, textos do bot já em uso).
  Para demonstrar edição/exclusão, use apenas os dados de exemplo que você mesmo criou.
- Todo dado de exemplo leva o prefixo **`[TESTE]`** no nome (ex.: `[TESTE] Enfermagem`, `[TESTE] Ana Souza`) para
  ser fácil de achar e limpar.
- O único telefone cadastrável é o **número de teste do usuário**. Nunca invente números: um número inventado pode
  ser de uma pessoa real e receber mensagens da empresa.
- Ao criar regra de lembrete de exemplo, **deixe-a inativa** (ou mostre só a pré-visualização e cancele) — uma regra
  ativa vale para **todos** os funcionários reais.
- Não trocar a senha do administrador. Não alterar **Configurações do bot** reais — mostre a tela e cancele.
- **Não coloque no tutorial** senha, URL real, telefone real nem nome de funcionário real. Nas capturas, borre ou
  recorte dados pessoais (nomes reais, telefones, histórico de mensagens de outras pessoas).
- Nada é "apagado" em cadastros (setor, turno, padrão, usuário, funcionário): para limpar, **desative**.
  Plantões e ausências de teste podem ser excluídos.

## 2. Conceitos que o tutorial precisa explicar (glossário)

Explique isto logo no começo do tutorial, em linguagem simples, com os exemplos:

| Termo | O que é | Exemplo |
|---|---|---|
| **Setor** | Área da empresa. Gestores só veem os setores vinculados a eles. | Enfermagem, Portaria, Recepção |
| **Turno** | Um **horário** de trabalho com nome e cor. Pode virar a noite. | Plantão dia 07:00–19:00 · Plantão noite 19:00–07:00 · Comercial 08:00–18:00 |
| **Padrão de escala** | **Quais dias** a pessoa trabalha (não o horário). | 12x36, 6x1, 5x2 |
| **Plantão** | Um dia/horário concreto de um funcionário no calendário. É o que gera lembrete. | Ana, qui 01/10, 07:00–19:00, Enfermagem |
| **Escala** | O conjunto de plantões de um período (ex.: o mês). | Escala de outubro da Enfermagem |
| **Ausência** | Férias, atestado, folga ou outro, por período de datas. Bloqueia plantões nesses dias. | Bruno de férias de 12 a 21/10 |
| **Regra de lembrete** | Quando e com qual texto o WhatsApp avisa o funcionário. | "Véspera 18h", "1 hora antes" |
| **Bot** | Atendimento automático no WhatsApp: o funcionário consulta a própria escala. | Envia `1` → recebe o próximo turno |

**Fórmula para o leitor guardar:** `Padrão (quais dias) + Turno (que horas) + Data de início do ciclo + Período = Plantões`.

### Tipos de padrão
- **Ciclo** — X dias de trabalho, Y de folga, repetindo sem olhar o dia da semana.
  - **12x36** = 1 dia trabalha / 1 folga, com turno de 12 h (trabalha 12 h, descansa 36 h). Já vem cadastrado.
  - **6x1** = 6 trabalha / 1 folga. O ciclo tem 7 dias, então a folga cai **sempre no mesmo dia da semana**
    (definido pela data de início do ciclo). Para espalhar as folgas, gere grupos com datas de início diferentes. Já vem cadastrado.
  - **4x2** = 4 trabalha / 2 folga (exemplo para cadastrar).
- **Semanal** — dias fixos da semana.
  - **5x2** = segunda a sexta. Já vem cadastrado.
  - **6x1 fixo** = segunda a sábado (exemplo para cadastrar).

### Data de início do ciclo (o ponto que mais gera dúvida)
É o **primeiro dia de trabalho** do ciclo. Duas pessoas no 12x36 com inícios em dias seguidos **se revezam** e cobrem
todos os dias. Para continuar a escala do mês anterior, informe um dia em que a pessoa **trabalhou** no ciclo atual —
o sistema calcula a sequência para frente.

Exemplo (outubro/2026, 01/10 é quinta-feira):

| Dia | 01 | 02 | 03 | 04 | 05 | 06 | ... |
|---|---|---|---|---|---|---|---|
| Equipe A (início 01/10) | trabalha | folga | trabalha | folga | trabalha | folga | dias ímpares |
| Equipe B (início 02/10) | folga | trabalha | folga | trabalha | folga | trabalha | dias pares |

## 3. Perfis de acesso

| Perfil | Acesso | Pode |
|---|---|---|
| **Administrador** | Painel | Tudo: usuários, setores, turnos, padrões, funcionários, escalas, ausências, mensagens, conexão do WhatsApp, regras de lembrete, configurações do bot |
| **Gestor** | Painel | Funcionários, plantões, ausências e mensagens **só dos setores vinculados**. Vê (sem alterar) setores, turnos e padrões |
| **Funcionário** | Só WhatsApp | Recebe lembretes e consulta a escala pelo bot. **Não tem login** |

Se tiver credencial de gestor, mostre lado a lado o menu do admin e o do gestor.

## 4. Mapa das telas (percorra todas)

Menu lateral (no celular, botão ☰). Caminhos relativos à URL do painel:

| Grupo | Tela | Caminho | Quem vê | O que mostrar no tutorial |
|---|---|---|---|---|
| — | Login | `/login` | todos | Entrar; sessão de 12 h; bloqueio após 5 tentativas erradas em 1 min |
| — | Topo | — | todos | Status do WhatsApp, menu do usuário (**Trocar senha**, **Sair**), faixa vermelha quando o WhatsApp cai |
| Escala | Calendário | `/` | todos | Mês/Semana/Dia/Lista, filtros, cores, conflito ⚠, editar, arrastar, redimensionar, cancelar, excluir, **+ Novo plantão** |
| Escala | Gerar escala | `/gerador` | todos | Passo a passo completo (seção 5.6), prévia, conflitos, Pular × Substituir |
| Escala | Ausências | `/ausencias` | todos | Cadastro, filtros, efeito no calendário e no bot |
| Cadastros | Funcionários | `/funcionarios` | todos | Formato do telefone, "Será salvo como +55...", busca e filtros, ativo/inativo |
| Cadastros | Setores | `/setores` | admin altera | Criar/desativar |
| Cadastros | Turnos | `/turnos` | admin altera | Horário, cor, turno que vira a noite |
| Cadastros | Padrões de escala | `/padroes` | admin altera | Ciclo × Semanal |
| Cadastros | Usuários | `/usuarios` | só admin | Perfis, setores do gestor, redefinir senha, bloquear |
| WhatsApp | Mensagens | `/mensagens` | todos | Histórico, filtros, status OK/Falhou e motivo do erro |
| WhatsApp | Conexão | `/whatsapp` | só admin | QR Code, status. **Só mostrar — não desconectar** |
| WhatsApp | Regras de lembrete | `/regras-lembrete` | só admin | Antecedência × Véspera, variáveis, pré-visualização |
| WhatsApp | Configurações do bot | `/configuracoes` | só admin | Menu do bot, mensagem "sem turno", número desconhecido (ignorar/responder) |

Tire também capturas em **largura de celular** (ex.: 390 px) do calendário e de uma lista — o painel funciona no celular,
listas viram cartões e o calendário abre em Lista; no celular não dá para arrastar plantões.

## 5. Cenário de exemplo — configurar o sistema do zero

Use este cenário fictício como fio condutor do tutorial. Execute na ordem (é a ordem recomendada de cadastro) e
fotografe cada passo. Todos os nomes com `[TESTE]`.

**Empresa fictícia:** uma clínica com atendimento 24 h na enfermagem e portaria, e um setor administrativo em horário comercial.

### 5.1 Setores
- `[TESTE] Enfermagem`
- `[TESTE] Portaria`
- `[TESTE] Administrativo`

### 5.2 Turnos
| Nome | Início | Fim | Observação |
|---|---|---|---|
| `[TESTE] Plantão dia` | 07:00 | 19:00 | 12 h |
| `[TESTE] Plantão noite` | 19:00 | 07:00 | atravessa a meia-noite — termina no dia seguinte automaticamente |
| `[TESTE] Comercial` | 08:00 | 18:00 | |

Escolha cores diferentes e mostre como aparecem no calendário.

### 5.3 Padrões de escala
- Mostrar os que já vêm: **12x36** (ciclo 1/1), **6x1** (ciclo 6/1), **5x2** (semanal seg–sex).
- Criar `[TESTE] 4x2` — Ciclo, 4 trabalho / 2 folga.
- Criar `[TESTE] Seg a sáb` — Semanal, segunda a sábado.
- Explicar: o padrão diz **quais dias**; o horário vem do turno escolhido na hora de gerar.

### 5.4 Usuário gestor
- `[TESTE] Gestora Enfermagem`, e-mail de teste (pergunte ao usuário qual usar), perfil **Gestor**, setor
  `[TESTE] Enfermagem` marcado.
- Se possível, entrar com ele em outra aba/janela anônima e mostrar que só vê a Enfermagem. **Desative-o no fim.**

### 5.5 Funcionários
Somente **um** funcionário recebe o número de teste real; os demais são para mostrar a escala e precisam de telefone
válido — **pergunte ao usuário** se ele tem números de teste extras. Se não tiver, cadastre só um e explique os outros
no texto/tabela, ou cadastre-os e desative logo após as capturas (inativo não recebe lembrete).

| Nome | Setor | Cargo | Escala planejada |
|---|---|---|---|
| `[TESTE] Ana Souza` (número de teste) | Enfermagem | Técnica de enfermagem | 12x36 dia, Equipe A (início 01) |
| `[TESTE] Bruno Lima` | Enfermagem | Técnico de enfermagem | 12x36 dia, Equipe B (início 02) |
| `[TESTE] Carla Dias` | Enfermagem | Enfermeira | 12x36 noite, Equipe A |
| `[TESTE] Diego Rocha` | Portaria | Porteiro | 6x1, Plantão dia |
| `[TESTE] Elisa Melo` | Administrativo | Assistente | 5x2, Comercial |

Mostrar: digitar só DDD + celular com o 9 → o campo formata `(51) 99999-8888`; conferir a linha
"Será salvo como +55 (DD) ..."; erros de número sem o 9 / DDD inexistente / "Telefone já cadastrado para ...".
Lembrar o leitor: **cada funcionário deve salvar o número da empresa na agenda**.

### 5.6 Gerar a escala (o coração do tutorial — detalhe bem)
Use o **mês seguinte ao atual** (o gerador já vem com ele preenchido). Faça uma geração por grupo que segue o
**mesmo padrão + turno + início de ciclo**:

1. **12x36 dia – Equipe A:** Ana · padrão 12x36 · turno Plantão dia · início do ciclo = dia 1 do mês.
2. **12x36 dia – Equipe B:** Bruno · mesmo padrão e turno · início do ciclo = dia 2. → Mostrar no calendário que
   Ana e Bruno se alternam e o dia fica sempre coberto.
3. **12x36 noite:** Carla · Plantão noite · início dia 1. Mostrar no calendário o plantão que termina às 07:00 do dia seguinte.
4. **6x1:** Diego · 6x1 · Plantão dia. Mostrar o aviso "Folga fixa toda semana: …" abaixo da data de início do ciclo
   e, no calendário, a folga no mesmo dia da semana. Trocar a data de início para mostrar que a folga muda de dia.
5. **5x2:** Elisa · 5x2 · Comercial. Mostrar que sábados e domingos ficam livres.

Em cada geração, mostrar: **Pré-visualizar** (nada é gravado ainda) → total de plantões, resumo por funcionário
(plantões e horas), lista dia a dia → **Gerar N plantão(ões)** → resultado (criados / pulados / substituídos).
Limite: **93 dias** por geração. "Setor dos plantões" fica em "Setor de cada funcionário", salvo exceções.

**Demonstrar conflitos:** depois de gerar a Equipe A, cadastre uma ausência (5.7) para a Ana e rode de novo a prévia
do mesmo período → aparecem conflitos de **Sobreposição** (plantão já existe) e **Ausência**. Marque
"Mostrar só os plantões com conflito". Explique:
- **Pular** — não cria os conflitantes; os existentes ficam (mais seguro).
- **Substituir** — apaga os existentes que se sobrepõem e cria os novos. Dias de ausência são sempre pulados.
Para não duplicar, finalize essa demonstração escolhendo **Pular** (ou cancele sem gerar).

### 5.7 Ausências
- `[TESTE] Ana Souza` · **Férias** · do dia 12 ao dia 21 do mês gerado (data final inclusive).
- Mostrar no calendário: plantões dentro das férias ficam com **borda vermelha e ⚠** (passe o mouse para ver o motivo),
  **não geram lembrete** e **não são apagados sozinhos** — o RH decide: excluir, cancelar ou passar para outra pessoa.
- Mostrar também os tipos Atestado, Folga e Outro (só no formulário).

### 5.8 Operações no calendário
Com os plantões de teste:
- **Editar** — clicar no plantão; trocar o turno preenche o horário sozinho.
- **Troca de plantão** — no plantão da Ana dentro das férias, trocar o **Funcionário** para o Bruno (é assim que se faz
  cobertura/troca; o lembrete vai para a nova pessoa).
- **Arrastar** para outro dia e **redimensionar** puxando a borda de baixo (visões Semana/Dia; não funciona no celular).
- **Cancelar sem apagar** — Status **Cancelado**; some do calendário (a menos que marque "Mostrar cancelados") e não gera lembrete.
- **Excluir** — definitivo.
- **Plantão avulso** — **+ Novo plantão** ou clicar num horário vazio; Turno = **Horário avulso** com início e fim manuais
  (ex.: hora extra do Diego, sábado 08:00–12:00).
- **Filtros** por setor e funcionário; botões Mês/Semana/Dia/Hoje.
- Explicar: se mudar horário ou pessoa de um plantão já lembrado, o lembrete é enviado de novo para o novo horário.

### 5.9 Regras de lembrete (WhatsApp)
- Mostrar a regra que já vem: **"1 hora antes"** (Antecedência, 60 min).
- Demonstrar uma nova regra **sem salvar ativa**:
  - Nome `[TESTE] Véspera 18h` · tipo **Véspera** · horário 18:00 · texto de exemplo:
    ```
    Olá {nome}! Amanhã ({dia_semana}, {data}) você trabalha das {inicio} às {fim} — {turno}, setor {setor}.
    ```
  - Clicar nas variáveis para inseri-las e em **Pré-visualizar mensagem**. Se alguma variável aparecer entre chaves
    na prévia, está escrita errado.
- Tabela de variáveis: `{nome}`, `{data}` (dd/mm), `{dia_semana}`, `{inicio}`, `{fim}` (HH:mm), `{turno}`
  ("Horário avulso" se não houver), `{setor}`.
- Explicar: várias regras ativas = várias mensagens por plantão (ex.: véspera + 1 h antes); **sem regra ativa, nenhum
  lembrete sai**; antecedência em minutos (60 = 1 h, 1440 = 1 dia); texto de antecedência diz "hoje", de véspera diz
  "amanhã"; para pausar, desmarque **Regra ativa**; plantão criado em cima da hora pode perder o lembrete;
  **lembrete nunca é enviado duas vezes** e um lembrete que **falhou não é reenviado**.

### 5.10 Bot do WhatsApp (o que o funcionário vê)
Com o celular de teste do usuário (cadastrado como Ana), peça ao usuário para mandar mensagens ao número da empresa e
enviar as capturas/prints (ou transcreva as respostas):

| Envia | Recebe |
|---|---|
| qualquer texto (ex.: "oi") | o menu |
| `1` | próximo turno (data, dia da semana, horário, setor) |
| `2` | escala dos próximos 7 dias |
| `3` | escala dos próximos 30 dias (no fim do mês já mostra o mês seguinte) |
| outra coisa | o menu de novo |

Explicar: ausências aparecem na resposta e plantões dentro delas não são listados; o bot só responde a funcionários
**ativos**; número desconhecido → conforme **Configurações do bot** (Ignorar ou Responder com mensagem padrão, só na
primeira mensagem); bot não responde com o WhatsApp desconectado. Mostrar a tela **Configurações do bot** (Menu do bot,
Mensagem quando não há turno, número desconhecido) **sem salvar alterações**. As opções 1, 2 e 3 são fixas.

### 5.11 Mensagens (histórico)
- Filtrar pelo funcionário de teste e mostrar as mensagens recebidas/enviadas do teste do bot.
- Filtros: direção, origem (Lembrete/Bot), status (OK/Falhou), funcionário, período; clicar no texto mostra a mensagem completa.
- Tabela de erros comuns e o que fazer (WhatsApp desconectado → reconectar; número inválido → corrigir cadastro;
  "Envio interrompido" → pode ou não ter saído). Lembrete que falhou **não é reenviado**: avisar o funcionário por outro meio.
- **Recorte/borre** mensagens de funcionários reais.

### 5.12 Conexão do WhatsApp (só explicar)
Mostrar a tela no estado atual. Explicar com texto (sem executar): Conectar → QR Code → no celular do número dedicado,
WhatsApp › Configurações › Aparelhos conectados › Conectar um aparelho → status **Conectado**; QR expira, gerar outro;
faixa vermelha quando cai e botão **Conectar agora**; **Desconectar** só para trocar de número.
Boas práticas contra bloqueio: número dedicado (nunca pessoal), foto e nome da empresa no perfil, funcionários salvam o
número na agenda, mensagens personalizadas e poucas regras, nada de disparo em massa/grupos/propaganda, celular ligado.

### 5.13 Rotina mensal sugerida (fechamento do tutorial)
1. Até o dia 20: cadastrar férias/afastamentos do mês seguinte em **Ausências**.
2. **Gerar escala** do mês seguinte, grupo por grupo, usando como início do ciclo um dia trabalhado no ciclo atual.
3. Conferir o **Calendário** filtrando por setor; resolver os ⚠.
4. Durante o mês: trocas e coberturas editando o plantão; hora extra com plantão avulso.
5. Toda semana: olhar **Mensagens** filtrando por **Falhou** e o status do WhatsApp no topo.

## 6. Estrutura esperada do tutorial

Escreva em português do Brasil, linguagem simples (o público é RH, não técnico), frases curtas, passos numerados,
nome exato dos botões em **negrito**, uma captura por passo importante.

```
TUTORIAL.md
1. O que é o sistema e quem usa (admin, gestor, funcionário)
2. Conceitos: setor, turno, padrão, plantão, escala, ausência, lembrete, bot (+ fórmula e tabela 12x36 A/B)
3. Primeiro acesso, troca de senha, como navegar (inclusive no celular)
4. Configuração inicial passo a passo (cenário da clínica): setores → turnos → padrões → usuários → funcionários
5. Montando a escala do mês: gerador, prévia, conflitos, Pular × Substituir
6. Calendário no dia a dia: editar, trocar, arrastar, cancelar, excluir, plantão avulso
7. Ausências
8. WhatsApp: conexão, regras de lembrete, variáveis, bot, configurações do bot
9. Histórico de mensagens e o que fazer quando falha
10. Rotina mensal do RH
11. Perguntas frequentes (use as do docs/09-guia-rh.md e acrescente as dúvidas que surgirem ao percorrer o sistema)
Anexo: divergências encontradas entre este roteiro e o sistema real / sugestões de melhoria
tutorial/img/NN-descricao.png
```

## 7. Limpeza no final (confirme com o usuário antes)

1. Excluir os plantões e ausências `[TESTE]` (filtrar o calendário pelos funcionários de teste).
2. Desativar funcionários, usuário gestor, turnos, padrões e setores `[TESTE]` (não há exclusão nesses cadastros).
3. Excluir ou deixar inativa a regra `[TESTE] Véspera 18h`, se tiver sido salva.
4. Conferir que a regra **"1 hora antes"** e as **Configurações do bot** continuam como estavam.
5. Relatar ao usuário o que foi criado, o que foi limpo e o que ficou (registros desativados continuam no histórico).
