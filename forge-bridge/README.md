# forge-bridge

Ponte entre o motor de regras do [Forge](https://github.com/Card-Forge/forge) e o frontend da Mesa de Duelo. O Forge roda sem tela, em Java. O navegador recebe o estado da partida em JSON e manda de volta os cliques e as respostas, por WebSocket.

Licença: **GPL-3.0-or-later**, a mesma do Forge (veja `LICENSE`). A ponte usa o código do Forge como biblioteca, então é uma obra derivada dele. O frontend em `../src` só conversa com ela pela rede.

## Instalação

Precisa de JDK 17 ou mais recente e de Maven.

```bash
./scripts/instalar-forge.sh   # clona o Forge em ~/forge (ou $FORGE_DIR), compila e instala no ~/.m2
./scripts/rodar.sh            # sobe a ponte em ws://127.0.0.1:7171/ws (modo play)
./scripts/rodar.sh --host=0.0.0.0   # idem, aceitando outras máquinas (partidas em rede)
```

Pela raiz do projeto, os mesmos comandos são `npm run forge:instalar` e `npm run forge`.

- O `instalar-forge.sh` corrige os poms instalados. O Forge usa a versão `${revision}` sem o flatten-maven-plugin, e sem essa correção o Maven não resolve a dependência fora do projeto do Forge.
- A ponte lê as cartas de `~/forge/forge-gui/res`. Para usar outro lugar, rode com `-Dforge.dir=...`.
- As preferências e os logs do Forge ficam em `~/.forge`.

## Modos

| Comando | O que faz |
|---|---|
| `./scripts/rodar.sh` | **play**: humano x IA (`start`) e humano x humano em salas (`host`/`join`). Cada conexão joga a sua partida. |
| `./scripts/rodar.sh --mode=watch --a=verde --b=vermelho --delay=150` | **watch**: partidas IA x IA, transmitindo o estado a cada evento. Útil para depurar o JSON. |
| `--lang=en-US` | Idioma dos prompts do Forge (padrão `pt-BR`). |
| `--port=7171` | Porta da WebSocket. |
| `--host=127.0.0.1` | Endereço em que a ponte escuta. Use `0.0.0.0` para partidas em rede (`npm run forge:rede`). |

## Protocolo

### Servidor → navegador

```jsonc
{
  "type": "state",
  "turn": 3, "phase": "MAIN1", "activePlayer": 0, "gameOver": false, "winner": null,
  "you": 0,
  "players": [{ "id": 0, "name": "Você", "life": 20, "library": 30, "handCount": 6,
                "hand": [/* cartas; vazio para o oponente */], "battlefield": [], "graveyard": [], "exile": [],
                "pool": { "W": 0, "U": 0, "B": 0, "R": 0, "G": 1, "C": 0 } }],
  "stack": [{ "id": 12, "text": "...", "source": { /* carta */ }, "controller": 1 }],
  "combat": [{ "attacker": 40, "defender": 0, "blockers": [33] }],
  "log": ["..."],
  "input": { "message": "Prioridade: Você ...", "ok": { "label": "OK", "enabled": true },
             "cancel": { "label": "Fim de Turno", "enabled": true }, "selectable": [29, 31] },
  "question": null,
  "session": { "code": "K7QM", "token": "...", "room": true }, // para voltar com "rejoin" se a conexão cair
  "room": null, // em rede: { "code": "K7QM", "seat": 0, "token": "...", "started": true,
                //            "players": [{ "name": "Ana", "connected": true, "rematch": false }] }
  "decks": ["vermelho", "verde", "azorius"]
}
```

Cada carta tem: `id`, `name` (em inglês, usado para buscar a imagem no Scryfall), `set`, `manaCost`, `typeLine`, `text`, `creature`, `land`, `power`, `toughness`, `damage`, `tapped`, `sick`, `attacking`, `blocking` e `counters`.

`question` aparece quando o Forge precisa de uma decisão e a partida fica parada até a resposta:

| `kind` | Campos | Resposta |
|---|---|---|
| `choose` | `title`, `min`, `max`, `options[]` (`label`, e `card` ou `id` de jogador) | `{type:"answer", id, indices:[...]}` |
| `confirm` | `title`, `options` (rótulos sim/não), `card?` | `{type:"answer", id, value:true}` |
| `order` | `title`, `options[]` | `{type:"answer", id, indices:[nova ordem]}` |
| `text` | `title`, `initial`, `numeric` | `{type:"answer", id, text:"3"}` |

Também chegam `{type:"toast", text}` com mensagens do Forge e `{type:"error", text}` quando um comando falha. Em rede chega `{type:"room", room}` ao criar, entrar ou voltar para uma sala, com o mesmo formato do campo `room`.

A mão do oponente vai só como contagem, as perguntas vão só para quem precisa responder, e um clique numa carta da mão do outro jogador é ignorado.

### Navegador → servidor

| Mensagem | Efeito |
|---|---|
| `{type:"start", you, opponent}` | Começa uma partida contra a IA. Cada deck é um id padrão (`"verde"`) ou `{name, cards:[{name, count}]}`. |
| `{type:"host", name, deck}` | Cria uma sala em rede e responde com `room` (código de 4 letras). |
| `{type:"join", code, name, deck}` | Entra na sala; com os dois assentos ocupados, a partida começa. |
| `{type:"rejoin", code, token}` | Volta ao assento depois de a conexão cair, em sala ou contra a IA (`code` e `token` vêm em `session`). Se a partida não existe mais, a resposta é `{type:"gone", text}`; se outra conexão ocupava o assento, ela recebe `{type:"replaced", text}` e é fechada. |
| `{type:"rematch"}` | Contra a IA recomeça na hora; em rede, quando os dois pedirem. |
| `{type:"leave"}` | Concede e sai da sala. A sala fecha quando não sobra ninguém conectado. |
| `{type:"card", id}` | Clica numa carta: jogar, conjurar, escolher alvo, atacar, bloquear ou pagar mana. |
| `{type:"player", id}` | Clica num jogador, por exemplo como alvo. |
| `{type:"ok"}` / `{type:"cancel"}` | Os dois botões do Forge; os rótulos vêm em `input`. |
| `{type:"concede"}` | Desiste da partida. |
| `{type:"answer", ...}` | Responde à `question` aberta. |

## Como funciona

- `HeadlessGui` faz o papel de interface sem tela. Ela tem sua própria thread de "interface", porque as entradas do jogador humano exigem que a thread do jogo seja outra.
- `WebGuiGame` estende o `ProtocolGuiGame` do Forge, que já transforma cada chamada da tela num evento. Ele também define as paradas de fase: na sua fase principal 1 e 2 e na janela depois dos bloqueios.
- `Session` é uma partida: um ou dois assentos humanos (`Seat`), cada um com o seu `WebGuiGame`, prompt, perguntas e conexão. Ela monta o estado visto por cada jogador. Os cliques do navegador são repassados ao `PlayerControllerHuman` do assento, sempre pela thread de interface.
- `Rooms` liga cada conexão a uma `Session`, cuida das salas (códigos, reconexão, revanche) e publica o estado a cada 50 ms. Uma partida sem ninguém conectado é encerrada depois de 5 minutos (`-Dmesa.grace=SEGUNDOS`).
- A distribuição de dano de combate entre vários bloqueadores é feita automaticamente: dano letal em cada um, na ordem, e o resto vai para o jogador quando há atropelar.
