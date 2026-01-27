const functions = require('firebase-functions');
const XLSX = require('xlsx');
const { ACTIVITY_HEADERS } = require('./config/activity-headers');

/**
 * Cloud Function to generate Excel template dynamically
 * @param {object} data - { activityType: string, tenantId: string }
 * @param {object} context - Auth context
 */
exports.downloadActivityTemplate = functions.https.onCall(async (data, context) => {
    // 1. Security Check
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Debe estar autenticado.');
    }

    const { activityType } = data;
    console.log(`Generating template for activity: ${activityType}`);

    try {
        // 2. Get Headers
        // Normalize activity type to match keys (uppercase)
        const activityKey = (activityType || 'DEFAULT').toUpperCase();

        // Find matching headers or fallback to DEFAULT
        // We do a loose match or direct match
        let headers = ACTIVITY_HEADERS[activityKey];

        if (!headers) {
            // Try partial match (e.g. INMUEBLES_V -> INMUEBLES)
            const partialKey = Object.keys(ACTIVITY_HEADERS).find(k => activityKey.includes(k));
            headers = partialKey ? ACTIVITY_HEADERS[partialKey] : ACTIVITY_HEADERS['DEFAULT'];
        }

        // 3. Create Workbook
        const wb = XLSX.utils.book_new();
        const wsData = [
            headers, // Row 1: Headers
            []       // Row 2: Empty for user data
        ];

        const ws = XLSX.utils.aoa_to_sheet(wsData);

        // 4. Styling (Basic Widths)
        if (!ws['!cols']) ws['!cols'] = [];
        headers.forEach((h, i) => {
            ws['!cols'][i] = { wch: Math.max(h.length + 5, 20) };
        });

        // Add instructions in a separate sheet
        const wsInstructions = XLSX.utils.aoa_to_sheet([
            ['Instrucciones de Llenado - PLD BDU'],
            [''],
            ['1. No modifique los encabezados de la primera fila.'],
            ['2. Ingrese los datos a partir de la segunda fila.'],
            ['3. Las fechas deben tener formato DIA/MES/AÑO.'],
            ['4. Los montos no deben incluir símbolos de moneda, solo números.'],
            ['5. Guarde el archivo y súbalo en la plataforma.']
        ]);
        XLSX.utils.book_append_sheet(wb, wsInstructions, "Instrucciones");
        XLSX.utils.book_append_sheet(wb, ws, "Datos");

        // 5. Generate Buffer
        const buffer = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

        return {
            success: true,
            fileBase64: buffer,
            fileName: `Plantilla_${activityKey}_${new Date().toISOString().split('T')[0]}.xlsx`
        };

    } catch (error) {
        console.error('Error generating template:', error);
        throw new functions.https.HttpsError('internal', 'Error al generar plantilla: ' + error.message);
    }
});
