// Gestión simple de estudiantes
export function generarEstudiantes(cantidad) {
    const estudiantes = [];
    
    for (let i = 1; i <= cantidad; i++) {
        estudiantes.push({
            id: i,
            nombre: `Estudiante ${i}`,
            curso: i <= 25 ? '1A' : i <= 47 ? '1B' : '2A',
            rendimiento: Math.floor(Math.random() * 10) + 1
        });
    }
    
    return estudiantes;
}

export function obtenerNivel(nota) {
    if (nota >= 9) return 'excelente';
    if (nota >= 7) return 'bueno';
    if (nota >= 5) return 'suficiente';
    return 'insuficiente';
}