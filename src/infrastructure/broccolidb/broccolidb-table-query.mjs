/** [LAYER: INFRASTRUCTURE] */
/**
 * Query planning, fluent query builder, where-clause evaluation, and secondary
 * index maintenance helpers for `BroccoliDbTable`.
 */

export function createSelectBuilder(table) {
  const whereObj = {};
  let sortByField;
  let sortDirection = "asc";
  let limitVal;
  let offsetVal;
  const createPredicate = (field) => ({
    equals: (val) => {
      whereObj[field] = { $eq: val };
      return builder;
    },
    notEquals: (val) => {
      whereObj[field] = { $ne: val };
      return builder;
    },
    greaterThan: (val) => {
      whereObj[field] = { $gt: val };
      return builder;
    },
    greaterThanOrEqual: (val) => {
      whereObj[field] = { $gte: val };
      return builder;
    },
    lessThan: (val) => {
      whereObj[field] = { $lt: val };
      return builder;
    },
    lessThanOrEqual: (val) => {
      whereObj[field] = { $lte: val };
      return builder;
    },
    in: (values) => {
      whereObj[field] = { $in: values };
      return builder;
    },
    notIn: (values) => {
      whereObj[field] = { $nin: values };
      return builder;
    },
    between: (min, max) => {
      whereObj[field] = { $between: [min, max] };
      return builder;
    },
    startsWith: (prefix) => {
      whereObj[field] = { $startsWith: prefix };
      return builder;
    },
    contains: (sub) => {
      whereObj[field] = { $contains: sub };
      return builder;
    },
    matches: (regex) => {
      whereObj[field] = { $regex: regex };
      return builder;
    }
  });
  const builder = {
    where: (field) => createPredicate(field),
    and: (field) => createPredicate(field),
    or: (clause) => {
      const subBuilder = table.select();
      clause(subBuilder);
      return builder;
    },
    orderBy: (field, direction = "asc") => {
      sortByField = field;
      sortDirection = direction;
      return builder;
    },
    limit: (count) => {
      limitVal = count;
      return builder;
    },
    offset: (count) => {
      offsetVal = count;
      return builder;
    },
    execute: () =>
      table.query({
        where: Object.keys(whereObj).length > 0 ? whereObj : undefined,
        sortBy: sortByField,
        sortOrder: sortDirection,
        limit: limitVal,
        offset: offsetVal
      }),
    explain: () =>
      table.explain({
        where: Object.keys(whereObj).length > 0 ? whereObj : undefined,
        sortBy: sortByField,
        sortOrder: sortDirection,
        limit: limitVal,
        offset: offsetVal
      }),
    first: () => {
      const res = builder.limit(1).execute();
      return res[0];
    },
    count: () => builder.execute().length
  };
  return builder;
}

export function planTableQuery(table, options) {
  if (!options.where) {
    if (options.sortBy && typeof options.sortBy === "string" && table.sortedIndices.has(options.sortBy)) {
      const sortedList = table.sortedIndices.get(options.sortBy);
      const candidates = [];
      const isDesc = options.sortOrder === "desc";
      if (isDesc) {
        for (let i = sortedList.length - 1; i >= 0; i--) {
          for (const id of sortedList[i].ids) {
            const r = table.records.get(id);
            if (r) candidates.push(r);
          }
        }
      } else {
        for (let i = 0; i < sortedList.length; i++) {
          for (const id of sortedList[i].ids) {
            const r = table.records.get(id);
            if (r) candidates.push(r);
          }
        }
      }
      return {
        candidates,
        indexName: options.sortBy,
        indexType: "sorted",
        scanStrategy: "INDEX_RANGE_SCAN"
      };
    }
    return {
      candidates: Array.from(table.records.values()),
      scanStrategy: "FULL_TABLE_SCAN"
    };
  }
  const whereKeys = Object.keys(options.where);
  for (const [compName, compIndex] of table.compositeIndices.entries()) {
    const allFieldsPresent = compIndex.fields.every((f) => {
      const val = options.where[f];
      return val !== undefined && (typeof val !== "object" || val === null || val.$eq !== undefined);
    });
    if (allFieldsPresent) {
      const keyParts = compIndex.fields.map((f) => {
        const val = options.where[f];
        if (typeof val === "object" && val !== null && val.$eq !== undefined) {
          return String(val.$eq);
        }
        return String(val ?? "");
      });
      const compKey = keyParts.join("::");
      const idSet = compIndex.map.get(compKey);
      const candidates = [];
      if (idSet) {
        for (const id of idSet) {
          const r = table.records.get(id);
          if (r) candidates.push(r);
        }
      }
      return {
        candidates,
        indexName: compName,
        indexType: "composite",
        scanStrategy: "COMPOSITE_INDEX_LOOKUP"
      };
    }
  }
  const matchingEqualitySets = [];
  for (const field of whereKeys) {
    if (table.equalityIndices.has(field)) {
      const rawVal = options.where[field];
      let targetVal = rawVal;
      let isEquality = false;
      if (typeof rawVal !== "object" || rawVal === null) {
        targetVal = rawVal;
        isEquality = true;
      } else if (rawVal.$eq !== undefined) {
        targetVal = rawVal.$eq;
        isEquality = true;
      }
      if (isEquality) {
        const idSet = table.equalityIndices.get(field)?.get(targetVal);
        matchingEqualitySets.push({ field, set: idSet || new Set() });
      }
    }
  }
  if (matchingEqualitySets.length > 1) {
    matchingEqualitySets.sort((a, b) => a.set.size - b.set.size);
    const primarySet = matchingEqualitySets[0].set;
    const candidates = [];
    for (const id of primarySet) {
      let inAll = true;
      for (let i = 1; i < matchingEqualitySets.length; i++) {
        if (!matchingEqualitySets[i].set.has(id)) {
          inAll = false;
          break;
        }
      }
      if (inAll) {
        const r = table.records.get(id);
        if (r) candidates.push(r);
      }
    }
    return {
      candidates,
      indexName: matchingEqualitySets.map((m) => m.field).join("+"),
      indexType: "equality",
      scanStrategy: "MULTI_INDEX_INTERSECTION"
    };
  }
  if (matchingEqualitySets.length === 1) {
    const match = matchingEqualitySets[0];
    const candidates = [];
    for (const id of match.set) {
      const r = table.records.get(id);
      if (r) candidates.push(r);
    }
    return {
      candidates,
      indexName: match.field,
      indexType: "equality",
      scanStrategy: "INDEX_LOOKUP"
    };
  }
  for (const field of whereKeys) {
    if (table.sortedIndices.has(field)) {
      const filter = options.where[field];
      if (typeof filter === "object" && filter !== null) {
        const f = filter;
        if (f.$between || f.$gt !== undefined || f.$gte !== undefined || f.$lt !== undefined || f.$lte !== undefined) {
          const sortedList = table.sortedIndices.get(field);
          const candidates = [];
          for (const entry of sortedList) {
            const val = entry.value;
            let match = true;
            if (f.$between && (val < f.$between[0] || val > f.$between[1])) match = false;
            if (f.$gt !== undefined && val <= f.$gt) match = false;
            if (f.$gte !== undefined && val < f.$gte) match = false;
            if (f.$lt !== undefined && val >= f.$lt) match = false;
            if (f.$lte !== undefined && val > f.$lte) match = false;
            if (match) {
              for (const id of entry.ids) {
                const r = table.records.get(id);
                if (r) candidates.push(r);
              }
            }
          }
          return {
            candidates,
            indexName: field,
            indexType: "sorted",
            scanStrategy: "INDEX_RANGE_SCAN"
          };
        }
      }
    }
  }
  for (const field of whereKeys) {
    if (table.prefixIndices.has(field)) {
      const filter = options.where[field];
      if (typeof filter === "object" && filter !== null && filter.$startsWith) {
        const prefix = filter.$startsWith.toLowerCase();
        const prefixMap = table.prefixIndices.get(field);
        const idSet = prefixMap.get(prefix);
        const candidates = [];
        if (idSet) {
          for (const id of idSet) {
            const r = table.records.get(id);
            if (r) candidates.push(r);
          }
        }
        return {
          candidates,
          indexName: field,
          indexType: "prefix",
          scanStrategy: "PREFIX_SCAN"
        };
      }
    }
  }
  return {
    candidates: Array.from(table.records.values()),
    scanStrategy: "FULL_TABLE_SCAN"
  };
}

export function evaluateRecordWhere(record, where) {
  for (const [field, expected] of Object.entries(where)) {
    const actualVal = record[field];
    if (expected === null || typeof expected !== "object") {
      if (actualVal !== expected) return false;
      continue;
    }
    if (expected instanceof RegExp) {
      expected.lastIndex = 0;
      if (typeof actualVal !== "string" || !expected.test(actualVal)) return false;
      continue;
    }
    const filter = expected;
    if (filter.$eq !== undefined && actualVal !== filter.$eq) return false;
    if (filter.$ne !== undefined && actualVal === filter.$ne) return false;
    if (filter.$exists !== undefined && (actualVal !== undefined) !== filter.$exists) return false;
    if (filter.$gt !== undefined && (actualVal === undefined || actualVal === null || actualVal <= filter.$gt)) return false;
    if (filter.$gte !== undefined && (actualVal === undefined || actualVal === null || actualVal < filter.$gte)) return false;
    if (filter.$lt !== undefined && (actualVal === undefined || actualVal === null || actualVal >= filter.$lt)) return false;
    if (filter.$lte !== undefined && (actualVal === undefined || actualVal === null || actualVal > filter.$lte)) return false;
    if (filter.$in !== undefined && (!Array.isArray(filter.$in) || !filter.$in.includes(actualVal))) return false;
    if (filter.$nin !== undefined && Array.isArray(filter.$nin) && filter.$nin.includes(actualVal)) return false;
    if (filter.$between !== undefined) {
      const [min, max] = filter.$between;
      if (actualVal === undefined || actualVal === null || actualVal < min || actualVal > max) return false;
    }
    if (filter.$startsWith !== undefined && (typeof actualVal !== "string" || !actualVal.startsWith(filter.$startsWith))) return false;
    if (filter.$endsWith !== undefined && (typeof actualVal !== "string" || !actualVal.endsWith(filter.$endsWith))) return false;
    if (filter.$contains !== undefined && (typeof actualVal !== "string" || !actualVal.includes(filter.$contains))) return false;
    if (filter.$regex !== undefined) {
      const re = typeof filter.$regex === "string" ? new RegExp(filter.$regex, "i") : filter.$regex;
      re.lastIndex = 0;
      if (typeof actualVal !== "string" || !re.test(actualVal)) return false;
    }
  }
  return true;
}

export function normalizeSortableValue(val) {
  if (typeof val === "number" || typeof val === "string") return val;
  if (val instanceof Date) return val.getTime();
  return undefined;
}

export function insertSortedIndexEntry(list, val, id) {
  let low = 0;
  let high = list.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (list[mid].value < val) low = mid + 1;
    else high = mid;
  }
  if (low < list.length && list[low].value === val) {
    list[low].ids.add(id);
  } else {
    list.splice(low, 0, { value: val, ids: new Set([id]) });
  }
}

export function buildCompositeKey(fields, record) {
  return fields.map((f) => String(record[f] ?? "")).join("::");
}

export function insertPrefixIndex(prefixMap, text, id) {
  const normalized = text.toLowerCase();
  for (let len = 1; len <= Math.min(20, normalized.length); len++) {
    const prefix = normalized.slice(0, len);
    let set = prefixMap.get(prefix);
    if (!set) {
      set = new Set();
      prefixMap.set(prefix, set);
    }
    set.add(id);
  }
}

export function addIndicesForRecord(table, id, record) {
  for (const [field, indexMap] of table.equalityIndices.entries()) {
    const val = record[field];
    if (val !== undefined) {
      let idSet = indexMap.get(val);
      if (!idSet) {
        idSet = new Set();
        indexMap.set(val, idSet);
      }
      idSet.add(id);
    }
  }
  for (const [field, sortedList] of table.sortedIndices.entries()) {
    const val = normalizeSortableValue(record[field]);
    if (val !== undefined) insertSortedIndexEntry(sortedList, val, id);
  }
  for (const compIndex of table.compositeIndices.values()) {
    const key = buildCompositeKey(compIndex.fields, record);
    let idSet = compIndex.map.get(key);
    if (!idSet) {
      idSet = new Set();
      compIndex.map.set(key, idSet);
    }
    idSet.add(id);
  }
  for (const [field, prefixMap] of table.prefixIndices.entries()) {
    const val = record[field];
    if (typeof val === "string") insertPrefixIndex(prefixMap, val, id);
  }
}

export function removeIndicesForRecord(table, id, record) {
  for (const [field, indexMap] of table.equalityIndices.entries()) {
    const val = record[field];
    if (val !== undefined) {
      const idSet = indexMap.get(val);
      if (idSet) {
        idSet.delete(id);
        if (idSet.size === 0) indexMap.delete(val);
      }
    }
  }
  for (const [field, sortedList] of table.sortedIndices.entries()) {
    const val = normalizeSortableValue(record[field]);
    if (val !== undefined) {
      for (let i = 0; i < sortedList.length; i++) {
        if (sortedList[i].value === val) {
          sortedList[i].ids.delete(id);
          if (sortedList[i].ids.size === 0) sortedList.splice(i, 1);
          break;
        }
      }
    }
  }
  for (const compIndex of table.compositeIndices.values()) {
    const key = buildCompositeKey(compIndex.fields, record);
    const idSet = compIndex.map.get(key);
    if (idSet) {
      idSet.delete(id);
      if (idSet.size === 0) compIndex.map.delete(key);
    }
  }
  for (const [field, prefixMap] of table.prefixIndices.entries()) {
    const val = record[field];
    if (typeof val === "string") {
      const normalized = val.toLowerCase();
      for (let len = 1; len <= Math.min(20, normalized.length); len++) {
        const prefix = normalized.slice(0, len);
        const set = prefixMap.get(prefix);
        if (set) {
          set.delete(id);
          if (set.size === 0) prefixMap.delete(prefix);
        }
      }
    }
  }
}

