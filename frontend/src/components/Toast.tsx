import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col space-y-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastMessage; onDismiss: () => void }> = ({ toast, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss();
    }, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const isSuccess = toast.type === 'success';
  const isError = toast.type === 'error';

  return (
    <div
      className={`pointer-events-auto p-4 rounded-xl border shadow-lg flex items-start space-x-3 transition-all transform duration-200 translate-y-0 ${
        isSuccess
          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
          : isError
          ? 'bg-rose-50 border-rose-200 text-rose-900'
          : 'bg-blue-50 border-blue-200 text-blue-900'
      }`}
    >
      <div className="flex-shrink-0 mt-0.5">
        {isSuccess && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
        {isError && <AlertCircle className="w-5 h-5 text-rose-600" />}
        {!isSuccess && !isError && <Info className="w-5 h-5 text-blue-600" />}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-xs font-bold leading-tight">{toast.title}</h4>
        <p className="text-[11px] mt-0.5 opacity-90 leading-normal">{toast.message}</p>
      </div>
      <button
        onClick={onDismiss}
        className="flex-shrink-0 text-slate-400 hover:text-slate-700 p-0.5 rounded transition"
        title="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

