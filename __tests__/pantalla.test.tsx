// Pruebas de la pantalla: mensajes de carga, información integrada y error de un servicio.
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ConsultaDestino from '../src/screens/ConsultaDestino';
import { simularCaida } from '../src/services/apis';
import { fetchSimulado, rutasNormales } from '../__fixtures__/respuestas';

const metrics = { frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const textos = (r: ReactTestRenderer.ReactTestRenderer) => JSON.stringify(r.toJSON());
const porId = (r: ReactTestRenderer.ReactTestRenderer, id: string) => r.root.findAll((n) => n.props.testID === id && typeof n.type === 'string');

async function montar() {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={metrics}><ConsultaDestino /></SafeAreaProvider>);
  });
  return r;
}
async function buscar(r: ReactTestRenderer.ReactTestRenderer, ciudad: string) {
  const campo = r.root.find((n) => n.props.testID === 'campo-ciudad' && typeof n.props.onChangeText === 'function');
  await act(async () => { campo.props.onChangeText(ciudad); });
  const boton = r.root.find((n) => n.props.testID === 'boton-consultar' && typeof n.props.onPress === 'function');
  await act(async () => { boton.props.onPress(); });
}

afterEach(() => simularCaida(null));

test('muestra un mensaje de carga y después la información de las tres API en la misma pantalla', async () => {
  let liberar!: () => void;
  const pendiente = new Promise<void>((ok) => { liberar = ok; });
  const { fn } = fetchSimulado(rutasNormales);
  globalThis.fetch = jest.fn(async (u: string) => { await pendiente; return fn(u); }) as unknown as typeof fetch;

  const r = await montar();
  await buscar(r, 'Toluca');
  expect(textos(r)).toContain('Consultando OpenStreetMap, Open-Meteo y el Banco Mundial');

  await act(async () => { liberar(); });
  const t = textos(r);
  expect(t).not.toContain('Consultando OpenStreetMap');
  expect(t).toContain('Toluca de Lerdo');          // OpenStreetMap
  expect(t).toContain('Parcialmente nublado');     // Open-Meteo
  expect(t).toContain('Ingreso mediano alto');     // Banco Mundial
  expect(porId(r, 'tarjeta-lugar')).toHaveLength(1);
  expect(porId(r, 'tarjeta-clima')).toHaveLength(1);
  expect(porId(r, 'tarjeta-pais')).toHaveLength(1);
  act(() => r.unmount());
});

test('con Open-Meteo caído solo la tarjeta del clima muestra el error y permite reintentar', async () => {
  globalThis.fetch = fetchSimulado(rutasNormales).fn as unknown as typeof fetch;
  simularCaida('clima');
  const r = await montar();
  await buscar(r, 'Toluca');
  let t = textos(r);
  expect(t).toContain('No se pudo conectar con Open-Meteo.');
  expect(t).toContain('Ingreso mediano alto');

  // El servicio "regresa" y el botón Reintentar de la tarjeta lo vuelve a consultar
  simularCaida(null);
  const reintentar = r.root.find((n) => n.props.testID === 'reintentar-clima' && typeof n.props.onPress === 'function');
  await act(async () => { reintentar.props.onPress(); });
  t = textos(r);
  expect(t).not.toContain('No se pudo conectar con Open-Meteo.');
  expect(t).toContain('Parcialmente nublado');
  act(() => r.unmount());
});

test('si OpenStreetMap no está disponible se muestra un error general, sin datos técnicos', async () => {
  globalThis.fetch = fetchSimulado(rutasNormales).fn as unknown as typeof fetch;
  simularCaida('lugar');
  const r = await montar();
  await buscar(r, 'Madrid');
  const t = textos(r);
  expect(porId(r, 'error-general')).toHaveLength(1);
  expect(t).toContain('No se pudo conectar con OpenStreetMap.');
  expect(t).not.toContain('Network request failed');
  act(() => r.unmount());
});

test('no consulta con menos de 2 letras', async () => {
  const { fn } = fetchSimulado(rutasNormales);
  globalThis.fetch = fn as unknown as typeof fetch;
  const r = await montar();
  await buscar(r, 'a');
  expect(fn).not.toHaveBeenCalled();
  expect(textos(r)).toContain('Escribe el nombre de una ciudad');
  act(() => r.unmount());
});
