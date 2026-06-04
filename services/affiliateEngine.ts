/**
 * affiliateEngine — Monetización PCI-DSS Compliant (STEP 4)
 *
 * ARQUITECTURA DE COMISIÓN:
 *   • WoW TRENES opera como "Front-End Afiliado Tecnológico".
 *   • El Merchant of Record es siempre el distribuidor (Trainline / Rail Europe).
 *   • Inyectamos un Affiliate ID en CADA petición de compra, client-side.
 *   • Red afiliada: Partnerize (p11p) o Impact Radius — 2%-5% por billete.
 *   • JAMÁS tocamos datos de tarjeta. Zero PCI-DSS scope.
 *
 * FLUJO:
 *   1. buildAffiliateUrl()  — wraps the distributor checkout URL con nuestro tag
 *   2. buildBookingPayload() — inyecta affiliateId + sessionToken en la request
 *   3. parseCommission()    — calcula comisión esperada (display only)
 */
import * as Crypto from 'expo-crypto';
import { Affiliate } from '../theme';
import type { AffiliatePayload, TrainService, SeatClass } from '../types';

// ── Session token (ephemeral — never stored) ──────────────────────────────
let ephemeralSessionId: string | null = null;

async function getSessionId(): Promise<string> {
  if (!ephemeralSessionId) {
    const bytes = await Crypto.getRandomBytesAsync(16);
    ephemeralSessionId = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return ephemeralSessionId;
}

// ── Partnerize wrapped URL ────────────────────────────────────────────────
/**
 * Wraps a Trainline checkout URL with a Partnerize tracking click URL.
 * The click URL redirects to Trainline while crediting the commission to us.
 */
export async function buildAffiliateUrl(
  rawDistributorUrl: string,
  commissionPct?: number,
): Promise<string> {
  const sessionId = await getSessionId();
  const pct       = commissionPct ?? Affiliate.commissionMin;

  // Partnerize click tracking URL format:
  // https://prf.hn/click/camref:{camref}/pubref:{pubref}/destination:{encoded_url}
  const encoded  = encodeURIComponent(rawDistributorUrl);
  const pubref   = `wow_${sessionId.slice(0, 8)}_${Date.now()}`;

  return (
    `https://prf.hn/click/camref:${Affiliate.partnerizeTag}` +
    `/pubref:${pubref}` +
    `/destination:${encoded}`
  );
}

// ── Booking payload builder ───────────────────────────────────────────────
/**
 * Constructs the booking request payload with affiliate metadata injected.
 * This payload is sent client-side to the distributor API.
 * WoW TRENES backend NEVER receives this payload — it goes direct to distributor.
 */
export async function buildBookingPayload(
  service:   TrainService,
  seatClass: SeatClass,
  extraParams?: Record<string, string>,
): Promise<AffiliatePayload & Record<string, unknown>> {
  const sessionId = await getSessionId();

  return {
    // Affiliate tracking — mandatory for commission
    affiliateId:   Affiliate.trackingId,
    trackingTag:   Affiliate.partnerizeTag,
    sessionId,
    timestamp:     Date.now(),
    commissionPct: Affiliate.commissionMin,

    // Booking context
    serviceId:  service.serviceId,
    operator:   service.operator,
    origin:     service.origin.id,
    destination:service.destination.id,
    departure:  service.departureTime.toISOString(),
    class:      seatClass,

    // Impact secondary tracking
    impactSid:  Affiliate.impactSid,
    sku:        `TKT_${service.operator.toUpperCase()}_${service.trainNumber}`,

    ...extraParams,
  };
}

// ── Commission estimate ───────────────────────────────────────────────────
export function estimateCommission(priceEur: number): {
  minEur: number;
  maxEur: number;
  midEur: number;
} {
  return {
    minEur: +(priceEur * Affiliate.commissionMin).toFixed(2),
    maxEur: +(priceEur * Affiliate.commissionMax).toFixed(2),
    midEur: +(priceEur * ((Affiliate.commissionMin + Affiliate.commissionMax) / 2)).toFixed(2),
  };
}

// ── Trainline distributor URL builder ────────────────────────────────────
export function buildTrainlineSearchUrl(
  originId:    string,
  destId:      string,
  departure:   Date,
  passengers:  number = 1,
): string {
  const date = departure.toISOString().slice(0, 16);
  return (
    `https://www.trainline.com/search/${originId}/${destId}` +
    `?departure=${encodeURIComponent(date)}&passengers=${passengers}`
  );
}

// ── Proxy URL — el marker real vive en el servidor, nunca en el cliente ───────
// En dev usa la URL local. En prod usa el servidor Railway de Voxa.
const AFFILIATE_BASE = (process.env.EXPO_PUBLIC_AFFILIATE_PROXY
  ?? 'https://voxa-production-dc15.up.railway.app/affiliate/redirect')
  .replace(/\/redirect$/, ''); // permite endpoint base sin /redirect

const AFFILIATE_PROXY  = `${AFFILIATE_BASE}/redirect`;
const SCENIC_PROXY     = `${AFFILIATE_BASE}/scenic`;
const KLOOK_PROXY      = `${AFFILIATE_BASE}/klook`;
const KIWITAXI_PROXY   = `${AFFILIATE_BASE}/kiwitaxi`;
const YESIM_PROXY      = `${AFFILIATE_BASE}/yesim`;
const TIQETS_PROXY     = `${AFFILIATE_BASE}/tiqets`;
const STORAGE_PROXY    = `${AFFILIATE_BASE}/storage`;
const INSURANCE_PROXY  = `${AFFILIATE_BASE}/insurance`;

/**
 * buildKlookUrl — URL via proxy para Klook (City Cards, experiencias, atracciones).
 * Comisión 2-5%. Programas pre-aprobados en TravelPayouts Mobile app.
 */
export function buildKlookUrl(city?: string, product?: string): string {
  const params = new URLSearchParams();
  if (city)    params.set('city', city);
  if (product) params.set('product', product);
  return `${KLOOK_PROXY}?${params.toString()}`;
}

/**
 * buildKiwitaxiUrl — URL via proxy para transfers aeropuerto-estación.
 * Comisión 9-11%. Pre-aprobado en TravelPayouts.
 */
export function buildKiwitaxiUrl(from: string, to: string, date?: Date): string {
  const params = new URLSearchParams({
    from,
    to,
    date: (date ?? new Date()).toISOString().slice(0, 10),
  });
  return `${KIWITAXI_PROXY}?${params.toString()}`;
}

/**
 * buildYesimUrl — URL via proxy para eSIM Yesim.
 * Comisión 18%. Pre-aprobado en TravelPayouts.
 */
export function buildYesimUrl(countryCode?: string): string {
  const params = new URLSearchParams();
  if (countryCode) params.set('country', countryCode);
  return `${YESIM_PROXY}?${params.toString()}`;
}

/**
 * buildTiqetsUrl — Tickets de museos y atracciones (Sagrada Familia, Coliseo, Louvre...).
 * Comisión 3.5-8%. Pre-aprobado en TravelPayouts.
 */
export function buildTiqetsUrl(): string {
  return TIQETS_PROXY;
}

/**
 * buildStorageUrl — Radical Storage, guardar equipaje en ciudades europeas.
 * Comisión 8%. Pre-aprobado en TravelPayouts.
 */
export function buildStorageUrl(): string {
  return STORAGE_PROXY;
}

/**
 * buildInsuranceUrl — Seguro de viaje EKTA.
 * Comisión 25%. Pre-aprobado en TravelPayouts.
 */
export function buildInsuranceUrl(): string {
  return INSURANCE_PROXY;
}

/**
 * buildScenicTrainUrl — Genera URL via proxy para tren escénico.
 * El proxy elige automáticamente la mejor red afiliada (Awin → TravelPayouts).
 * Cubre Glacier Express, Bernina, GoldenPass, TGV Lyria, Cinque Terre, etc.
 */
export function buildScenicTrainUrl(
  originName: string,
  destName:   string,
  departure?: Date,
): string {
  const date = (departure ?? new Date()).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    origin: originName,
    dest:   destName,
    date,
  });
  return `${SCENIC_PROXY}?${params.toString()}`;
}

/**
 * buildBestBookingUrl — Genera URL via proxy servidor.
 * El marker de Travelpayouts nunca sale del servidor — protección real.
 *
 * El proxy hace:
 *   1. Recibe origen/destino/fecha/país
 *   2. Agrega el marker desde variable de entorno Railway (privada)
 *   3. Redirige 302 → Omio o Trip.com con tracking completo
 */
export function buildBestBookingUrl(
  originName:  string,
  destName:    string,
  departure:   Date,
  countryCode: string,
  passengers:  number = 1,
): string {
  const params = new URLSearchParams({
    origin:     originName,
    dest:       destName,
    date:       departure.toISOString().slice(0, 10),
    country:    countryCode,
    passengers: String(passengers),
  });
  return `${AFFILIATE_PROXY}?${params.toString()}`;
}

/**
 * buildTrainlineByName — Trainline directo por nombre de ciudad.
 * Fallback cuando el proxy affiliate falla o el marker no está aprobado.
 */
export function buildTrainlineByName(
  originName: string,
  destName:   string,
  departure:  Date,
): string {
  const date = departure.toISOString().slice(0, 10);
  return (
    `https://www.thetrainline.com/book/results` +
    `?origin=${encodeURIComponent(originName)}` +
    `&destination=${encodeURIComponent(destName)}` +
    `&outwardDate=${date}` +
    `&outwardDateType=departAfter` +
    `&journeySearchType=single`
  );
}

// Aliases por compatibilidad con código existente
export function buildOmioUrl(
  originName: string, destName: string, departure: Date, passengers = 1,
): string {
  return buildBestBookingUrl(originName, destName, departure, 'ES', passengers);
}

export function buildTripComUrl(
  originName: string, destName: string, departure: Date, passengers = 1,
): string {
  return buildBestBookingUrl(originName, destName, departure, 'JP', passengers);
}
