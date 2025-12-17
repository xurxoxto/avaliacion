// Configuración simple - Sin Firebase inicialmente
export const config = {
    apiKey: "demo-key",
    projectId: "demo-project",
    appName: "Libro de Clase"
};

export function guardarLocal(clave, datos) {
    localStorage.setItem(clave, JSON.stringify(datos));
}

export function cargarLocal(clave) {
    const datos = localStorage.getItem(clave);
    return datos ? JSON.parse(datos) : null;
}