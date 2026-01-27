/**
 * Graph Service for PLD BDU v2
 * Visualizes relationships between entities using Vis.js
 */

const GraphService = {
    network: null,
    colors: {
        node: '#00AEEF',      // Cyan
        nodeHighRisk: '#ef4444', // Red
        edge: '#718096',      // Gray
        highlight: '#f59e0b'  // Orange
    },

    /**
     * Initialize and Render the Graph
     */
    init(containerId) {
        console.log('Initializing GraphService...');
        const container = document.getElementById(containerId);
        if (!container) return;

        // 1. Get Data
        const kycData = DBService.getCollection('kyc') || [];
        const operations = DBService.getCollection('operations') || [];

        // 2. Build Nodes and Edges
        const data = this.buildGraphData(kycData, operations);

        // 3. Configuration
        const options = {
            nodes: {
                shape: 'dot',
                size: 20,
                font: {
                    size: 14,
                    color: '#ffffff',
                    strokeWidth: 0
                },
                borderWidth: 2,
                shadow: true
            },
            edges: {
                width: 1,
                color: { color: this.colors.edge, highlight: this.colors.highlight },
                smooth: { type: 'continuous' }
            },
            physics: {
                stabilization: false,
                barnesHut: {
                    gravitationalConstant: -80000,
                    springConstant: 0.001,
                    springLength: 200
                }
            },
            interaction: {
                tooltipDelay: 200,
                hideEdgesOnDrag: true
            }
        };

        // 4. Create Network
        this.network = new vis.Network(container, data, options);

        // 5. Events
        this.network.on("click", (params) => {
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                console.log('Clicked node:', nodeId);
                // Future: Show details panel
            }
        });
    },

    /**
     * Transform database data into Vis.js format (nodes/edges)
     * Detects links based on: Shared Address, Shared Phone, Shared RFC (if multiple entries)
     */
    buildGraphData(users, ops) {
        const nodes = new vis.DataSet();
        const edges = new vis.DataSet();

        const addedNodes = new Set();

        // Attribute Maps for linking
        const addressMap = {};
        const phoneMap = {};

        // 1. Add User Nodes
        users.forEach(user => {
            const id = user.id || user.rfc;
            if (!addedNodes.has(id)) {

                // Determine Risk Color
                let color = this.colors.node;
                if (user.nivelRiesgo === 'Alto' || user.pep) {
                    color = this.colors.nodeHighRisk;
                }

                nodes.add({
                    id: id,
                    label: user.nombre || user.rfc,
                    color: { background: color, border: '#ffffff' },
                    title: `Check Details: ${user.rfc}` // Tooltip
                });
                addedNodes.add(id);

                // Map attributes for linking
                const cleanAddr = (user.domicilio || '').trim().toLowerCase();
                if (cleanAddr && cleanAddr.length > 5) {
                    if (!addressMap[cleanAddr]) addressMap[cleanAddr] = [];
                    addressMap[cleanAddr].push(id);
                }

                const cleanPhone = (user.telefono || '').trim().replace(/\D/g, '');
                if (cleanPhone && cleanPhone.length >= 10) {
                    if (!phoneMap[cleanPhone]) phoneMap[cleanPhone] = [];
                    phoneMap[cleanPhone].push(id);
                }
            }
        });

        // 2. Create Attribute Links (Structuring Detection)

        // Link by Address
        Object.keys(addressMap).forEach(addr => {
            const ids = addressMap[addr];
            if (ids.length > 1) {
                // Create a "hub" node for the address? Or just connect them?
                // Connecting everyone to everyone is messy. Let's create a Hub Node.
                const addressNodeId = `ADDR_${addr.substring(0, 10)}`;
                nodes.add({
                    id: addressNodeId,
                    label: '🏠 Mismo Domicilio',
                    shape: 'diamond',
                    size: 10,
                    color: '#fbbf24' // Amber
                });

                ids.forEach(userId => {
                    edges.add({ from: userId, to: addressNodeId });
                });
            }
        });

        // Link by Phone
        Object.keys(phoneMap).forEach(phone => {
            const ids = phoneMap[phone];
            if (ids.length > 1) {
                const phoneNodeId = `PHONE_${phone}`;
                nodes.add({
                    id: phoneNodeId,
                    label: '📱 Mismo Teléfono',
                    shape: 'triangle',
                    size: 10,
                    color: '#a78bfa' // Purple
                });

                ids.forEach(userId => {
                    edges.add({ from: userId, to: phoneNodeId });
                });
            }
        });

        return { nodes, edges };
    }
};
