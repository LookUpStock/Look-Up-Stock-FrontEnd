const WEIGHT_SCALE = 100;
const CENTS_SCALE = 100;
const MAX_WEIGHT = 100;
const MAX_DECIMALS = 2;
const WEIGHT_TOLERANCE = 0.000001;

function toTrimmedString(value) {
  return String(value ?? "").trim();
}

function toNumber(value) {
  if (typeof value === "number") {
    return value;
  }

  const normalizedValue = toTrimmedString(value).replace(",", ".");

  if (normalizedValue === "") {
    return Number.NaN;
  }

  return Number(normalizedValue);
}

function roundToTwoDecimals(value) {
  return Math.round(value * CENTS_SCALE) / CENTS_SCALE;
}

function hasMaxTwoDecimals(value) {
  return Math.abs(roundToTwoDecimals(value) - value) <= WEIGHT_TOLERANCE;
}

function formatWeightPct(value) {
  return roundToTwoDecimals(value);
}

function clonePosition(position) {
  return {
    id: position.id,
    // Datenbank-id der Anlage aus der Suche; das Backend speichert nur damit (US-03)
    assetId: position.assetId ?? null,
    symbol: toTrimmedString(position.symbol),
    name: toTrimmedString(position.name),
    weightPct: formatWeightPct(position.weightPct),
  };
}

function distributeCents(totalCents, count) {
  if (count <= 0) {
    return [];
  }

  const baseCents = Math.floor(totalCents / count);
  const remainders = totalCents - baseCents * count;

  return Array.from({ length: count }, (_, index) => baseCents + (index < remainders ? 1 : 0));
}

export function createPosition(position = {}) {
  return clonePosition({
    id: position.id ?? crypto.randomUUID(),
    assetId: position.assetId ?? null,
    symbol: position.symbol ?? "",
    name: position.name ?? "",
    weightPct: position.weightPct ?? 0,
  });
}

export function createPortfolio(name = "", positions = []) {
  return {
    name: toTrimmedString(name),
    positions: positions.map(createPosition),
  };
}

export function parseWeightInput(value) {
  return toNumber(value);
}

export function formatWeightInput(value) {
  return roundToTwoDecimals(value).toFixed(MAX_DECIMALS).replace(".", ",");
}

export function calculateTotalWeight(portfolio) {
  return roundToTwoDecimals(
    portfolio.positions.reduce((sum, position) => {
      const weightPct = toNumber(position.weightPct);

      return Number.isFinite(weightPct) ? sum + weightPct : sum;
    }, 0)
  );
}

export function validatePosition(position) {
  const errors = {
    symbol: "",
    name: "",
    weightPct: "",
  };

  const symbol = toTrimmedString(position.symbol);
  const name = toTrimmedString(position.name);
  const weightPct = toNumber(position.weightPct);

  if (!symbol) {
    errors.symbol = "Das Symbol ist erforderlich.";
  }

  if (!name) {
    errors.name = "Der Name ist erforderlich.";
  }

  if (!Number.isFinite(weightPct)) {
    errors.weightPct = "Das Gewicht ist erforderlich.";
  } else if (weightPct < 0 || weightPct > MAX_WEIGHT) {
    errors.weightPct = "Das Gewicht muss zwischen 0 und 100 % liegen.";
  } else if (!hasMaxTwoDecimals(weightPct)) {
    errors.weightPct = "Das Gewicht darf höchstens 2 Nachkommastellen haben.";
  }

  return errors;
}

export function validatePortfolio(portfolio) {
  const errors = {
    name: "",
    totalWeightPct: "",
    positions: portfolio.positions.map(validatePosition),
  };

  const name = toTrimmedString(portfolio.name);

  if (!name) {
    errors.name = "Der Portfolio-Name ist erforderlich.";
  }

  const duplicateGroups = new Map();

  portfolio.positions.forEach((position, index) => {
    const symbol = toTrimmedString(position.symbol).toUpperCase();

    if (!symbol) {
      return;
    }

    const indices = duplicateGroups.get(symbol) ?? [];
    indices.push(index);
    duplicateGroups.set(symbol, indices);
  });

  for (const indices of duplicateGroups.values()) {
    if (indices.length < 2) {
      continue;
    }

    for (const index of indices) {
      errors.positions[index].symbol = "Das Symbol darf nicht doppelt vorkommen.";
    }
  }

  const totalWeightPct = calculateTotalWeight(portfolio);
  const hasInvalidWeight = errors.positions.some((positionErrors) => positionErrors.weightPct);

  if (portfolio.positions.length === 0) {
    errors.totalWeightPct = "Bitte mindestens eine Position anlegen.";
  } else if (hasInvalidWeight) {
    errors.totalWeightPct = "Bitte alle Gewichte korrekt eingeben.";
  } else if (Math.round(totalWeightPct * CENTS_SCALE) !== WEIGHT_SCALE * CENTS_SCALE) {
    errors.totalWeightPct = `Die Gewichtssumme muss genau 100 % ergeben. Aktuell: ${formatWeightInput(totalWeightPct)} %.`;
  }

  return {
    valid:
      !errors.name &&
      !errors.totalWeightPct &&
      errors.positions.every((positionErrors) =>
        Object.values(positionErrors).every((message) => !message)
      ),
    errors,
  };
}

export function normalizePortfolioWeights(portfolio) {
  const positions = portfolio.positions.map(clonePosition);
  const totalWeightPct = calculateTotalWeight(portfolio);

  if (positions.length === 0 || totalWeightPct <= 0) {
    return createPortfolio(portfolio.name, positions);
  }

  const scaledCents = positions.map((position) => (position.weightPct / totalWeightPct) * WEIGHT_SCALE * CENTS_SCALE);
  const floorCents = scaledCents.map((value) => Math.floor(value));
  const missingCents = WEIGHT_SCALE * CENTS_SCALE - floorCents.reduce((sum, value) => sum + value, 0);
  const rankedIndices = scaledCents
    .map((value, index) => ({ index, remainder: value - floorCents[index] }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index)
    .map(({ index }) => index);

  for (let index = 0; index < missingCents; index += 1) {
    floorCents[rankedIndices[index]] += 1;
  }

  return createPortfolio(portfolio.name, positions.map((position, index) => ({
    ...position,
    weightPct: floorCents[index] / CENTS_SCALE,
  })));
}

export function equalizePortfolioWeights(portfolio) {
  const positions = portfolio.positions.map(clonePosition);

  if (positions.length === 0) {
    return createPortfolio(portfolio.name, positions);
  }

  const centsPerPosition = distributeCents(WEIGHT_SCALE * CENTS_SCALE, positions.length);

  return createPortfolio(portfolio.name, positions.map((position, index) => ({
    ...position,
    weightPct: centsPerPosition[index] / CENTS_SCALE,
  })));
}