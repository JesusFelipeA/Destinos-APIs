// Pruebas de la integración de las tres API (Parte 3 de la actividad).
import { consultarDestino, describirClima, obtenerPais, simularCaida, urlClima, urlLugar, urlPais, urlPoblacion } from '../src/services/apis';
import { obtenerJson, ServicioError } from '../src/services/http';
import { codigoInvalido, fetchSimulado, rutasNormales } from '../__fixtures__/respuestas';

afterEach(() => { simularCaida(null); jest.useRealTimers(); });

test('las tres URL usan HTTPS y llevan los parámetros correctos', () => {
  expect(urlLugar(' Toluca ')).toBe('https://nominatim.openstreetmap.org/search?q=Toluca&format=jsonv2&limit=1&addressdetails=1&accept-language=es');
  expect(urlClima(19.2923, -99.6569)).toMatch(/^https:\/\/api\.open-meteo\.com\/v1\/forecast\?latitude=19\.2923&longitude=-99\.6569&current=.*&timezone=auto&forecast_days=3$/);
  expect(urlPais('MX')).toBe('https://api.worldbank.org/v2/es/country/MX?format=json');
  expect(urlPoblacion('MX')).toBe('https://api.worldbank.org/v2/country/MX/indicator/SP.POP.TOTL?format=json&mrnev=1');
});

test('consulta encadenada: las coordenadas y el país de OpenStreetMap alimentan a las otras dos API', async () => {
  const { fn, llamadas } = fetchSimulado(rutasNormales);
  globalThis.fetch = fn as unknown as typeof fetch;
  const d = await consultarDestino('Toluca');

  expect(llamadas).toHaveLength(4); // Banco Mundial: país + población
  expect(llamadas[0]).toContain('nominatim.openstreetmap.org/search?q=Toluca');
  expect(llamadas[1]).toContain('latitude=19.2923&longitude=-99.6569');
  expect(llamadas.slice(2).join(' ')).toContain('/v2/es/country/MX');
  expect(llamadas.slice(2).join(' ')).toContain('/country/MX/indicator/SP.POP.TOTL');
  expect(d.lugar).toMatchObject({ nombre: 'Toluca de Lerdo', estado: 'Estado de México', codigoPais: 'MX', lat: 19.2923, lon: -99.6569 });
  expect(d.clima.ok && d.clima.datos).toMatchObject({ temperatura: 19, descripcion: 'Parcialmente nublado', humedad: 41 });
  expect(d.pais.ok && d.pais.datos).toEqual({ nombre: 'México', capital: 'Ciudad de México', region: 'América Latina y el Caribe', ingreso: 'Ingreso mediano alto', poblacion: 130861007, anioPoblacion: '2024', bandera: 'https://flagcdn.com/w160/mx.png' });
  // Cada petición se identifica, como pide la política de Nominatim
  expect(fn.mock.calls[0][1]?.headers?.['User-Agent']).toMatch(/^DestinosApp\//);
});

test('dos ubicaciones diferentes devuelven información distinta y relacionada', async () => {
  globalThis.fetch = fetchSimulado(rutasNormales).fn as unknown as typeof fetch;
  const toluca = await consultarDestino('Toluca');
  const madrid = await consultarDestino('Madrid');
  expect(madrid.lugar).toMatchObject({ nombre: 'Madrid', codigoPais: 'ES' });
  expect(madrid.clima.ok && madrid.clima.datos.descripcion).toBe('Despejado');
  expect(madrid.pais.ok && madrid.pais.datos).toMatchObject({ nombre: 'España', capital: 'Madrid', ingreso: 'Ingreso alto' });
  expect(toluca.pais.ok && toluca.pais.datos.nombre).not.toBe(madrid.pais.ok && madrid.pais.datos.nombre);
});

test('si Open-Meteo no está disponible, la ubicación y el país se muestran igual', async () => {
  globalThis.fetch = fetchSimulado(rutasNormales).fn as unknown as typeof fetch;
  simularCaida('clima');
  const d = await consultarDestino('Toluca');
  expect(d.lugar.nombre).toBe('Toluca de Lerdo');
  expect(d.clima).toEqual({ ok: false, error: 'No se pudo conectar con Open-Meteo.' });
  expect(d.pais.ok).toBe(true);
});

test('si el Banco Mundial responde 503, el clima se muestra igual', async () => {
  globalThis.fetch = fetchSimulado((u) => (u.includes('worldbank') ? { ok: false, status: 503 } : rutasNormales(u))).fn as unknown as typeof fetch;
  const d = await consultarDestino('Madrid');
  expect(d.clima.ok).toBe(true);
  expect(d.pais).toEqual({ ok: false, error: 'Banco Mundial no está disponible por ahora (código 503).' });
});

test('si OpenStreetMap no está disponible, no se consulta nada más', async () => {
  const { fn, llamadas } = fetchSimulado(rutasNormales);
  globalThis.fetch = fn as unknown as typeof fetch;
  simularCaida('lugar');
  await expect(consultarDestino('Toluca')).rejects.toMatchObject({ servicio: 'OpenStreetMap', tipo: 'red' });
  expect(llamadas).toHaveLength(1);
});

test('una ciudad que no existe da un mensaje claro', async () => {
  globalThis.fetch = fetchSimulado(rutasNormales).fn as unknown as typeof fetch;
  await expect(consultarDestino('Ciudad Inventada XYZ')).rejects.toThrow('No se encontró "Ciudad Inventada XYZ"');
});

test('una URL sin HTTPS se bloquea antes de enviar la petición', async () => {
  const { fn } = fetchSimulado(rutasNormales);
  globalThis.fetch = fn as unknown as typeof fetch;
  await expect(obtenerJson('http://api.open-meteo.com/v1/forecast', { servicio: 'Open-Meteo' })).rejects.toMatchObject({ tipo: 'inseguro' });
  expect(fn).not.toHaveBeenCalled();
});

test('una respuesta que no es JSON o que tarda demasiado da un error controlado', async () => {
  globalThis.fetch = fetchSimulado(() => ({ falla: 'json' })).fn as unknown as typeof fetch;
  await expect(obtenerJson('https://api.worldbank.org/v2/es/country/MX?format=json', { servicio: 'Banco Mundial' })).rejects.toThrow('Banco Mundial devolvió una respuesta que no se pudo leer.');

  jest.useFakeTimers();
  globalThis.fetch = jest.fn((_u: string, o: { signal: AbortSignal }) => new Promise((_ok, mal) => {
    o.signal.addEventListener('abort', () => mal(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  })) as unknown as typeof fetch;
  const p = obtenerJson('https://api.open-meteo.com/v1/forecast', { servicio: 'Open-Meteo', timeoutMs: 5000 });
  jest.advanceTimersByTime(5000);
  await expect(p).rejects.toEqual(new ServicioError('Open-Meteo', 'tiempo', 'Open-Meteo tardó demasiado en responder.'));
});

test('los códigos del clima se traducen y el país sin código no se consulta', async () => {
  expect(describirClima(95)).toEqual({ descripcion: 'Tormenta', icono: '⛈️' });
  expect(describirClima(1234).descripcion).toBe('Sin dato');
  await expect(obtenerPais('')).rejects.toThrow('La ubicación no tiene un país asociado.');
});

test('Banco Mundial: un código que no existe da un mensaje claro y la población es opcional', async () => {
  globalThis.fetch = fetchSimulado(() => ({ json: codigoInvalido })).fn as unknown as typeof fetch;
  await expect(obtenerPais('XK')).rejects.toThrow('El Banco Mundial no tiene datos del país XK.');

  globalThis.fetch = fetchSimulado((u) => (u.includes('SP.POP.TOTL') ? { ok: false, status: 502 } : rutasNormales(u))).fn as unknown as typeof fetch;
  await expect(obtenerPais('MX')).resolves.toMatchObject({ nombre: 'México', poblacion: null, anioPoblacion: null });
});

test('si la API retirada redirige a un aviso que no es el formato esperado, se informa sin romper la pantalla', async () => {
  // Así respondía REST Countries v3.1 después de retirarse: JSON sin los datos del país
  globalThis.fetch = fetchSimulado(() => ({ json: { message: 'This API version has been deprecated' } })).fn as unknown as typeof fetch;
  await expect(obtenerPais('MX')).rejects.toThrow('El Banco Mundial no tiene datos del país MX.');
});
