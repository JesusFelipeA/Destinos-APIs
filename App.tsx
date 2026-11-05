/**
 * Destinos · Actividad 19 (Desarrollo Móvil Integral)
 * Integra tres API de terceros: OpenStreetMap (Nominatim), Open-Meteo y REST Countries.
 *
 * @format
 */

import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ConsultaDestino from './src/screens/ConsultaDestino';

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <ConsultaDestino />
    </SafeAreaProvider>
  );
}

export default App;
