import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { PaymentSettingsProvider } from './context/PaymentSettingsContext.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <PaymentSettingsProvider>
      <App />
    </PaymentSettingsProvider>
  </AuthProvider>,
);
