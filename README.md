# Sistema de Evaluación - CEIP Galicia

Sistema moderno de evaluación para profesores construido con React, TypeScript, TailwindCSS y Node.js/Express.

## 🚀 Tecnologías Utilizadas

### Frontend
- **React 19** - Biblioteca de UI moderna
- **TypeScript** - Tipado estático para mejor mantenibilidad
- **TailwindCSS 3** - Framework de CSS utility-first
- **React Router** - Navegación entre páginas
- **Chart.js** - Visualización de datos y analíticas
- **Lucide React** - Iconos modernos
- **Vite** - Build tool rápido y moderno

### Backend
- **Node.js** - Runtime de JavaScript
- **Express** - Framework web minimalista
- **PostgreSQL** - Base de datos relacional (diseño incluido)
- **CORS** - Habilitación de peticiones cross-origin

## 📦 Instalación

### Prerrequisitos
- Node.js 18+ instalado
- npm o yarn
- (Opcional) PostgreSQL para la base de datos

### Pasos de Instalación

1. **Clonar el repositorio**
```bash
git clone https://github.com/xurxoxto/avaliacion.git
cd avaliacion
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar variables de entorno**
```bash
cp .env.example .env
# Editar .env con tus configuraciones
```

## 🏃‍♂️ Uso

### Modo Desarrollo

**Frontend** (Puerto 3000)
```bash
npm run dev
```

**Backend** (Puerto 3001)
```bash
npm run server
```

### Modo Producción

**Build del Frontend**
```bash
npm run build
```

**Preview de la build**
```bash
npm run preview
```

## 🏗️ Estructura del Proyecto

```
avaliacion/
├── src/                      # Código fuente del frontend
│   ├── components/          # Componentes reutilizables
│   ├── pages/              # Páginas de la aplicación
│   ├── types/              # Definiciones de TypeScript
│   ├── utils/              # Utilidades y helpers
│   ├── data/               # Datos estáticos
│   ├── App.tsx             # Componente principal
│   ├── main.tsx            # Punto de entrada
│   └── index.css           # Estilos globales
├── server/                  # Backend Node.js
│   ├── routes/             # Rutas de la API
│   ├── database/           # Esquemas de base de datos
│   └── index.js            # Servidor Express
├── public/                  # Archivos públicos estáticos
├── dist/                    # Build de producción
└── package.json            # Dependencias y scripts
```

## 🎨 Características

### 1. **Teacher Dashboard**
- Vista de todas las aulas
- Tarjetas interactivas con información clave
- Botón para crear nuevas aulas
- Navegación a página de analíticas

### 2. **Classroom Page**
- Gestión de estudiantes por aula
- Tarjetas de estudiantes con información de progreso
- Búsqueda y filtrado de estudiantes
- Modal para añadir nuevos estudiantes

### 3. **Student Page**
- Perfil detallado del estudiante
- Registro de observaciones
- Dropdown de competencias clave (Decreto 155/2021)
- Sistema de valoración de 1-10
- Subida de archivos de evidencia
- Historial completo de evaluaciones

### 4. **Analytics Dashboard**
- Estadísticas generales del curso
- Gráficos de distribución de calificaciones
- Promedio por competencia clave
- Tendencia de evaluaciones en el tiempo
- Visualizaciones interactivas con Chart.js

## 📊 Base de Datos

### Esquema PostgreSQL
El archivo `server/database/schema.sql` contiene:
- Tablas: teachers, classrooms, students, competencias, evaluations, evidence_files
- Índices para optimización de consultas
- Triggers para actualización automática de timestamps
- Vistas para analíticas
- Datos iniciales de competencias clave

### Competencias Clave (Decreto 155/2021)
1. **C1**: Comunicación Lingüística
2. **C2**: Competencia Matemática
3. **C3**: Competencia Digital
4. **C4**: Aprender a Aprender
5. **C5**: Competencias Sociales y Cívicas
6. **C6**: Sentido de Iniciativa y Espíritu Emprendedor
7. **C7**: Conciencia y Expresiones Culturales

## 🔌 API Endpoints

### Classrooms
- `GET /api/classrooms` - Obtener todas las aulas
- `POST /api/classrooms` - Crear nueva aula
- `GET /api/classrooms/:id` - Obtener aula específica
- `PUT /api/classrooms/:id` - Actualizar aula
- `DELETE /api/classrooms/:id` - Eliminar aula

### Students
- `GET /api/students` - Obtener todos los estudiantes
- `GET /api/students?classroomId=:id` - Filtrar por aula
- `POST /api/students` - Crear nuevo estudiante
- `GET /api/students/:id` - Obtener estudiante específico
- `PUT /api/students/:id` - Actualizar estudiante
- `DELETE /api/students/:id` - Eliminar estudiante

### Evaluations
- `GET /api/evaluations` - Obtener todas las evaluaciones
- `GET /api/evaluations?studentId=:id` - Filtrar por estudiante
- `POST /api/evaluations` - Crear nueva evaluación
- `GET /api/evaluations/:id` - Obtener evaluación específica
- `DELETE /api/evaluations/:id` - Eliminar evaluación
- `GET /api/evaluations/stats/summary` - Obtener estadísticas

## 🎯 Características Futuras

- [ ] Integración con Firebase/Firestore
- [ ] Sincronización entre dispositivos
- [ ] Autenticación de usuarios completa
- [ ] Exportación de informes en PDF
- [ ] Notificaciones push
- [ ] Modo offline con sincronización
- [ ] Aplicación móvil (React Native)

## 📱 Diseño Responsive

La aplicación está diseñada con un enfoque **mobile-first**:
- Adaptable a tablets y móviles
- Grid responsivo con TailwindCSS
- Navegación optimizada para touch
- Componentes accesibles

## 🔒 Seguridad

- Variables de entorno para configuración sensible
- CORS configurado
- Validación de datos en frontend y backend
- (Pendiente) Autenticación JWT
- (Pendiente) Encriptación de contraseñas

## 🤝 Contribución

Las contribuciones son bienvenidas. Por favor:
1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

MIT License - ver el archivo LICENSE para más detalles

## 👨‍💻 Autor

CEIP Galicia

## 📞 Soporte

Para soporte, por favor abre un issue en el repositorio de GitHub.
