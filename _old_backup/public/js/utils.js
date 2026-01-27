/**
 * PLD BDU v2 - Utilities
 * Preserved algorithms from original system:
 * - RFC calculation with homoclave
 * - State mapping from postal code
 * - Date formatting for XML
 */

const Utils = {
    /**
     * Remove accents from string
     */
    removeAccents(str) {
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    },

    /**
     * Filter inconvenient words from RFC
     */
    filterInconvenientWords(rfc) {
        const badWords = ['BUEI', 'BUEY', 'CACA', 'CACO', 'CAGA', 'CAGO', 'CAKA', 'CAKO', 'COGE', 'COJA', 'COJE', 'COJI', 'COJO', 'CULO', 'FETO', 'GUEY', 'JOTO', 'KACA', 'KACO', 'KAGA', 'KAGO', 'KOGE', 'KOJO', 'KAKA', 'KULO', 'MAME', 'MAMO', 'MEAR', 'MEAS', 'MEON', 'MIAR', 'MION', 'MOCO', 'MULA', 'PEDA', 'PEDO', 'PENE', 'PUTA', 'PUTO', 'QULO', 'RATA', 'RUIN'];
        return badWords.includes(rfc) ? rfc.substring(0, 3) + 'X' : rfc;
    },

    /**
     * Check if character is vowel
     */
    isVowel(char) {
        return /^[AEIOU]$/i.test(char);
    },

    /**
     * Calculate homoclave for RFC
     */
    calculateHomoclave(fullName) {
        const map = {
            ' ': '00', '0': '00', '1': '01', '2': '02', '3': '03', '4': '04', '5': '05', '6': '06', '7': '07', '8': '08', '9': '09',
            '&': '10', 'A': '11', 'B': '12', 'C': '13', 'D': '14', 'E': '15', 'F': '16', 'G': '17', 'H': '18', 'I': '19', 'J': '21',
            'K': '22', 'L': '23', 'M': '24', 'N': '25', 'O': '26', 'P': '27', 'Q': '28', 'R': '29', 'S': '32', 'T': '33', 'U': '34',
            'V': '35', 'W': '36', 'X': '37', 'Y': '38', 'Z': '39', 'Ñ': '40'
        };

        let scores = [];
        for (let i = 0; i < fullName.length; i++) {
            scores.push(map[fullName[i]] || '00');
        }
        let strScores = '0' + scores.join('');

        let sumH = 0;
        for (let i = 0; i < scores.length; i++) {
            const s1 = parseInt(strScores.substring(i, i + 2));
            const s2 = parseInt(strScores.substring(i + 1, i + 2));
            sumH += s1 * s2;
        }

        const last3 = sumH % 1000;
        const quo = Math.floor(last3 / 34);
        const res = last3 % 34;

        const homoclaveChars = "123456789ABCDEFGHIJKLMNPQRSTUVWXYZ";
        return homoclaveChars[quo] + homoclaveChars[res];
    },

    /**
     * Calculate RFC check digit
     */
    calculateCheckDigit(rfc12) {
        const map = {
            '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
            'A': 10, 'B': 11, 'C': 12, 'D': 13, 'E': 14, 'F': 15, 'G': 16, 'H': 17, 'I': 18, 'J': 19,
            'K': 20, 'L': 21, 'M': 22, 'N': 23, '&': 24, 'O': 25, 'P': 26, 'Q': 27, 'R': 28, 'S': 29,
            'T': 30, 'U': 31, 'V': 32, 'W': 33, 'X': 34, 'Y': 35, 'Z': 36, ' ': 37, 'Ñ': 38
        };

        let sum = 0;
        for (let i = 0; i < 12; i++) {
            const c = rfc12.charAt(i);
            const val = map[c] || 0;
            sum += val * (13 - i);
        }

        const rem = sum % 11;
        if (rem === 0) return '0';
        if (rem > 0) {
            const diff = 11 - rem;
            if (diff === 10) return 'A';
            return diff.toString();
        }
        return '0';
    },

    /**
     * Calculate complete RFC from name and date of birth
     */
    calcularRFC(nombre, paterno, materno, fechaNac) {
        try {
            // Clean inputs
            let n = this.removeAccents(nombre.trim().toUpperCase());
            let p = this.removeAccents(paterno.trim().toUpperCase());
            let m = materno ? this.removeAccents(materno.trim().toUpperCase()) : '';

            // Remove particles
            const particles = ['DE ', 'DEL ', 'LA ', 'LOS ', 'LAS ', 'Y ', 'MC ', 'MAC ', 'VON ', 'VAN '];
            particles.forEach(part => {
                if (n.startsWith(part)) n = n.substring(part.length);
                if (p.startsWith(part)) p = p.substring(part.length);
                if (m.startsWith(part)) m = m.substring(part.length);
            });

            // Generate first 4 letters
            let rfc = '';
            rfc += p.charAt(0);
            let vowelFound = false;
            for (let i = 1; i < p.length; i++) {
                if (this.isVowel(p.charAt(i))) {
                    rfc += p.charAt(i);
                    vowelFound = true;
                    break;
                }
            }
            if (!vowelFound) rfc += 'X';
            rfc += m ? m.charAt(0) : 'X';
            rfc += n.charAt(0);
            rfc = this.filterInconvenientWords(rfc);

            // Date YYMMDD
            let d = new Date(fechaNac);
            if (isNaN(d.getTime())) return "XAXX010101000";
            const yy = d.getFullYear().toString().slice(-2);
            const mm = (d.getMonth() + 1).toString().padStart(2, '0');
            const dd = d.getDate().toString().padStart(2, '0');
            rfc += yy + mm + dd;

            // Homoclave
            const fullNameForAlgo = `${p} ${m} ${n}`;
            const homoclave = this.calculateHomoclave(fullNameForAlgo);
            rfc += homoclave;

            // Check digit
            const verifier = this.calculateCheckDigit(rfc);
            rfc += verifier;

            return rfc;
        } catch (e) {
            console.error("RFC Algo Error", e);
            return "XAXX010101000";
        }
    },

    /**
     * Get Mexican state from postal code
     */
    getStateFromCP(cp) {
        if (!cp || cp.length < 2) return 'Desconocido';
        const prefix = parseInt(cp.substring(0, 2));

        if (prefix >= 1 && prefix <= 16) return 'Ciudad de México';
        if (prefix === 20) return 'Aguascalientes';
        if (prefix >= 21 && prefix <= 22) return 'Baja California';
        if (prefix === 23) return 'Baja California Sur';
        if (prefix === 24) return 'Campeche';
        if (prefix >= 25 && prefix <= 27) return 'Coahuila';
        if (prefix === 28) return 'Colima';
        if (prefix >= 29 && prefix <= 30) return 'Chiapas';
        if (prefix >= 31 && prefix <= 33) return 'Chihuahua';
        if (prefix >= 34 && prefix <= 35) return 'Durango';
        if (prefix >= 36 && prefix <= 38) return 'Guanajuato';
        if (prefix >= 39 && prefix <= 41) return 'Guerrero';
        if (prefix >= 42 && prefix <= 43) return 'Hidalgo';
        if (prefix >= 44 && prefix <= 48) return 'Jalisco';
        if (prefix >= 50 && prefix <= 57) return 'Estado de México';
        if (prefix >= 58 && prefix <= 61) return 'Michoacán';
        if (prefix === 62) return 'Morelos';
        if (prefix === 63) return 'Nayarit';
        if (prefix >= 64 && prefix <= 67) return 'Nuevo León';
        if (prefix >= 68 && prefix <= 71) return 'Oaxaca';
        if (prefix >= 72 && prefix <= 75) return 'Puebla';
        if (prefix === 76) return 'Querétaro';
        if (prefix === 77) return 'Quintana Roo';
        if (prefix >= 78 && prefix <= 79) return 'San Luis Potosí';
        if (prefix >= 80 && prefix <= 82) return 'Sinaloa';
        if (prefix >= 83 && prefix <= 85) return 'Sonora';
        if (prefix === 86) return 'Tabasco';
        if (prefix >= 87 && prefix <= 89) return 'Tamaulipas';
        if (prefix === 90) return 'Tlaxcala';
        if (prefix >= 91 && prefix <= 96) return 'Veracruz';
        if (prefix === 97) return 'Yucatán';
        if (prefix >= 98 && prefix <= 99) return 'Zacatecas';

        return 'Desconocido';
    },

    /**
     * Format date for XML (YYYYMMDD)
     */
    formatDateXML(rawDate) {
        if (!rawDate) return '19000101';
        try {
            const d = new Date(rawDate);
            if (isNaN(d.getTime())) return '19000101';
            return d.toISOString().slice(0, 10).replace(/-/g, '');
        } catch (e) {
            return '19000101';
        }
    },

    /**
     * Escape XML special characters
     */
    escapeXML(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    },

    /**
     * UMA values by year
     */
    UMA_VALUES: {
        2025: 113.14,
        2024: 108.57,
        2023: 103.74,
        2022: 96.22,
        2021: 89.62,
        2020: 86.88
    },

    /**
     * Get UMA value for year
     */
    getUMAValue(year) {
        return this.UMA_VALUES[year] || this.UMA_VALUES[2025];
    },

    /**
     * Format currency (MXN)
     */
    formatCurrency(amount) {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN'
        }).format(amount);
    },

    /**
     * Format date for display
     */
    formatDate(date) {
        if (!date) return '--';
        const d = new Date(date);
        if (isNaN(d.getTime())) return '--';
        return d.toLocaleDateString('es-MX', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    },

    /**
     * Format datetime for display
     */
    formatDateTime(date) {
        if (!date) return '--';
        const d = new Date(date);
        if (isNaN(d.getTime())) return '--';
        return d.toLocaleString('es-MX', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    /**
     * Risk levels by Mexican state (ENR 2023)
     */
    STATE_RISK: {
        'Baja California': 'high',
        'Chihuahua': 'high',
        'Sinaloa': 'high',
        'Jalisco': 'high',
        'Guerrero': 'high',
        'Tamaulipas': 'high',
        'Michoacán': 'high',
        'Ciudad de México': 'medium',
        'Estado de México': 'medium',
        'Quintana Roo': 'medium',
        'Nuevo León': 'medium',
        'Sonora': 'medium',
        'Guanajuato': 'medium',
        'Veracruz': 'medium'
        // All others default to 'low'
    },

    /**
     * Get risk level for a state
     */
    getStateRisk(state) {
        return this.STATE_RISK[state] || 'low';
    },

    /**
     * Get risk level from state name (ENR 2023 classification)
     */
    getRiskState(nombreEstado) {
        if (!nombreEstado) return 'Desconocido';
        const s = this.removeAccents(nombreEstado.toLowerCase().trim());

        // HIGH RISK - Border states, Drug Trafficking Hubs, Financial Districts, Major Tourism
        const high = ['baja california', 'sonora', 'chihuahua', 'coahuila', 'nuevo leon', 'tamaulipas',
            'sinaloa', 'durango', 'michoacan', 'guerrero', 'jalisco', 'colima',
            'ciudad de mexico', 'cdmx', 'quintana roo'];

        // MEDIUM RISK - Industrial, Central Hubs, Ports
        const medium = ['guanajuato', 'estado de mexico', 'mexico', 'morelos', 'veracruz', 'puebla',
            'baja california sur', 'nayarit', 'zacatecas', 'san luis potosi'];

        if (high.some(h => s.includes(h))) return 'Alto';
        if (medium.some(m => s.includes(m))) return 'Medio';

        return 'Bajo';
    },

    /**
     * Get ISO code for Mexican state (for GeoChart)
     */
    getStateISO(nombreEstado) {
        if (!nombreEstado) return '';
        const s = this.removeAccents(nombreEstado.toLowerCase().trim());
        const map = {
            'aguascalientes': 'MX-AGU', 'baja california': 'MX-BCN', 'baja california sur': 'MX-BCS',
            'campeche': 'MX-CAM', 'chiapas': 'MX-CHP', 'chihuahua': 'MX-CHH', 'ciudad de mexico': 'MX-CMX', 'cdmx': 'MX-CMX',
            'coahuila': 'MX-COA', 'colima': 'MX-COL', 'durango': 'MX-DUR', 'guanajuato': 'MX-GUA',
            'guerrero': 'MX-GRO', 'hidalgo': 'MX-HID', 'jalisco': 'MX-JAL', 'mexico': 'MX-MEX', 'estado de mexico': 'MX-MEX',
            'michoacan': 'MX-MIC', 'morelos': 'MX-MOR', 'nayarit': 'MX-NAY', 'nuevo leon': 'MX-NLE',
            'oaxaca': 'MX-OAX', 'puebla': 'MX-PUE', 'queretaro': 'MX-QUE', 'quintana roo': 'MX-ROO',
            'san luis potosi': 'MX-SLP', 'sinaloa': 'MX-SIN', 'sonora': 'MX-SON', 'tabasco': 'MX-TAB',
            'tamaulipas': 'MX-TAM', 'tlaxcala': 'MX-TLA', 'veracruz': 'MX-VER', 'yucatan': 'MX-YUC', 'zacatecas': 'MX-ZAC'
        };
        if (map[s]) return map[s];
        for (let k in map) { if (s.includes(k)) return map[k]; }
        return '';
    }
};
