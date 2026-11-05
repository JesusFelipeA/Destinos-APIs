import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Image, Keyboard, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ClaveServicio, Clima, Destino, Lugar, Pais, Resultado, SERVICIOS,
  consultarDestino, reintentar, servicioSimuladoCaido, simularCaida,
} from '../services/apis';
import { mensajeDeError } from '../services/http';

const C = { fondo: '#F3F6FB', tarjeta: '#FFFFFF', texto: '#13203A', sub: '#5B6782', azul: '#1D5FD1', verde: '#147D64', naranja: '#B4570B', rojo: '#B42318', borde: '#DCE3EF' };
const SUGERENCIAS = ['Toluca', 'Cancún', 'Madrid', 'Tokio'];
const MODOS: Array<{ id: ClaveServicio | null; texto: string }> = [
  { id: null, texto: 'Sin fallas' },
  { id: 'clima', texto: 'Open-Meteo caído' },
  { id: 'pais', texto: 'Banco Mundial caído' },
  { id: 'lugar', texto: 'OpenStreetMap caído' },
];
// Política de Nominatim: como máximo una búsqueda por segundo
const ESPERA_ENTRE_BUSQUEDAS_MS = 1000;

const numero = new Intl.NumberFormat('es-MX');
const fechaCorta = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' });
};

export default function ConsultaDestino() {
  const insets = useSafeAreaInsets();
  const [ciudad, setCiudad] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [destino, setDestino] = useState<Destino | null>(null);
  const [modo, setModo] = useState<ClaveServicio | null>(servicioSimuladoCaido());
  const [reintentando, setReintentando] = useState<'clima' | 'pais' | null>(null);
  const ultima = useRef(0);

  const consultar = useCallback(async (texto: string) => {
    const valor = texto.trim();
    if (valor.length < 2) {
      setError('Escribe el nombre de una ciudad (al menos 2 letras).');
      return;
    }
    if (Date.now() - ultima.current < ESPERA_ENTRE_BUSQUEDAS_MS) return;
    ultima.current = Date.now();
    Keyboard.dismiss();
    setCiudad(valor);
    setCargando(true);
    setError('');
    setDestino(null);
    try {
      setDestino(await consultarDestino(valor));
    } catch (e) {
      setError(mensajeDeError(e, SERVICIOS.lugar));
    } finally {
      setCargando(false);
    }
  }, []);

  const cambiarModo = (m: ClaveServicio | null) => {
    simularCaida(m);
    setModo(m);
  };

  const reintentarServicio = async (s: 'clima' | 'pais') => {
    if (!destino) return;
    setReintentando(s);
    const r = await reintentar(s, destino.lugar);
    setDestino((d) => (d ? { ...d, [s]: r } : d));
    setReintentando(null);
  };

  return (
    <ScrollView style={{ backgroundColor: C.fondo }} contentContainerStyle={[s.contenido, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
      <Text style={s.titulo}>Destinos</Text>
      <Text style={s.subtitulo}>Ubicación, clima y datos del país de cualquier ciudad, desde tres servicios en la nube.</Text>

      <View style={s.buscador}>
        <TextInput
          testID="campo-ciudad"
          style={s.input}
          placeholder="Escribe una ciudad, por ejemplo Toluca"
          placeholderTextColor={C.sub}
          value={ciudad}
          onChangeText={setCiudad}
          onSubmitEditing={() => consultar(ciudad)}
          returnKeyType="search"
          maxLength={80}
          autoCorrect={false}
        />
        <Pressable testID="boton-consultar" accessibilityRole="button" style={[s.boton, cargando && { opacity: 0.6 }]} disabled={cargando} onPress={() => consultar(ciudad)}>
          <Text style={s.botonTexto}>Consultar</Text>
        </Pressable>
      </View>

      <View style={s.fila}>
        {SUGERENCIAS.map((c) => (
          <Pressable key={c} accessibilityRole="button" disabled={cargando} onPress={() => consultar(c)} style={s.chip}>
            <Text style={s.chipTexto}>{c}</Text>
          </Pressable>
        ))}
      </View>

      <View style={s.modo}>
        <Text style={s.modoTitulo}>Modo de prueba · simular un servicio no disponible</Text>
        <View style={s.fila}>
          {MODOS.map((m) => {
            const activo = modo === m.id;
            return (
              <Pressable key={String(m.id)} accessibilityRole="button" accessibilityState={{ selected: activo }} onPress={() => cambiarModo(m.id)}
                style={[s.chip, activo && { backgroundColor: m.id ? C.rojo : C.verde, borderColor: 'transparent' }]}>
                <Text style={[s.chipTexto, activo && { color: '#fff' }]}>{m.texto}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {cargando && (
        <View style={s.cargando} testID="cargando">
          <ActivityIndicator color={C.azul} />
          <Text style={s.cargandoTexto}>Consultando OpenStreetMap, Open-Meteo y el Banco Mundial…</Text>
        </View>
      )}

      {!!error && !cargando && (
        <View style={[s.tarjeta, s.tarjetaError]} testID="error-general">
          <Text style={[s.tarjetaTitulo, { color: C.rojo }]}>No se pudo consultar el destino</Text>
          <Text style={s.texto}>{error}</Text>
          {!!ciudad.trim() && (
            <Pressable accessibilityRole="button" onPress={() => { ultima.current = 0; consultar(ciudad); }} style={[s.botonSec, { marginTop: 12 }]}>
              <Text style={s.botonSecTexto}>Reintentar</Text>
            </Pressable>
          )}
        </View>
      )}

      {destino && !cargando && (
        <>
          <TarjetaLugar lugar={destino.lugar} />
          <TarjetaClima r={destino.clima} lugar={destino.lugar} ocupado={reintentando === 'clima'} onReintentar={() => reintentarServicio('clima')} />
          <TarjetaPais r={destino.pais} lugar={destino.lugar} ocupado={reintentando === 'pais'} onReintentar={() => reintentarServicio('pais')} />
        </>
      )}

      {!destino && !cargando && !error && (
        <Text style={s.vacio}>Elige una ciudad para ver su información.</Text>
      )}
    </ScrollView>
  );
}

function Fuente({ servicio, endpoint }: { servicio: string; endpoint: string }) {
  return <Text style={s.fuente}>Fuente: {servicio} · {endpoint}</Text>;
}

function TarjetaLugar({ lugar }: { lugar: Lugar }) {
  const mapa = `https://www.openstreetmap.org/?mlat=${lugar.lat}&mlon=${lugar.lon}#map=12/${lugar.lat}/${lugar.lon}`;
  return (
    <View style={s.tarjeta} testID="tarjeta-lugar">
      <Text style={s.etiqueta}>📍 UBICACIÓN</Text>
      <Text style={s.tarjetaTitulo}>{lugar.nombre}</Text>
      <Text style={s.texto}>{[lugar.estado, lugar.pais].filter(Boolean).join(', ')}</Text>
      <View style={s.datos}>
        <Dato titulo="Latitud" valor={lugar.lat.toFixed(4)} />
        <Dato titulo="Longitud" valor={lugar.lon.toFixed(4)} />
        <Dato titulo="País (ISO)" valor={lugar.codigoPais || '—'} />
      </View>
      <Text style={s.relacion}>Las coordenadas se usan para pedir el clima y el código del país para pedir sus datos.</Text>
      <Pressable accessibilityRole="link" onPress={() => Linking.openURL(mapa)} style={s.botonSec}>
        <Text style={s.botonSecTexto}>Ver en el mapa</Text>
      </Pressable>
      <Fuente servicio={SERVICIOS.lugar} endpoint="GET /search" />
    </View>
  );
}

function ErrorServicio({ id, mensaje, ocupado, onReintentar }: { id: string; mensaje: string; ocupado: boolean; onReintentar: () => void }) {
  return (
    <View style={s.avisoError}>
      <Text style={{ color: C.rojo, fontWeight: '600' }}>⚠️ {mensaje}</Text>
      <Text style={[s.texto, { marginTop: 4 }]}>El resto de la información se muestra normalmente.</Text>
      <Pressable testID={`reintentar-${id}`} accessibilityRole="button" disabled={ocupado} onPress={onReintentar} style={[s.botonSec, { marginTop: 10 }]}>
        {ocupado ? <ActivityIndicator color={C.azul} /> : <Text style={s.botonSecTexto}>Reintentar</Text>}
      </Pressable>
    </View>
  );
}

function TarjetaClima({ r, lugar, ocupado, onReintentar }: { r: Resultado<Clima>; lugar: Lugar; ocupado: boolean; onReintentar: () => void }) {
  return (
    <View style={s.tarjeta} testID="tarjeta-clima">
      <Text style={s.etiqueta}>🌡️ CLIMA EN {lugar.nombre.toUpperCase()}</Text>
      {r.ok ? (
        <>
          <View style={s.climaFila}>
            <Text style={s.icono}>{r.datos.icono}</Text>
            <View>
              <Text style={s.temperatura}>{r.datos.temperatura} °C</Text>
              <Text style={s.texto}>{r.datos.descripcion} · sensación {r.datos.sensacion} °C</Text>
            </View>
          </View>
          <View style={s.datos}>
            <Dato titulo="Humedad" valor={`${r.datos.humedad} %`} />
            <Dato titulo="Viento" valor={`${r.datos.viento} km/h`} />
            <Dato titulo="Hora local" valor={r.datos.hora.slice(11, 16)} />
          </View>
          <View style={s.dias}>
            {r.datos.dias.map((d) => (
              <View key={d.fecha} style={s.dia}>
                <Text style={s.diaFecha}>{fechaCorta(d.fecha)}</Text>
                <Text style={{ fontSize: 22 }}>{d.icono}</Text>
                <Text style={s.diaTemp}>{d.max}° / {d.min}°</Text>
                {d.lluvia !== null && <Text style={s.diaLluvia}>💧 {d.lluvia} %</Text>}
              </View>
            ))}
          </View>
        </>
      ) : (
        <ErrorServicio id="clima" mensaje={r.error} ocupado={ocupado} onReintentar={onReintentar} />
      )}
      <Fuente servicio={SERVICIOS.clima} endpoint="GET /v1/forecast" />
    </View>
  );
}

function TarjetaPais({ r, lugar, ocupado, onReintentar }: { r: Resultado<Pais>; lugar: Lugar; ocupado: boolean; onReintentar: () => void }) {
  return (
    <View style={s.tarjeta} testID="tarjeta-pais">
      <Text style={s.etiqueta}>🌎 PAÍS {lugar.codigoPais ? `· ${lugar.codigoPais}` : ''}</Text>
      {r.ok ? (
        <>
          <View style={s.climaFila}>
            {r.datos.bandera && <Image source={{ uri: r.datos.bandera }} style={s.bandera} accessibilityLabel={`Bandera de ${r.datos.nombre}`} />}
            <View style={{ flex: 1 }}>
              <Text style={s.tarjetaTitulo}>{r.datos.nombre}</Text>
              <Text style={s.texto}>{r.datos.region}</Text>
            </View>
          </View>
          <View style={s.datos}>
            <Dato titulo="Capital" valor={r.datos.capital} />
            <Dato titulo={r.datos.anioPoblacion ? `Población (${r.datos.anioPoblacion})` : 'Población'} valor={r.datos.poblacion !== null ? numero.format(r.datos.poblacion) : 'Sin dato'} />
          </View>
          <Linea titulo="Nivel de ingreso" valor={r.datos.ingreso || '—'} />
        </>
      ) : (
        <ErrorServicio id="pais" mensaje={r.error} ocupado={ocupado} onReintentar={onReintentar} />
      )}
      <Fuente servicio={SERVICIOS.pais} endpoint="GET /v2/country/{código}" />
    </View>
  );
}

const Dato = ({ titulo, valor }: { titulo: string; valor: string }) => (
  <View style={s.dato}>
    <Text style={s.datoTitulo}>{titulo}</Text>
    <Text style={s.datoValor}>{valor}</Text>
  </View>
);
const Linea = ({ titulo, valor }: { titulo: string; valor: string }) => (
  <Text style={[s.texto, { marginTop: 6 }]}><Text style={{ fontWeight: '700', color: C.texto }}>{titulo}: </Text>{valor}</Text>
);

const s = StyleSheet.create({
  contenido: { paddingHorizontal: 16, gap: 14 },
  titulo: { fontSize: 30, fontWeight: '800', color: C.texto },
  subtitulo: { fontSize: 15, color: C.sub, lineHeight: 21 },
  buscador: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, backgroundColor: C.tarjeta, borderWidth: 1, borderColor: C.borde, borderRadius: 12, paddingHorizontal: 14, height: 48, fontSize: 16, color: C.texto },
  boton: { backgroundColor: C.azul, borderRadius: 12, paddingHorizontal: 18, justifyContent: 'center' },
  botonTexto: { color: '#fff', fontWeight: '700', fontSize: 15 },
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: C.borde, backgroundColor: C.tarjeta, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  chipTexto: { color: C.texto, fontSize: 13, fontWeight: '600' },
  modo: { backgroundColor: '#EAF0FA', borderRadius: 12, padding: 12, gap: 8 },
  modoTitulo: { fontSize: 12, fontWeight: '700', color: C.sub },
  cargando: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, backgroundColor: C.tarjeta, borderRadius: 14 },
  cargandoTexto: { color: C.sub, flex: 1 },
  tarjeta: { backgroundColor: C.tarjeta, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.borde, gap: 6 },
  tarjetaError: { borderColor: '#F4C7C3', backgroundColor: '#FFF6F5' },
  tarjetaTitulo: { fontSize: 20, fontWeight: '800', color: C.texto },
  etiqueta: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6, color: C.azul },
  texto: { fontSize: 14, color: C.sub, lineHeight: 20 },
  datos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  dato: { flexGrow: 1, minWidth: 90, backgroundColor: C.fondo, borderRadius: 10, padding: 10 },
  datoTitulo: { fontSize: 11, color: C.sub, fontWeight: '600' },
  datoValor: { fontSize: 15, color: C.texto, fontWeight: '700', marginTop: 2 },
  relacion: { fontSize: 12, color: C.verde, marginTop: 6 },
  botonSec: { alignSelf: 'flex-start', borderWidth: 1, borderColor: C.azul, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginTop: 6, minWidth: 110, alignItems: 'center' },
  botonSecTexto: { color: C.azul, fontWeight: '700' },
  fuente: { fontSize: 11, color: C.sub, marginTop: 8, fontStyle: 'italic' },
  climaFila: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4 },
  icono: { fontSize: 46 },
  temperatura: { fontSize: 34, fontWeight: '800', color: C.texto },
  dias: { flexDirection: 'row', gap: 8, marginTop: 8 },
  dia: { flex: 1, alignItems: 'center', backgroundColor: C.fondo, borderRadius: 12, paddingVertical: 10, gap: 2 },
  diaFecha: { fontSize: 12, color: C.sub, fontWeight: '700', textTransform: 'capitalize' },
  diaTemp: { fontSize: 14, fontWeight: '700', color: C.texto },
  diaLluvia: { fontSize: 11, color: C.azul },
  avisoError: { backgroundColor: '#FFF6F5', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#F4C7C3', marginTop: 4 },
  bandera: { width: 64, height: 42, borderRadius: 6, borderWidth: 1, borderColor: C.borde },
  vacio: { textAlign: 'center', color: C.sub, marginTop: 24 },
});
