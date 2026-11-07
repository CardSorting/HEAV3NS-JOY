/** [LAYER: INFRASTRUCTURE] */
/**
 * BroccoliDB generic reactive in-memory table.
 * Maintains secondary indexes, operator filters, aggregation, change
 * subscriptions, and TTL expiration for records held in process memory.
 */
import { BroccoliAggregateEngine } from "./broccolidb-aggregation.mjs";
import {
    createSelectBuilder,
    planTableQuery,
    evaluateRecordWhere,
    normalizeSortableValue,
    insertSortedIndexEntry,
    buildCompositeKey,
    insertPrefixIndex,
    addIndicesForRecord,
    removeIndicesForRecord
} from "./broccolidb-table-query.mjs";

export class BroccoliDbTable {
    name;
    records = new Map();
    walHook;
    // Index Stores
    equalityIndices = new Map();
    sortedIndices = new Map();
    compositeIndices = new Map();
    prefixIndices = new Map();
    // Subscriptions & Timers
    subscriptions = new Map();
    subscriptionSeq = 0;
    ttlTimers = new Map();
    constructor(name, walHook) {
        this.name = name;
        this.walHook = walHook;
    }
    createIndex(field) {
        if (this.equalityIndices.has(field))
            return;
        const indexMap = new Map();
        this.equalityIndices.set(field, indexMap);
        for (const [id, record] of this.records.entries()) {
            const val = this.resolveFieldValue(record, field);
            if (val !== undefined) {
                let idSet = indexMap.get(val);
                if (!idSet) {
                    idSet = new Set();
                    indexMap.set(val, idSet);
                }
                idSet.add(id);
            }
        }
    }
    createSortedIndex(field) {
        if (this.sortedIndices.has(field))
            return;
        const sortedList = [];
        this.sortedIndices.set(field, sortedList);
        for (const [id, record] of this.records.entries()) {
            const rawVal = this.resolveFieldValue(record, field);
            const val = normalizeSortableValue(rawVal);
            if (val !== undefined) {
                insertSortedIndexEntry(sortedList, val, id);
            }
        }
    }
    createCompositeIndex(fields) {
        const compName = fields.join("__");
        if (this.compositeIndices.has(compName))
            return;
        const compIndex = {
            fields,
            map: new Map(),
        };
        this.compositeIndices.set(compName, compIndex);
        for (const [id, record] of this.records.entries()) {
            const key = buildCompositeKey(fields, record);
            let idSet = compIndex.map.get(key);
            if (!idSet) {
                idSet = new Set();
                compIndex.map.set(key, idSet);
            }
            idSet.add(id);
        }
    }
    createPrefixIndex(field) {
        if (this.prefixIndices.has(field))
            return;
        const prefixMap = new Map();
        this.prefixIndices.set(field, prefixMap);
        for (const [id, record] of this.records.entries()) {
            const val = this.resolveFieldValue(record, field);
            if (typeof val === "string") {
                insertPrefixIndex(prefixMap, val, id);
            }
        }
    }
    get(id) {
        const record = this.records.get(id);
        return record ? { ...record } : undefined;
    }
    getAll() {
        return Array.from(this.records.values()).map((r) => ({ ...r }));
    }
    /** Returns cloned records together with their application keys. */
    getAllEntries() {
        return Array.from(this.records.entries()).map(([id, record]) => ({ id, record: { ...record } }));
    }
    put(id, record, options) {
        const existing = this.records.get(id);
        const isUpdate = existing !== undefined;
        const beforeClone = existing ? { ...existing } : undefined;
        this.putInternal(id, record);
        if (options?.ttlMs && options.ttlMs > 0) {
            const existingTimer = this.ttlTimers.get(id);
            if (existingTimer)
                clearTimeout(existingTimer);
            const timer = setTimeout(() => {
                const expiredRec = this.records.get(id);
                if (expiredRec) {
                    this.deleteInternal(id);
                    this.ttlTimers.delete(id);
                    this.emitChangeEvent("EXPIRE", id, expiredRec, undefined);
                    if (this.walHook) {
                        this.walHook("DELETE", this.name, id);
                    }
                }
            }, options.ttlMs);
            timer.unref?.();
            this.ttlTimers.set(id, timer);
        }
        const stored = this.records.get(id);
        const clonedReturn = { ...stored };
        this.emitChangeEvent(isUpdate ? "UPDATE" : "INSERT", id, beforeClone, clonedReturn);
        if (this.walHook) {
            this.walHook(isUpdate ? "UPDATE" : "INSERT", this.name, id, clonedReturn);
        }
        return clonedReturn;
    }
    putMany(entries) {
        const results = [];
        for (const entry of entries) {
            results.push(this.put(entry.id, entry.record, entry.options));
        }
        return results;
    }
    compareAndSwap(id, predicate, updater, options) {
        const current = this.get(id);
        if (!predicate(current)) {
            return { success: false, record: current };
        }
        if (!current) {
            return { success: false };
        }
        const updated = updater({ ...current });
        const saved = this.put(id, updated, options);
        return { success: true, record: saved };
    }
    delete(id) {
        const existing = this.records.get(id);
        if (!existing)
            return false;
        const beforeClone = { ...existing };
        this.deleteInternal(id);
        const timer = this.ttlTimers.get(id);
        if (timer) {
            clearTimeout(timer);
            this.ttlTimers.delete(id);
        }
        this.emitChangeEvent("DELETE", id, beforeClone, undefined);
        if (this.walHook) {
            this.walHook("DELETE", this.name, id);
        }
        return true;
    }
    deleteWhere(where) {
        const matching = Array.from(this.records.entries())
            .filter(([, record]) => this.evaluateWhere(record, where))
            .map(([id]) => id);
        let deletedCount = 0;
        for (const id of matching) {
            if (this.delete(id)) {
                deletedCount++;
            }
        }
        return deletedCount;
    }
    updateWhere(where, updater) {
        const matching = Array.from(this.records.entries())
            .filter(([, record]) => this.evaluateWhere(record, where))
            .map(([id, record]) => [id, { ...record }]);
        let updatedCount = 0;
        for (const [id, record] of matching) {
            const updated = updater(record);
            this.put(id, updated);
            updatedCount++;
        }
        return updatedCount;
    }
    count() {
        return this.records.size;
    }
    clear() {
        this.records.clear();
        for (const m of this.equalityIndices.values())
            m.clear();
        for (const arr of this.sortedIndices.values())
            arr.length = 0;
        for (const comp of this.compositeIndices.values())
            comp.map.clear();
        for (const m of this.prefixIndices.values())
            m.clear();
        for (const t of this.ttlTimers.values())
            clearTimeout(t);
        this.ttlTimers.clear();
        this.emitChangeEvent("CLEAR", "*", undefined, undefined);
        if (this.walHook) {
            this.walHook("CLEAR", this.name, "*");
        }
    }
    query(options = {}) {
        const plan = this.planQuery(options);
        let candidates = plan.candidates;
        if (options.where) {
            candidates = candidates.filter((rec) => this.evaluateWhere(rec, options.where));
        }
        if (options.and && options.and.length > 0) {
            candidates = candidates.filter((rec) => options.and.every((clause) => this.evaluateWhere(rec, clause)));
        }
        if (options.or && options.or.length > 0) {
            candidates = candidates.filter((rec) => options.or.some((clause) => this.evaluateWhere(rec, clause)));
        }
        if (options.not) {
            candidates = candidates.filter((rec) => !this.evaluateWhere(rec, options.not));
        }
        if (options.sortBy) {
            const sortFields = Array.isArray(options.sortBy) ? options.sortBy : [options.sortBy];
            const sortOrders = Array.isArray(options.sortOrder)
                ? options.sortOrder
                : [options.sortOrder ?? "asc"];
            candidates = [...candidates].sort((a, b) => {
                for (let i = 0; i < sortFields.length; i++) {
                    const field = sortFields[i];
                    const order = (sortOrders[i] ?? sortOrders[0]) === "desc" ? -1 : 1;
                    const valA = this.resolveFieldValue(a, field);
                    const valB = this.resolveFieldValue(b, field);
                    if (valA === valB)
                        continue;
                    if (valA === undefined || valA === null)
                        return 1;
                    if (valB === undefined || valB === null)
                        return -1;
                    return valA > valB ? order : -order;
                }
                return 0;
            });
        }
        const offset = options.offset ?? 0;
        const limit = options.limit !== undefined ? options.limit : candidates.length;
        return candidates.slice(offset, offset + limit).map((r) => ({ ...r }));
    }
    aggregate(query) {
        const candidateRecords = query.where ? this.query({ where: query.where }) : this.getAll();
        return BroccoliAggregateEngine.execute(this.name, candidateRecords, query);
    }
    subscribe(callback, filter) {
        const id = `sub_${++this.subscriptionSeq}_${Date.now()}`;
        this.subscriptions.set(id, { callback, filter });
        return {
            subscriptionId: id,
            unsubscribe: () => {
                this.unsubscribe(id);
            },
        };
    }
    unsubscribe(subscriptionId) {
        return this.subscriptions.delete(subscriptionId);
    }
    dispose() {
        for (const t of this.ttlTimers.values())
            clearTimeout(t);
        this.ttlTimers.clear();
        this.subscriptions.clear();
    }
    transaction(fn) {
        const snapshot = this.createSnapshot();
        const stagedMutations = [];
        const tx = {
            get: (id) => this.get(id),
            put: (id, record) => {
                stagedMutations.push({ op: "PUT", id, record });
                this.putInternal(id, record);
                return { ...record };
            },
            delete: (id) => {
                stagedMutations.push({ op: "DELETE", id });
                return this.deleteInternal(id);
            },
            query: (options) => this.query(options),
        };
        try {
            const result = fn(tx);
            if (this.walHook) {
                for (const mut of stagedMutations) {
                    if (mut.op === "PUT" && mut.record) {
                        this.walHook("INSERT", this.name, mut.id, mut.record);
                    }
                    else if (mut.op === "DELETE") {
                        this.walHook("DELETE", this.name, mut.id);
                    }
                }
            }
            return result;
        }
        catch (err) {
            this.restoreSnapshot(snapshot);
            throw err;
        }
    }
    select() {
        return createSelectBuilder(this);
    }
    explain(options = {}) {
        const startTime = performance.now();
        const plan = this.planQuery(options);
        const results = this.query(options);
        const durationMicros = Math.round((performance.now() - startTime) * 1000);
        return {
            table: this.name,
            matchedIndex: plan.indexName,
            indexType: plan.indexType,
            scanStrategy: plan.scanStrategy,
            candidatesScanned: plan.candidates.length,
            recordsMatched: results.length,
            executionTimeMicros: durationMicros,
            query: options,
        };
    }
    createSnapshot() {
        const snap = new Map();
        for (const [k, v] of this.records.entries()) {
            snap.set(k, { ...v });
        }
        return snap;
    }
    restoreSnapshot(snapshot) {
        this.records.clear();
        for (const m of this.equalityIndices.values())
            m.clear();
        for (const arr of this.sortedIndices.values())
            arr.length = 0;
        for (const comp of this.compositeIndices.values())
            comp.map.clear();
        for (const m of this.prefixIndices.values())
            m.clear();
        for (const timer of this.ttlTimers.values())
            clearTimeout(timer);
        this.ttlTimers.clear();
        for (const [k, v] of snapshot.entries()) {
            this.putInternal(k, v);
        }
    }
    // Internal Helpers
    putInternal(id, record) {
        const existing = this.records.get(id);
        if (existing) {
            removeIndicesForRecord(this, id, existing);
        }
        this.records.set(id, { ...record });
        addIndicesForRecord(this, id, record);
    }
    deleteInternal(id) {
        const existing = this.records.get(id);
        if (!existing)
            return false;
        removeIndicesForRecord(this, id, existing);
        this.records.delete(id);
        return true;
    }
    planQuery(options) {
        return planTableQuery(this, options);
    }
    evaluateWhere(record, where) {
        return evaluateRecordWhere(record, where);
    }
    resolveFieldValue(record, field) {
        return record[field];
    }
    emitChangeEvent(operation, recordId, before, after) {
        if (this.subscriptions.size === 0)
            return;
        let diff;
        if (before && after) {
            diff = {};
            const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
            for (const k of allKeys) {
                if (before[k] !== after[k]) {
                    diff[k] = { old: before[k], new: after[k] };
                }
            }
        }
        const event = {
            operation,
            table: this.name,
            recordId,
            before,
            after,
            diff,
            timestamp: Date.now(),
        };
        for (const { callback, filter } of this.subscriptions.values()) {
            try {
                if (filter) {
                    const target = after ?? before;
                    if (target && !filter(target))
                        continue;
                }
                callback(event);
            }
            catch {
                // Isolate subscriber exceptions
            }
        }
    }
}
