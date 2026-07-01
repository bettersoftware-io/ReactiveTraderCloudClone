export function splitPrice(
  value: number,
  ratePrecision: number,
  pipsPosition: number,
): PriceParts {
  const formatted = value.toFixed(ratePrecision);
  const fractionalDigits = ratePrecision - pipsPosition;
  const pipEnd = formatted.length - fractionalDigits;
  const pipStart = pipEnd - 2;
  return {
    prefix: formatted.slice(0, pipStart),
    pips: formatted.slice(pipStart, pipEnd),
    fractional: fractionalDigits > 0 ? formatted.slice(pipEnd) : "",
  };
}

interface PriceParts {
  prefix: string;
  pips: string;
  fractional: string;
}
