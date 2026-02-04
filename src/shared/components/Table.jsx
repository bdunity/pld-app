import { clsx } from 'clsx';

export function Table({ children, className }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-secondary-200">
      <table className={clsx('w-full divide-y divide-secondary-200', className)}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ children, className }) {
  return (
    <thead className={clsx('bg-secondary-50', className)}>
      {children}
    </thead>
  );
}

export function TableBody({ children, className }) {
  return (
    <tbody className={clsx('divide-y divide-secondary-200 bg-white', className)}>
      {children}
    </tbody>
  );
}

export function TableRow({ children, className, onClick, hoverable = true }) {
  return (
    <tr
      className={clsx(
        hoverable && 'hover:bg-secondary-50 transition-colors',
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export function TableHead({ children, className }) {
  return (
    <th
      className={clsx(
        'px-4 py-3 text-left text-xs font-semibold text-secondary-600 uppercase tracking-wider',
        className
      )}
    >
      {children}
    </th>
  );
}

export function TableCell({ children, className }) {
  return (
    <td className={clsx('px-4 py-3 text-sm text-secondary-700', className)}>
      {children}
    </td>
  );
}

export default Table;
