import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../core/config/firebase';
import { useAuth } from '../../../core/context/AuthContext';
import {
  Users,
  Search,
  FolderOpen,
  Building2,
  User,
  ChevronRight,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { Input, Alert } from '../../../shared/components';
import { ClientDetailModal } from './ClientDetailModal';

export function ClientFileView() {
  const { user } = useAuth();
  const [clients, setClients] = useState([]);
  const [filteredClients, setFilteredClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);

  // Cargar clientes únicos desde operaciones
  useEffect(() => {
    const loadClients = async () => {
      if (!user?.uid) return;

      try {
        setLoading(true);

        // Obtener operaciones del tenant
        const operationsQuery = query(
          collection(db, 'operations'),
          where('tenantId', '==', user.uid)
        );

        const operationsSnapshot = await getDocs(operationsQuery);

        // Agrupar por RFC único
        const clientsMap = new Map();

        operationsSnapshot.docs.forEach((doc) => {
          const data = doc.data();
          const clientRfc = data.clienteRfc || data.rfc;

          if (clientRfc && !clientsMap.has(clientRfc)) {
            clientsMap.set(clientRfc, {
              rfc: clientRfc,
              nombre: data.clienteNombre || data.nombre || data.razonSocial || 'Sin nombre',
              tipo: clientRfc.length === 13 ? 'FISICA' : 'MORAL',
              operationsCount: 1,
              lastOperation: data.fechaOperacion || data.createdAt,
            });
          } else if (clientRfc) {
            const existing = clientsMap.get(clientRfc);
            existing.operationsCount++;
            if (data.fechaOperacion > existing.lastOperation) {
              existing.lastOperation = data.fechaOperacion;
            }
          }
        });

        // Convertir a array y ordenar
        const clientsList = Array.from(clientsMap.values()).sort((a, b) =>
          a.nombre.localeCompare(b.nombre)
        );

        setClients(clientsList);
        setFilteredClients(clientsList);
        setLoading(false);
      } catch (err) {
        console.error('Error loading clients:', err);
        setError('Error al cargar los clientes');
        setLoading(false);
      }
    };

    loadClients();
  }, [user?.uid]);

  // Filtrar clientes por búsqueda
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredClients(clients);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = clients.filter(
      (client) =>
        client.rfc.toLowerCase().includes(term) ||
        client.nombre.toLowerCase().includes(term)
    );
    setFilteredClients(filtered);
  }, [searchTerm, clients]);

  // Formatear fecha
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {error && (
        <Alert variant="error" className="mb-4" onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Search bar */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
          <Input
            type="text"
            placeholder="Buscar por RFC o nombre..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-secondary-50 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-secondary-900">{clients.length}</p>
              <p className="text-sm text-secondary-500">Total Clientes</p>
            </div>
          </div>
        </div>

        <div className="bg-secondary-50 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-info/10 rounded-lg flex items-center justify-center">
              <User className="w-5 h-5 text-info" />
            </div>
            <div>
              <p className="text-2xl font-bold text-secondary-900">
                {clients.filter(c => c.tipo === 'FISICA').length}
              </p>
              <p className="text-sm text-secondary-500">Personas Físicas</p>
            </div>
          </div>
        </div>

        <div className="bg-secondary-50 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-success/10 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-secondary-900">
                {clients.filter(c => c.tipo === 'MORAL').length}
              </p>
              <p className="text-sm text-secondary-500">Personas Morales</p>
            </div>
          </div>
        </div>
      </div>

      {/* Clients list */}
      {filteredClients.length === 0 ? (
        <div className="text-center py-12 bg-secondary-50 rounded-lg">
          {clients.length === 0 ? (
            <>
              <Users className="w-12 h-12 text-secondary-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-secondary-900 mb-1">
                Sin clientes registrados
              </h3>
              <p className="text-secondary-500">
                Los clientes aparecerán aquí cuando cargues operaciones
              </p>
            </>
          ) : (
            <>
              <Search className="w-12 h-12 text-secondary-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-secondary-900 mb-1">
                Sin resultados
              </h3>
              <p className="text-secondary-500">
                No se encontraron clientes con "{searchTerm}"
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredClients.map((client) => (
            <button
              key={client.rfc}
              onClick={() => setSelectedClient(client)}
              className="w-full flex items-center gap-4 p-4 bg-white border border-secondary-200 rounded-lg hover:border-primary-300 hover:bg-primary-50/30 transition-all group"
            >
              {/* Avatar */}
              <div className={`
                w-12 h-12 rounded-full flex items-center justify-center
                ${client.tipo === 'FISICA' ? 'bg-info/10' : 'bg-success/10'}
              `}>
                {client.tipo === 'FISICA' ? (
                  <User className={`w-6 h-6 text-info`} />
                ) : (
                  <Building2 className={`w-6 h-6 text-success`} />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 text-left">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-secondary-900 group-hover:text-primary-700">
                    {client.nombre}
                  </h4>
                  <span className={`
                    text-xs px-2 py-0.5 rounded-full
                    ${client.tipo === 'FISICA'
                      ? 'bg-info/10 text-info'
                      : 'bg-success/10 text-success'
                    }
                  `}>
                    {client.tipo === 'FISICA' ? 'Física' : 'Moral'}
                  </span>
                </div>
                <p className="text-sm text-secondary-500 font-mono">{client.rfc}</p>
              </div>

              {/* Stats */}
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-secondary-900">
                  {client.operationsCount} operación(es)
                </p>
                <p className="text-xs text-secondary-500">
                  Última: {formatDate(client.lastOperation)}
                </p>
              </div>

              {/* Arrow */}
              <div className="flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-secondary-400 group-hover:text-primary-600" />
                <ChevronRight className="w-5 h-5 text-secondary-300 group-hover:text-primary-600" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Client Detail Modal */}
      {selectedClient && (
        <ClientDetailModal
          client={selectedClient}
          onClose={() => setSelectedClient(null)}
        />
      )}
    </div>
  );
}

export default ClientFileView;
