/**
 * PLD BDU v2 - AI Service with Google Gemini
 * Asistente de soporte, análisis de riesgo, generador de narrativas
 */

const AIService = {

    API_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
    apiKey: '',

    // System prompts for different functions
    PROMPTS: {
        soporte: `Eres un asistente experto en Prevención de Lavado de Dinero (PLD) y Financiamiento al Terrorismo (FT) en México. 
Tu nombre es "BDUNITY AI" y ayudas a usuarios del sistema PLD BDU.

Conocimientos que tienes:
- LFPIORPI (Ley Federal para la Prevención e Identificación de Operaciones con Recursos de Procedencia Ilícita)
- Actividades vulnerables y sus umbrales (Art. 17)
- Generación de XML para la UIF/SAT
- Proceso de avisos y reportes mensuales
- KYC (Know Your Customer) y debida diligencia
- Detección de operaciones inusuales
- El sistema BDUNITY y sus funcionalidades

Instrucciones:
- Responde en español, de forma clara y concisa
- Si no sabes algo, sugiere crear un ticket de soporte
- Incluye referencias a la ley cuando sea relevante
- Sé amable y profesional`,

        riesgo: `Eres un analista experto en evaluación de riesgo PLD/FT. Evalúa el perfil de riesgo de un cliente basándote en:

Factores de riesgo:
1. PEP (Persona Políticamente Expuesta) - Alto riesgo
2. País de nacionalidad (lista GAFI de alto riesgo)
3. Actividad económica
4. Volumen de transacciones
5. Patrones de comportamiento
6. Antigüedad de la relación

Responde SIEMPRE en formato JSON con esta estructura:
{
    "nivelRiesgo": "alto|medio|bajo",
    "score": 0-100,
    "factores": ["factor1", "factor2"],
    "recomendaciones": ["accion1", "accion2"],
    "alertas": ["alerta1"] o [],
    "narrativa": "Texto explicativo del análisis"
}`,

        narrativa: `Eres un redactor experto en reportes de operaciones inusuales para la UIF México.
Genera narrativas profesionales, objetivas y bien estructuradas para reportes PLD.

La narrativa debe incluir:
1. Descripción del cliente (sin juicios de valor)
2. Descripción de la operación u operaciones
3. Razón por la que se considera inusual
4. Información adicional relevante

Usa lenguaje formal, objetivo y evita conclusiones. Solo describe hechos.
Responde con la narrativa lista para incluir en un reporte.`,

        anomalias: `Eres un detector de anomalías en transacciones financieras para PLD/FT.
Analiza las operaciones proporcionadas y detecta patrones sospechosos como:

1. Fraccionamiento (Smurfing): Múltiples operaciones pequeñas para evitar umbrales
2. Incremento súbito: Aumento repentino en volumen o frecuencia
3. Round-tripping: Operaciones circulares
4. Estructuración: Operaciones justo debajo del umbral
5. Horarios inusuales: Operaciones fuera de patrones normales

Responde en JSON:
{
    "anomaliasDetectadas": [
        {
            "tipo": "nombre_patron",
            "severidad": "alta|media|baja",
            "descripcion": "...",
            "operacionesInvolucradas": [ids],
            "montoTotal": 0,
            "recomendacion": "..."
        }
    ],
    "resumen": "Texto resumen del análisis"
}`
    },

    /**
     * Initialize with API key
     */
    demoMode: false,

    /**
     * Initialize with API key
     */
    async init() {
        const config = await dbService.get('config', 'main');
        this.apiKey = config?.geminiApiKey || localStorage.getItem('gemini_api_key');
        this.demoMode = config?.aiDemoMode === true; // Load demo mode setting
        return !!this.apiKey || this.demoMode;
    },

    /**
     * Set API key
     */
    async setApiKey(key) {
        this.apiKey = key;
        localStorage.setItem('gemini_api_key', key);

        // Also save to config
        const config = await dbService.get('config', 'main') || { id: 'main' };
        config.geminiApiKey = key;
        await dbService.addItems('config', [config]);

        return true;
    },

    /**
     * Set Demo Mode
     */
    async setDemoMode(enabled) {
        this.demoMode = enabled;
        const config = await dbService.get('config', 'main') || { id: 'main' };
        config.aiDemoMode = enabled;
        await dbService.addItems('config', [config]);
        return enabled;
    },

    /**
     * Check if API is configured
     */
    isConfigured() {
        return !!this.apiKey || this.demoMode;
    },

    /**
     * Call Gemini API (or Mock)
     */
    async callGemini(prompt, systemPrompt = '', temperature = 0.7) {
        if (this.demoMode) {
            // Determine type of prompt for mock response
            let type = '';
            if (systemPrompt.includes('asistente experto')) type = this.PROMPTS.soporte;
            else if (systemPrompt.includes('analista experto')) type = this.PROMPTS.riesgo;
            else if (systemPrompt.includes('detector de anomalías')) type = this.PROMPTS.anomalias;
            else if (systemPrompt.includes('redactor experto')) type = this.PROMPTS.narrativa;

            return this.mockResponse(prompt, type);
        }

        if (!this.apiKey) {
            throw new Error('API key no configurada. Ve a Configuración para agregar tu clave de Gemini.');
        }

        const url = `${this.API_URL}?key=${this.apiKey}`;

        const body = {
            contents: [
                {
                    parts: [
                        { text: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt }
                    ]
                }
            ],
            generationConfig: {
                temperature: temperature,
                maxOutputTokens: 2048
            }
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || 'Error en API de Gemini');
            }

            const data = await response.json();
            return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } catch (error) {
            console.error('Gemini API error:', error);
            throw error;
        }
    },

    /**
     * Generate Mock Response for Demo Mode
     */
    mockResponse(prompt, type) {
        console.log('🤖 [DEMO MODE] Prompt:', prompt);

        // Simulate network delay
        return new Promise(resolve => {
            setTimeout(() => {
                const p = prompt.toLowerCase();

                // 0. Test de Conexión
                if (p.includes('responde solo "ok"') || p.includes('ok')) {
                    resolve("OK");
                    return;
                }

                // 1. Respuestas para SOPORTE (Expert Knowledge Base)
                if (type === this.PROMPTS.soporte) {
                    if (p.includes('xml') || p.includes('aviso')) {
                        resolve(`**Generación de XML y Avisos (Guía Experta):**

Para cumplir con la obligación de presentar avisos (Art. 17 LFPIORPI):
1.  Ve a la pestaña **Exportar**.
2.  Selecciona el periodo (mes calendario anterior).
3.  El sistema validará automáticamente los umbrales vigentes (${new Date().getFullYear()}).
4.  Haz clic en **Generar XML**.
5.  Sube este archivo al portal del SPPLD.

💡 **Tip:** Revisa siempre el acuse de aceptación del SAT/UIF. El sistema marca las operaciones que superan el umbral de aviso (**645 UMA**).`);
                    } else if (p.includes('umbral') || p.includes('uma')) {
                        const uma = 113.14; // UMA 2025 estimate/real
                        resolve(`**Umbrales PLD 2025 (Estimado UMA $${uma}):**

Para Actividades Vulnerables (Art 17 LFPIORPI):

🔹 **Identificación (325 UMA):** ~$${(325 * uma).toLocaleString('es-MX', { maximumFractionDigits: 2 })} MXN
🔹 **Aviso (645 UMA):** ~$${(645 * uma).toLocaleString('es-MX', { maximumFractionDigits: 2 })} MXN
🔹 **Restricción de Efectivo (3,210 UMA):** ~$${(3210 * uma).toLocaleString('es-MX', { maximumFractionDigits: 2 })} MXN

*El sistema actualiza estos valores automáticamente. Asegúrate de tener el expediente completo si la operación supera el umbral de identificación.*`);
                    } else if (p.includes('kyc') || p.includes('cliente') || p.includes('expediente')) {
                        resolve(`**Gestión de Debida Diligencia (KYC):**

El expediente de identificación debe contener (Anexos 3-8 DCG):
1.  **Datos Generales:** Nombre, fecha nac., país, actividad económica.
2.  **Documentos:** Identificación oficial, CURP/RFC, Comprobante de domicilio (< 3 meses).
3.  **Propietario Real:** Identificar si actúa a nombre de un tercero.
4.  **Perfil Transaccional:** Estimación de operaciones esperadas.

⚠️ *Para clientes de Alto Riesgo (PEP, No Residente), se requiere aprobación de un directivo y actualización anual.*`);
                    } else if (p.includes('manual') || p.includes('pld')) {
                        resolve(`**Manual de Cumplimiento PLD:**

Tu manual debe incluir (según Disposiciones de Carácter General):
1.  **Enfoque Basado en Riesgo (EBR):** Metodología de evaluación.
2.  **Estructuras Internas:** Funciones del Oficial de Cumplimiento.
3.  **Identificación:** Políticas de KYC para clientes y usuarios.
4.  **Reportes:** Inusuales (24h), Internos Preocupantes y Relevantes.
5.  **Capacitación:** Programa anual y difusión.

*¿Necesitas ayuda redactando una sección específica del manual?*`);
                    } else if (p.includes('estructuracion') || p.includes('pitufeo')) {
                        resolve(`**Estructuración (Pitufeo/Smurfing):**

Práctica tipificada donde un usuario fracciona operaciones para evitar umbrales de reporte.
**Señales de Alerta:**
- Múltiples depósitos en efectivo el mismo día en distintas sucursales/cajas.
- Operaciones justo por debajo del umbral de $7,500 USD (o equivalente).
- Varios terceros depositando a una misma cuenta sin relación aparente.

*El módulo de Detección de Anomalías de BDUNITY identifica estos patrones automáticamente.*`);
                    } else {
                        resolve(`¡Hola! Soy **BDUNITY AI**, tu consultor experto en PLD/FT (Modo Demo).

Puedo ayudarte con:
✅ **Interpretación de Ley (LFPIORPI):** Dudas sobre artículos o reglamentos.
✅ **Cálculo de Umbrales:** Valores UMA actualizados y montos límites.
✅ **Guía Operativa:** Cómo generar reportes, XML o gestionar KYC.
✅ **Análisis de Tipologías:** Detección de operaciones inusuales.

*Prueba preguntando: "¿Cuáles son los umbrales de aviso para 2025?" o "¿Qué documentos necesito para una Persona Moral?"*`);
                    }
                }

                // 2. Respuestas para RIESGO (Realistic Simulation)
                else if (type === this.PROMPTS.riesgo) {
                    resolve(JSON.stringify({
                        nivelRiesgo: "alto",
                        score: 85,
                        factores: [
                            "📍 Nacionalidad de Alto Riesgo (Lista GAFI)",
                            "💰 Operaciones en efectivo recurrentes",
                            "👔 Actividad Económica Sensible (Joyeria/Blindaje)",
                            "🔄 Volumen transaccional 300% superior al perfil declarado"
                        ],
                        recomendaciones: [
                            "Solicitar actualización de expediente inmediata",
                            "Realizar visita domiciliaria para verificar actividad",
                            "Escalar aprobación a Comité de Comunicación y Control",
                            "Monitoreo reforzado (diario)"
                        ],
                        alertas: ["Posible discrepancia fiscal", "PEP por asociación"],
                        narrativa: "[DEMO] El cliente ha realizado operaciones que superan significativamente su perfil transaccional declarado. Se detectó origen de fondos de una jurisdicción de alto riesgo. Se recomienda clasificación inmediata como Alto Riesgo y debida diligencia intensificada."
                    }));
                }

                // 3. Respuestas para ANOMALÍAS (Complex Case)
                else if (type === this.PROMPTS.anomalias) {
                    resolve(JSON.stringify({
                        anomaliasDetectadas: [
                            {
                                "tipo": "ESTRUCTURACION_POSIBLE",
                                "severidad": "alta",
                                "descripcion": "[DEMO] Se detectaron 14 depósitos de $9,500 MXN en un lapso de 4 horas.",
                                "montoTotal": 133000,
                                "recomendacion": "Generar Reporte de Operación Inusual (24 horas)"
                            },
                            {
                                "tipo": "VELOCIDAD_FONDOS",
                                "severidad": "media",
                                "descripcion": "[DEMO] Los fondos son retirados inmediatamente después de su depósito (Pass-through).",
                                "montoTotal": 130000,
                                "recomendacion": "Documentar justificación comercial"
                            }
                        ],
                        resumen: "[DEMO] Patrón claro de pitufeo detectado. El usuario intenta evitar el umbral de identificación mediante fraccionamiento. Riesgo alto de lavado de dinero."
                    }));
                }

                // 4. Respuestas para NARRATIVA
                else if (type === this.PROMPTS.narrativa) {
                    resolve(`**REPORTE DE OPERACIÓN INUSUAL (PROPUESTA)**

**I. IDENTIFICACIÓN DE LA OPERACIÓN**
Se detectó que el cliente [NOMBRE_CLIENTE] realizó operaciones inusuales el día [FECHA] por un monto total de [MONTO], las cuales no concuerdan con sus antecedentes transaccionales conocidos ni con su actividad económica declarada de [OCUPACION].

**II. ELEMENTOS DE ANÁLISIS**
La inusualidad radica en la fragmentación de los montos (estructuración) en operaciones consecutivas por debajo del umbral de alerta, sumando un total que hubiera requerido identificación inmediata. Adicionalmente, los recursos fueron retirados en su totalidad el mismo día, comportamiento atípico para el giro del cliente.

**III. CONCLUSIÓN**
Con base en el análisis, se determina que las operaciones presentan características de intentar evadir los controles preventivos de la entidad (estructuración), por lo que se procede a reportar conforme a las disposiciones vigentes.`);
                }

                // Default
                else {
                    resolve("[DEMO] Soy un asistente experto en PLD. En modo demo, mis respuestas son simuladas pero basadas en mejores prácticas reales.");
                }
            }, 1500); // Slightly longer delay for realism
        });
    },

    // ========== ASISTENTE DE SOPORTE ==========

    /**
     * Chat with AI support assistant
     */
    async chatSoporte(mensaje, contexto = {}) {
        const contextInfo = `
Contexto del usuario:
- Empresa: ${contexto.empresa || 'No especificada'}
- Rol: ${contexto.rol || 'usuario'}
- Giro: ${contexto.giro || 'Juegos y Sorteos'}
- Pregunta anterior: ${contexto.preguntaAnterior || 'ninguna'}
`;

        const prompt = `${contextInfo}\n\nPregunta del usuario: ${mensaje}`;

        return await this.callGemini(prompt, this.PROMPTS.soporte, 0.7);
    },

    // ========== ANÁLISIS DE RIESGO ==========

    /**
     * Analyze client risk profile
     */
    async analizarRiesgoCliente(cliente) {
        const prompt = `Analiza el perfil de riesgo de este cliente:

Datos del cliente:
- Nombre: ${cliente.firstname} ${cliente.lastname}
- RFC: ${cliente.rfc || 'No proporcionado'}
- CURP: ${cliente.curp || 'No proporcionado'}
- Nacionalidad: ${cliente.paisNacionalidad || cliente.country || 'México'}
- Estado: ${cliente.state || 'No especificado'}
- Ocupación: ${cliente.ocupacion || cliente.economicActivity || 'No especificada'}
- Fecha registro: ${cliente.registrationDate || 'No especificada'}
- Monto total operaciones: ${cliente.montoTotal ? '$' + cliente.montoTotal.toLocaleString() : 'No disponible'}
- Número de operaciones: ${cliente.numOperaciones || 0}

Evalúa su nivel de riesgo y proporciona recomendaciones.`;

        try {
            const response = await this.callGemini(prompt, this.PROMPTS.riesgo, 0.3);

            // Try to parse JSON response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }

            // Fallback
            return {
                nivelRiesgo: 'medio',
                score: 50,
                factores: ['Análisis automático no disponible'],
                recomendaciones: ['Revisar manualmente'],
                alertas: [],
                narrativa: response
            };
        } catch (error) {
            console.error('Error analyzing risk:', error);
            throw error;
        }
    },

    /**
     * Batch risk analysis for multiple clients
     */
    async analizarRiesgoLote(clientes) {
        const resultados = [];

        for (const cliente of clientes.slice(0, 10)) { // Limit to 10 to avoid rate limits
            try {
                const analisis = await this.analizarRiesgoCliente(cliente);
                resultados.push({
                    playercode: cliente.playercode,
                    nombre: `${cliente.firstname} ${cliente.lastname}`,
                    ...analisis
                });
            } catch (e) {
                resultados.push({
                    playercode: cliente.playercode,
                    nombre: `${cliente.firstname} ${cliente.lastname}`,
                    error: e.message
                });
            }

            // Small delay to avoid rate limits
            await new Promise(r => setTimeout(r, 500));
        }

        return resultados;
    },

    // ========== GENERADOR DE NARRATIVAS ==========

    /**
     * Generate narrative for unusual operation report
     */
    async generarNarrativa(operacion, cliente, motivo) {
        const prompt = `Genera una narrativa para reporte de operación inusual:

DATOS DEL CLIENTE:
- Nombre: ${cliente.firstname} ${cliente.lastname}
- RFC: ${cliente.rfc || 'No registrado'}
- Nacionalidad: ${cliente.paisNacionalidad || 'Mexicana'}
- Ocupación: ${cliente.ocupacion || 'No especificada'}

DATOS DE LA OPERACIÓN:
- Tipo: ${operacion.tipo}
- Monto: $${operacion.monto?.toLocaleString() || 0}
- Fecha: ${operacion.fecha || operacion.fechaProceso}
- Medio: ${operacion.instrumento || 'No especificado'}

MOTIVO DE REPORTE:
${motivo || 'Operación por encima del umbral de aviso'}

Genera una narrativa profesional para incluir en el reporte a la UIF.`;

        return await this.callGemini(prompt, this.PROMPTS.narrativa, 0.5);
    },

    // ========== DETECTOR DE ANOMALÍAS ==========

    /**
     * Detect anomalies in operations
     */
    async detectarAnomalias(operaciones, umbral = 645) {
        // Summarize operations for the prompt
        const resumen = {
            total: operaciones.length,
            montoTotal: operaciones.reduce((sum, op) => sum + (op.monto || 0), 0),
            promedioMonto: 0,
            porCliente: {}
        };

        resumen.promedioMonto = resumen.total > 0 ? resumen.montoTotal / resumen.total : 0;

        // Group by client
        operaciones.forEach(op => {
            const key = op.playercode || 'desconocido';
            if (!resumen.porCliente[key]) {
                resumen.porCliente[key] = { count: 0, total: 0, operaciones: [] };
            }
            resumen.porCliente[key].count++;
            resumen.porCliente[key].total += op.monto || 0;
            resumen.porCliente[key].operaciones.push({
                id: op.id,
                monto: op.monto,
                fecha: op.fechaProceso
            });
        });

        const prompt = `Analiza estas operaciones para detectar anomalías:

RESUMEN:
- Total operaciones: ${resumen.total}
- Monto total: $${resumen.montoTotal.toLocaleString()}
- Monto promedio: $${resumen.promedioMonto.toLocaleString()}
- Umbral de aviso: ${umbral} UMA

OPERACIONES POR CLIENTE (top 10):
${Object.entries(resumen.porCliente)
                .slice(0, 10)
                .map(([id, data]) => `- ${id}: ${data.count} ops, $${data.total.toLocaleString()}`)
                .join('\n')}

MUESTRA DE OPERACIONES (últimas 20):
${operaciones.slice(-20).map(op =>
                    `- ${op.playercode}: $${op.monto?.toLocaleString()} (${op.fechaProceso})`
                ).join('\n')}

Detecta patrones sospechosos y anomalías.`;

        try {
            const response = await this.callGemini(prompt, this.PROMPTS.anomalias, 0.3);

            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }

            return {
                anomaliasDetectadas: [],
                resumen: response
            };
        } catch (error) {
            console.error('Error detecting anomalies:', error);
            throw error;
        }
    },

    // ========== REPORTES ==========

    /**
     * Generar reporte de operación inusual
     */
    async generarReporteInusual(datosCliente) {
        if (!this.apiKey) return "Error: API Key no configurada.";

        const prompt = this.PROMPTS.narrativa + JSON.stringify(datosCliente); // corrected prompt key reference in fallback

        try {
            return await this.callGemini(prompt, '', 0.7);
        } catch (error) {
            console.error('Error generando reporte:', error);
            return "Error generando el reporte.";
        }
    },

    // ========== HELPERS ==========

    /**
     * Test API connection
     */
    async testConnection() {
        try {
            const response = await this.callGemini('Responde solo "OK" si puedes leerme.', '', 0);
            const isOk = response.toLowerCase().includes('ok');

            if (!isOk) {
                console.warn('Gemini Test Response:', response);
                throw new Error(`Respuesta inesperada: ${response.substring(0, 50)}...`);
            }

            return true;
        } catch (error) {
            console.error('Gemini Connection Test Error:', error);
            throw error; // Re-throw to be handled by UI
        }
    }
};

// Export
if (typeof window !== 'undefined') {
    window.AIService = AIService;
}
