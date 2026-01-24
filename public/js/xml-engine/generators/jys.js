/**
 * PLD BDU v2 - JYS XML Generator (Casinos)
 * Preserves original logic from xml-generator.js
 * Registered with XMLEngine for modular routing
 */

const XMLGeneratorJYS = {
    GIRO_ID: 'juegos_sorteos',
    CLAVE_ACTIVIDAD: 'JYS',
    XSD_URL: 'http://www.uif.shcp.gob.mx/recepcion/jys',

    /**
     * Generate XML for Juegos y Sorteos (JYS)
     * Preserves original logic from XMLGenerator.generateJYS()
     */
    generate(config) {
        const {
            mesReportado,
            rfcSujetoObligado,
            referencia,
            prioridad = 1,
            tipoAlerta = 100,
            personas,
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
        xml += `      <referencia_aviso>${XMLGeneratorBase.escapeXML(referencia)}</referencia_aviso>\n`;
        xml += `      <prioridad>${prioridad}</prioridad>\n`;
        xml += '      <alerta>\n';
        xml += `        <tipo_alerta>${tipoAlerta}</tipo_alerta>\n`;
        xml += '      </alerta>\n';

        // Generate all persona_aviso elements
        personas.forEach(persona => {
            xml += this.generatePersonaAviso(persona);
        });

        // Generate detalle_operaciones (outside persona_aviso per XSD)
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

        const totalOps = personas.reduce((sum, p) => sum + (p.operaciones?.length || 0), 0);

        return {
            xml,
            tipo: 'aviso',
            totalAvisos: personas.length,
            totalOperaciones: totalOps,
            filename: `Aviso_JYS_${mesReportado}.xml`
        };
    },

    /**
     * Generate persona_aviso element
     */
    generatePersonaAviso(persona) {
        let xml = '      <persona_aviso>\n';
        xml += '        <tipo_persona>\n';
        xml += '          <persona_fisica>\n';
        xml += `            <nombre>${XMLGeneratorBase.escapeXML(persona.nombre || 'X')}</nombre>\n`;
        xml += `            <apellido_paterno>${XMLGeneratorBase.escapeXML(persona.apellidoPaterno || 'X')}</apellido_paterno>\n`;
        xml += `            <apellido_materno>${XMLGeneratorBase.escapeXML(persona.apellidoMaterno || 'X')}</apellido_materno>\n`;

        if (persona.fechaNacimiento) {
            xml += `            <fecha_nacimiento>${XMLGeneratorBase.formatDate(persona.fechaNacimiento)}</fecha_nacimiento>\n`;
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
            xml += `            <colonia>${XMLGeneratorBase.escapeXML(persona.domicilio.colonia || 'NO DISPONIBLE')}</colonia>\n`;
            xml += `            <calle>${XMLGeneratorBase.escapeXML(persona.domicilio.calle || 'NO DISPONIBLE')}</calle>\n`;
            xml += `            <numero_exterior>${XMLGeneratorBase.escapeXML(persona.domicilio.numeroExterior || 'SN')}</numero_exterior>\n`;
            if (persona.domicilio.numeroInterior) {
                xml += `            <numero_interior>${XMLGeneratorBase.escapeXML(persona.domicilio.numeroInterior)}</numero_interior>\n`;
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
                xml += `          <correo_electronico>${XMLGeneratorBase.escapeXML(persona.email.toUpperCase())}</correo_electronico>\n`;
            }
            xml += '        </telefono>\n';
        }

        xml += '      </persona_aviso>\n';
        return xml;
    },

    /**
     * Generate datos_operacion with ALL mandatory fields per XSD
     */
    generateDatosOperacion(op, cpSucursal) {
        let xml = '        <datos_operacion>\n';

        // Mandatory fields per XSD (in order)
        xml += `          <fecha_operacion>${XMLGeneratorBase.formatDate(op.fecha)}</fecha_operacion>\n`;

        // tipo_sucursal (mandatory)
        xml += '          <tipo_sucursal>\n';
        xml += '            <datos_sucursal_propia>\n';
        xml += `              <codigo_postal>${(op.cpSucursal || cpSucursal || '00000').toString().padStart(5, '0')}</codigo_postal>\n`;
        xml += '            </datos_sucursal_propia>\n';
        xml += '          </tipo_sucursal>\n';

        // tipo_operacion: 101=Deposit, 102=Withdrawal, 103=Prize payment
        xml += `          <tipo_operacion>${op.tipoOperacion || (op.tipo === 'deposito' ? '101' : '102')}</tipo_operacion>\n`;

        // linea_negocio: 1=Casinos, 2=Remote betting
        xml += `          <linea_negocio>${op.lineaNegocio || '2'}</linea_negocio>\n`;

        // medio_operacion: 1=In-person, 2=Online/remote
        xml += `          <medio_operacion>${op.medioOperacion || '2'}</medio_operacion>\n`;

        // datos_liquidacion
        xml += '          <datos_liquidacion>\n';
        xml += '            <liquidacion_numerario>\n';
        xml += `              <fecha_pago>${XMLGeneratorBase.formatDate(op.fechaPago || op.fecha)}</fecha_pago>\n`;
        xml += `              <instrumento_monetario>${op.instrumentoMonetario || '8'}</instrumento_monetario>\n`;
        xml += `              <moneda>${op.moneda || '1'}</moneda>\n`;
        xml += `              <monto_operacion>${parseFloat(op.monto).toFixed(2)}</monto_operacion>\n`;
        xml += '            </liquidacion_numerario>\n';
        xml += '          </datos_liquidacion>\n';

        xml += '        </datos_operacion>\n';
        return xml;
    },

    /**
     * Generate Informe en Cero for JYS
     */
    generateInformeCero(config) {
        const { mesReportado, rfcSujetoObligado } = config;

        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<archivo xmlns="http://www.uif.shcp.gob.mx/recepcion/jys" ';
        xml += 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ';
        xml += 'xsi:schemaLocation="http://www.uif.shcp.gob.mx/recepcion/jys jys.xsd">\n';
        xml += '  <informe>\n';
        xml += `    <mes_reportado>${mesReportado}</mes_reportado>\n`;
        xml += '    <sujeto_obligado>\n';
        xml += `      <clave_sujeto_obligado>${rfcSujetoObligado}</clave_sujeto_obligado>\n`;
        xml += '      <clave_actividad>JYS</clave_actividad>\n';
        xml += '      <exento>1</exento>\n';
        xml += '    </sujeto_obligado>\n';
        xml += '  </informe>\n';
        xml += '</archivo>';

        return {
            xml,
            tipo: 'informe_cero',
            totalAvisos: 0,
            filename: `Informe_Cero_JYS_${mesReportado}.xml`
        };
    },

    /**
     * Validate JYS XML against basic rules
     */
    validate(xmlString) {
        const errors = [];
        const warnings = [];

        // Basic structure validations
        if (!xmlString.includes('<?xml')) {
            errors.push('Falta declaración XML');
        }

        if (!xmlString.includes('xmlns="http://www.uif.shcp.gob.mx/recepcion/jys"')) {
            errors.push('Falta namespace de JYS');
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

        // For avisos (not informe en cero)
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
        }

        // RFC format validation
        const rfcMatch = xmlString.match(/<clave_sujeto_obligado>([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})<\/clave_sujeto_obligado>/);
        if (xmlString.includes('<clave_sujeto_obligado>') && !rfcMatch) {
            warnings.push('Formato de RFC podría ser incorrecto');
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            summary: errors.length === 0
                ? (warnings.length > 0 ? `✅ Válido con ${warnings.length} advertencias` : '✅ XML válido')
                : `❌ ${errors.length} errores encontrados`
        };
    }
};

// Register with XMLEngine when available
if (typeof XMLEngine !== 'undefined') {
    XMLEngine.registerGenerator('juegos_sorteos', XMLGeneratorJYS);
}

// Export
if (typeof window !== 'undefined') {
    window.XMLGeneratorJYS = XMLGeneratorJYS;
}
