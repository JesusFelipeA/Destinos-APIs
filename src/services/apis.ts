// Integración de las tres API de terceros.
//
// 1. OpenStreetMap (Nominatim): convierte el nombre de la ciudad en coordenadas, estado y país.
// 2. Open-Meteo: clima actual y pronóstico de 3 días con las coordenadas del paso 1.
// 3. Banco Mundial (World Bank API): datos del país y su población con el código ISO del paso 1.
//    (Sustituye a REST Countries: su versión 3.1 sin llave se retiró en octubre de 2026.)
//
// La API 1 es obligatoria: sin coordenadas ni país no hay qué consultar.
// Las API 2 y 3 se consultan en paralelo con Promise.allSettled: si una falla,
// la otra se muestra igual y solo esa tarjeta indica el error.

import { obtenerJson, ServicioError } from './http';

export const SERVICIOS = {
  lugar: 'OpenStreetMap',
  clima: 'Open-Meteo',
  pais: 'Banco Mundial',
} as const;

export type ClaveServicio = keyof typeof SERVICIOS;

export const BASES: Record<ClaveServicio, string> = {
  lugar: 'https://nominatim.openstreetmap.org',
  clima: 'https://api.open-meteo.com',
  pais: 'https://api.worldbank.org',
};

// ---------- Modo de prueba: simular que una API no está disponible ----------
// Solo cambia la dirección del servicio por una que no existe (dominio .invalid,
// reservado para pruebas), así la falla es real y pasa por el mismo manejo de errores.
let servicioCaido: ClaveServicio | null = null;
export function simularCaida(servicio: ClaveServicio | null) {
  servicioCaido = servicio;
}
export function servicioSimuladoCaido() {
  return servicioCaido;
}
const base = (s: ClaveServicio) => (servicioCaido === s ? 'https://servicio-no-disponible.invalid' : BASES[s]);

// ---------- Tipos de lo que muestra la app ----------
export type Lugar = {
  nombre: string;
  descripcion: string;
  estado: string;
  pais: string;
  codigoPais: string;
  lat: number;
  lon: number;
};

export type Dia = { fecha: string; max: number; min: number; lluvia: number | null; descripcion: string; icono: string };
export type Clima = {
  temperatura: number;
  sensacion: number;
  humedad: number;
  viento: number;
  descripcion: string;
  icono: string;
  hora: string;
  zonaHoraria: string;
  dias: Dia[];
};

export type Pais = {
  nombre: string;
  capital: string;
  region: string;
  ingreso: string;
  poblacion: number | null;
  anioPoblacion: string | null;
  bandera: string | null;
};

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };
export type Destino = { lugar: Lugar; clima: Resultado<Clima>; pais: Resultado<Pais> };

// ---------- API 1 · OpenStreetMap Nominatim ----------
type RespuestaNominatim = Array<{
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  address?: { city?: string; town?: string; village?: string; state?: string; country?: string; country_code?: string };
}>;

export function urlLugar(ciudad: string) {
  const q = encodeURIComponent(ciudad.trim());
  return `${base('lugar')}/search?q=${q}&format=jsonv2&limit=1&addressdetails=1&accept-language=es`;
}

export async function buscarLugar(ciudad: string): Promise<Lugar> {
  const datos = await obtenerJson<RespuestaNominatim>(urlLugar(ciudad), { servicio: SERVICIOS.lugar });
  const r = Array.isArray(datos) ? datos[0] : undefined;
  const lat = Number(r?.lat);
  const lon = Number(r?.lon);
  if (!r || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new ServicioError(SERVICIOS.lugar, 'sin-resultados', `No se encontró "${ciudad.trim()}". Revisa el nombre e inténtalo de nuevo.`);
  }
  const a = r.address || {};
  return {
    nombre: a.city || a.town || a.village || r.name || ciudad.trim(),
    descripcion: r.display_name,
    estado: a.state || '',
    pais: a.country || '',
    codigoPais: (a.country_code || '').toUpperCase(),
    lat,
    lon,
  };
}

// ---------- API 2 · Open-Meteo ----------
// Códigos del clima de la Organización Meteorológica Mundial (WMO) que usa Open-Meteo
const CODIGOS_CLIMA: Array<[number[], string, string]> = [
  [[0], 'Despejado', '☀️'],
  [[1], 'Mayormente despejado', '🌤️'],
  [[2], 'Parcialmente nublado', '⛅'],
  [[3], 'Nublado', '☁️'],
  [[45, 48], 'Niebla', '🌫️'],
  [[51, 53, 55, 56, 57], 'Llovizna', '🌦️'],
  [[61, 63, 65, 66, 67], 'Lluvia', '🌧️'],
  [[71, 73, 75, 77], 'Nieve', '🌨️'],
  [[80, 81, 82], 'Chubascos', '🌦️'],
  [[85, 86], 'Chubascos de nieve', '🌨️'],
  [[95], 'Tormenta', '⛈️'],
  [[96, 99], 'Tormenta con granizo', '⛈️'],
];
export function describirClima(codigo: number) {
  const c = CODIGOS_CLIMA.find(([codigos]) => codigos.includes(codigo));
  return c ? { descripcion: c[1], icono: c[2] } : { descripcion: 'Sin dato', icono: '🌡️' };
}

type RespuestaOpenMeteo = {
  timezone: string;
  current: { time: string; temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number; wind_speed_10m: number; weather_code: number };
  daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max?: (number | null)[]; weather_code: number[] };
};

export function urlClima(lat: number, lon: number) {
  return (
    `${base('clima')}/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    '&timezone=auto&forecast_days=3'
  );
}

export async function obtenerClima(lat: number, lon: number): Promise<Clima> {
  const d = await obtenerJson<RespuestaOpenMeteo>(urlClima(lat, lon), { servicio: SERVICIOS.clima });
  if (!d || !d.current || !d.daily || !Array.isArray(d.daily.time)) {
    throw new ServicioError(SERVICIOS.clima, 'formato', 'Open-Meteo devolvió una respuesta incompleta.');
  }
  const actual = describirClima(d.current.weather_code);
  return {
    temperatura: Math.round(d.current.temperature_2m),
    sensacion: Math.round(d.current.apparent_temperature),
    humedad: Math.round(d.current.relative_humidity_2m),
    viento: Math.round(d.current.wind_speed_10m),
    descripcion: actual.descripcion,
    icono: actual.icono,
    hora: d.current.time,
    zonaHoraria: d.timezone,
    dias: d.daily.time.map((fecha, i) => {
      const c = describirClima(d.daily.weather_code[i]);
      const lluvia = d.daily.precipitation_probability_max ? d.daily.precipitation_probability_max[i] : null;
      return {
        fecha,
        max: Math.round(d.daily.temperature_2m_max[i]),
        min: Math.round(d.daily.temperature_2m_min[i]),
        lluvia: lluvia ?? null,
        descripcion: c.descripcion,
        icono: c.icono,
      };
    }),
  };
}

// ---------- API 3 · Banco Mundial ----------
// La API responde un arreglo de dos posiciones: [metadatos, datos].
// Si el código no existe responde [{ message: [...] }] (sin la posición de datos).
type PaisBM = {
  id: string;
  iso2Code: string;
  name: string;
  capitalCity: string;
  region: { value: string };
  incomeLevel: { value: string };
};
type IndicadorBM = { date: string; value: number | null };
type RespuestaBM<T> = [unknown, T[] | null] | [{ message: unknown[] }];

const datosBM = <T,>(r: RespuestaBM<T> | unknown): T[] => (Array.isArray(r) && Array.isArray(r[1]) ? (r[1] as T[]) : []);
const limpiar = (t?: string) => (t || '').trim();

export function urlPais(codigo: string) {
  return `${base('pais')}/v2/es/country/${encodeURIComponent(codigo)}?format=json`;
}
export function urlPoblacion(codigo: string) {
  // SP.POP.TOTL = población total; mrnev=1 trae el dato no vacío más reciente
  return `${base('pais')}/v2/country/${encodeURIComponent(codigo)}/indicator/SP.POP.TOTL?format=json&mrnev=1`;
}

export async function obtenerPais(codigo: string): Promise<Pais> {
  if (!/^[A-Z]{2}$/.test(codigo)) {
    throw new ServicioError(SERVICIOS.pais, 'sin-resultados', 'La ubicación no tiene un país asociado.');
  }
  // Las dos peticiones van en paralelo; la población es complementaria y puede faltar
  const [pais, poblacion] = await Promise.allSettled([
    obtenerJson<RespuestaBM<PaisBM>>(urlPais(codigo), { servicio: SERVICIOS.pais }),
    obtenerJson<RespuestaBM<IndicadorBM>>(urlPoblacion(codigo), { servicio: SERVICIOS.pais }),
  ]);
  if (pais.status === 'rejected') throw pais.reason;
  const p = datosBM<PaisBM>(pais.value)[0];
  if (!p || !p.name) {
    throw new ServicioError(SERVICIOS.pais, 'sin-resultados', `El Banco Mundial no tiene datos del país ${codigo}.`);
  }
  const dato = poblacion.status === 'fulfilled' ? datosBM<IndicadorBM>(poblacion.value)[0] : undefined;
  return {
    nombre: limpiar(p.name),
    capital: limpiar(p.capitalCity) || 'Sin capital registrada',
    region: limpiar(p.region && p.region.value),
    ingreso: limpiar(p.incomeLevel && p.incomeLevel.value),
    poblacion: dato && typeof dato.value === 'number' ? dato.value : null,
    anioPoblacion: dato && typeof dato.value === 'number' ? dato.date : null,
    // Imagen de la bandera desde la CDN pública flagcdn (no es una API de datos)
    bandera: `https://flagcdn.com/w160/${codigo.toLowerCase()}.png`,
  };
}

// ---------- Consulta completa ----------
const comoResultado = <T,>(r: PromiseSettledResult<T>, servicio: string): Resultado<T> =>
  r.status === 'fulfilled'
    ? { ok: true, datos: r.value }
    : { ok: false, error: r.reason instanceof ServicioError ? r.reason.message : `${servicio} no respondió correctamente.` };

/** Consulta las tres API. Lanza error solo si falla la primera (la ubicación). */
export async function consultarDestino(ciudad: string): Promise<Destino> {
  const lugar = await buscarLugar(ciudad);
  const [clima, pais] = await Promise.allSettled([obtenerClima(lugar.lat, lugar.lon), obtenerPais(lugar.codigoPais)]);
  return { lugar, clima: comoResultado(clima, SERVICIOS.clima), pais: comoResultado(pais, SERVICIOS.pais) };
}

/** Vuelve a consultar solo una API complementaria (botón Reintentar de su tarjeta). */
export async function reintentar(servicio: 'clima' | 'pais', lugar: Lugar): Promise<Resultado<Clima> | Resultado<Pais>> {
  const [r] = await Promise.allSettled([servicio === 'clima' ? obtenerClima(lugar.lat, lugar.lon) : obtenerPais(lugar.codigoPais)]);
  return comoResultado<Clima | Pais>(r, SERVICIOS[servicio]) as Resultado<Clima> | Resultado<Pais>;
}
