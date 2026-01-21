# PLD BDU v2 - Sistema de Prevención de Lavado de Dinero

Sistema moderno de Prevención de Lavado de Dinero y Financiamiento al Terrorismo, diseñado para cumplir con la LFPIORPI.

## 🚀 Quick Start

### Desarrollo Local

```bash
# Navegar al directorio público
cd public

# Usar cualquier servidor HTTP local
npx serve .
# o
python3 -m http.server 8000
```

Luego abrir `http://localhost:8000` (o el puerto indicado).

### Primer Uso

1. Al abrir la aplicación por primera vez, aparecerá el enlace "Configurar Admin Inicial"
2. Crea la cuenta de administrador con email, contraseña y pregunta de seguridad
3. Inicia sesión con el rol "Administrador"

## 🔥 Despliegue en Firebase

### Prerrequisitos

```bash
npm install -g firebase-tools
firebase login
```

### Crear Proyecto Firebase

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Crea un nuevo proyecto llamado `pld-bdunity`
3. Habilita Firebase Hosting

### Desplegar

```bash
cd pld-bdu-v2
firebase deploy
```

### Configurar Dominio Personalizado (pld.bdunity.com)

1. En Firebase Console → Hosting → Add custom domain
2. Ingresa `pld.bdunity.com`
3. Agrega los registros DNS proporcionados en tu panel de bdunity.com:
   - Registro CNAME: `pld` → `pld-bdunity.web.app`
4. Espera la verificación SSL (puede tomar hasta 24 horas)

## 👥 Roles de Usuario

| Rol | Acceso |
|-----|--------|
| **Administrador** | Configuración, Carga de Datos, Operaciones, Monitoreo, KYC, Exportar, Reportes, Bitácora |
| **Usuario** | Operaciones, Monitoreo, KYC, Exportar, Reportes |
| **Visitante** | Dashboard con métricas agregadas (sin datos sensibles) |

## 📁 Estructura del Proyecto

```
pld-bdu-v2/
├── firebase.json       # Configuración Firebase Hosting
├── .firebaserc         # Proyecto Firebase
└── public/
    ├── index.html      # Página de Login
    ├── dashboard.html  # Panel Principal
    ├── css/
    │   ├── design-system.css  # Variables y tema
    │   ├── components.css     # UI Components
    │   └── layouts.css        # Layouts y navegación
    └── js/
        ├── db.js       # IndexedDB Service
        ├── auth.js     # Autenticación
        ├── utils.js    # Algoritmos RFC, UMA, etc.
        ├── app.js      # Lógica principal
        └── ui.js       # Helpers UI
```

## 🔧 Configuración

### Parámetros del Sistema (en panel de Configuración)

- **RFC Sujeto Obligado**: RFC de la empresa
- **Valor UMA**: Se actualiza automáticamente según el año seleccionado
- **Umbral Aviso**: 645 UMA (operaciones que requieren reporte)
- **Umbral Monitoreo**: 325 UMA (operaciones bajo vigilancia)

### Valores UMA por Año

| Año | Valor Diario |
|-----|--------------|
| 2025 | $113.14 |
| 2024 | $108.57 |
| 2023 | $103.74 |
| 2022 | $96.22 |
| 2021 | $89.62 |
| 2020 | $86.88 |

## 📊 Funcionalidades

- ✅ Carga de archivos Excel con depósitos y retiros
- ✅ Cálculo automático de RFC con homoclave
- ✅ Monitoreo de acumulados 6 meses
- ✅ Generación de XML para UIF (esquema LFPIORPI)
- ✅ Padrón KYC con clasificación de riesgo por estado
- ✅ Exportación a Excel
- ✅ Bitácora de auditoría
- ✅ Respaldo y restauración de datos

## 🎨 Diseño

Diseño moderno inspirado en [bdunity.com](https://bdunity.com/):
- Tema oscuro Navy con acentos Cyan
- Componentes glassmorphism
- Navegación sidebar
- Totalmente responsive

## 📄 Licencia

Propiedad de 10bet Casino - Uso interno únicamente.
