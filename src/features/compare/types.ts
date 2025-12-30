export type TransitLeg = { kind: 'walking' | 'taxi' | 'bus' | 'subway' | 'railway'; label: string; distanceMeters?: number }
export type TravelMode = 'driving' | 'walking' | 'cycling'

export type Settings = { amapKey: string; amapWebKey: string; amapSecurityCode: string; candidateLimit: number }
export type SettingsDraft = { amapKey: string; amapWebKey: string; amapSecurityCode: string; candidateLimit: string }
