// Mirrors src/shared/risk_config.py and src/compliance/deadlines.py.
// tests/test_site_rules.py fails when the two drift apart.
export const WEIGHTS = { velocity: 0.3, travel: 0.3, high_value: 0.2, d17_limit: 0.2 };
export const VELOCITY = 3;
export const TRAVEL = 1;
export const HIGH_VALUE_TND = 15000;
export const EWALLET_TND = 2000;
export const ALERT = 0.5;
export const FILING_DAYS = 10;
export const HOLIDAYS = ["01-01", "03-20", "03-21", "04-09", "05-01", "07-25", "08-13", "10-15"];

export function score({ amount, method, v_count, g_dist }) {
  const hits = {
    velocity: v_count > VELOCITY,
    travel: g_dist > TRAVEL,
    high_value: amount > HIGH_VALUE_TND,
    d17_limit: amount > EWALLET_TND && method.toLowerCase() === "flouci",
  };
  // Same summation order as BacktestEngine._apply_rules, so 0.3 + 0.2 lands on 0.5 exactly.
  const total = Object.keys(WEIGHTS).reduce((sum, rule) => sum + (hits[rule] ? WEIGHTS[rule] : 0), 0);
  return { hits, total, alert: total > ALERT };
}

export const isDayOff = (day) => day.getUTCDay() % 6 === 0 || HOLIDAYS.includes(day.toISOString().slice(5, 10));

// Dates are UTC midnights so daylight saving never shifts a day.
export function deadline(from, days = FILING_DAYS) {
  const day = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  for (let counted = 0; counted < days; ) {
    day.setUTCDate(day.getUTCDate() + 1);
    if (!isDayOff(day)) counted += 1;
  }
  return day;
}
