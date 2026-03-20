/**
 * Metro area groupings for Nigerian cities.
 * Used to match events without coordinates to the user's search area.
 * An event in "Ikeja" should match a user searching in "Lagos".
 */

const METROS: string[][] = [
  ['lagos', 'lekki', 'victoria island', 'ikeja', 'surulere', 'ikoyi', 'yaba', 'ajah', 'oshodi', 'ikotun', 'agege', 'epe', 'badagry', 'ikorodu', 'festac', 'apapa', 'mushin', 'ogba', 'maryland', 'ojota', 'ogudu', 'gbagada', 'berger', 'magodo', 'ketu', 'ojodu', 'oregun', 'omole', 'anthony', 'palmgrove', 'bariga', 'elegushi'],
  ['abuja', 'wuse', 'garki', 'maitama', 'gwarinpa', 'kubwa', 'jabi', 'asokoro', 'lugbe', 'nyanya', 'karu'],
  ['port harcourt', 'ph', 'rumuokoro', 'eleme', 'rumuola', 'trans amadi', 'dline', 'old gra'],
  ['ibadan', 'bodija', 'challenge', 'mokola', 'dugbe', 'ojoo'],
  ['enugu', 'independence layout', 'new haven', 'ogui', 'achara'],
  ['kano', 'nassarawa', 'fagge', 'sabon gari'],
  ['benin city', 'benin', 'uselu', 'ugbowo', 'sapele road'],
  ['calabar', 'marian', 'watt'],
  ['accra', 'east legon', 'osu', 'labone', 'airport residential', 'cantonments', 'madina', 'tema'],
  ['nairobi', 'westlands', 'kilimani', 'karen', 'lavington', 'kileleshwa', 'hurlingham'],
]

/** Check whether an event's city belongs to the same metro as the user's search city. */
export function isSameMetro(eventCity: string, searchCity: string): boolean {
  const ec = eventCity.toLowerCase().trim()
  const sc = searchCity.toLowerCase().trim()

  if (ec === sc || ec.includes(sc) || sc.includes(ec)) return true

  for (const metro of METROS) {
    const ecMatch = metro.some((m) => ec.includes(m) || m.includes(ec))
    const scMatch = metro.some((m) => sc.includes(m) || m.includes(sc))
    if (ecMatch && scMatch) return true
  }

  return false
}
