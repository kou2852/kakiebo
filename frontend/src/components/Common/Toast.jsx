import { useState, useCallback, useEffect, createContext, useContext } from 'react';

const ToastContext = createContext(null);

let showToastGlobal = () => {};

export function useToast() {
  return useCallback((msg) => showToastGlobal(msg), []);
}

export default function Toast() {
  const [message, setMessage] = useState(null);

  useEffect(() => {
    showToastGlobal = (msg) => {
      setMessage(msg);
      setTimeout(() => setMessage(null), 2400);
    };
  }, []);

  if (!message) return null;

  return <div className="toast">{message}</div>;
}
