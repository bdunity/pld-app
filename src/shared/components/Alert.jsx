import { clsx } from 'clsx';
import { AlertCircle, CheckCircle, Info, XCircle, X } from 'lucide-react';

const variants = {
  info: {
    bg: 'bg-blue-50 border-blue-200',
    text: 'text-blue-800',
    icon: Info,
  },
  success: {
    bg: 'bg-green-50 border-green-200',
    text: 'text-green-800',
    icon: CheckCircle,
  },
  warning: {
    bg: 'bg-yellow-50 border-yellow-200',
    text: 'text-yellow-800',
    icon: AlertCircle,
  },
  error: {
    bg: 'bg-red-50 border-red-200',
    text: 'text-red-800',
    icon: XCircle,
  },
};

export function Alert({
  variant = 'info',
  title,
  children,
  onClose,
  className,
}) {
  const config = variants[variant];
  const Icon = config.icon;

  return (
    <div
      className={clsx(
        'flex items-start gap-3 p-4 rounded-lg border',
        config.bg,
        className
      )}
    >
      <Icon className={clsx('w-5 h-5 flex-shrink-0 mt-0.5', config.text)} />
      <div className="flex-1">
        {title && (
          <h4 className={clsx('font-medium mb-1', config.text)}>{title}</h4>
        )}
        <div className={clsx('text-sm', config.text)}>{children}</div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className={clsx(
            'p-1 rounded-lg hover:bg-white/50 transition-colors',
            config.text
          )}
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export default Alert;
