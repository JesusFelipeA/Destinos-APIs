// Respuestas de ejemplo con el mismo formato que devuelven las API reales
// (recortadas a los campos que usa la app).

export const nominatim = {
  Toluca: [{
    lat: '19.2923', lon: '-99.6569', name: 'Toluca de Lerdo',
    display_name: 'Toluca de Lerdo, Toluca, Estado de México, 50000, México',
    address: { city: 'Toluca de Lerdo', state: 'Estado de México', country: 'México', country_code: 'mx' },
  }],
  Madrid: [{
    lat: '40.4167', lon: '-3.7036', name: 'Madrid',
    display_name: 'Madrid, Área metropolitana de Madrid y Corredor del Henares, Comunidad de Madrid, España',
    address: { city: 'Madrid', state: 'Comunidad de Madrid', country: 'España', country_code: 'es' },
  }],
};

export const openMeteo = (temperatura: number, codigo: number) => ({
  timezone: 'America/Mexico_City',
  current: { time: '2026-11-05T16:00', temperature_2m: temperatura, apparent_temperature: temperatura - 1.2, relative_humidity_2m: 41, wind_speed_10m: 9.7, weather_code: codigo },
  daily: {
    time: ['2026-11-05', '2026-11-06', '2026-11-07'],
    weather_code: [codigo, 61, 3],
    temperature_2m_max: [21.4, 19.8, 20.1],
    temperature_2m_min: [6.2, 7.9, 5.5],
    precipitation_probability_max: [10, 65, 20],
  },
});

// Banco Mundial: [metadatos, datos]. Con /v2/es/ los nombres vienen en español.
const meta = { page: 1, pages: 1, per_page: '50', total: 1 };
export const bancoMundial: Record<string, unknown> = {
  MX: [meta, [{
    id: 'MEX', iso2Code: 'MX', name: 'México', capitalCity: 'Ciudad de México ',
    region: { id: 'LCN', iso2code: 'ZJ', value: 'América Latina y el Caribe ' },
    incomeLevel: { id: 'UMC', iso2code: 'XT', value: 'Ingreso mediano alto' },
    longitude: '-99.1276', latitude: '19.427',
  }]],
  ES: [meta, [{
    id: 'ESP', iso2Code: 'ES', name: 'España', capitalCity: 'Madrid',
    region: { id: 'ECS', iso2code: 'Z7', value: 'Europa y Asia central' },
    incomeLevel: { id: 'HIC', iso2code: 'XD', value: 'Ingreso alto' },
    longitude: '-3.70327', latitude: '40.4167',
  }]],
};
export const poblacion: Record<string, unknown> = {
  MX: [meta, [{ indicator: { id: 'SP.POP.TOTL', value: 'Población, total' }, date: '2024', value: 130861007 }]],
  ES: [meta, [{ indicator: { id: 'SP.POP.TOTL', value: 'Población, total' }, date: '2024', value: 48619695 }]],
};
// Respuesta del Banco Mundial cuando el código no existe
export const codigoInvalido = [{ message: [{ id: '120', key: 'Invalid value', value: 'The provided parameter value is not valid' }] }];

type Ruta = { ok?: boolean; status?: number; json?: unknown; falla?: 'red' | 'json' };

/** fetch simulado: responde según el servicio de la URL. Guarda las URL pedidas. */
export function fetchSimulado(rutas: (url: string) => Ruta) {
  const llamadas: string[] = [];
  const fn = jest.fn(async (url: string, _opciones?: { headers?: Record<string, string> }) => {
    llamadas.push(url);
    const r = rutas(url);
    if (r.falla === 'red') throw new TypeError('Network request failed');
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      json: async () => {
        if (r.falla === 'json') throw new SyntaxError('Unexpected token <');
        return r.json;
      },
    };
  });
  return { fn, llamadas };
}

/** Rutas de un día normal: las tres API responden. */
export const rutasNormales = (url: string): Ruta => {
  if (url.includes('.invalid')) return { falla: 'red' };
  if (url.includes('nominatim')) {
    const q = decodeURIComponent(/q=([^&]+)/.exec(url)![1]);
    return { json: (nominatim as Record<string, unknown>)[q] ?? [] };
  }
  if (url.includes('open-meteo')) return { json: url.includes('latitude=19.2923') ? openMeteo(18.6, 2) : openMeteo(12.3, 0) };
  if (url.includes('worldbank')) {
    const c = /country\/([A-Z]{2})/.exec(url)![1];
    const tabla = url.includes('SP.POP.TOTL') ? poblacion : bancoMundial;
    return { json: tabla[c] ?? codigoInvalido };
  }
  return { status: 404, ok: false };
};
