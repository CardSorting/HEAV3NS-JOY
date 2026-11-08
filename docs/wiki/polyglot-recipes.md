<!-- [LAYER: UI] -->
# Polyglot Joyzoning Cookbook

<p align="center">
  <a href="README.md">Wiki Home</a> ·
  <a href="../README.md">Docs Hub</a> ·
  <a href="../../spec/01-SYNTAX-AND-HEADERS.md">Header Spec</a> ·
  <a href="../../examples/typescript/violations-and-fixes.md">TS Examples</a> ·
  <a href="../playbooks/brownfield-migration-and-monorepo-rollout.md">Brownfield Playbook</a>
</p>

**Joyzoning** is language-agnostic. The single-pass polyglot scanner ([`codeTokenizer.mjs`](../../src/plumbing/codeTokenizer.mjs) + [`sourceScanner.mjs`](../../src/plumbing/sourceScanner.mjs)) natively understands **TypeScript, JavaScript, Python, Go, Rust, Java, C/C++, Protobuf, SQL, Lua, Haskell, Shell, Ruby, YAML, HTML, Vue, Svelte, and Markdown**.

---

## 1. Multi-language `[LAYER: <ZONE>]` header cheat sheet

Place the header on line 1 (or immediately after a `#!/usr/bin/env ...` shebang or `---` YAML frontmatter block) within the first `10,000` characters:

| Language Family | Extensions | Header Syntax (`DOMAIN` example) |
| :--- | :--- | :--- |
| **TypeScript / JS / Java** | `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.java` | `/** [LAYER: DOMAIN] */` |
| **Python / Shell / Ruby / YAML** | `.py`, `.sh`, `.bash`, `.zsh`, `.rb`, `.yaml`, `.yml` | `# [LAYER: DOMAIN]` |
| **Go / Rust / C / C++ / Proto** | `.go`, `.rs`, `.c`, `.cpp`, `.h`, `.hpp`, `.proto` | `// [LAYER: DOMAIN]` |
| **SQL / Lua / Haskell** | `.sql`, `.lua`, `.hs` | `-- [LAYER: DOMAIN]` |
| **Markdown / HTML / Vue / Svelte** | `.md`, `.html`, `.vue`, `.svelte` | `<!-- [LAYER: UI] -->` |

> [!TIP]
> You never need to memorize comment styles when onboarding an existing directory: run `node bin/joy-check.mjs <dir> --heal` and [`RefactorHealer`](../../src/core/RefactorHealer.mjs) stamps the language-appropriate header automatically.

---

## 2. Dependency Inversion (`I<ClassName>`) across languages

### TypeScript / ECMAScript Modules (`.ts` / `.mjs`)

See runnable example in [`examples/typescript/`](../../examples/typescript/src/index.mjs):

```ts
// 1. Contract in src/domain/interfaces/IOrderRepository.ts
/** [LAYER: DOMAIN] */
import type { Order } from "../Order.ts";
export interface IOrderRepository {
  save(order: Order): Promise<void>;
}

// 2. Adapter in src/infrastructure/FileOrderRepository.ts
/** [LAYER: INFRASTRUCTURE] */
import fs from "node:fs/promises";
import type { IOrderRepository } from "../domain/interfaces/IOrderRepository.ts";
import type { Order } from "../domain/Order.ts";

export class FileOrderRepository implements IOrderRepository {
  async save(order: Order): Promise<void> {
    await fs.writeFile(`/tmp/${order.id}.json`, JSON.stringify(order));
  }
}

// 3. Use-Case in src/core/PlaceOrderController.ts
/** [LAYER: CORE] */
import type { IOrderRepository } from "../domain/interfaces/IOrderRepository.ts";
import { Order } from "../domain/Order.ts";

export class PlaceOrderController {
  constructor(private readonly repo: IOrderRepository) {}
  async execute(id: string, cents: number): Promise<Order> {
    const order = new Order(id, cents);
    await this.repo.save(order);
    return order;
  }
}
```

### Python (`examples/polyglot/python/`)

See runnable example in [`examples/polyglot/python/domain/order.py`](../../examples/polyglot/python/domain/order.py):

```python
# [LAYER: DOMAIN]
from dataclasses import dataclass
from typing import Protocol
from ..plumbing.money_math import clamp_cents

@dataclass(frozen=True)
class Order:
    order_id: str
    total_cents: int

class IOrderRepository(Protocol):
    def save(self, order: Order) -> None: ...
```

### Go (`examples/polyglot/go/`)

See runnable example in [`examples/polyglot/go/domain/order.go`](../../examples/polyglot/go/domain/order.go):

```go
// [LAYER: DOMAIN]
package domain

type Order struct {
    ID         string
    TotalCents int
}

type IOrderRepository interface {
    Save(order Order) error
}
```

### Rust (`examples/polyglot/rust/`)

See runnable example in [`examples/polyglot/rust/domain/order.rs`](../../examples/polyglot/rust/domain/order.rs):

```rust
// [LAYER: DOMAIN]
pub struct Order {
    pub id: String,
    pub total_cents: i64,
}

pub trait IOrderRepository {
    fn save(&self, order: &Order) -> Result<(), String>;
}
```

---

## 3. How `SpiderEngine` resolves polyglot imports & aliases

[`NodeWorkspaceScanner.mjs`](../../src/infrastructure/NodeWorkspaceScanner.mjs) and [`SpiderEngine.mjs`](../../src/core/SpiderEngine.mjs) automatically load workspace alias manifests so cross-zone imports are checked even when you don't use relative `../` paths:

| Ecosystem | Config Read Automatically | Resolved Specifier Patterns |
| :--- | :--- | :--- |
| **TypeScript / JS** | `tsconfig.json` / `jsconfig.json` (`compilerOptions.paths`), `package.json` (`imports`) | `@domain/*`, `@core/*`, `#domain/*`, `./rel/path` |
| **Python** | Relative & package module dots | `from ..plumbing.math import x`, `import src.domain.order` |
| **Go** | `go.mod` (`module <name>`) | `"<module>/src/domain"`, `"<module>/domain"` |
| **Rust** | `Cargo.toml` (`src/lib.rs`, `mod.rs`) | `use crate::domain::order::Order;`, `use super::plumbing::*;` |

