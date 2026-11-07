<!-- [LAYER: UI] -->
# Joyzoning Violations & Fixes Reference Catalog

This reference provides side-by-side **Non-Conformant (Before)** and **Conformant (After)** code examples for the most common Joyzoning violations.

---

## 1. `SPI-206`: Domain I/O Impurity (`DOMAIN` importing `fs` or `http`)

### ❌ Incorrect (`src/domain/Invoice.ts` performs filesystem I/O)
```ts
/** [LAYER: DOMAIN] */
import fs from "node:fs"; // ❌ VIOLATION [SPI-206]: Forbidden I/O import in DOMAIN

export class Invoice {
  constructor(public id: string, public amount: number) {}

  saveToDisk() {
    fs.writeFileSync(`/tmp/invoice-${this.id}.json`, JSON.stringify(this));
  }
}
```

### ✅ Correct (Extract contract to `domain/interfaces/` and I/O to `infrastructure/`)
```ts
// src/domain/interfaces/IInvoiceStore.ts
/** [LAYER: DOMAIN] */
export interface IInvoiceStore {
  save(id: string, payload: { id: string; amount: number }): Promise<void>;
}

// src/domain/Invoice.ts
/** [LAYER: DOMAIN] */
export class Invoice {
  constructor(public readonly id: string, public readonly amount: number) {}

  calculateTax(rate: number): number {
    return Math.round(this.amount * rate);
  }
}

// src/infrastructure/FileInvoiceStore.ts
/** [LAYER: INFRASTRUCTURE] */
import fs from "node:fs/promises";
import type { IInvoiceStore } from "../domain/interfaces/IInvoiceStore.js";

export class FileInvoiceStore implements IInvoiceStore {
  async save(id: string, payload: { id: string; amount: number }): Promise<void> {
    await fs.writeFile(`/tmp/invoice-${id}.json`, JSON.stringify(payload), "utf8");
  }
}
```

---

## 2. `SPI-206`: Direct `UI -> INFRASTRUCTURE` Shortcut

### ❌ Incorrect (`src/ui/UserProfileView.ts` imports `SqlUserRepository` directly)
```ts
/** [LAYER: UI] */
import { SqlUserRepository } from "../infrastructure/SqlUserRepository.js"; // ❌ VIOLATION [SPI-206]

export async function renderUserProfile(userId: string) {
  const repo = new SqlUserRepository();
  const user = await repo.findById(userId);
  return `<h1>${user.name}</h1>`;
}
```

### ✅ Correct (Route `UI` through a `CORE` controller)
```ts
// src/ui/UserProfileView.ts
/** [LAYER: UI] */
import type { UserController } from "../core/UserController.js";

export async function renderUserProfile(controller: UserController, userId: string) {
  const user = await controller.getUserProfile(userId);
  return `<h1>${user.name}</h1>`;
}
```

---

## 3. `SPI-201`: Runtime Circular Dependency (`A <-> B`)

### ❌ Incorrect (`OrderService.ts` and `PaymentProcessor.ts` import each other)
```ts
// src/core/OrderService.ts
/** [LAYER: CORE] */
import { PaymentProcessor } from "./PaymentProcessor.js"; // Cycle A -> B

export class OrderService {
  processor = new PaymentProcessor(this);
  markPaid(id: string) { /* ... */ }
}

// src/core/PaymentProcessor.ts
/** [LAYER: CORE] */
import { OrderService } from "./OrderService.js"; // ❌ VIOLATION [SPI-201]: Cycle B -> A

export class PaymentProcessor {
  constructor(private orders: OrderService) {}
  charge(id: string) {
    this.orders.markPaid(id);
  }
}
```

### ✅ Correct (`DECOUPLE` SOP: Extract `IOrderStateMutator` to `src/domain/interfaces/`)
```ts
// src/domain/interfaces/IOrderStateMutator.ts
/** [LAYER: DOMAIN] */
export interface IOrderStateMutator {
  markPaid(id: string): void;
}

// src/core/PaymentProcessor.ts
/** [LAYER: CORE] */
import type { IOrderStateMutator } from "../domain/interfaces/IOrderStateMutator.js";

export class PaymentProcessor {
  constructor(private orders: IOrderStateMutator) {}
  charge(id: string) {
    this.orders.markPaid(id);
  }
}
```

---

## 4. `SPI-205`: Mutable State & Upward Imports in `PLUMBING`

### ❌ Incorrect (`src/plumbing/idGenerator.ts` holds mutable `let` state and imports `domain`)
```ts
/** [LAYER: PLUMBING] */
import { Order } from "../domain/Order.js"; // ❌ VIOLATION [SPI-206]: Plumbing cannot import Domain

let sequenceCounter = 0; // ❌ VIOLATION [SPI-205]: Mutable top-level let in Plumbing

export function nextOrderId(order: Order): string {
  sequenceCounter += 1;
  return `${order.id}-${sequenceCounter}`;
}
```

### ✅ Correct (`HEAL_STATELESSNESS` SOP: Pure function with `const` only and zero upward imports)
```ts
/** [LAYER: PLUMBING] */
const ID_PREFIX = "ORD";

export function formatSequenceId(prefix: string = ID_PREFIX, sequenceNumber: number): string {
  return `${prefix}-${String(sequenceNumber).padStart(6, "0")}`;
}
```

---

## 5. `SPI-208` & `SPI-209`: Geographic Misalignment and Deep Relative Imports

### ❌ Incorrect (File in `src/domain/` tagged as `CORE` and using 4 levels of `../`)
```ts
// File path: src/domain/sub/deep/pricing/TaxRule.ts
/** [LAYER: CORE] */ // ❌ VIOLATION [SPI-208]: Path is `domain`, tag is `CORE`
import { roundCurrency } from "../../../../plumbing/currencyMath.js"; // ❌ VIOLATION [SPI-209]: 4 levels of `../`
```

### ✅ Correct (Flatten directory tree to depth `<= 3` and align `[LAYER: DOMAIN]` tag)
```ts
// File path: src/domain/pricing/TaxRule.ts
/** [LAYER: DOMAIN] */
import { roundCurrency } from "../../plumbing/currencyMath.js"; // ✅ Depth = 2 (or use `@plumbing/currencyMath.js`)
```

