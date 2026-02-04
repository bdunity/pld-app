import { z } from 'zod';

// Regex oficial para RFC mexicano
// Persona Moral: 3 letras + 6 dígitos fecha + 3 caracteres homoclave = 12 chars
// Persona Física: 4 letras + 6 dígitos fecha + 3 caracteres homoclave = 13 chars
const RFC_REGEX = /^([A-ZÑ&]{3,4})(\d{6})([A-Z\d]{3})$/;

// Esquema de Login
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'El correo electrónico es requerido')
    .email('Ingresa un correo electrónico válido'),
  password: z
    .string()
    .min(1, 'La contraseña es requerida')
    .min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

// Esquema de Registro
export const registerSchema = z.object({
  email: z
    .string()
    .min(1, 'El correo electrónico es requerido')
    .email('Ingresa un correo electrónico válido'),
  password: z
    .string()
    .min(1, 'La contraseña es requerida')
    .min(6, 'La contraseña debe tener al menos 6 caracteres')
    .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
    .regex(/[0-9]/, 'Debe contener al menos un número'),
  confirmPassword: z
    .string()
    .min(1, 'Confirma tu contraseña'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
});

// Esquema de Recuperación de Contraseña
export const recoverySchema = z.object({
  email: z
    .string()
    .min(1, 'El correo electrónico es requerido')
    .email('Ingresa un correo electrónico válido'),
});

// ========================================
// ONBOARDING SCHEMAS
// ========================================

// Paso 1: Identidad Fiscal
export const fiscalIdentitySchema = z.object({
  rfc: z
    .string()
    .min(1, 'El RFC es requerido')
    .min(12, 'El RFC debe tener al menos 12 caracteres')
    .max(13, 'El RFC no puede tener más de 13 caracteres')
    .regex(RFC_REGEX, 'Formato de RFC inválido. Debe ser: 3-4 letras + 6 dígitos + 3 caracteres'),
  razonSocial: z
    .string()
    .min(1, 'La razón social es requerida')
    .min(3, 'La razón social debe tener al menos 3 caracteres')
    .max(200, 'La razón social no puede exceder 200 caracteres'),
  regimenFiscal: z
    .string()
    .min(1, 'El régimen fiscal es requerido'),
});

// Paso 2: Representación
export const representationSchema = z.object({
  nombreOficialCumplimiento: z
    .string()
    .min(1, 'El nombre del oficial de cumplimiento es requerido')
    .min(5, 'El nombre debe tener al menos 5 caracteres')
    .max(150, 'El nombre no puede exceder 150 caracteres'),
  rfcRepresentante: z
    .string()
    .min(1, 'El RFC del representante es requerido')
    .length(13, 'El RFC del representante debe tener 13 caracteres (persona física)')
    .regex(RFC_REGEX, 'Formato de RFC inválido'),
  cargoRepresentante: z
    .string()
    .min(1, 'El cargo es requerido'),
  emailContacto: z
    .string()
    .min(1, 'El email de contacto es requerido')
    .email('Ingresa un email válido'),
  telefonoContacto: z
    .string()
    .min(1, 'El teléfono es requerido')
    .regex(/^\d{10}$/, 'El teléfono debe tener 10 dígitos'),
});

// Paso 3: Actividades Vulnerables
export const vulnerableActivitiesSchema = z.object({
  actividadesVulnerables: z
    .array(z.string())
    .min(1, 'Debes seleccionar al menos una actividad vulnerable'),
});

// Schema completo del Onboarding
export const onboardingSchema = z.object({
  // Paso 1
  rfc: fiscalIdentitySchema.shape.rfc,
  razonSocial: fiscalIdentitySchema.shape.razonSocial,
  regimenFiscal: fiscalIdentitySchema.shape.regimenFiscal,
  // Paso 2
  nombreOficialCumplimiento: representationSchema.shape.nombreOficialCumplimiento,
  rfcRepresentante: representationSchema.shape.rfcRepresentante,
  cargoRepresentante: representationSchema.shape.cargoRepresentante,
  emailContacto: representationSchema.shape.emailContacto,
  telefonoContacto: representationSchema.shape.telefonoContacto,
  // Paso 3
  actividadesVulnerables: vulnerableActivitiesSchema.shape.actividadesVulnerables,
});

// Catálogo de Regímenes Fiscales (SAT)
export const REGIMENES_FISCALES = [
  { value: '601', label: 'General de Ley Personas Morales' },
  { value: '603', label: 'Personas Morales con Fines no Lucrativos' },
  { value: '605', label: 'Sueldos y Salarios e Ingresos Asimilados a Salarios' },
  { value: '606', label: 'Arrendamiento' },
  { value: '607', label: 'Régimen de Enajenación o Adquisición de Bienes' },
  { value: '608', label: 'Demás Ingresos' },
  { value: '610', label: 'Residentes en el Extranjero sin Establecimiento Permanente en México' },
  { value: '611', label: 'Ingresos por Dividendos (Socios y Accionistas)' },
  { value: '612', label: 'Personas Físicas con Actividades Empresariales y Profesionales' },
  { value: '614', label: 'Ingresos por Intereses' },
  { value: '615', label: 'Régimen de los Ingresos por Obtención de Premios' },
  { value: '616', label: 'Sin Obligaciones Fiscales' },
  { value: '620', label: 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos' },
  { value: '621', label: 'Incorporación Fiscal' },
  { value: '622', label: 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras' },
  { value: '623', label: 'Opcional para Grupos de Sociedades' },
  { value: '624', label: 'Coordinados' },
  { value: '625', label: 'Régimen de las Actividades Empresariales con Ingresos a través de Plataformas Tecnológicas' },
  { value: '626', label: 'Régimen Simplificado de Confianza' },
];

// Catálogo de Actividades Vulnerables (LFPIORPI Art. 17)
export const ACTIVIDADES_VULNERABLES = [
  {
    id: 'JUEGOS_APUESTAS',
    label: 'Juegos con Apuestas, Concursos o Sorteos',
    description: 'Casinos, centros de apuestas, sorteos'
  },
  {
    id: 'TARJETAS_PREPAGO',
    label: 'Emisión de Tarjetas de Servicios o Crédito',
    description: 'Tarjetas prepagadas, monederos electrónicos'
  },
  {
    id: 'CHEQUES_VIAJERO',
    label: 'Emisión de Cheques de Viajero',
    description: 'Emisión y comercialización de cheques de viajero'
  },
  {
    id: 'OPERACIONES_MUTUO',
    label: 'Operaciones de Mutuo o Garantía',
    description: 'Préstamos entre particulares, créditos'
  },
  {
    id: 'INMUEBLES',
    label: 'Compraventa de Inmuebles',
    description: 'Servicios de construcción, intermediación o compraventa de inmuebles'
  },
  {
    id: 'METALES_PIEDRAS',
    label: 'Comercialización de Metales Preciosos y Piedras',
    description: 'Joyerías, casas de empeño con metales y piedras preciosas'
  },
  {
    id: 'OBRAS_ARTE',
    label: 'Comercialización de Obras de Arte',
    description: 'Galerías, subastas de arte, antigüedades'
  },
  {
    id: 'VEHICULOS',
    label: 'Comercialización de Vehículos',
    description: 'Venta de vehículos nuevos o usados: autos, aviones, embarcaciones'
  },
  {
    id: 'BLINDAJE',
    label: 'Servicios de Blindaje',
    description: 'Blindaje de vehículos o inmuebles'
  },
  {
    id: 'TRASLADO_VALORES',
    label: 'Traslado o Custodia de Dinero o Valores',
    description: 'Empresas de traslado de valores'
  },
  {
    id: 'SERVICIOS_FE_PUBLICA',
    label: 'Prestación de Servicios de Fe Pública',
    description: 'Notarios, corredores públicos'
  },
  {
    id: 'SERVICIOS_PROFESIONALES',
    label: 'Prestación de Servicios Profesionales Independientes',
    description: 'Contadores, abogados en operaciones específicas'
  },
  {
    id: 'ARRENDAMIENTO',
    label: 'Arrendamiento de Inmuebles',
    description: 'Arrendamiento de bienes inmuebles'
  },
  {
    id: 'ACTIVOS_VIRTUALES',
    label: 'Operaciones con Activos Virtuales',
    description: 'Exchanges de criptomonedas, plataformas de activos virtuales'
  },
  {
    id: 'CONSTITUCION_PERSONAS',
    label: 'Constitución de Personas Morales o Fideicomisos',
    description: 'Servicios de creación de sociedades o estructuras jurídicas'
  },
];

// Catálogo de Cargos
export const CARGOS_REPRESENTANTE = [
  { value: 'OFICIAL_CUMPLIMIENTO', label: 'Oficial de Cumplimiento' },
  { value: 'REPRESENTANTE_LEGAL', label: 'Representante Legal' },
  { value: 'APODERADO', label: 'Apoderado Legal' },
  { value: 'ADMINISTRADOR_UNICO', label: 'Administrador Único' },
  { value: 'DIRECTOR_GENERAL', label: 'Director General' },
  { value: 'CONTADOR', label: 'Contador / CFO' },
];
