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

// ── Travelpayouts marker ──────────────────────────────────────────────────
// Señuelo — valor inválido si no hay .env configurado
const TP_MARKER = process.env.EXPO_PUBLIC_TP_MARKER ?? '000000';

/**
 * buildOmioUrl — Deeplink a Omio con tracking Travelpayouts.
 * Omio programa ID 91, comisión 6%, cookie 30 días, mobile web & app.
 *
 * Formato: https://tp.media/r?marker={marker}&p=91&u={encoded_omio_url}
 * Omio busca por nombre de ciudad — usamos los nombres de parada GTFS.
 */
export function buildOmioUrl(
  originName:  string,
  destName:    string,
  departure:   Date,
  passengers:  number = 1,
): string {
  const dateStr = departure.toISOString().slice(0, 10); // YYYY-MM-DD
  const omioBase = 'https://www.omio.com/';
  const omioParams = new URLSearchParams({
    origin:      originName,
    destination: destName,
    departure:   dateStr,
    pax:         String(passengers),
  });
  const omioUrl = `${omioBase}?${omioParams.toString()}`;

  // Wrappear con Travelpayouts redirect para tracking
  return (
    `https://tp.media/r?marker=${TP_MARKER}&p=91` +
    `&u=${encodeURIComponent(omioUrl)}`
  );
}

/**
 * buildTripComUrl — Deeplink a Trip.com con tracking Travelpayouts.
 * Programa ID 121, comisión 1.8% trenes / 5.5% hoteles, mobile web & app.
 */
export function buildTripComUrl(
  originName:  string,
  destName:    string,
  departure:   Date,
  passengers:  number = 1,
): string {
  const dateStr = departure.toISOString().slice(0, 10);
  const tripUrl = `https://www.trip.com/trains/search?` +
    `fromname=${encodeURIComponent(originName)}` +
    `&toname=${encodeURIComponent(destName)}` +
    `&date=${dateStr}&adult=${passengers}`;

  return (
    `https://tp.media/r?marker=${TP_MARKER}&p=121` +
    `&u=${encodeURIComponent(tripUrl)}`
  );
}

/**
 * buildBestBookingUrl — Elige automáticamente el mejor afiliado según el país.
 * Europa → Omio (6%). Asia/global → Trip.com (1.8% trenes).
 */
export function buildBestBookingUrl(
  originName:  string,
  destName:    string,
  departure:   Date,
  countryCode: string,
  passengers:  number = 1,
): string {
  const europeCountries = ['ES','FR','DE','CH','IT','BE','NL','AT','PT','GB','NO','DK'];
  if (europeCountries.includes(countryCode.toUpperCase())) {
    return buildOmioUrl(originName, destName, departure, passengers);
  }
  return buildTripComUrl(originName, destName, departure, passengers);
}
