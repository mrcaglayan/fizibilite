const VALID_FIELDS = new Set(["all", "brief"]);
const VALID_DIRECTIONS = new Set(["asc", "desc"]);

function buildAllowedOrderMap(allowedOrderColumns) {
  if (!allowedOrderColumns) return null;
  const map = {};
  if (Array.isArray(allowedOrderColumns)) {
    allowedOrderColumns
      .map((col) => String(col || "").trim())
      .filter(Boolean)
      .forEach((col) => {
        map[col.toLowerCase()] = col;
      });
    return map;
  }
  if (typeof allowedOrderColumns === "object") {
    Object.entries(allowedOrderColumns).forEach(([key, value]) => {
      const colKey = String(key || "").trim().toLowerCase();
      const colValue = String(value || "").trim();
      if (!colKey || !colValue) return;
      map[colKey] = colValue;
    });
    return map;
  }
  return null;
}

function listParamError(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function parseOrderValue(rawValue, allowedMap) {
  if (!allowedMap) {
    throw listParamError("Ordering is not supported for this endpoint");
  }

  if (typeof rawValue === "object" && rawValue !== null) {
    const column = String(rawValue.column || "").trim().toLowerCase();
    if (!column || !allowedMap[column]) {
      throw listParamError("Invalid order column");
    }
    const direction = String(rawValue.direction || "desc").trim().toLowerCase();
    if (!VALID_DIRECTIONS.has(direction)) {
      throw listParamError("Invalid order direction");
    }
    return {
      column,
      direction,
      orderBy: `${allowedMap[column]} ${direction.toUpperCase()}`,
    };
  }

  const raw = String(rawValue || "").trim();
  if (!raw) throw listParamError("Invalid order");
  const parts = raw.split(":");
  if (parts.length > 2) throw listParamError("Invalid order");
  const column = String(parts[0] || "").trim().toLowerCase();
  if (!column || !allowedMap[column]) {
    throw listParamError("Invalid order column");
  }
  const directionPart = parts.length === 2 ? String(parts[1] || "").trim().toLowerCase() : "desc";
  const direction = directionPart || "desc";
  if (!VALID_DIRECTIONS.has(direction)) {
    throw listParamError("Invalid order direction");
  }
  return {
    column,
    direction,
    orderBy: `${allowedMap[column]} ${direction.toUpperCase()}`,
  };
}

function parseListParams(
  query,
  {
    defaultLimit = 50,
    maxLimit = 200,
    defaultOffset = 0,
    allowedOrderColumns,
    defaultOrder,
    applyDefaultLimit = true,
  } = {}
) {
  const hasLimitParam = Object.prototype.hasOwnProperty.call(query || {}, "limit");
  const hasOffsetParam = Object.prototype.hasOwnProperty.call(query || {}, "offset");
  const hasFieldsParam = Object.prototype.hasOwnProperty.call(query || {}, "fields");
  const hasOrderParam = Object.prototype.hasOwnProperty.call(query || {}, "order");

  let fields = "all";
  if (hasFieldsParam) {
    const raw = String(query?.fields || "").trim().toLowerCase();
    if (!raw) throw listParamError("Invalid fields");
    if (!VALID_FIELDS.has(raw)) throw listParamError("Invalid fields");
    fields = raw;
  }

  const isPagedOrSelective =
    hasLimitParam || hasOffsetParam || hasFieldsParam || hasOrderParam || fields === "brief";

  let limit = null;
  if (hasLimitParam) {
    const rawLimit = query?.limit;
    if (rawLimit == null || rawLimit === "") {
      throw listParamError("Invalid limit");
    }
    const parsed = Number(rawLimit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > maxLimit) {
      throw listParamError("Invalid limit");
    }
    limit = parsed;
  } else if (applyDefaultLimit && isPagedOrSelective) {
    limit = defaultLimit;
  }

  let offset = defaultOffset;
  if (hasOffsetParam) {
    const rawOffset = query?.offset;
    if (rawOffset == null || rawOffset === "") {
      throw listParamError("Invalid offset");
    }
    const parsed = Number(rawOffset);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw listParamError("Invalid offset");
    }
    offset = parsed;
  }

  const allowedMap = buildAllowedOrderMap(allowedOrderColumns);
  let order = null;
  let orderBy = null;

  if (hasOrderParam) {
    const parsed = parseOrderValue(query?.order, allowedMap);
    order = { column: parsed.column, direction: parsed.direction };
    orderBy = parsed.orderBy;
  } else if (defaultOrder) {
    const parsed = parseOrderValue(defaultOrder, allowedMap);
    order = { column: parsed.column, direction: parsed.direction };
    orderBy = parsed.orderBy;
  }

  return {
    limit,
    offset,
    fields,
    order,
    orderBy,
    isPagedOrSelective,
    hasLimitParam,
    hasOffsetParam,
    hasFieldsParam,
    hasOrderParam,
  };
}

module.exports = { parseListParams };
