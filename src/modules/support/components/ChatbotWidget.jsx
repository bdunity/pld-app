/**
 * Chatbot Widget
 * Widget flotante de chat con IA para consultas PLD
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  MessageCircle,
  X,
  Send,
  Bot,
  User,
  Loader2,
  Sparkles,
  Minimize2,
  RefreshCw,
} from 'lucide-react';

export function ChatbotWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(true);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const functions = getFunctions();

  // Scroll al último mensaje
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Cargar sugerencias al abrir
  useEffect(() => {
    if (isOpen && suggestions.length === 0) {
      loadSuggestions();
    }
  }, [isOpen, suggestions.length]);

  // Focus en input al abrir
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isMinimized]);

  // Cargar sugerencias de preguntas
  const loadSuggestions = async () => {
    try {
      const getChatSuggestions = httpsCallable(functions, 'getChatSuggestions');
      const result = await getChatSuggestions();
      setSuggestions(result.data.suggestions || []);
    } catch (error) {
      console.error('Error loading suggestions:', error);
      // Fallback suggestions
      setSuggestions([
        '¿Cuáles son los umbrales de aviso?',
        '¿Cuándo debo presentar un Aviso?',
        '¿Qué es una Actividad Vulnerable?',
      ]);
    }
  };

  // Enviar mensaje
  const sendMessage = async (messageText = inputValue) => {
    if (!messageText.trim() || isLoading) return;

    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: messageText.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setShowSuggestions(false);

    try {
      const chatWithGemini = httpsCallable(functions, 'chatWithGemini');
      const result = await chatWithGemini({
        message: messageText.trim(),
        history: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });

      const botMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: result.data.response,
        timestamp: result.data.timestamp,
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error('Chat error:', error);

      const errorMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: 'Lo siento, hubo un error al procesar tu mensaje. Por favor intenta de nuevo.',
        timestamp: new Date().toISOString(),
        isError: true,
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Manejar tecla Enter
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Limpiar conversación
  const clearChat = () => {
    setMessages([]);
    setShowSuggestions(true);
  };

  // Formatear mensaje con markdown básico
  const formatMessage = (content) => {
    // Convertir listas con viñetas
    let formatted = content.replace(/^[•\-\*]\s/gm, '• ');

    // Convertir **texto** a bold
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Convertir saltos de línea
    formatted = formatted.replace(/\n/g, '<br/>');

    return formatted;
  };

  // Mensaje de bienvenida
  const welcomeMessage = {
    id: 'welcome',
    role: 'assistant',
    content: '¡Hola! Soy **Antigravity Bot**, tu asistente experto en la Ley Antilavado (LFPIORPI). Puedo ayudarte con:\n\n• Umbrales de Aviso\n• Actividades Vulnerables\n• Plazos y obligaciones\n• Mejores prácticas de cumplimiento\n\n¿En qué puedo ayudarte hoy?',
    timestamp: new Date().toISOString(),
  };

  const displayMessages = messages.length > 0 ? messages : [welcomeMessage];

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-110 flex items-center justify-center z-50 group"
        aria-label="Abrir chat de ayuda"
      >
        <MessageCircle className="w-6 h-6" />
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-success rounded-full flex items-center justify-center">
          <Sparkles className="w-3 h-3 text-white" />
        </span>

        {/* Tooltip */}
        <span className="absolute right-full mr-3 px-3 py-1.5 bg-secondary-900 text-white text-sm rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
          ¿Dudas sobre PLD?
        </span>
      </button>
    );
  }

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 transition-all duration-300 ${
        isMinimized ? 'w-72' : 'w-96'
      }`}
    >
      <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-secondary-200 flex flex-col max-h-[600px]">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold">Antigravity Bot</h3>
              <p className="text-xs text-primary-100">Asistente PLD</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={clearChat}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              title="Nueva conversación"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              title={isMinimized ? 'Expandir' : 'Minimizar'}
            >
              <Minimize2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              title="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!isMinimized && (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px] max-h-[400px] bg-secondary-50">
              {displayMessages.map((message) => (
                <div
                  key={message.id}
                  className={`flex items-start gap-2 ${
                    message.role === 'user' ? 'flex-row-reverse' : ''
                  }`}
                >
                  {/* Avatar */}
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      message.role === 'user'
                        ? 'bg-primary-100'
                        : message.isError
                        ? 'bg-error/10'
                        : 'bg-success/10'
                    }`}
                  >
                    {message.role === 'user' ? (
                      <User className="w-4 h-4 text-primary-600" />
                    ) : (
                      <Bot
                        className={`w-4 h-4 ${
                          message.isError ? 'text-error' : 'text-success'
                        }`}
                      />
                    )}
                  </div>

                  {/* Message bubble */}
                  <div
                    className={`max-w-[80%] px-4 py-2.5 rounded-2xl ${
                      message.role === 'user'
                        ? 'bg-primary-600 text-white rounded-br-sm'
                        : message.isError
                        ? 'bg-error/10 text-error rounded-bl-sm'
                        : 'bg-white text-secondary-700 shadow-sm rounded-bl-sm'
                    }`}
                  >
                    <div
                      className="text-sm leading-relaxed"
                      dangerouslySetInnerHTML={{
                        __html: formatMessage(message.content),
                      }}
                    />
                  </div>
                </div>
              ))}

              {/* Loading indicator */}
              {isLoading && (
                <div className="flex items-start gap-2">
                  <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-success" />
                  </div>
                  <div className="bg-white shadow-sm px-4 py-3 rounded-2xl rounded-bl-sm">
                    <div className="flex items-center gap-2 text-secondary-500">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Escribiendo...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Suggestions */}
            {showSuggestions && suggestions.length > 0 && messages.length === 0 && (
              <div className="px-4 pb-2">
                <p className="text-xs text-secondary-500 mb-2">Preguntas frecuentes:</p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.slice(0, 3).map((suggestion, idx) => (
                    <button
                      key={idx}
                      onClick={() => sendMessage(suggestion)}
                      className="text-xs px-3 py-1.5 bg-primary-50 text-primary-700 rounded-full hover:bg-primary-100 transition-colors truncate max-w-full"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <div className="p-4 border-t border-secondary-200 bg-white">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Escribe tu pregunta..."
                  className="flex-1 resize-none border border-secondary-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent max-h-24"
                  rows={1}
                  disabled={isLoading}
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={!inputValue.trim() || isLoading}
                  className="w-10 h-10 bg-primary-600 text-white rounded-xl flex items-center justify-center hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-secondary-400 mt-2 text-center">
                Powered by Google Gemini
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ChatbotWidget;
