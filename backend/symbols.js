/**
 * The Nifty 50 universe, shared by the API and the docs.
 *
 * `yahoo` is the ticker suffix used by Yahoo Finance for the NSE listing.
 * Nothing here is a price: prices only ever come from the upstream feed.
 */

const SYMBOLS = [
  { symbol: 'ADANIENT', name: 'Adani Enterprises', sector: 'Conglomerate', yahoo: 'ADANIENT.NS' },
  { symbol: 'ADANIPORTS', name: 'Adani Ports', sector: 'Infrastructure', yahoo: 'ADANIPORTS.NS' },
  { symbol: 'APOLLOHOSP', name: 'Apollo Hospitals', sector: 'Healthcare', yahoo: 'APOLLOHOSP.NS' },
  { symbol: 'ASIANPAINT', name: 'Asian Paints', sector: 'Consumer', yahoo: 'ASIANPAINT.NS' },
  { symbol: 'AXISBANK', name: 'Axis Bank', sector: 'Financials', yahoo: 'AXISBANK.NS' },
  { symbol: 'BAJAJ-AUTO', name: 'Bajaj Auto', sector: 'Auto', yahoo: 'BAJAJ-AUTO.NS' },
  { symbol: 'BAJAJFINSV', name: 'Bajaj Finserv', sector: 'Financials', yahoo: 'BAJAJFINSV.NS' },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance', sector: 'Financials', yahoo: 'BAJFINANCE.NS' },
  { symbol: 'BEL', name: 'Bharat Electronics', sector: 'Defence', yahoo: 'BEL.NS' },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel', sector: 'Telecom', yahoo: 'BHARTIARTL.NS' },
  { symbol: 'BSE', name: 'BSE Ltd', sector: 'Financials', yahoo: 'BSE.NS' },
  { symbol: 'CIPLA', name: 'Cipla', sector: 'Healthcare', yahoo: 'CIPLA.NS' },
  { symbol: 'COALINDIA', name: 'Coal India', sector: 'Energy', yahoo: 'COALINDIA.NS' },
  { symbol: 'DRREDDY', name: "Dr Reddy's Labs", sector: 'Healthcare', yahoo: 'DRREDDY.NS' },
  { symbol: 'EICHERMOT', name: 'Eicher Motors', sector: 'Auto', yahoo: 'EICHERMOT.NS' },
  { symbol: 'ETERNAL', name: 'Eternal/Zomato', sector: 'Consumer Tech', yahoo: 'ETERNAL.NS' },
  { symbol: 'GRASIM', name: 'Grasim Industries', sector: 'Industrials', yahoo: 'GRASIM.NS' },
  { symbol: 'HCLTECH', name: 'HCL Technologies', sector: 'IT', yahoo: 'HCLTECH.NS' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank', sector: 'Financials', yahoo: 'HDFCBANK.NS' },
  { symbol: 'HDFCLIFE', name: 'HDFC Life', sector: 'Financials', yahoo: 'HDFCLIFE.NS' },
  { symbol: 'HINDALCO', name: 'Hindalco', sector: 'Metals', yahoo: 'HINDALCO.NS' },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever', sector: 'FMCG', yahoo: 'HINDUNILVR.NS' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', sector: 'Financials', yahoo: 'ICICIBANK.NS' },
  { symbol: 'INDIGO', name: 'InterGlobe Aviation', sector: 'Aviation', yahoo: 'INDIGO.NS' },
  { symbol: 'INFY', name: 'Infosys', sector: 'IT', yahoo: 'INFY.NS' },
  { symbol: 'ITC', name: 'ITC', sector: 'FMCG', yahoo: 'ITC.NS' },
  { symbol: 'JIOFIN', name: 'Jio Financial', sector: 'Financials', yahoo: 'JIOFIN.NS' },
  { symbol: 'JSWSTEEL', name: 'JSW Steel', sector: 'Metals', yahoo: 'JSWSTEEL.NS' },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank', sector: 'Financials', yahoo: 'KOTAKBANK.NS' },
  { symbol: 'LT', name: 'Larsen & Toubro', sector: 'Infrastructure', yahoo: 'LT.NS' },
  { symbol: 'M&M', name: 'Mahindra & Mahindra', sector: 'Auto', yahoo: 'M&M.NS' },
  { symbol: 'MARUTI', name: 'Maruti Suzuki', sector: 'Auto', yahoo: 'MARUTI.NS' },
  { symbol: 'MAXHEALTH', name: 'Max Healthcare', sector: 'Healthcare', yahoo: 'MAXHEALTH.NS' },
  { symbol: 'NESTLEIND', name: 'Nestle India', sector: 'FMCG', yahoo: 'NESTLEIND.NS' },
  { symbol: 'NTPC', name: 'NTPC', sector: 'Energy', yahoo: 'NTPC.NS' },
  { symbol: 'ONGC', name: 'ONGC', sector: 'Energy', yahoo: 'ONGC.NS' },
  { symbol: 'POWERGRID', name: 'Power Grid', sector: 'Energy', yahoo: 'POWERGRID.NS' },
  { symbol: 'RELIANCE', name: 'Reliance Industries', sector: 'Energy', yahoo: 'RELIANCE.NS' },
  { symbol: 'SBILIFE', name: 'SBI Life', sector: 'Financials', yahoo: 'SBILIFE.NS' },
  { symbol: 'SBIN', name: 'State Bank of India', sector: 'Financials', yahoo: 'SBIN.NS' },
  { symbol: 'SHRIRAMFIN', name: 'Shriram Finance', sector: 'Financials', yahoo: 'SHRIRAMFIN.NS' },
  { symbol: 'SUNPHARMA', name: 'Sun Pharma', sector: 'Healthcare', yahoo: 'SUNPHARMA.NS' },
  { symbol: 'TATACONSUM', name: 'Tata Consumer', sector: 'FMCG', yahoo: 'TATACONSUM.NS' },
  { symbol: 'TATASTEEL', name: 'Tata Steel', sector: 'Metals', yahoo: 'TATASTEEL.NS' },
  { symbol: 'TCS', name: 'TCS', sector: 'IT', yahoo: 'TCS.NS' },
  { symbol: 'TECHM', name: 'Tech Mahindra', sector: 'IT', yahoo: 'TECHM.NS' },
  { symbol: 'TITAN', name: 'Titan Company', sector: 'Consumer', yahoo: 'TITAN.NS' },
  { symbol: 'TMPV', name: 'Tata Motors PV', sector: 'Auto', yahoo: 'TMPV.NS' },
  { symbol: 'TRENT', name: 'Trent', sector: 'Consumer', yahoo: 'TRENT.NS' },
  { symbol: 'ULTRACEMCO', name: 'UltraTech Cement', sector: 'Industrials', yahoo: 'ULTRACEMCO.NS' },
];

const BY_SYMBOL = new Map(SYMBOLS.map((s) => [s.symbol.toUpperCase(), s]));

module.exports = { SYMBOLS, BY_SYMBOL };
