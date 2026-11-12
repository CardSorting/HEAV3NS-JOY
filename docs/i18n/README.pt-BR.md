<!-- [LAYER: UI] -->
# HEAV3NS-JOY: Framework de Soberania Arquitetural e Controle de Entropia Estrutural

[English](../../README.md) · [Outros idiomas](README.md) · [Guia de Início](../GETTING_STARTED.md) · [Protocolo de Agentes](../../AGENTS.md)

> *“Não construa mais um lugar onde os agentes executam. Construa algo que os agentes possam aprender, transportar e reproduzir independentemente em qualquer lugar.”*

**Em uma frase:** HEAV3NS-JOY mantém seus repositórios arquiteturalmente honestos (código humano e gerado por IA) usando uma convenção mínima e um verificador com zero dependências.

---

## A ideia em 60 segundos

| Dimensão | Detalhes |
| :--- | :--- |
| **O que é** | Uma convenção e uma ferramenta de auditoria sem dependências. Cada arquivo declara uma das cinco zonas canônicas (`DOMAIN`, `CORE`, `INFRASTRUCTURE`, `PLUMBING`, `UI`) no cabeçalho inicial. |
| **Por que** | A arquitetura degrada em silêncio, e agentes de IA aceleram essa degradação. Tornar a estrutura verificável por máquinas impede a corrupção no commit, não numa reescrita tardia. |
| **Como** | Posicione cada arquivo na pasta da sua zona, importe somente nas direções permitidas e execute `node bin/joy-check.mjs .`. Código de saída `0` indica conformidade total. |
| **Custo** | **Zero dependências externas**, sem contas, sem rede, somente leitura por padrão. |

### Analogia do Restaurante

Pense no código como um restaurante:
- **A cozinha (`DOMAIN`)**: Prepara pratos puros e regras de negócio; jamais liga para fornecedores no meio do preparo.
- **A coordenação (`CORE`)**: Gerencia pedidos e orquestração de casos de uso.
- **Os fornecedores (`INFRASTRUCTURE`)**: Adaptadores para sistema de arquivos, HTTP e banco de dados.
- **O salão (`UI`)**: Atende clientes e renderiza interfaces; nunca entra na despensa.
- **O encanamento (`PLUMBING`)**: Funções utilitárias puras sem estado e totalmente isoladas.

---

## As Cinco Zonas Canônicas

| Zona | Diretório | Responsabilidade | Regra Rígida |
| :--- | :--- | :--- | :--- |
| `DOMAIN` | `src/domain/` | Regras de negócio, entidades, contratos `I*` | **0% de entropia I/O**; proibido importar infra ou UI |
| `CORE` | `src/core/` | Casos de uso, orquestração, fluxos | Proibido importar UI; integra com infra via interfaces |
| `INFRASTRUCTURE` | `src/infrastructure/` | Adaptadores de fs, rede, banco de dados | Proibido importar UI; implementa contratos de Domain |
| `PLUMBING` | `src/plumbing/` | Criptografia, utilitários sem estado | Camada folha; proibido importar qualquer outra zona |
| `UI` | `src/ui/` | Apresentadores CLI, rotas HTTP, visualizações | Proibido importar infraestrutura diretamente |

---

## Início Rápido (2 minutos)

Nenhum `npm install` é necessário (apenas Node.js 18+ e git):

```bash
git clone https://github.com/CardSorting/HEAV3NS-JOY.git
cd HEAV3NS-JOY

# 1. Executar suíte de testes (196 testes passam)
npm test

# 2. Auditar conformidade arquitetural
npm run joy-check

# 3. Configurar agentes de IA (Claude, Cursor, Antigravity, etc.)
npx heav3ns-joy init
```

Consulte o [Portal de Documentação](../README.md) e o [Modelo Canônico](../../spec/00-CANONICAL-MODEL.md).

