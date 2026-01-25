/**
 * PLD BDU - Services Controller
 * 
 * Handles the UI and logic for Premium Services (Upsells)
 * Bridges the gap between frontend buttons and backend Cloud Functions.
 */

const ServicesController = {

    /**
     * Initialize the controller
     */
    init() {
        console.log('ServicesController initialized');
        // Check if we need to render services in specific containers
        this.renderUpsell('premiumServicesContainer');
    },

    /**
     * Render the services upsell cards into a container
     */
    renderUpsell(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return; // Container might not exist in all views

        if (typeof PREMIUM_SERVICES_CONFIG === 'undefined') {
            console.error('PREMIUM_SERVICES_CONFIG not loaded');
            return;
        }

        const services = Object.values(PREMIUM_SERVICES_CONFIG);

        container.innerHTML = services.map(service => this.createServiceCard(service)).join('');

        // Attach event listeners for buttons
        services.forEach(service => {
            const btn = document.getElementById(`btn-quote-${service.id}`);
            if (btn) {
                btn.addEventListener('click', () => this.openRequestModal(service.id));
            }
        });
    },

    /**
     * Create HTML for a service card
     */
    createServiceCard(service) {
        // Determine status based on compliance check (mocked for now or read from user profile)
        return `
            <div class="card service-card" style="border-top: 4px solid ${service.badgeColor === 'red' ? 'var(--color-danger)' : 'var(--color-success)'}">
                <div class="service-header">
                    <div class="service-icon" style="background: ${service.iconColor}20; color: ${service.iconColor}; padding: 12px; border-radius: 50%; width: fit-content; margin-bottom: 12px;">
                        <!-- Icon placeholder -->
                        <span style="font-size: 1.5em">⭐</span>
                    </div>
                    ${service.badge ? `<span class="badge badge-${service.badgeColor}">${service.badge}</span>` : ''}
                </div>
                <h3>${service.headline}</h3>
                <p class="text-muted">${service.subheadline}</p>
                
                <ul class="service-features" style="margin: 16px 0; list-style: none; padding: 0;">
                    ${service.features.map(f => `<li style="margin-bottom: 8px;">✓ ${f.text}</li>`).join('')}
                </ul>

                <button id="btn-quote-${service.id}" class="btn btn-primary w-full">
                    ${service.cta.primary.text}
                </button>
            </div>
        `;
    },

    /**
     * Open the request modal for a specific user
     */
    async openRequestModal(serviceId) {
        const service = PREMIUM_SERVICES_CONFIG[serviceId];
        if (!service) return;

        // Populate modal
        const modal = document.getElementById('serviceRequestModal');
        if (!modal) {
            console.error('Modal element not found: serviceRequestModal');
            return;
        }

        document.getElementById('modalServiceId').value = serviceId;
        document.getElementById('modalTitle').textContent = service.requestForm.title;

        // Render form fields dynamically
        const formContainer = document.getElementById('modalFormFields');
        formContainer.innerHTML = service.requestForm.fields.map(field => this.renderField(field)).join('');

        // Show modal
        modal.classList.remove('hidden');
        modal.style.display = 'flex'; // Ensure flex for centering
    },

    /**
     * Render a single form field
     */
    renderField(field) {
        if (field.type === 'select') {
            const options = Array.isArray(field.options) ? field.options : []; // Handle dynamic later
            return `
                <div class="form-group">
                    <label class="form-label">${field.label}</label>
                    <select id="field-${field.id}" name="${field.id}" class="form-select" ${field.required ? 'required' : ''}>
                        <option value="">Seleccionar...</option>
                        ${options.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}
                    </select>
                </div>
            `;
        }

        if (field.type === 'textarea') {
            return `
                <div class="form-group">
                    <label class="form-label">${field.label}</label>
                    <textarea id="field-${field.id}" name="${field.id}" class="form-input" rows="${field.rows || 3}"></textarea>
                </div>
            `;
        }

        return `
            <div class="form-group">
                <label class="form-label">${field.label}</label>
                <input type="${field.type}" id="field-${field.id}" name="${field.id}" class="form-input" 
                    placeholder="${field.placeholder || ''}" ${field.readonly ? 'readonly' : ''} 
                    ${field.required ? 'required' : ''}>
            </div>
        `;
    },

    /**
     * Close the request modal
     */
    closeModal() {
        const modal = document.getElementById('serviceRequestModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none';
        }
    },

    /**
     * Submit the service request to the backend
     */
    async submitRequest(event) {
        event.preventDefault();

        const submitBtn = event.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Enviando...';

        try {
            const serviceId = document.getElementById('modalServiceId').value;
            const service = PREMIUM_SERVICES_CONFIG[serviceId];

            // Gather form data
            const formData = {};
            service.requestForm.fields.forEach(field => {
                const el = document.getElementById(`field-${field.id}`);
                if (el) formData[field.id] = el.value;
            });

            console.log('Sending request for:', serviceId, formData);

            // CALL BACKEND FUNCTION
            const submitServiceRequest = firebase.functions().httpsCallable('submitServiceRequest');
            const result = await submitServiceRequest({
                serviceId: serviceId,
                formData: formData
            });

            console.log('Backend response:', result.data);

            if (result.data.success) {
                this.closeModal();
                // Show success message (using global showToast if available)
                if (typeof showToast === 'function') {
                    showToast('✅ Solicitud enviada exitosamente. Un asesor te contactará pronto.', 'success');
                } else {
                    alert('Solicitud enviada exitosamente.');
                }
            } else {
                throw new Error(result.data.message || 'Error desconocido');
            }

        } catch (error) {
            console.error('Error submitting request:', error);
            if (typeof showToast === 'function') {
                showToast('❌ Error: ' + error.message, 'danger');
            } else {
                alert('Error: ' + error.message);
            }
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    }
};

// Expose globally
window.ServicesController = ServicesController;
