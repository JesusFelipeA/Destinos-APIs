// Cliente HTTP común para las tres API.
// - Solo permite HTTPS: si una URL no es segura, no se hace la petición.
// - Corta la petición si tarda demasiado (AbortController).
// - Convierte cualquier falla en un ServicioError con un mensaje para el usuario,
//   sin mostrar detalles técnicos.

export type TipoFalla = 'inseguro' | 'red' | 'tiempo' | 'http' | 'formato' | 'sin-resultados';

export class ServicioError extends Error {
  servicio: string;
  tipo: TipoFalla;
  status?: number;

  constructor(servicio: string, tipo: TipoFalla, mensaje: string, status?: number) {
    super(mensaje);
    this.name = 'ServicioError';
    this.servicio = servicio;
    this.tipo = tipo;
    this.status = status;
  }
}

export const TIEMPO_MAXIMO_MS = 10000;

// Las API públicas piden que cada aplicación se identifique (política de uso de Nominatim).
export const USER_AGENT = 'DestinosApp/1.0 (proyecto escolar UTVT)';

type Opciones = { servicio: string; timeoutMs?: number; headers?: Record<string, string> };

export async function obtenerJson<T = unknown>(url: string, { servicio, timeoutMs = TIEMPO_MAXIMO_MS, headers = {} }: Opciones): Promise<T> {
  if (!url.startsWith('https://')) {
    throw new ServicioError(servicio, 'inseguro', `${servicio}: la petición no usa HTTPS y se bloqueó.`);
  }

  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), timeoutMs);
  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...headers },
      signal: control.signal,
    });
  } catch (e) {
    const tiempo = (e as Error)?.name === 'AbortError';
    throw new ServicioError(
      servicio,
      tiempo ? 'tiempo' : 'red',
      tiempo ? `${servicio} tardó demasiado en responder.` : `No se pudo conectar con ${servicio}.`,
    );
  } finally {
    clearTimeout(temporizador);
  }

  if (!respuesta.ok) {
    throw new ServicioError(servicio, 'http', `${servicio} no está disponible por ahora (código ${respuesta.status}).`, respuesta.status);
  }

  try {
    return (await respuesta.json()) as T;
  } catch {
    throw new ServicioError(servicio, 'formato', `${servicio} devolvió una respuesta que no se pudo leer.`);
  }
}

/** Mensaje que se puede mostrar al usuario para cualquier error. */
export function mensajeDeError(e: unknown, servicio = 'El servicio'): string {
  if (e instanceof ServicioError) return e.message;
  return `${servicio} no respondió correctamente.`;
}
