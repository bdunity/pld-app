/**
 * PLD BDU v2 - XML Generator
 * Generación de XML conforme a XSD del SAT para todas las actividades vulnerables
 */

const XMLGenerator = {

    /**
     * Generar XML para Juegos y Sorteos (JYS)
     * Conforme a esquema: http://www.uif.shcp.gob.mx/recepcion/jys jys.xsd
     */
    generateJYS(config) {
        const {
            mesReportado,     // YYYYMM
            rfcSujetoObligado,
            referencia,
            prioridad = 1,
            tipoAlerta = 100,
            personas,         // Array de personas con operaciones
            cpSucursal = '00000'
        } = config;

        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<archivo xmlns="http://www.uif.shcp.gob.mx/recepcion/jys" ';
        xml += 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ';
        xml += 'xsi:schemaLocation="http://www.uif.shcp.gob.mx/recepcion/jys jys.xsd">\n';
        xml += '  <informe>\n';
        xml += `    <mes_reportado>${mesReportado}</mes_reportado>\n`;
        xml += '    <sujeto_obligado>\n';
        xml += `      <clave_sujeto_obligado>${rfcSujetoObligado}</clave_sujeto_obligado>\n`;
        xml += '      <clave_actividad>JYS</clave_actividad>\n';
        xml += '    </sujeto_obligado>\n';
        xml += '    <aviso>\n';
        xml += `      <referencia_aviso>${this.escapeXML(referencia)}</referencia_aviso>\n`;
        xml += `      <prioridad>${prioridad}</prioridad>\n`;
        xml += '      <alerta>\n';
        xml += `        <tipo_alerta>${tipoAlerta}</tipo_alerta>\n`;
        xml += '      </alerta>\n';

        // Generar todas las personas_aviso
        personas.forEach(persona => {
            xml += this.generatePersonaAviso(persona);
        });

        // Generar detalle_operaciones (FUERA de persona_aviso, según XSD)
        xml += '      <detalle_operaciones>\n';
        personas.forEach(persona => {
            persona.operaciones.forEach(op => {
                xml += this.generateDatosOperacion(op, cpSucursal);
            });
        });
        xml += '      </detalle_operaciones>\n';

        xml += '    </aviso>\n';
        xml += '  </informe>\n';
        xml += '</archivo>';

        return xml;
    },

    /**
     * Generar persona_aviso
     */
    generatePersonaAviso(persona) {
        let xml = '      <persona_aviso>\n';
        xml += '        <tipo_persona>\n';
        xml += '          <persona_fisica>\n';
        xml += `            <nombre>${this.escapeXML(persona.nombre || 'X')}</nombre>\n`;
        xml += `            <apellido_paterno>${this.escapeXML(persona.apellidoPaterno || 'X')}</apellido_paterno>\n`;
        xml += `            <apellido_materno>${this.escapeXML(persona.apellidoMaterno || 'X')}</apellido_materno>\n`;

        if (persona.fechaNacimiento) {
            xml += `            <fecha_nacimiento>${this.formatDate(persona.fechaNacimiento)}</fecha_nacimiento>\n`;
        }

        if (persona.rfc && persona.rfc.length >= 12) {
            xml += `            <rfc>${persona.rfc.toUpperCase()}</rfc>\n`;
        }

        if (persona.curp && persona.curp.length === 18) {
            xml += `            <curp>${persona.curp.toUpperCase()}</curp>\n`;
        }

        xml += `            <pais_nacionalidad>${persona.paisNacionalidad || 'MX'}</pais_nacionalidad>\n`;
        xml += `            <actividad_economica>${persona.actividadEconomica || '8230300'}</actividad_economica>\n`;
        xml += '          </persona_fisica>\n';
        xml += '        </tipo_persona>\n';

        // Domicilio
        if (persona.domicilio) {
            xml += '        <tipo_domicilio>\n';
            xml += '          <nacional>\n';
            xml += `            <colonia>${this.escapeXML(persona.domicilio.colonia || 'NO DISPONIBLE')}</colonia>\n`;
            xml += `            <calle>${this.escapeXML(persona.domicilio.calle || 'NO DISPONIBLE')}</calle>\n`;
            xml += `            <numero_exterior>${this.escapeXML(persona.domicilio.numeroExterior || 'SN')}</numero_exterior>\n`;
            if (persona.domicilio.numeroInterior) {
                xml += `            <numero_interior>${this.escapeXML(persona.domicilio.numeroInterior)}</numero_interior>\n`;
            }
            xml += `            <codigo_postal>${(persona.domicilio.cp || '00000').toString().padStart(5, '0')}</codigo_postal>\n`;
            xml += '          </nacional>\n';
            xml += '        </tipo_domicilio>\n';
        }

        // Teléfono
        if (persona.telefono || persona.email) {
            xml += '        <telefono>\n';
            if (persona.paisTelefono) {
                xml += `          <clave_pais>${persona.paisTelefono}</clave_pais>\n`;
            }
            if (persona.telefono) {
                xml += `          <numero_telefono>${persona.telefono.replace(/\D/g, '')}</numero_telefono>\n`;
            }
            if (persona.email) {
                xml += `          <correo_electronico>${this.escapeXML(persona.email.toUpperCase())}</correo_electronico>\n`;
            }
            xml += '        </telefono>\n';
        }

        xml += '      </persona_aviso>\n';
        return xml;
    },

    /**
     * Generar datos_operacion con TODOS los campos obligatorios según XSD
     */
    generateDatosOperacion(op, cpSucursal) {
        let xml = '        <datos_operacion>\n';

        // Campos OBLIGATORIOS según XSD (en orden)
        xml += `          <fecha_operacion>${this.formatDate(op.fecha)}</fecha_operacion>\n`;

        // tipo_sucursal (obligatorio)
        xml += '          <tipo_sucursal>\n';
        xml += '            <datos_sucursal_propia>\n';
        xml += `              <codigo_postal>${(op.cpSucursal || cpSucursal || '00000').toString().padStart(5, '0')}</codigo_postal>\n`;
        xml += '            </datos_sucursal_propia>\n';
        xml += '          </tipo_sucursal>\n';

        // tipo_operacion: 101=Depósito ficha, 102=Retiro ficha, 103=Pago premio
        xml += `          <tipo_operacion>${op.tipoOperacion || (op.tipo === 'deposito' ? '101' : '102')}</tipo_operacion>\n`;

        // linea_negocio: 1=Casinos, 2=Apuestas remotas
        xml += `          <linea_negocio>${op.lineaNegocio || '2'}</linea_negocio>\n`;

        // medio_operacion: 1=Ventanilla/presencial, 2=En línea/remoto
        xml += `          <medio_operacion>${op.medioOperacion || '2'}</medio_operacion>\n`;

        // datos_liquidacion
        xml += '          <datos_liquidacion>\n';
        xml += '            <liquidacion_numerario>\n';
        xml += `              <fecha_pago>${this.formatDate(op.fechaPago || op.fecha)}</fecha_pago>\n`;
        xml += `              <instrumento_monetario>${op.instrumentoMonetario || '8'}</instrumento_monetario>\n`;
        xml += `              <moneda>${op.moneda || '1'}</moneda>\n`;
        xml += `              <monto_operacion>${parseFloat(op.monto).toFixed(2)}</monto_operacion>\n`;
        xml += '            </liquidacion_numerario>\n';
        xml += '          </datos_liquidacion>\n';

        xml += '        </datos_operacion>\n';
        return xml;
    },

    /**
     * Generar Informe en Cero (cuando no hay operaciones reportables)
     */
    generateInformeCero(config) {
        const {
            mesReportado,
            rfcSujetoObligado,
            claveActividad = 'JYS'
        } = config;

        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += `<archivo xmlns="http://www.uif.shcp.gob.mx/recepcion/${claveActividad.toLowerCase()}" `;
        xml += 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ';
        xml += `xsi:schemaLocation="http://www.uif.shcp.gob.mx/recepcion/${claveActividad.toLowerCase()} ${claveActividad.toLowerCase()}.xsd">\n`;
        xml += '  <informe>\n';
        xml += `    <mes_reportado>${mesReportado}</mes_reportado>\n`;
        xml += '    <sujeto_obligado>\n';
        xml += `      <clave_sujeto_obligado>${rfcSujetoObligado}</clave_sujeto_obligado>\n`;
        xml += `      <clave_actividad>${claveActividad}</clave_actividad>\n`;
        xml += '      <exento>1</exento>\n';
        xml += '    </sujeto_obligado>\n';
        xml += '  </informe>\n';
        xml += '</archivo>';

        return xml;
    },

    /**
     * Validar XML contra reglas básicas del XSD
     */
    validateXML(xmlString, giro = 'JYS') {
        const errors = [];
        const warnings = [];

        // Validaciones básicas de estructura
        if (!xmlString.includes('<?xml')) {
            errors.push('Falta declaración XML');
        }

        if (!xmlString.includes('xmlns="http://www.uif.shcp.gob.mx/recepcion/')) {
            errors.push('Falta namespace de la UIF');
        }

        if (!xmlString.includes('<mes_reportado>')) {
            errors.push('Falta elemento mes_reportado');
        } else {
            const mesMatch = xmlString.match(/<mes_reportado>(\d{6})<\/mes_reportado>/);
            if (!mesMatch) {
                errors.push('mes_reportado debe tener formato YYYYMM');
            }
        }

        if (!xmlString.includes('<clave_sujeto_obligado>')) {
            errors.push('Falta clave_sujeto_obligado (RFC)');
        }

        if (!xmlString.includes('<clave_actividad>')) {
            errors.push('Falta clave_actividad');
        }

        // Validaciones específicas para avisos (no informes en cero)
        if (xmlString.includes('<aviso>')) {
            if (!xmlString.includes('<referencia_aviso>')) {
                errors.push('Falta referencia_aviso');
            }

            if (!xmlString.includes('<prioridad>')) {
                errors.push('Falta prioridad');
            }

            if (!xmlString.includes('<tipo_alerta>')) {
                errors.push('Falta tipo_alerta');
            }

            if (!xmlString.includes('<persona_aviso>')) {
                errors.push('Falta persona_aviso');
            }

            if (!xmlString.includes('<detalle_operaciones>')) {
                errors.push('Falta detalle_operaciones');
            }

            if (!xmlString.includes('<datos_operacion>')) {
                errors.push('Falta datos_operacion');
            }

            // Validar campos obligatorios en datos_operacion
            if (xmlString.includes('<datos_operacion>')) {
                if (!xmlString.includes('<fecha_operacion>')) {
                    errors.push('Falta fecha_operacion en datos_operacion');
                }
                if (!xmlString.includes('<tipo_sucursal>')) {
                    errors.push('Falta tipo_sucursal en datos_operacion');
                }
                if (!xmlString.includes('<tipo_operacion>')) {
                    errors.push('Falta tipo_operacion en datos_operacion');
                }
                if (!xmlString.includes('<linea_negocio>')) {
                    errors.push('Falta linea_negocio en datos_operacion');
                }
                if (!xmlString.includes('<medio_operacion>')) {
                    errors.push('Falta medio_operacion en datos_operacion');
                }
            }
        }

        // Validar formato RFC
        const rfcMatch = xmlString.match(/<clave_sujeto_obligado>([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})<\/clave_sujeto_obligado>/);
        if (xmlString.includes('<clave_sujeto_obligado>') && !rfcMatch) {
            warnings.push('Formato de RFC podría ser incorrecto');
        }

        // Validar formato CURP si existe
        if (xmlString.includes('<curp>')) {
            const curpMatch = xmlString.match(/<curp>([A-Z]{4}\d{6}[MH][A-Z]{5}[0-9]{2})<\/curp>/);
            if (!curpMatch) {
                warnings.push('Formato de CURP podría ser incorrecto');
            }
        }

        // Validar códigos postales
        const cpMatches = xmlString.matchAll(/<codigo_postal>(\d+)<\/codigo_postal>/g);
        for (const match of cpMatches) {
            if (match[1].length !== 5) {
                warnings.push(`Código postal ${match[1]} no tiene 5 dígitos`);
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            summary: errors.length === 0
                ? (warnings.length > 0 ? `✅ Válido con ${warnings.length} advertencias` : '✅ XML válido')
                : `❌ ${errors.length} errores encontrados`
        };
    },

    /**
     * Formatear fecha a YYYYMMDD
     */
    formatDate(rawDate) {
        if (!rawDate) return this.formatDate(new Date());
        try {
            const d = typeof rawDate === 'string' ? new Date(rawDate) : rawDate;
            if (isNaN(d.getTime())) return '19000101';
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}${month}${day}`;
        } catch (e) {
            return '19000101';
        }
    },

    /**
     * Escapar caracteres especiales XML
     */
    escapeXML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;')
            .toUpperCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, ''); // Remove accents
    },

    /**
     * Descargar XML como archivo
     */
    download(xmlString, filename) {
        const blob = new Blob([xmlString], { type: 'text/xml;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }
};

// Export for use in app.js
if (typeof window !== 'undefined') {
    window.XMLGenerator = XMLGenerator;
}
