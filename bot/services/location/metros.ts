/**
 * Lightweight metro area matching.
 * Used as a fast fallback when geocoded coords aren't available.
 * The real source of truth is Geoapify geocoding (venueGeocoder.ts).
 */

const METROS: string[][] = [
  ['lagos', 'lekki', 'ikeja', 'surulere', 'ikoyi', 'yaba', 'ajah', 'victoria island', 'festac', 'apapa', 'oshodi', 'epe', 'ikotun', 'badagry', 'ikorodu'],
  ['abuja', 'wuse', 'garki', 'maitama', 'gwarinpa', 'kubwa', 'jabi', 'asokoro'],
  ['port harcourt', 'rumuokoro', 'rumuola', 'trans amadi'],
  ['ibadan', 'bodija', 'mokola', 'dugbe'],
  ['accra', 'east legon', 'osu', 'labone', 'tema'],
  ['nairobi', 'westlands', 'kilimani', 'karen'],
]

/** Check whether two city strings belong to the same metro area. */
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
