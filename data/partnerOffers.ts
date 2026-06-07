/**
 * partnerOffers.ts — Catálogo de ofertas por ciudad/país.
 *
 * Mapeo: ciudad detectada → productos relevantes (City Card, Transfer, eSIM).
 * Las comisiones son del programa, no aparecen en UI — solo internas.
 */
import { buildKlookUrl, buildKiwitaxiUrl, buildYesimUrl, buildTiqetsUrl, buildStorageUrl, buildInsuranceUrl } from '../services/affiliateEngine';
import type { PartnerCardProps } from '../components/PartnerCard';
import { t } from '../services/i18n';

// Ofertas estándar por ciudad
const CITY_OFFERS: Record<string, PartnerCardProps[]> = {
  MADRID: [
    {
      icon: 'card-outline',
      title: 'Madrid City Card',
      subtitle: 'Metro ilimitado + 50 atracciones · desde €55',
      cta: 'Reservar',
      url: buildKlookUrl('madrid', 'Madrid City Card'),
      colors: ['#7C3AED', '#5B21B6'],
      highlight: true,
    },
    {
      icon: 'ticket-outline',
      title: 'Museo del Prado · sin fila',
      subtitle: 'Entrada prioritaria al Prado, Reina Sofía y más',
      cta: 'Ver entradas',
      url: buildTiqetsUrl(),
      colors: ['#EC4899', '#BE185D'],
    },
    {
      icon: 'car-sport-outline',
      title: 'Transfer Barajas → centro',
      subtitle: 'Taxi privado desde el aeropuerto · desde €30',
      cta: 'Reservar',
      url: buildKiwitaxiUrl('Barajas Airport', 'Madrid'),
      colors: ['#F59E0B', '#D97706'],
    },
    {
      icon: 'bag-handle-outline',
      title: 'Guardar equipaje · Madrid',
      subtitle: 'Custodia segura cerca de Atocha · desde €5',
      cta: 'Buscar',
      url: buildStorageUrl(),
      colors: ['#0EA5E9', '#0369A1'],
    },
  ],
  BARCELONA: [
    {
      icon: 'card-outline',
      title: 'Barcelona Card',
      subtitle: 'Transporte público + descuentos · desde €48',
      cta: 'Reservar',
      url: buildKlookUrl('barcelona', 'Barcelona Card'),
      colors: ['#7C3AED', '#5B21B6'],
      highlight: true,
    },
    {
      icon: 'ticket-outline',
      title: 'Sagrada Familia · sin fila',
      subtitle: 'Entrada prioritaria + Parc Güell, Casa Batlló',
      cta: 'Ver entradas',
      url: buildTiqetsUrl(),
      colors: ['#EC4899', '#BE185D'],
    },
    {
      icon: 'car-sport-outline',
      title: 'Transfer El Prat → centro',
      subtitle: 'Taxi privado desde el aeropuerto · desde €35',
      cta: 'Reservar',
      url: buildKiwitaxiUrl('El Prat Airport', 'Barcelona'),
      colors: ['#F59E0B', '#D97706'],
    },
    {
      icon: 'bag-handle-outline',
      title: 'Guardar equipaje · Barcelona',
      subtitle: 'Custodia segura cerca de Sants · desde €5',
      cta: 'Buscar',
      url: buildStorageUrl(),
      colors: ['#0EA5E9', '#0369A1'],
    },
  ],
  PARIS: [
    {
      icon: 'card-outline',
      title: 'Paris Pass',
      subtitle: 'Metro + 80 atracciones · desde €99',
      cta: 'Reservar',
      url: buildKlookUrl('paris', 'Paris Pass'),
      colors: ['#7C3AED', '#5B21B6'],
      highlight: true,
    },
    {
      icon: 'ticket-outline',
      title: 'Louvre · Torre Eiffel · sin fila',
      subtitle: 'Entrada prioritaria a las atracciones de París',
      cta: 'Ver entradas',
      url: buildTiqetsUrl(),
      colors: ['#EC4899', '#BE185D'],
    },
    {
      icon: 'car-sport-outline',
      title: 'Transfer CDG → centro',
      subtitle: 'Taxi privado desde el aeropuerto · desde €55',
      cta: 'Reservar',
      url: buildKiwitaxiUrl('Charles de Gaulle Airport', 'Paris'),
      colors: ['#F59E0B', '#D97706'],
    },
    {
      icon: 'bag-handle-outline',
      title: 'Guardar equipaje · París',
      subtitle: 'Custodia segura cerca de Gare du Nord · desde €5',
      cta: 'Buscar',
      url: buildStorageUrl(),
      colors: ['#0EA5E9', '#0369A1'],
    },
  ],
  ROMA: [
    {
      icon: 'card-outline',
      title: 'Roma Pass',
      subtitle: 'Transporte + 2 museos gratis · desde €32',
      cta: 'Reservar',
      url: buildKlookUrl('roma', 'Roma Pass'),
      colors: ['#7C3AED', '#5B21B6'],
      highlight: true,
    },
    {
      icon: 'ticket-outline',
      title: 'Coliseo · Vaticano · sin fila',
      subtitle: 'Entrada prioritaria a las atracciones de Roma',
      cta: 'Ver entradas',
      url: buildTiqetsUrl(),
      colors: ['#EC4899', '#BE185D'],
    },
    {
      icon: 'car-sport-outline',
      title: 'Transfer Fiumicino → centro',
      subtitle: 'Taxi privado desde el aeropuerto · desde €45',
      cta: 'Reservar',
      url: buildKiwitaxiUrl('Fiumicino Airport', 'Roma'),
      colors: ['#F59E0B', '#D97706'],
    },
    {
      icon: 'bag-handle-outline',
      title: 'Guardar equipaje · Roma',
      subtitle: 'Custodia segura cerca de Termini · desde €5',
      cta: 'Buscar',
      url: buildStorageUrl(),
      colors: ['#0EA5E9', '#0369A1'],
    },
  ],
  LONDON: [
    {
      icon: 'card-outline',
      title: 'London Pass',
      subtitle: 'Tube + 90 atracciones · desde £79',
      cta: 'Reservar',
      url: buildKlookUrl('london', 'London Pass'),
      colors: ['#7C3AED', '#5B21B6'],
      highlight: true,
    },
    {
      icon: 'ticket-outline',
      title: 'Tower of London · sin fila',
      subtitle: 'Entrada prioritaria a las atracciones de Londres',
      cta: 'Ver entradas',
      url: buildTiqetsUrl(),
      colors: ['#EC4899', '#BE185D'],
    },
    {
      icon: 'car-sport-outline',
      title: 'Transfer Heathrow → centro',
      subtitle: 'Taxi privado desde el aeropuerto · desde £55',
      cta: 'Reservar',
      url: buildKiwitaxiUrl('Heathrow Airport', 'London'),
      colors: ['#F59E0B', '#D97706'],
    },
    {
      icon: 'bag-handle-outline',
      title: 'Guardar equipaje · Londres',
      subtitle: "Custodia segura cerca de King's Cross · desde £5",
      cta: 'Buscar',
      url: buildStorageUrl(),
      colors: ['#0EA5E9', '#0369A1'],
    },
  ],
  BERLIN: [
    {
      icon: 'card-outline',
      title: 'Berlin WelcomeCard',
      subtitle: 'BVG + descuentos en museos · desde €25',
      cta: 'Reservar',
      url: buildKlookUrl('berlin', 'Berlin WelcomeCard'),
      colors: ['#7C3AED', '#5B21B6'],
      highlight: true,
    },
    {
      icon: 'ticket-outline',
      title: 'Museo de Pérgamo · sin fila',
      subtitle: 'Entrada prioritaria a museos de Berlín',
      cta: 'Ver entradas',
      url: buildTiqetsUrl(),
      colors: ['#EC4899', '#BE185D'],
    },
    {
      icon: 'bag-handle-outline',
      title: 'Guardar equipaje · Berlín',
      subtitle: 'Custodia segura cerca de Hauptbahnhof · desde €5',
      cta: 'Buscar',
      url: buildStorageUrl(),
      colors: ['#0EA5E9', '#0369A1'],
    },
  ],
};

// ── Ofertas universales (aplican a cualquier ciudad) ──────────────────────────

export function getYesimOffer(countryCode?: string): PartnerCardProps {
  return {
    icon: 'globe-outline',
    title: t('p_yesim_title'),
    subtitle: t('p_yesim_sub'),
    cta: t('p_yesim_cta'),
    url: buildYesimUrl(countryCode),
    colors: ['#10B981', '#059669'],
    highlight: true,
  };
}

export function getTiqetsOffer(): PartnerCardProps {
  return {
    icon: 'ticket-outline',
    title: t('p_tiqets_title'),
    subtitle: t('p_tiqets_sub'),
    cta: t('p_tiqets_cta'),
    url: buildTiqetsUrl(),
    colors: ['#EC4899', '#BE185D'],
  };
}

export function getStorageOffer(): PartnerCardProps {
  return {
    icon: 'bag-handle-outline',
    title: t('p_storage_title'),
    subtitle: t('p_storage_sub'),
    cta: t('p_storage_cta'),
    url: buildStorageUrl(),
    colors: ['#0EA5E9', '#0369A1'],
  };
}

export function getInsuranceOffer(): PartnerCardProps {
  return {
    icon: 'shield-checkmark-outline',
    title: t('p_insurance_title'),
    subtitle: t('p_insurance_sub'),
    cta: t('p_insurance_cta'),
    url: buildInsuranceUrl(),
    colors: ['#EF4444', '#B91C1C'],
    highlight: true,
  };
}

/**
 * getCityOffers — devuelve ofertas relevantes según ciudad detectada.
 * Si la ciudad no está en el catálogo, devuelve array vacío.
 */
export function getCityOffers(cityName: string): PartnerCardProps[] {
  const key = cityName
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');  // remueve acentos

  // Buscar match exacto o por inclusión
  for (const cityKey of Object.keys(CITY_OFFERS)) {
    if (key.includes(cityKey)) {
      return CITY_OFFERS[cityKey];
    }
  }
  return [];
}
