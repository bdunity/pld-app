import { forwardRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const Input = forwardRef(({
  label,
  error,
  helperText,
  className,
  type = 'text',
  ...props
}, ref) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-secondary-700 mb-1">
          {label}
        </label>
      )}
      <input
        ref={ref}
        type={type}
        className={twMerge(
          clsx(
            'w-full px-4 py-2 rounded-lg border transition-all duration-200',
            'bg-white text-secondary-900 placeholder-secondary-400',
            'focus:outline-none focus:ring-2 focus:ring-offset-0',
            error
              ? 'border-error focus:ring-error/30 focus:border-error'
              : 'border-secondary-300 focus:ring-primary-500/30 focus:border-primary-500',
            'disabled:bg-secondary-100 disabled:cursor-not-allowed',
            className
          )
        )}
        {...props}
      />
      {(error || helperText) && (
        <p className={clsx(
          'mt-1 text-sm',
          error ? 'text-error' : 'text-secondary-500'
        )}>
          {error || helperText}
        </p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

export default Input;
