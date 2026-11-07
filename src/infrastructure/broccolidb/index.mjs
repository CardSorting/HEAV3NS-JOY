/** [LAYER: INFRASTRUCTURE] */
/**
 * Local, dependency-free BroccoliDB surface.
 *
 * BroccoliDB is table-first and keeps its hot path in memory. The kernel's
 * optional WAL/CAS/checkpoint layers use ordinary files and Node built-ins;
 * no native database driver is part of this surface.
 */
// SPDX-FileCopyrightText: 2026 William Andrew Cruz
// SPDX-License-Identifier: Apache-2.0
export * from "./broccolidb-aggregation.mjs";
export * from "./broccolidb-mutex.mjs";
export * from "./broccolidb-natural-query.mjs";
export * from "./broccolidb-wal.mjs";
export * from "./broccolidb-cas.mjs";
export * from "./broccolidb-table.mjs";
export * from "./broccolidb-kernel.mjs";
export * from "./TokenCompressionService.mjs";
