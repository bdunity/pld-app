import { useState, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Clock,
  CheckCircle,
  AlertOctagon,
} from 'lucide-react';

// Configuración de fechas límite por tipo de aviso
const DEADLINE_CONFIG = {
  INMUEBLES: { name: 'Avisos Inmuebles', day: 17 },
  VEHICULOS: { name: 'Avisos Vehículos', day: 17 },
  JOYAS: { name: 'Avisos Joyería', day: 17 },
  NOTARIOS: { name: 'Avisos Notariales', day: 17 },
  ARRENDAMIENTO: { name: 'Avisos Arrendamiento', day: 17 },
  TRASLADO_EFECTIVO: { name: 'Avisos Traslado Efectivo', day: 17 },
  JUEGOS_APUESTAS: { name: 'Avisos Juegos y Apuestas', day: 17 },
  SERVICIOS_PROFESIONALES: { name: 'Avisos Servicios Profesionales', day: 17 },
};

// Función para obtener el color según el día
const getDayColor = (day, deadlineDay = 17) => {
  if (day >= 1 && day <= 10) {
    return {
      bg: 'bg-green-100',
      text: 'text-green-700',
      border: 'border-green-300',
      label: 'Óptimo',
    };
  } else if (day >= 11 && day <= 15) {
    return {
      bg: 'bg-yellow-100',
      text: 'text-yellow-700',
      border: 'border-yellow-300',
      label: 'Advertencia',
    };
  } else if (day >= 16 && day <= deadlineDay) {
    return {
      bg: 'bg-red-100',
      text: 'text-red-700',
      border: 'border-red-300',
      label: 'Urgente',
    };
  } else {
    return {
      bg: 'bg-secondary-100',
      text: 'text-secondary-500',
      border: 'border-secondary-300',
      label: 'Extemporáneo',
    };
  }
};

// Función para calcular días restantes
const getDaysRemaining = (deadlineDay = 17) => {
  const now = new Date();
  const currentDay = now.getDate();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Si ya pasó el día 17, calcular para el próximo mes
  if (currentDay > deadlineDay) {
    const nextMonth = new Date(currentYear, currentMonth + 1, deadlineDay);
    const diffTime = nextMonth - now;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  return deadlineDay - currentDay;
};

export function ComplianceCalendar({ pendingReports = [] }) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];

  const daysInMonth = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    return new Date(year, month + 1, 0).getDate();
  }, [currentDate]);

  const firstDayOfMonth = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    return new Date(year, month, 1).getDay();
  }, [currentDate]);

  const today = new Date();
  const isCurrentMonth =
    today.getMonth() === currentDate.getMonth() &&
    today.getFullYear() === currentDate.getFullYear();

  const daysRemaining = getDaysRemaining(17);
  const todayStatus = getDayColor(today.getDate());

  const navigateMonth = (direction) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + direction);
    setCurrentDate(newDate);
  };

  // Generar días del calendario
  const calendarDays = useMemo(() => {
    const days = [];

    // Días vacíos al inicio
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(null);
    }

    // Días del mes
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }

    return days;
  }, [daysInMonth, firstDayOfMonth]);

  return (
    <div className="bg-white rounded-xl border border-secondary-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-primary-600" />
          <h3 className="text-lg font-semibold text-secondary-900">Agenda Fiscal</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateMonth(-1)}
            className="p-1 hover:bg-secondary-100 rounded"
          >
            <ChevronLeft className="w-5 h-5 text-secondary-600" />
          </button>
          <span className="text-sm font-medium text-secondary-700 min-w-[120px] text-center">
            {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
          </span>
          <button
            onClick={() => navigateMonth(1)}
            className="p-1 hover:bg-secondary-100 rounded"
          >
            <ChevronRight className="w-5 h-5 text-secondary-600" />
          </button>
        </div>
      </div>

      {/* Alert Banner */}
      {isCurrentMonth && (
        <div
          className={`mb-4 p-3 rounded-lg border ${
            daysRemaining <= 2
              ? 'bg-red-50 border-red-200'
              : daysRemaining <= 5
              ? 'bg-yellow-50 border-yellow-200'
              : 'bg-green-50 border-green-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {daysRemaining <= 2 ? (
              <AlertOctagon className="w-5 h-5 text-red-600" />
            ) : daysRemaining <= 5 ? (
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
            ) : (
              <Clock className="w-5 h-5 text-green-600" />
            )}
            <span
              className={`text-sm font-medium ${
                daysRemaining <= 2
                  ? 'text-red-800'
                  : daysRemaining <= 5
                  ? 'text-yellow-800'
                  : 'text-green-800'
              }`}
            >
              {daysRemaining === 0
                ? '¡Hoy es el último día para enviar avisos!'
                : daysRemaining < 0
                ? 'El plazo para enviar avisos ha vencido'
                : `Te quedan ${daysRemaining} día${daysRemaining !== 1 ? 's' : ''} para enviar avisos`}
            </span>
          </div>
        </div>
      )}

      {/* Day Names */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((day) => (
          <div
            key={day}
            className="text-center text-xs font-medium text-secondary-500 py-2"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day, index) => {
          if (day === null) {
            return <div key={index} className="aspect-square" />;
          }

          const isToday =
            isCurrentMonth && day === today.getDate();
          const isDeadline = day === 17;
          const dayColors = getDayColor(day);

          return (
            <div
              key={index}
              className={`
                aspect-square flex flex-col items-center justify-center rounded-lg text-sm
                transition-colors cursor-default
                ${isToday ? 'ring-2 ring-primary-500' : ''}
                ${isDeadline ? 'ring-2 ring-red-400' : ''}
                ${dayColors.bg}
              `}
            >
              <span className={`font-medium ${dayColors.text}`}>{day}</span>
              {isDeadline && (
                <span className="text-[10px] text-red-600 font-medium">Límite</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-4 border-t border-secondary-200">
        <p className="text-xs font-medium text-secondary-500 mb-2">Leyenda de fechas</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-green-400" />
            <span className="text-xs text-secondary-600">Día 1-10: Óptimo</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-yellow-400" />
            <span className="text-xs text-secondary-600">Día 11-15: Advertencia</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-red-400" />
            <span className="text-xs text-secondary-600">Día 16-17: Urgente</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-secondary-300" />
            <span className="text-xs text-secondary-600">Día 18+: Extemporáneo</span>
          </div>
        </div>
      </div>

      {/* Pending Reports */}
      {pendingReports.length > 0 && (
        <div className="mt-4 pt-4 border-t border-secondary-200">
          <p className="text-xs font-medium text-secondary-500 mb-2">Avisos pendientes este mes</p>
          <div className="space-y-2">
            {pendingReports.map((report, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2 bg-secondary-50 rounded-lg"
              >
                <span className="text-sm text-secondary-700">{report.type}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    report.status === 'pending'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-green-100 text-green-700'
                  }`}
                >
                  {report.status === 'pending' ? 'Pendiente' : 'Enviado'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="text-center p-2 bg-green-50 rounded-lg">
          <p className="text-lg font-bold text-green-700">{daysRemaining > 0 ? daysRemaining : 0}</p>
          <p className="text-xs text-green-600">Días restantes</p>
        </div>
        <div className="text-center p-2 bg-blue-50 rounded-lg">
          <p className="text-lg font-bold text-blue-700">17</p>
          <p className="text-xs text-blue-600">Día límite</p>
        </div>
        <div className="text-center p-2 bg-secondary-50 rounded-lg">
          <p className="text-lg font-bold text-secondary-700">{today.getDate()}</p>
          <p className="text-xs text-secondary-600">Hoy</p>
        </div>
      </div>
    </div>
  );
}

export default ComplianceCalendar;
