/**
 * WoW TRENES — Global TypeScript Types
 * RGPD compliant: no user accounts, no personal data in cloud
 */

// ─── GEOGRAPHY ───────────────────────────────────────────────────────────────
export interface Coordinates {
  latitude:  number;
  longitude: number;
}

export interface Station {
  id:          string;   // GTFS stop_id
  name:        string;
  nameLocal:   string;   // Native language name
  country:     CountryCode;
  coordinates: Coordinates;
  platforms:   Platform[];
  uicCode?:    string;   // UIC station code (European standard)
  crsCode?:    string;   // UK/IE CRS code
}

export interface Platform {
  number:   string;
  track?:   string;
  status:   'open' | 'closed' | 'unknown';
}

// ─── TRAIN & SCHEDULES ────────────────────────────────────────────────────────
export type TrainOperator =
  // ── Europa ───────────────────────────────────────────────────────────────
  | 'sncf'        // France — TGV / Intercités
  | 'db'          // Germany — ICE / IC
  | 'renfe'       // Spain — AVE / Alvia / Ouigo
  | 'trenitalia'  // Italy — Frecciarossa / Frecciargento
  | 'ns'          // Netherlands — Intercity Direct
  | 'sbb'         // Switzerland — IC / RE / Glacier Express
  | 'eurostar'    // London ↔ Paris / Brussels
  | 'thalys'      // Brussels ↔ Paris / Amsterdam
  | 'oebb'        // Austria — Railjet / Nightjet (ÖBB)
  | 'dsb'         // Denmark — DSB InterCity / IC3
  | 'avanti'      // UK — West Coast Mainline
  | 'lner'        // UK — East Coast Mainline
  | 'gwr'         // UK — Great Western Railway
  | 'tfl'         // UK — London Underground / TfL (Tube + Elizabeth + Overground + DLR)
  // ── Asia ─────────────────────────────────────────────────────────────────
  | 'jr'          // Japan — JR (Shinkansen + limited express)
  | 'jr_east'     // Japan — JR East (Tohoku / Joetsu Shinkansen)
  | 'jr_central'  // Japan — JR Central (Tokaido Shinkansen)
  | 'jr_west'     // Japan — JR West (Sanyo Shinkansen)
  | 'tokyo_metro' // Japan — Tokyo Metro (urban)
  | 'osaka_metro' // Japan — Osaka Metro (urban)
  | 'crh'         // China — CRH (China Railway High-speed)
  | 'cr'          // China — China Railway general
  | 'maglev'      // China — Shanghai Maglev
  // ── USA Metro ─────────────────────────────────────────────────────────────
  | 'mta_nyc'     // NYC — MTA Subway + LIRR + Metro-North
  | 'cta'         // Chicago — CTA L train
  | 'la_metro'    // Los Angeles — LA Metro Rail (Swiftly RT)
  // ── Metro urbano ──────────────────────────────────────────────────────────
  | 'tmb'         // Barcelona — TMB (L1-L11 + FGC + Rodalies)
  | 'ratp'        // Paris — RATP (Métro + RER via IDFM)
  | 'emt'         // Madrid — EMT + Metro Madrid
  | 'other';

export type TrainType = 'high-speed' | 'intercity' | 'regional' | 'night';

export interface TrainService {
  serviceId:       string;
  operator:        TrainOperator;
  trainType:       TrainType;
  trainNumber:     string;
  origin:          Station;
  destination:     Station;
  departureTime:   Date;
  arrivalTime:     Date;
  platform?:       string;
  delayMinutes:    number;
  status:          'on-time' | 'delayed' | 'cancelled' | 'unknown';
  availableSeats?: number;
  priceEur?:       number;
  classes:         SeatClass[];
}

export type SeatClass = 'first' | 'second' | 'business';

// ─── PREDICTIVE CLOCK STATUS ─────────────────────────────────────────────────
export type ArrivalStatus = 'safe' | 'warn' | 'danger';

export interface PredictiveClock {
  train:           TrainService;
  walkMinutes:     number;   // Time from current location to platform
  bufferMinutes:   number;   // departureTime - now - walkMinutes
  status:          ArrivalStatus;
  transportMode:   TransportMode;
}

// ─── NAVIGATION MODES ────────────────────────────────────────────────────────
export type TransportMode = 'walk' | 'bus' | 'rideshare';

export interface RouteSegment {
  mode:            TransportMode;
  durationMinutes: number;
  distanceMeters:  number;
  polyline?:       Coordinates[];
  deepLink?:       string;   // Uber/Cabify deeplink
}

// ─── COUNTRIES ────────────────────────────────────────────────────────────────
export type CountryCode =
  // Europa — todos con GTFS abierto verificado
  | 'ES' | 'IT' | 'FR' | 'DE' | 'NL' | 'CH' | 'AT' | 'GB' | 'PT' | 'BE'
  | 'NO' | 'DK' | 'US' | 'US_NYC'
  // Metro urbano — sub-ciudades con sistema de metro independiente
  | 'ES_MAD'   // Madrid Metro
  | 'ES_BCN'   // Barcelona Metro (TMB)
  | 'FR_PAR'   // Paris Métro + RER (RATP/IDFM)
  | 'DE_BER'   // Berlin U-Bahn + S-Bahn (BVG)
  | 'DE_MUN'   // Munich U-Bahn + S-Bahn (MVG)
  | 'US_CHI'   // Chicago CTA L
  | 'US_LAX'   // LA Metro Rail
  | 'GB_LON'   // London Underground / TfL
  | 'IT_ROM'   // Roma Metropolitane (A, B, C)
  | 'IT_MIL'   // Milano ATM (M1-M5)
  | 'AT_VIE'   // Wien U-Bahn (U1-U6)
  | 'NL_AMS'   // Amsterdam GVB Metro
  | 'PT_LIS'   // Lisboa Metro (Azul, Amarela, Verde, Vermelha)
  | 'DK_CPH'   // Copenhagen Metro (M1-M4)
  | 'NO_OSL'   // Oslo T-bane (L1-L6)
  | 'BE_BRU'   // Bruxelles STIB (L1,L2,L5,L6)
  // Asia — ODPT (Japón: Tokyo Metro, JR East abiertos)
  | 'JP';
  // CN excluida: China Railway no publica datos abiertos

// Supported UI languages (ISO 639-1)
export type AppLanguage =
  | 'es' | 'en' | 'pt' | 'fr' | 'de' | 'it' | 'ja' | 'zh' | 'ko' | 'ar';

export interface CountryDestination {
  code:        CountryCode;
  name:        string;
  flag:        string;   // emoji
  tagline:     string;
  operator:    TrainOperator;
  trainName:   string;   // AVE, TGV, Frecciarossa...
  imageUrl?:   string;   // bundled asset key
  color:       string;   // accent color for gradient
}

// ─── TICKET / BOOKING ────────────────────────────────────────────────────────
export interface PassengerInfo {
  firstName:      string;
  lastName:       string;
  documentNumber: string; // Passport / DNI / NIE
  email:          string; // Receipt only — not stored in cloud
  nationality:    string;
}

export interface BookingRequest {
  service:       TrainService;
  passengers:    PassengerInfo[];
  seatClass:     SeatClass;
  affiliateId:   string;   // injected client-side
  sessionToken?: string;   // ephemeral, from distributor
}

export interface TicketQR {
  id:              string;   // local UUID
  bookingRef:      string;   // Distributor reference
  qrData:          string;   // Raw QR content (barcode/aztec data)
  qrFormat:        'QR_CODE' | 'AZTEC' | 'PDF_417';
  trainService:    TrainService;
  passenger:       Pick<PassengerInfo, 'firstName' | 'lastName'>;
  issuedAt:        Date;
  validUntil:      Date;
  encryptedBlob?:  string;   // AES-256 encrypted for storage
  operator:        TrainOperator;
}

export type TicketStatus = 'valid' | 'used' | 'expired' | 'cancelled';

export interface StoredTicket extends TicketQR {
  status:           TicketStatus;
  storedAt:         Date;
  associatedStation?:string;  // GTFS stop_id for geofence trigger
}

// ─── GEOFENCE ────────────────────────────────────────────────────────────────
export type GeofenceRing = 'outer' | 'inner';

export interface GeofenceEvent {
  stationId: string;
  ring:      GeofenceRing;
  eventType: 'enter' | 'exit';
  timestamp: Date;
  ticket?:   StoredTicket;
}

// ─── GTFS DATA ───────────────────────────────────────────────────────────────
export interface GTFSStop {
  stop_id:    string;
  stop_name:  string;
  stop_lat:   number;
  stop_lon:   number;
  stop_code?: string;
  location_type?: number;
  parent_station?: string;
}

export interface GTFSTrip {
  route_id:    string;
  service_id:  string;
  trip_id:     string;
  trip_headsign?: string;
  direction_id?: number;
  shape_id?:   string;
}

export interface GTFSStopTime {
  trip_id:        string;
  arrival_time:   string;
  departure_time: string;
  stop_id:        string;
  stop_sequence:  number;
  platform_code?: string;
}

// ─── AFFILIATE / MONETIZATION ─────────────────────────────────────────────────
export interface AffiliatePayload {
  affiliateId:   string;
  trackingTag:   string;
  sessionId:     string;   // ephemeral — not stored
  timestamp:     number;
  commissionPct: number;
}

// ─── API RESPONSES ────────────────────────────────────────────────────────────
export interface RealTimeUpdate {
  serviceId:    string;
  delayMinutes: number;
  platform?:    string;
  status:       TrainService['status'];
  updatedAt:    Date;
}

export interface BookingConfirmation {
  success:      boolean;
  bookingRef:   string;
  ticket?:      TicketQR;
  errorCode?:   string;
  errorMessage?:string;
}
