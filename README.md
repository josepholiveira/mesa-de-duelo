# Mesa de Duelo

Simulador de partidas de Magic: The Gathering contra uma IA ou contra outra pessoa pela rede, no navegador, com cartas reais buscadas no [Scryfall](https://scryfall.com/docs/api). Visual inspirado em uma partida do MTG Arena.

As regras, as cartas e a IA são do [Forge](https://github.com/Card-Forge/forge), que roda numa ponte em Java (`forge-bridge/`). O navegador só desenha a mesa e manda os cliques. Veja `forge-bridge/README.md`.

## Instalação

### Requisitos

- [Node.js](https://nodejs.org) 18 ou mais recente (com npm) e Git
- JDK 17 ou mais recente, Maven 3.9+ e cerca de 2 GB de RAM livre para a ponte

No Ubuntu/Debian, Java e Maven saem com `sudo apt install openjdk-17-jdk maven`. Confira com `java -version` e `mvn -v`.

### 1. Baixar e instalar

```bash
git clone https://github.com/kassiogluten/mesa-de-duelo.git
cd mesa-de-duelo
npm install
npm run forge:instalar   # só uma vez: clona o Forge em ~/forge, compila e instala no ~/.m2 (demora vários minutos)
```

### 2. Rodar

Em dois terminais:

```bash
npm run forge      # sobe a ponte em ws://127.0.0.1:7171/ws
npm run dev        # abre o site em http://localhost:5173
```

Na tela inicial, escolha um deck e jogue contra a IA. Abrir com `#jogar` no fim do endereço começa uma partida direto. As imagens e os nomes em português vêm do Scryfall, então o primeiro carregamento de cada deck precisa de internet. Depois eles ficam em cache no navegador.

- Para instalar o Forge em outro lugar, rode `FORGE_DIR=/caminho npm run forge:instalar` e depois `MAVEN_OPTS="-Xmx2g -Dforge.dir=/caminho" npm run forge`.
- A ponte depende da versão do Forge em `forge.version` no `forge-bridge/pom.xml`. Se o `forge:instalar` mostrar outra versão no final (`Forge X instalado em ...`), ajuste esse campo para a versão mostrada.
- Detalhes da ponte e do protocolo estão em `forge-bridge/README.md`.

### Outros comandos

```bash
npm run build      # checagem de tipos + build de produção em dist/
npm run preview    # serve o build de dist/
```

## Partida em rede

Dois jogadores, cada um no seu navegador. Uma máquina (o anfitrião) roda a ponte e o site:

```bash
npm run forge:rede   # ponte aceitando conexões de outras máquinas (0.0.0.0:7171)
npm run dev:rede     # site acessível pela rede (Vite com --host)
```

1. Os dois abrem `http://IP-DO-ANFITRIÃO:5173`, escolhem o deck e o modo **Em rede**.
2. Um clica em **Criar sala** e passa o código de 4 letras; o outro digita o código e clica em **Entrar**. A partida começa na hora.
3. O campo **Ponte** já aponta para a máquina que serviu a página; mude só se a ponte estiver em outro lugar (por exemplo `ws://203.0.113.5:7171/ws`).

Se a conexão cair, o navegador volta sozinho ao mesmo assento, inclusive depois de recarregar a página ou fechar e abrir a aba de novo (a partida fica guardada no `localStorage`). Vale também para partidas contra a IA. A ponte guarda uma partida sem ninguém conectado por 5 minutos (`-Dmesa.grace=SEGUNDOS` em `MAVEN_OPTS` muda isso). No fim, a revanche começa quando os dois pedirem. Fora da rede local é preciso liberar a porta 7171 (e a 5173, se o oponente for abrir o site do anfitrião) no roteador ou usar uma VPN como Tailscale. A ponte não tem senha nem criptografia: só abra para fora em quem você confia.

## Estrutura

| Caminho | O que faz |
|---|---|
| `src/scryfall.ts` | Cliente da API com intervalo entre requisições e cache no `localStorage`. |
| `src/cards.ts` | Dados de exibição de uma carta do Scryfall (nome em português, tipo, cores, imagens). |
| `src/decks.ts` | Decks padrão e decks salvos pelo jogador. |
| `src/ui/` | Telas: início, mesa (`forgeTable.ts`) e montador de decks. |
| `src/forge/client.ts` | Cliente WebSocket da ponte e tipos do protocolo (inclusive salas em rede). |
| `forge-bridge/` | Ponte em Java para o Forge (licença GPL-3.0). |

Cartas aparecem em português (nome, tipo e imagem da impressão PT do Scryfall) quando existe tradução; sem ela, ficam em inglês.

Magic: The Gathering é marca da Wizards of the Coast. Projeto de fã, sem afiliação. Dados e imagens fornecidos pelo Scryfall.
