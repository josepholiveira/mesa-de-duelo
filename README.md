# Mesa de Duelo

Simulador de partidas de Magic: The Gathering contra uma IA ou contra outra pessoa pela rede, no navegador, com cartas reais buscadas no [Scryfall](https://scryfall.com/docs/api). Visual inspirado em uma partida do MTG Arena.

Há dois motores de regras, escolhidos na tela inicial:

- **Navegador** (`src/engine`): regras básicas escritas aqui, funciona sem instalar nada.
- **Forge** (`forge-bridge/`): o motor completo do [Forge](https://github.com/Card-Forge/forge), com pilha, todas as cartas e uma IA melhor. Roda numa ponte em Java e o navegador só desenha a mesa. Veja `forge-bridge/README.md`.

## Instalação

### Requisitos

| Para | Precisa de |
|---|---|
| Motor do navegador | [Node.js](https://nodejs.org) 18 ou mais recente (com npm) e Git |
| Motor Forge (opcional) | Também JDK 17 ou mais recente, Maven 3.9+ e cerca de 2 GB de RAM livre para a ponte |

No Ubuntu/Debian, o necessário para o Forge sai com `sudo apt install openjdk-17-jdk maven`. Confira com `java -version` e `mvn -v`.

### 1. Baixar e rodar o site

```bash
git clone https://github.com/kassiogluten/mesa-de-duelo.git
cd mesa-de-duelo
npm install
npm run dev        # abre em http://localhost:5173
```

Na tela inicial, escolha um deck e o motor **Navegador** para jogar contra a IA. Abrir com `#jogar` no fim do endereço começa uma partida direto. As cartas vêm do Scryfall, então o primeiro carregamento de cada deck precisa de internet. Depois elas ficam em cache no navegador.

### 2. Motor Forge (opcional)

O Forge entende todas as cartas e é necessário para os decks marcados como **só no Forge** e para as partidas em rede.

```bash
npm run forge:instalar   # só uma vez: clona o Forge em ~/forge, compila e instala no ~/.m2 (demora vários minutos)
npm run forge            # sobe a ponte em ws://127.0.0.1:7171/ws
```

Com a ponte e o `npm run dev` rodando ao mesmo tempo (em dois terminais), escolha **Forge** na tela inicial ou abra com `#forge`.

- Para instalar o Forge em outro lugar, rode `FORGE_DIR=/caminho npm run forge:instalar` e depois `MAVEN_OPTS="-Xmx2g -Dforge.dir=/caminho" npm run forge`.
- A ponte depende da versão do Forge em `forge.version` no `forge-bridge/pom.xml`. Se o `forge:instalar` mostrar outra versão no final (`Forge X instalado em ...`), ajuste esse campo para a versão mostrada.
- Detalhes da ponte e do protocolo estão em `forge-bridge/README.md`.

### Outros comandos

```bash
npm test           # testes do motor do navegador (sem rede)
npm run build      # checagem de tipos + build de produção em dist/
npm run preview    # serve o build de dist/
```

## Partida em rede

Dois jogadores, cada um no seu navegador, com o motor Forge. Uma máquina (o anfitrião) roda a ponte e o site:

```bash
npm run forge:rede   # ponte aceitando conexões de outras máquinas (0.0.0.0:7171)
npm run dev:rede     # site acessível pela rede (Vite com --host)
```

1. Os dois abrem `http://IP-DO-ANFITRIÃO:5173`, escolhem o deck e o modo **Em rede**.
2. Um clica em **Criar sala** e passa o código de 4 letras; o outro digita o código e clica em **Entrar**. A partida começa na hora.
3. O campo **Ponte** já aponta para a máquina que serviu a página; mude só se a ponte estiver em outro lugar (por exemplo `ws://203.0.113.5:7171/ws`).

Se a conexão cair, o navegador volta sozinho ao mesmo assento, inclusive depois de recarregar a página ou fechar e abrir a aba de novo (a partida fica guardada no `localStorage`). Vale também para partidas contra a IA no Forge. A ponte guarda uma partida sem ninguém conectado por 5 minutos (`-Dmesa.grace=SEGUNDOS` em `MAVEN_OPTS` muda isso). No fim, a revanche começa quando os dois pedirem. Fora da rede local é preciso liberar a porta 7171 (e a 5173, se o oponente for abrir o site do anfitrião) no roteador ou usar uma VPN como Tailscale. A ponte não tem senha nem criptografia: só abra para fora em quem você confia.

## Estrutura

| Caminho | O que faz |
|---|---|
| `src/engine/types.ts` | Tipos do jogo: carta, jogador, efeitos, fases. |
| `src/engine/parse.ts` | Converte uma carta do Scryfall em `CardDef` e decide se o motor a suporta. |
| `src/engine/rules.ts` | Regras puras: palavras-chave, quem pode atacar/bloquear, previsão de combate. |
| `src/engine/mana.ts` | Resolve o pagamento de custos com reserva de mana e fontes (inclui terrenos de duas cores). |
| `src/engine/game.ts` | Estado da partida, estrutura de turno, conjuração, combate e entrada do jogador. |
| `src/engine/ai.ts` | Decisões da IA: terreno, mágicas, ataques, bloqueios e truques de combate. |
| `src/scryfall.ts` | Cliente da API com intervalo entre requisições e cache no `localStorage`. |
| `src/decks.ts` | Decks padrão e decks salvos pelo jogador. |
| `src/ui/` | Telas: início, mesa (`table.ts`, motor do navegador), mesa do Forge (`forgeTable.ts`) e montador de decks. |
| `src/forge/client.ts` | Cliente WebSocket da ponte e tipos do protocolo (inclusive salas em rede). |
| `forge-bridge/` | Ponte em Java para o Forge (licença GPL-3.0). |

## O que o motor do navegador entende

- Terrenos básicos e terrenos com `{T}: Add {X}` (inclusive "X ou Y" e "entra virado").
- Criaturas com Voar, Alcance, Ímpeto, Vigilância, Atropelar, Toque Mortífero, Vínculo com a Vida, Iniciativa, Golpe Duplo, Defensor e Ameaçar; criaturas de mana; "quando entra" com dano, compra de cartas ou ganho de vida.
- Mágicas instantâneas e feitiços com dano (qualquer alvo, criatura, jogador, cada oponente), +N/+N até o fim do turno, luta, destruir criatura, comprar cartas e ganhar vida.

Qualquer carta com texto fora disso aparece como **só no Forge** no montador de decks e é ignorada nas partidas com o motor do navegador. Para suportar uma nova habilidade, adicione o padrão em `parseEffect` (`src/engine/parse.ts`) e a resolução em `Game.resolveEffect`.

## Limitações do motor do navegador

- Sem pilha: cada mágica resolve na hora. Instantâneas só podem ser conjuradas na sua fase principal e na janela antes do dano de combate.
- Sem mulligan. O atacante não escolhe a ordem de dano entre vários bloqueadores.
- Cartas aparecem em português (nome, tipo e imagem da impressão PT do Scryfall) quando existe tradução; sem ela, ficam em inglês. As regras sempre leem o texto Oracle em inglês.

Magic: The Gathering é marca da Wizards of the Coast. Projeto de fã, sem afiliação. Dados e imagens fornecidos pelo Scryfall.
