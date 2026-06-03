/**
 * stationTranslations — Traducciones de nombres de ciudades a nombres de estaciones GTFS
 *
 * Un hispanohablante escribe "Florencia" → la DB italiana tiene "Firenze"
 * Un hispanohablante escribe "Viena" → la DB austríaca tiene "Wien"
 *
 * Formato: clave en minúsculas sin acentos → nombre GTFS exacto o prefijo de búsqueda
 *
 * Uso: translateStationQuery(query) devuelve el término normalizado para buscar en GTFS
 */

// ── Mapa de traducciones ──────────────────────────────────────────────────────
// Clave: variantes en español/inglés (minúsculas, sin acentos)
// Valor: término de búsqueda que coincide con el nombre en la DB GTFS

const TRANSLATIONS: Record<string, string> = {

  // ── ITALIA ────────────────────────────────────────────────────────────────
  'florencia':       'Firenze',
  'florencia smn':   'Firenze Smn',
  'florence':        'Firenze',
  'milan':           'Milano',
  'milán':           'Milano',
  'milan central':   'Milano Centrale',
  'milan centrale':  'Milano Centrale',
  'venecia':         'Venezia',
  'venice':          'Venezia',
  'venezia sc':      'Venezia Santa Lucia',
  'napoles':         'Napoli',
  'nápoles':         'Napoli',
  'naples':          'Napoli',
  'turin':           'Torino',
  'turín':           'Torino',
  'genova':          'Genova',
  'génova':          'Genova',
  'bolonia':         'Bologna',
  'bologna':         'Bologna',
  'pisa':            'Pisa',
  'siena':           'Siena',
  'bari':            'Bari',
  'palermo':         'Palermo',
  'catania':         'Catania',
  'verona':          'Verona',
  'padova':          'Padova',
  'padua':           'Padova',
  'trieste':         'Trieste',
  'perugia':         'Perugia',
  'assisi':          'Assisi',
  'asís':            'Assisi',

  // ── ALEMANIA ──────────────────────────────────────────────────────────────
  'munich':          'München',
  'múnich':          'München',
  'munchen':         'München',
  'colonia':         'Köln',
  'cologne':         'Köln',
  'koln':            'Köln',
  'dusseldorf':      'Düsseldorf',
  'düsseldorf':      'Düsseldorf',
  'nuremberg':       'Nürnberg',
  'núremberg':       'Nürnberg',
  'nurnberg':        'Nürnberg',
  'hamburgo':        'Hamburg',
  'hamburg':         'Hamburg',
  'frankfurt':       'Frankfurt',
  'francfort':       'Frankfurt',
  'berlín':          'Berlin',
  'berlin':          'Berlin',
  'stuttgart':       'Stuttgart',
  'hannover':        'Hannover',
  'leipzig':         'Leipzig',
  'dresde':          'Dresden',
  'dresden':         'Dresden',
  'bonn':            'Bonn',
  'bremen':          'Bremen',

  // ── AUSTRIA ───────────────────────────────────────────────────────────────
  'viena':           'Wien',
  'vienna':          'Wien',
  'wien':            'Wien',
  'salzburgo':       'Salzburg',
  'salzburg':        'Salzburg',
  'innsbruck':       'Innsbruck',
  'graz':            'Graz',
  'linz':            'Linz',

  // ── SUIZA ─────────────────────────────────────────────────────────────────
  'zurich':          'Zürich',
  'zúrich':          'Zürich',
  'zürich':          'Zürich',
  'ginebra':         'Genève',
  'geneva':          'Genève',
  'geneve':          'Genève',
  'genf':            'Genève',
  'basilea':         'Basel',
  'bale':            'Basel',
  'berna':           'Bern',
  'berne':           'Bern',
  'lausana':         'Lausanne',
  'lausanne':        'Lausanne',
  'lucerna':         'Luzern',
  'luzern':          'Luzern',
  'lucerne':         'Luzern',
  'lugano':          'Lugano',
  'interlaken':      'Interlaken',
  'zermatt':         'Zermatt',
  'st gallen':       'St. Gallen',
  'san galo':        'St. Gallen',

  // ── FRANCIA ───────────────────────────────────────────────────────────────
  'paris':           'Paris',
  'parís':           'Paris',
  'lyon':            'Lyon',
  'marsella':        'Marseille',
  'marseille':       'Marseille',
  'burdeos':         'Bordeaux',
  'bordeaux':        'Bordeaux',
  'niza':            'Nice',
  'nice':            'Nice',
  'estrasburgo':     'Strasbourg',
  'strasbourg':      'Strasbourg',
  'toulouse':        'Toulouse',
  'nantes':          'Nantes',
  'lille':           'Lille',
  'montpellier':     'Montpellier',
  'rennes':          'Rennes',
  'grenoble':        'Grenoble',
  'nimes':           'Nîmes',
  'avignon':         'Avignon',
  'tours':           'Tours',
  'dijon':           'Dijon',
  'annecy':          'Annecy',
  'cannes':          'Cannes',

  // ── BÉLGICA ───────────────────────────────────────────────────────────────
  'bruselas':        'Bruxelles',
  'brussels':        'Bruxelles',
  'brujas':          'Brugge',
  'bruges':          'Brugge',
  'gante':           'Gent',
  'ghent':           'Gent',
  'gand':            'Gent',
  'amberes':         'Antwerpen',
  'anvers':          'Antwerpen',
  'antwerp':         'Antwerpen',
  'lieja':           'Liège',
  'liege':           'Liège',
  'lüttich':         'Liège',

  // ── PAÍSES BAJOS ──────────────────────────────────────────────────────────
  'amsterdam':       'Amsterdam',
  'rotterdam':       'Rotterdam',
  'la haya':         'Den Haag',
  'the hague':       'Den Haag',
  'utrecht':         'Utrecht',
  'eindhoven':       'Eindhoven',
  'groningen':       'Groningen',
  'maastricht':      'Maastricht',
  'haarlem':         'Haarlem',
  'leiden':          'Leiden',
  'delft':           'Delft',

  // ── PORTUGAL ──────────────────────────────────────────────────────────────
  'lisboa':          'Lisboa',
  'lisbon':          'Lisboa',
  'oporto':          'Porto',
  'porto':           'Porto',
  'coimbra':         'Coimbra',
  'faro':            'Faro',
  'braga':           'Braga',
  'evora':           'Évora',
  'évora':           'Évora',
  'sintra':          'Sintra',
  'cascais':         'Cascais',

  // ── ESPAÑA ────────────────────────────────────────────────────────────────
  'madrid':          'Madrid',
  'barcelona':       'Barcelona',
  'sevilla':         'Sevilla',
  'seville':         'Sevilla',
  'valencia':        'València',
  'bilbao':          'Bilbao',
  'zaragoza':        'Zaragoza',
  'malaga':          'Málaga',
  'málaga':          'Málaga',
  'cordoba':         'Córdoba',
  'córdoba':         'Córdoba',
  'granada':         'Granada',
  'alicante':        'Alicante',
  'valladolid':      'Valladolid',
  'vigo':            'Vigo',
  'salamanca':       'Salamanca',
  'toledo':          'Toledo',
  'burgos':          'Burgos',
  'leon':            'León',
  'león':            'León',
  'santiago':        'Santiago de Compostela',
  'la coruña':       'A Coruña',
  'pamplona':        'Pamplona',
  'san sebastian':   'Donostia-San Sebastián',
  'donostia':        'Donostia-San Sebastián',
  'tarragona':       'Tarragona',
  'lleida':          'Lleida-Pirineus',
  'lerida':          'Lleida-Pirineus',
  'logroño':         'Logroño',
  'logrono':         'Logroño',
  'murcia':          'Murcia',
  'almeria':         'Almería',
  'almería':         'Almería',
  'cadiz':           'Cádiz',
  'cádiz':           'Cádiz',
  'huesca':          'Huesca',
  'teruel':          'Teruel',
  'albacete':        'Albacete-Los Llanos',
  'cuenca':          'Cuenca Fernando Zóbel',
  'ciudad real':     'Ciudad Real',
  'puertollano':     'Puertollano',
};

// ── Función de normalización ──────────────────────────────────────────────────
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quitar acentos
    .trim();
}

/**
 * translateStationQuery — traduce el texto del usuario al nombre GTFS
 *
 * Ejemplos:
 *   "Florencia"  → "Firenze"
 *   "Viena"      → "Wien"
 *   "Munich"     → "München"
 *   "Barcelona"  → "Barcelona" (sin cambio)
 *   "Firenze"    → "Firenze"   (ya está en formato GTFS)
 */
export function translateStationQuery(query: string): string {
  const key = normalize(query);

  // Búsqueda exacta
  if (TRANSLATIONS[key]) return TRANSLATIONS[key];

  // Búsqueda parcial — si el query empieza con una clave conocida
  for (const [k, v] of Object.entries(TRANSLATIONS)) {
    if (key.startsWith(k) || k.startsWith(key)) {
      return v;
    }
  }

  // Sin traducción → devolver el original (puede que ya esté en formato GTFS)
  return query;
}

export default TRANSLATIONS;
