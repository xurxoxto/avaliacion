// APLICACIÓN SUPER SIMPLE PARA MAC
console.log('¡App cargada en Mac! 🍎');

// Cuando cargue la página
document.addEventListener('DOMContentLoaded', function() {
    
    // 1. FECHA ACTUAL
    const hoy = new Date();
    const opciones = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    };
    
    const fechaElemento = document.getElementById('current-date');
    if (fechaElemento) {
        fechaElemento.textContent = hoy.toLocaleDateString('es-ES', opciones);
    }
    
    // 2. LOGIN SIMPLE
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', function(event) {
            event.preventDefault(); // Evitar que se recargue
            
            const email = document.getElementById('teacher-email').value;
            const clase = document.getElementById('class-select').value;
            
            // Validación simple
            if (!email.includes('@')) {
                alert('Por favor, introduce un email válido');
                return;
            }
            
            if (!clase) {
                alert('Por favor, selecciona un grupo');
                return;
            }
            
            // Ocultar login, mostrar app
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('app-container').classList.remove('hidden');
            
            // Actualizar información
            document.getElementById('current-class').textContent = clase;
            document.getElementById('teacher-name').textContent = email.split('@')[0];
            
            // Cargar estudiantes
            cargarEstudiantes();
        });
    }
    
    // 3. LOGOUT
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            if (confirm('¿Seguro que quieres salir?')) {
                // Volver a login
                document.getElementById('app-container').classList.add('hidden');
                document.getElementById('login-screen').classList.remove('hidden');
                
                // Limpiar formulario
                document.getElementById('login-form').reset();
            }
        });
    }
    
    // 4. TABS
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            // Remover activo de todos
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            // Activar este
            this.classList.add('active');
            const tabId = this.getAttribute('data-tab');
            const tabContent = document.getElementById(`tab-${tabId}-content`);
            if (tabContent) tabContent.classList.add('active');
        });
    });
    
    // 5. CARGAR ESTUDIANTES AL INICIO (si hay datos guardados)
    if (localStorage.getItem('profesor')) {
        cargarEstudiantes();
    }
});

// FUNCIÓN PARA CARGAR ESTUDIANTES
function cargarEstudiantes() {
    const container = document.getElementById('students-grid-65');
    if (!container) return;
    
    let html = '';
    
    // Generar 65 estudiantes de ejemplo
    for (let i = 1; i <= 65; i++) {
        const curso = i <= 25 ? '1A' : i <= 47 ? '1B' : '2A';
        const nombre = `Estudiante ${i}`;
        const apellido = `Apellido ${i}`;
        const rendimiento = Math.floor(Math.random() * 10) + 1;
        
        // Determinar nivel
        let nivel = '';
        if (rendimiento >= 9) nivel = 'excelente';
        else if (rendimiento >= 7) nivel = 'bueno';
        else if (rendimiento >= 5) nivel = 'suficiente';
        else nivel = 'insuficiente';
        
        html += `
            <div class="student-card-65">
                <div class="performance-tag ${nivel}"></div>
                
                <div class="student-avatar" style="background-color: #3498db">
                    ${nombre.charAt(0)}${apellido.charAt(0)}
                </div>
                
                <h4 class="student-name">${nombre}</h4>
                <p class="student-info">
                    <small>${apellido}</small><br>
                    <span class="badge">${curso}</span>
                    <span class="badge">#${i}</span>
                </p>
                
                <div class="student-stats">
                    <div class="stat-mini">
                        <i class="fas fa-star"></i>
                        <span>${rendimiento}.0</span>
                    </div>
                </div>
                
                <div class="student-actions">
                    <button class="btn-action-sm" onclick="seleccionar(${i})">
                        <i class="fas fa-plus"></i>
                    </button>
                    <button class="btn-action-sm" onclick="verCuaderno(${i})">
                        <i class="fas fa-book"></i>
                    </button>
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
    
    // Actualizar contador
    const contador = document.getElementById('student-count');
    if (contador) {
        contador.textContent = '65 alumnos';
    }
}

// FUNCIONES GLOBALES (para los botones)
window.seleccionar = function(numero) {
    alert(`Has seleccionado al estudiante #${numero}`);
};

window.verCuaderno = function(numero) {
    alert(`Verías el cuaderno del estudiante #${numero}`);
    // Cambiar a pestaña de cuaderno
    document.querySelector('.nav-tab[data-tab="cuaderno"]').click();
};
