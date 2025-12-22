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

**1. Instalar dependencias**
```bash
npm install
```

**2. Build del Frontend**
```bash
npm run build
```

**3. Iniciar en modo producción**
```bash
npm start
```

El servidor iniciará en el puerto configurado (por defecto 3001) y servirá:
- Frontend React en `http://localhost:3001`
- API REST en `http://localhost:3001/api`

**Preview de la build (alternativa para desarrollo)**
```bash
npm run preview
```

### Despliegue

#### Opción 1: Firebase Hosting (Recomendado)

La aplicación ya está configurada para desplegarse en Firebase Hosting:

1. **Instalar Firebase CLI**
```bash
npm install -g firebase-tools
```

2. **Iniciar sesión en Firebase**
```bash
firebase login
```

3. **Construir la aplicación**
```bash
npm run build
```

4. **Desplegar**
```bash
firebase deploy
```

Tu aplicación estará disponible en: `https://avaliacioncompetencias.web.app`

**Configuración incluida:**
- `firebase.json` - Configuración de hosting con rewrites para SPA
- `.firebaserc` - Proyecto configurado: avaliacioncompetencias
- Caché optimizado para assets estáticos
- Redirección de todas las rutas al index.html para React Router

**Nota:** Para desplegar el backend (API), considera usar Firebase Cloud Functions o un servidor separado.

#### Opción 2: Servidor de Producción (VPS/Cloud)

Para desplegar la aplicación en un servidor de producción:

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
# Editar .env con las configuraciones de producción
# Especialmente: NODE_ENV=production, PORT, DATABASE_URL
```

4. **Construir la aplicación**
```bash
npm run build
```

5. **Iniciar el servidor**
```bash
npm start
```

**Notas de despliegue:**
- El comando `npm start` ejecuta el servidor en modo producción
- El servidor Express sirve tanto la aplicación React como las APIs
- Se recomienda usar un process manager como PM2 para producción:
  ```bash
  npm install -g pm2
  pm2 start npm --name "avaliacion" -- start
  pm2 save
  ```
- Configure un proxy inverso (nginx/Apache) para HTTPS y dominios personalizados

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
1. **CCL**: Competencia en comunicación lingüística
2. **CP**: Competencia plurilingüe
3. **STEM**: Competencia matemática y competencia en ciencia, tecnología e ingeniería
4. **CD**: Competencia digital
5. **CPSAA**: Competencia personal, social y de aprender a aprender
6. **CC**: Competencia ciudadana
7. **CE**: Competencia emprendedora
8. **CCEC**: Competencia en conciencia y expresión culturales

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

### Registrar Evaluación (PostgreSQL)

- `POST /api/registrar-evaluacion` - Inserta una evaluación en PostgreSQL y actualiza `progreso_descriptores` según las `vinculaciones` (`TEXT[]`) de la competencia específica.

Body JSON:

```json
{
  "alumnoId": "11111111-1111-4111-8111-111111111111",
  "competenciaEspecificaId": "MAT_CE1",
  "nota": 7.5,
  "evidencia": "opcional",
  "decisionDocente": "opcional",
  "fecha": "2025-12-22T10:00:00.000Z",
  "nivelLogro": "AUTONOMO"
}
```

Nota: Si usas el trigger de [server/database/init.sql](server/database/init.sql) que también actualiza `progreso_descriptores`, este endpoint establece `SET LOCAL app.skip_progreso_trigger = '1'` para evitar doble conteo.

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
