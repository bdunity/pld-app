/**
 * Ticket System
 * Sistema de tickets de soporte técnico
 */

import { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Ticket,
  Plus,
  Clock,
  CheckCircle,
  AlertCircle,
  MessageSquare,
  ChevronRight,
  X,
  Send,
  Loader2,
  RefreshCw,
  ArrowLeft,
} from 'lucide-react';
import { Button, Input, Alert, Card } from '../../../shared/components';

// Schema de validación
const ticketSchema = z.object({
  subject: z.string().min(5, 'El asunto debe tener al menos 5 caracteres').max(100),
  category: z.enum(['TECHNICAL', 'LEGAL', 'BILLING', 'GENERAL'], {
    required_error: 'Selecciona una categoría',
  }),
  message: z.string().min(10, 'El mensaje debe tener al menos 10 caracteres').max(2000),
});

// Configuración de categorías
const CATEGORIES = [
  { id: 'TECHNICAL', name: 'Técnico', description: 'Problemas con la plataforma' },
  { id: 'LEGAL', name: 'Legal/Cumplimiento', description: 'Dudas sobre normativa PLD' },
  { id: 'BILLING', name: 'Facturación', description: 'Pagos y suscripción' },
  { id: 'GENERAL', name: 'General', description: 'Otras consultas' },
];

// Configuración de estados
const STATUS_CONFIG = {
  open: {
    label: 'Abierto',
    color: 'text-info',
    bg: 'bg-info/10',
    icon: AlertCircle,
  },
  in_progress: {
    label: 'En Proceso',
    color: 'text-warning',
    bg: 'bg-warning/10',
    icon: Clock,
  },
  waiting_user: {
    label: 'Esperando Respuesta',
    color: 'text-primary-600',
    bg: 'bg-primary-50',
    icon: MessageSquare,
  },
  closed: {
    label: 'Cerrado',
    color: 'text-success',
    bg: 'bg-success/10',
    icon: CheckCircle,
  },
};

export function TicketSystem() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  const functions = getFunctions();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(ticketSchema),
  });

  // Cargar tickets
  const loadTickets = async () => {
    try {
      setLoading(true);
      const getMyTickets = httpsCallable(functions, 'getMyTickets');
      const result = await getMyTickets({ limit: 20 });
      setTickets(result.data.tickets || []);
    } catch (err) {
      console.error('Error loading tickets:', err);
      setError('Error al cargar los tickets');
    } finally {
      setLoading(false);
    }
  };

  // Cargar detalle de ticket
  const loadTicketDetail = async (ticketId) => {
    try {
      const getTicketDetail = httpsCallable(functions, 'getTicketDetail');
      const result = await getTicketDetail({ ticketId });
      setSelectedTicket(result.data.ticket);
    } catch (err) {
      console.error('Error loading ticket detail:', err);
      setError('Error al cargar el ticket');
    }
  };

  useEffect(() => {
    loadTickets();
  }, []);

  // Crear ticket
  const onSubmit = async (data) => {
    setSubmitting(true);
    setError('');

    try {
      const createTicket = httpsCallable(functions, 'createTicket');
      const result = await createTicket(data);

      setSuccess(`Ticket ${result.data.ticketNumber} creado exitosamente`);
      setShowForm(false);
      reset();
      loadTickets();
    } catch (err) {
      console.error('Error creating ticket:', err);
      setError(err.message || 'Error al crear el ticket');
    } finally {
      setSubmitting(false);
    }
  };

  // Enviar mensaje
  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedTicket) return;

    setSendingMessage(true);
    try {
      const addTicketMessage = httpsCallable(functions, 'addTicketMessage');
      await addTicketMessage({
        ticketId: selectedTicket.id,
        message: newMessage.trim(),
      });

      setNewMessage('');
      loadTicketDetail(selectedTicket.id);
    } catch (err) {
      console.error('Error sending message:', err);
      setError('Error al enviar el mensaje');
    } finally {
      setSendingMessage(false);
    }
  };

  // Cerrar ticket
  const handleCloseTicket = async () => {
    if (!selectedTicket) return;

    try {
      const closeTicket = httpsCallable(functions, 'closeTicket');
      await closeTicket({ ticketId: selectedTicket.id });

      setSuccess('Ticket cerrado exitosamente');
      setSelectedTicket(null);
      loadTickets();
    } catch (err) {
      console.error('Error closing ticket:', err);
      setError('Error al cerrar el ticket');
    }
  };

  // Formatear fecha
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Vista de detalle de ticket
  if (selectedTicket) {
    const statusConfig = STATUS_CONFIG[selectedTicket.status] || STATUS_CONFIG.open;
    const StatusIcon = statusConfig.icon;

    return (
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => setSelectedTicket(null)}
            className="p-2 hover:bg-secondary-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-secondary-600" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-secondary-900">
                {selectedTicket.ticketNumber}
              </h2>
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${statusConfig.bg}`}>
                <StatusIcon className={`w-4 h-4 ${statusConfig.color}`} />
                <span className={`text-xs font-medium ${statusConfig.color}`}>
                  {statusConfig.label}
                </span>
              </div>
            </div>
            <p className="text-secondary-600">{selectedTicket.subject}</p>
          </div>

          {selectedTicket.status !== 'closed' && (
            <Button variant="secondary" onClick={handleCloseTicket}>
              Marcar como Resuelto
            </Button>
          )}
        </div>

        {error && (
          <Alert variant="error" className="mb-4" onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {/* Messages */}
        <Card className="mb-4">
          <div className="p-4 border-b border-secondary-200">
            <div className="flex items-center justify-between">
              <span className="text-sm text-secondary-500">
                Categoría: <span className="font-medium text-secondary-700">{selectedTicket.categoryLabel}</span>
              </span>
              <span className="text-sm text-secondary-500">
                Creado: {formatDate(selectedTicket.createdAt)}
              </span>
            </div>
          </div>

          <div className="p-4 max-h-[400px] overflow-y-auto space-y-4">
            {selectedTicket.messages?.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] px-4 py-3 rounded-2xl ${
                    msg.sender === 'user'
                      ? 'bg-primary-600 text-white rounded-br-sm'
                      : 'bg-secondary-100 text-secondary-700 rounded-bl-sm'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  <p className={`text-xs mt-1 ${
                    msg.sender === 'user' ? 'text-primary-200' : 'text-secondary-400'
                  }`}>
                    {formatDate(msg.timestamp)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Input para nuevo mensaje */}
          {selectedTicket.status !== 'closed' && (
            <div className="p-4 border-t border-secondary-200">
              <div className="flex items-end gap-2">
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Escribe tu mensaje..."
                  className="flex-1 resize-none border border-secondary-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  rows={2}
                  disabled={sendingMessage}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim() || sendingMessage}
                  className="flex items-center gap-2"
                >
                  {sendingMessage ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    );
  }

  // Vista de formulario nuevo ticket
  if (showForm) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => setShowForm(false)}
            className="p-2 hover:bg-secondary-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-secondary-600" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-secondary-900">Nuevo Ticket</h2>
            <p className="text-secondary-600">Describe tu problema o consulta</p>
          </div>
        </div>

        {error && (
          <Alert variant="error" className="mb-4" onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        <Card className="p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Asunto */}
            <Input
              label="Asunto"
              placeholder="Describe brevemente tu problema"
              error={errors.subject?.message}
              {...register('subject')}
            />

            {/* Categoría */}
            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-2">
                Categoría
              </label>
              <div className="grid grid-cols-2 gap-3">
                {CATEGORIES.map((cat) => (
                  <label
                    key={cat.id}
                    className="relative flex cursor-pointer rounded-lg border bg-white p-4 shadow-sm focus:outline-none hover:border-primary-300 transition-colors"
                  >
                    <input
                      type="radio"
                      value={cat.id}
                      className="sr-only"
                      {...register('category')}
                    />
                    <span className="flex flex-1">
                      <span className="flex flex-col">
                        <span className="block text-sm font-medium text-secondary-900">
                          {cat.name}
                        </span>
                        <span className="mt-1 flex items-center text-xs text-secondary-500">
                          {cat.description}
                        </span>
                      </span>
                    </span>
                    <CheckCircle className="h-5 w-5 text-primary-600 opacity-0 peer-checked:opacity-100" />
                  </label>
                ))}
              </div>
              {errors.category && (
                <p className="mt-1 text-sm text-error">{errors.category.message}</p>
              )}
            </div>

            {/* Mensaje */}
            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-2">
                Mensaje
              </label>
              <textarea
                placeholder="Describe tu problema con el mayor detalle posible..."
                className="w-full border border-secondary-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                rows={6}
                {...register('message')}
              />
              {errors.message && (
                <p className="mt-1 text-sm text-error">{errors.message.message}</p>
              )}
            </div>

            {/* Botones */}
            <div className="flex items-center justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Enviando...
                  </>
                ) : (
                  'Crear Ticket'
                )}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    );
  }

  // Vista de lista de tickets
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-secondary-900">Mis Tickets</h2>
          <p className="text-secondary-600">Gestiona tus solicitudes de soporte</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={loadTickets} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Ticket
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="error" className="mb-4" onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert variant="success" className="mb-4" onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      {/* Lista de tickets */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
        </div>
      ) : tickets.length === 0 ? (
        <Card className="p-12 text-center">
          <Ticket className="w-12 h-12 text-secondary-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-secondary-900 mb-2">
            No tienes tickets
          </h3>
          <p className="text-secondary-500 mb-6">
            Crea un ticket si necesitas ayuda con la plataforma
          </p>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Crear Ticket
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => {
            const statusConfig = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
            const StatusIcon = statusConfig.icon;

            return (
              <Card
                key={ticket.id}
                className="p-4 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => loadTicketDetail(ticket.id)}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${statusConfig.bg}`}>
                    <StatusIcon className={`w-5 h-5 ${statusConfig.color}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-secondary-500">
                        {ticket.ticketNumber}
                      </span>
                      <span className="text-xs text-secondary-400">•</span>
                      <span className="text-xs text-secondary-500">
                        {ticket.categoryLabel}
                      </span>
                    </div>
                    <h4 className="font-medium text-secondary-900 truncate">
                      {ticket.subject}
                    </h4>
                    <p className="text-sm text-secondary-500">
                      {formatDate(ticket.createdAt)}
                      {ticket.messageCount > 1 && (
                        <span className="ml-2">
                          • {ticket.messageCount} mensajes
                        </span>
                      )}
                    </p>
                  </div>

                  <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full ${statusConfig.bg}`}>
                    <span className={`text-xs font-medium ${statusConfig.color}`}>
                      {statusConfig.label}
                    </span>
                  </div>

                  <ChevronRight className="w-5 h-5 text-secondary-400" />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default TicketSystem;
