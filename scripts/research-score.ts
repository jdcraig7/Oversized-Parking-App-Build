// Likely-yield score for a research queue row. Measured on 838 searched
// garages: a website listed -> 34% had a posted height, operator -> 25%,
// institution (university/hospital/airport/city...) -> 24%, plain named -> 22%,
// unnamed or generic ("Parking Garage", "Garage A") -> 9%.

export interface QueueRow {
  name?: string;
  operator?: string;
  website?: string;
}

const GENERIC = /^(parking )?(garage|structure|deck|lot|ramp)( [a-z0-9]+)?$/;
const INSTITUTION = /universit|college|hospital|medical|airport|health|campus|clinic|center|city of|county/;

export function yieldScore(r: QueueRow): number {
  const name = (r.name ?? '').trim().toLowerCase();
  const named = name !== '' && !GENERIC.test(name);
  const inst = INSTITUTION.test(`${name} ${(r.operator ?? '').toLowerCase()}`);
  return (r.website ? 3 : 0) + (r.operator ? 2 : 0) + (inst ? 2 : 0) + (named ? 2 : 0);
}
