// Gestión simple de evidencias
export class EvidenciasManager {
    constructor() {
        this.fotos = [];
    }
    
    agregarFoto(archivo) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.fotos.push({
                    id: Date.now(),
                    url: e.target.result,
                    nombre: archivo.name,
                    fecha: new Date()
                });
                resolve(true);
            };
            reader.readAsDataURL(archivo);
        });
    }
    
    obtenerFotos() {
        return this.fotos;
    }
    
    eliminarFoto(id) {
        this.fotos = this.fotos.filter(foto => foto.id !== id);
    }
}