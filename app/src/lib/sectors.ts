/**
 * One consistent category map for all 50 Nifty 50 names.
 *
 * The bundled snapshot ships a broad `sector` per symbol, but it splits obvious
 * peers (TRENT is "Consumer", ETERNAL is "Consumer Tech") and lumps unrelated
 * businesses together ("Financials" holds banks, an exchange, insurers and
 * NBFCs). Every symbol in the app is assigned exactly one industry below, and
 * each industry belongs to exactly one sector, so nothing can fall through and
 * every stock appears in exactly one place.
 *
 * The grouping is a static NSE-style classification, not a data feed: it does
 * not change with prices.
 */

/** Granular industry for each symbol. Keep this in sync with the snapshot's 50 names. */
export const INDUSTRY_OF: Record<string, string> = {
  // ---------------------------------------------------------------- Financials
  AXISBANK: "Private banks",
  HDFCBANK: "Private banks",
  ICICIBANK: "Private banks",
  KOTAKBANK: "Private banks",
  SBIN: "PSU bank",
  BAJFINANCE: "NBFC",
  BAJAJFINSV: "NBFC",
  SHRIRAMFIN: "NBFC",
  JIOFIN: "NBFC",
  HDFCLIFE: "Insurance",
  SBILIFE: "Insurance",
  BSE: "Capital markets",

  // ------------------------------------------------------------------------ IT
  TCS: "IT services",
  INFY: "IT services",
  HCLTECH: "IT services",
  TECHM: "IT services",

  // -------------------------------------------------------------------- Energy
  RELIANCE: "Oil & gas",
  ONGC: "Oil & gas",
  NTPC: "Power",
  POWERGRID: "Power",
  COALINDIA: "Coal",

  // ---------------------------------------------------------------------- Auto
  MARUTI: "Passenger vehicles",
  "M&M": "Passenger vehicles",
  TMPV: "Passenger vehicles",
  "BAJAJ-AUTO": "Two-wheelers",
  EICHERMOT: "Two-wheelers",

  // ------------------------------------------------------------------ Consumer
  TRENT: "Retail",
  ETERNAL: "Retail",
  TITAN: "Jewellery",
  ASIANPAINT: "Paints",

  // --------------------------------------------------------------------- FMCG
  HINDUNILVR: "Home & personal care",
  ITC: "Cigarettes",
  NESTLEIND: "Packaged foods",
  TATACONSUM: "Packaged foods",

  // --------------------------------------------------------------- Healthcare
  APOLLOHOSP: "Hospitals",
  MAXHEALTH: "Hospitals",
  SUNPHARMA: "Pharma",
  CIPLA: "Pharma",
  DRREDDY: "Pharma",

  // -------------------------------------------------------------------- Metals
  TATASTEEL: "Steel",
  JSWSTEEL: "Steel",
  HINDALCO: "Aluminium",

  // --------------------------------------------------------------- Industrials
  ULTRACEMCO: "Cement",
  GRASIM: "Cement",
  LT: "Engineering & construction",
  ADANIPORTS: "Ports & logistics",

  // ------------------------------------------------------------ Single-name
  BHARTIARTL: "Telecom",
  BEL: "Defence",
  INDIGO: "Aviation",
  ADANIENT: "Conglomerate",
};

/** Which sector each industry sits in. */
export const SECTOR_OF_INDUSTRY: Record<string, string> = {
  "Private banks": "Financials",
  "PSU bank": "Financials",
  NBFC: "Financials",
  Insurance: "Financials",
  "Capital markets": "Financials",

  "IT services": "IT",

  "Oil & gas": "Energy",
  Power: "Energy",
  Coal: "Energy",

  "Passenger vehicles": "Auto",
  "Two-wheelers": "Auto",

  Retail: "Consumer",
  Jewellery: "Consumer",
  Paints: "Consumer",

  "Home & personal care": "FMCG",
  Cigarettes: "FMCG",
  "Packaged foods": "FMCG",

  Hospitals: "Healthcare",
  Pharma: "Healthcare",

  Steel: "Metals",
  Aluminium: "Metals",

  Cement: "Industrials",
  "Engineering & construction": "Industrials",
  "Ports & logistics": "Industrials",

  Telecom: "Telecom",
  Defence: "Defence",
  Aviation: "Aviation",
  Conglomerate: "Conglomerate",
};

/** Display order for the sector view. */
export const SECTOR_ORDER: string[] = [
  "Financials",
  "IT",
  "Energy",
  "Auto",
  "FMCG",
  "Healthcare",
  "Consumer",
  "Metals",
  "Industrials",
  "Telecom",
  "Defence",
  "Aviation",
  "Conglomerate",
];

/** One short line per sector, so a group is not just a label. */
export const SECTOR_BLURB: Record<string, string> = {
  Financials: "Banks, NBFCs, insurers and the exchange",
  IT: "Software and IT services exporters",
  Energy: "Oil & gas, power utilities and coal",
  Auto: "Cars, utility vehicles and two-wheelers",
  FMCG: "Everyday staples and packaged foods",
  Healthcare: "Hospitals and pharmaceutical makers",
  Consumer: "Retail, jewellery and paints",
  Metals: "Steel and aluminium producers",
  Industrials: "Cement, engineering and ports",
  Telecom: "Mobile and data networks",
  Defence: "Defence electronics",
  Aviation: "Air travel",
  Conglomerate: "Diversified holding companies",
};

export function industryOf(symbol: string): string {
  return INDUSTRY_OF[symbol] || "Other";
}

export function sectorOf(symbol: string): string {
  return SECTOR_OF_INDUSTRY[industryOf(symbol)] || "Other";
}

/** The industries inside a sector, in the order they first appear. */
export function industriesIn(sector: string, symbols: string[]): string[] {
  const seen: string[] = [];
  for (const sym of symbols) {
    const ind = industryOf(sym);
    if (SECTOR_OF_INDUSTRY[ind] === sector && !seen.includes(ind)) seen.push(ind);
  }
  return seen;
}
