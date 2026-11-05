# Destinos · Actividad 19

App en **React Native CLI** (0.87, sin Expo) que integra tres API de terceros para mostrar información complementaria de una ciudad:

| # | API | Para qué | Endpoint | Parámetros | Respuesta |
|---|---|---|---|---|---|
| 1 | **OpenStreetMap · Nominatim** | Ubicación: coordenadas, estado y país | `GET https://nominatim.openstreetmap.org/search` | `q` (ciudad), `format=jsonv2`, `limit=1`, `addressdetails=1`, `accept-language=es` | Arreglo JSON de lugares: `lat`, `lon`, `display_name`, `address.country_code` |
| 2 | **Open-Meteo** | Clima actual y pronóstico de 3 días | `GET https://api.open-meteo.com/v1/forecast` | `latitude`, `longitude` (de la API 1), `current`, `daily`, `timezone=auto`, `forecast_days=3` | Objeto JSON con `current` y `daily` (arreglos por día) |
| 3 | **Banco Mundial (World Bank API v2)** | Datos del país y población | `GET https://api.worldbank.org/v2/es/country/{código}` y `GET https://api.worldbank.org/v2/country/{código}/indicator/SP.POP.TOTL` | código ISO de 2 letras (de la API 1), `format=json`, `mrnev=1` | Arreglo `[metadatos, datos]`: `name`, `capitalCity`, `region.value`, `incomeLevel.value`; el indicador trae `date` y `value` |

Ninguna requiere llave (API key). La bandera se muestra desde la CDN pública `flagcdn.com` (solo imagen).

> Al principio la tercera API era **REST Countries**, pero su versión 3.1 sin llave se retiró en octubre de 2026 (ahora redirige a un aviso y la v5 pide una llave de pago o con límite), así que se cambió por el Banco Mundial.

## Cómo se relacionan

1. El usuario escribe una ciudad y la app consulta **Nominatim**.
2. De la respuesta toma `lat`/`lon` y `address.country_code`.
3. Con esos datos consulta **Open-Meteo** y el **Banco Mundial** al mismo tiempo (`Promise.allSettled`).
4. Si una de esas dos falla, las demás tarjetas se muestran igual y solo la que falló indica el error, con un botón **Reintentar**. Si falla Nominatim, no hay ubicación y se muestra un error general.

## Seguridad y manejo de errores

- Solo HTTPS: `src/services/http.ts` bloquea cualquier URL que no empiece con `https://`. En la versión release Android tampoco permite tráfico sin cifrar (`usesCleartextTraffic=false`).
- Tiempo máximo de 10 s por petición (`AbortController`).
- Mensajes controlados por tipo de falla: sin conexión, tiempo agotado, código HTTP, respuesta que no es JSON, ciudad no encontrada.
- Cada petición se identifica con un `User-Agent` y hay al menos 1 s entre búsquedas, como pide la [política de uso de Nominatim](https://operations.osmfoundation.org/policies/nominatim/).
- **Modo de prueba** en la pantalla para simular que una API no está disponible: cambia su dirección por un dominio `.invalid` (reservado, no existe), así la falla es real.

## Ejecutar

```powershell
npm install
npx react-native start          # terminal 1 (Metro)
npx react-native run-android    # terminal 2, con el emulador abierto o el celular por USB
```

El teléfono o emulador necesita internet. Las API se consultan directamente desde el teléfono; no hace falta servidor propio.

## Pruebas

```powershell
npm test          # 16 pruebas (Jest) con respuestas simuladas de las tres API
npx tsc --noEmit  # revisión de tipos
npm run lint
```

## Archivos principales

- `src/services/http.ts`: cliente HTTP común (HTTPS, tiempo máximo, errores controlados).
- `src/services/apis.ts`: las tres consultas, el procesamiento de cada JSON y la consulta encadenada.
- `src/screens/ConsultaDestino.tsx`: la pantalla de consulta con las tres tarjetas.
- `__tests__/`: pruebas de la integración y de la pantalla; `__fixtures__/respuestas.ts` tiene respuestas de ejemplo con el formato real.
