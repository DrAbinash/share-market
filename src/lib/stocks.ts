// Curated universe of liquid NSE large-cap / mid-cap stocks across sectors.
// Baseline prices are approximate real-world reference levels (INR).
// Used for: (1) candidate generation, (2) deterministic synthetic chart seeds,
// (3) realistic entry/SL/target ranges for the LLM strategist.

export interface StockMeta {
  symbol: string;
  name: string;
  sector: string;
  baseline: number; // approximate recent price (INR)
  lotSize: number;
  volatility: number; // daily volatility estimate (fraction, e.g. 0.018 = 1.8%)
}

export const STOCK_UNIVERSE: StockMeta[] = [
  // Banking & Financials
  { symbol: "HDFCBANK", name: "HDFC Bank", sector: "Banking", baseline: 1680, lotSize: 550, volatility: 0.014 },
  { symbol: "ICICIBANK", name: "ICICI Bank", sector: "Banking", baseline: 1250, lotSize: 700, volatility: 0.016 },
  { symbol: "SBIN", name: "State Bank of India", sector: "Banking", baseline: 820, lotSize: 750, volatility: 0.019 },
  { symbol: "AXISBANK", name: "Axis Bank", sector: "Banking", baseline: 1140, lotSize: 625, volatility: 0.018 },
  { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank", sector: "Banking", baseline: 1760, lotSize: 400, volatility: 0.015 },
  { symbol: "BAJFINANCE", name: "Bajaj Finance", sector: "NBFC", baseline: 6900, lotSize: 125, volatility: 0.022 },

  // IT
  { symbol: "TCS", name: "Tata Consultancy Services", sector: "Information Technology", baseline: 3850, lotSize: 175, volatility: 0.013 },
  { symbol: "INFY", name: "Infosys", sector: "Information Technology", baseline: 1560, lotSize: 400, volatility: 0.015 },
  { symbol: "WIPRO", name: "Wipro", sector: "Information Technology", baseline: 295, lotSize: 3000, volatility: 0.017 },
  { symbol: "HCLTECH", name: "HCL Technologies", sector: "Information Technology", baseline: 1620, lotSize: 350, volatility: 0.014 },

  // Oil, Gas & Energy
  { symbol: "RELIANCE", name: "Reliance Industries", sector: "Oil & Gas / Conglomerate", baseline: 1290, lotSize: 500, volatility: 0.015 },
  { symbol: "ONGC", name: "Oil & Natural Gas Corp", sector: "Oil & Gas", baseline: 265, lotSize: 3850, volatility: 0.021 },
  { symbol: "NTPC", name: "NTPC", sector: "Power", baseline: 360, lotSize: 3500, volatility: 0.017 },
  { symbol: "POWERGRID", name: "Power Grid Corp", sector: "Power", baseline: 320, lotSize: 4000, volatility: 0.014 },

  // Auto
  { symbol: "TATAMOTORS", name: "Tata Motors", sector: "Automobile", baseline: 720, lotSize: 1625, volatility: 0.024 },
  { symbol: "MARUTI", name: "Maruti Suzuki", sector: "Automobile", baseline: 11200, lotSize: 50, volatility: 0.016 },
  { symbol: "M&M", name: "Mahindra & Mahindra", sector: "Automobile", baseline: 2120, lotSize: 350, volatility: 0.018 },
  { symbol: "BAJAJ-AUTO", name: "Bajaj Auto", sector: "Automobile", baseline: 9100, lotSize: 125, volatility: 0.017 },

  // FMCG
  { symbol: "HINDUNILVR", name: "Hindustan Unilever", sector: "FMCG", baseline: 2480, lotSize: 300, volatility: 0.012 },
  { symbol: "ITC", name: "ITC", sector: "FMCG", baseline: 460, lotSize: 1600, volatility: 0.013 },
  { symbol: "NESTLEIND", name: "Nestle India", sector: "FMCG", baseline: 2280, lotSize: 250, volatility: 0.012 },

  // Pharma
  { symbol: "SUNPHARMA", name: "Sun Pharmaceutical", sector: "Pharmaceuticals", baseline: 1780, lotSize: 350, volatility: 0.016 },
  { symbol: "DRREDDY", name: "Dr. Reddy's Labs", sector: "Pharmaceuticals", baseline: 1240, lotSize: 500, volatility: 0.017 },
  { symbol: "CIPLA", name: "Cipla", sector: "Pharmaceuticals", baseline: 1520, lotSize: 425, volatility: 0.016 },

  // Metals
  { symbol: "TATASTEEL", name: "Tata Steel", sector: "Metals", baseline: 150, lotSize: 5500, volatility: 0.023 },
  { symbol: "JSWSTEEL", name: "JSW Steel", sector: "Metals", baseline: 920, lotSize: 675, volatility: 0.02 },
  { symbol: "HINDALCO", name: "Hindalco", sector: "Metals", baseline: 640, lotSize: 1075, volatility: 0.022 },

  // Infra / Capital Goods
  { symbol: "LT", name: "Larsen & Toubro", sector: "Capital Goods", baseline: 3580, lotSize: 150, volatility: 0.015 },

  // Telecom
  { symbol: "BHARTIARTL", name: "Bharti Airtel", sector: "Telecom", baseline: 1620, lotSize: 475, volatility: 0.014 },
];

export const STOCK_BY_SYMBOL: Record<string, StockMeta> = Object.fromEntries(
  STOCK_UNIVERSE.map((s) => [s.symbol, s]),
);

export function getStock(symbol: string): StockMeta | undefined {
  return STOCK_BY_SYMBOL[symbol];
}
