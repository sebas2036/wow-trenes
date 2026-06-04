/**
 * partnerOffers.ts — Catálogo de ofertas por ciudad/país.
 *
 * Mapeo: ciudad detectada → productos relevantes (City Card, Transfer, eSIM).
 * Las comisiones son del programa, no aparecen en UI — solo internas.
 */
import { buildKlookUrl, buildKiwitaxiUrl, buildYesimUrl } from '../services/affiliateEngine';
import type { PartnerCardProps } from '../components/PartnerCard';

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
      icon: 'car-sport-outline',
      title: 'Transfer Barajas → centro',
      subtitle: 'Taxi privado desde el aeropuerto · desde €30',
      cta: 'Reservar',
      url: buildKiwitaxiUrl('Barajas Airport', 'Madrid'),
      colors: ['#F59E0B', '#D97706'],
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
      icon: 'car-sport-outline',
      title: 'Transfer El Prat → centro',
      subtitle: 'Taxi privado desde el aeropuerto · desde €35',
      cta: 'Reservar',
      url: buildKiwitaxiUrl('El Prat Airport', 'Barcelona'),
      colors: ['#F59E0B', '#D97706'],
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
      icon: 'car-sport-outline',
      title: 'Transfer CDG → centro',
      subtitle: 'Taxi privado desde el aeropuerto · desde €55',
      cta: 'Reservar',
      url: buildKiwitaxiUrl('Charles de Gaulle Airport', 'Paris'),
      colors: ['#F59E0B', '#D97706'],
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
      icon: 'car-sport-outline',
      title: 'Transfer Fiumicino → centro',
      subtitle: 'Taxi privado desde el aeropuerto · desde €45',
      cta: 'Reservar',
      url: buildKiwitaxiUrl('Fiumicino Airport', 'Roma'),
      colors: ['#F59E0B', '#D97706'],
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
      icon: 'car-sport-outline',
      title: 'Transfer Heathrow → centro',
      subtitle: 'Taxi privado desde el aeropuerto · desde £55',
      cta: 'Reservar',
      url: buildKiwitaxiUrl('Heathrow Airport', 'London'),
      colors: ['#F59E0B', '#D97706'],
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
  ],
};

// eSIM Yesim — universal, se muestra en pantalla internacional
export function getYesimOffer(countryCode?: string): PartnerCardProps {
  return {
    icon: 'globe-outline',
    title: 'eSIM Europa · Yesim',
    subtitle: 'Internet en 30+ países · desde €4.90',
    cta: 'Activar',
    url: buildYesimUrl(countryCode),
    colors: ['#10B981', '#059669'],
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
