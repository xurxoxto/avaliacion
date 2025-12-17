// Cuaderno simple
export function generarCuaderno(estudianteId) {
    return {
        estudiante: `Estudiante ${estudianteId}`,
        registros: [
            {
                fecha: '2024-01-15',
                materia: 'Matemáticas',
                competencia: 'C2',
                nota: 8,
                comentario: 'Buen trabajo'
            },
            {
                fecha: '2024-01-14',
                materia: 'Lengua',
                competencia: 'C1',
                nota: 6,
                comentario: 'Puede mejorar'
            }
        ],
        promedio: 7.0
    };
}