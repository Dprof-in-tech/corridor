// The African side of the corridor. Weave's payout rail (Paycrest) already
// covers these currencies; a country is "live" once Weave switches it on.
// Corridor is country-agnostic: to add one, add a row here — the recipient
// pills, the landing and /mainnet all read from this list.

export interface AfricanCountry {
  code: string;        // ISO-3166 alpha-2
  name: string;
  currency: string;    // ISO-4217
  symbol: string;
  demonym: string;     // "a bank in Nigeria" → "a Nigerian bank" where needed
  dot: string;         // pill dot colour
  live: boolean;       // switched on in Weave
}

export const AFRICA: AfricanCountry[] = [
  { code: 'NG', name: 'Nigeria',  currency: 'NGN', symbol: '₦',   demonym: 'Nigerian',  dot: '#4F7A5C', live: true },
  { code: 'KE', name: 'Kenya',    currency: 'KES', symbol: 'KSh', demonym: 'Kenyan',    dot: '#B8C7BA', live: false },
  { code: 'UG', name: 'Uganda',   currency: 'UGX', symbol: 'USh', demonym: 'Ugandan',   dot: '#B8C7BA', live: false },
  { code: 'TZ', name: 'Tanzania', currency: 'TZS', symbol: 'TSh', demonym: 'Tanzanian', dot: '#B8C7BA', live: false },
];

export const LIVE_AFRICA = AFRICA.filter(c => c.live);
export const NEXT_AFRICA = AFRICA.filter(c => !c.live);
export const NEXT_CURRENCIES = NEXT_AFRICA.map(c => c.currency).join(' · ');   // "KES · UGX · TZS"
