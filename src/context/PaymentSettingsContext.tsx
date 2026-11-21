import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { PaymentSettings } from '../types';
import { fetchPaymentSettings, updateAdminPaymentSettings } from '../utils/api';
import {
  DEFAULT_BRAND_NAME,
  getMerchantMobile,
  getMerchantUpiId,
} from '../utils/upi';
import { DEFAULT_COURIER_TRACKING_BASE_URL } from '../utils/ekart';

interface PaymentSettingsContextValue {
  settings: PaymentSettings;
  loading: boolean;
  refreshSettings: () => Promise<void>;
  saveSettings: (patch: {
    merchantUpiId: string;
    merchantMobile: string;
    brandName?: string;
    defaultTrackingBaseUrl?: string;
  }) => Promise<PaymentSettings>;
}

const initialSettings: PaymentSettings = {
  merchantUpiId: getMerchantUpiId(),
  merchantMobile: getMerchantMobile(),
  brandName: DEFAULT_BRAND_NAME,
  defaultTrackingBaseUrl: DEFAULT_COURIER_TRACKING_BASE_URL,
};

const PaymentSettingsContext = createContext<PaymentSettingsContextValue>({
  settings: initialSettings,
  loading: false,
  refreshSettings: async () => {},
  saveSettings: async () => initialSettings,
});

export function PaymentSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PaymentSettings>(initialSettings);
  const [loading, setLoading] = useState(true);

  const refreshSettings = useCallback(async () => {
    try {
      const data = await fetchPaymentSettings();
      setSettings(data);
    } catch {
      // keep safe defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  const saveSettings = useCallback(
    async (patch: {
      merchantUpiId: string;
      merchantMobile: string;
      brandName?: string;
      defaultTrackingBaseUrl?: string;
    }) => {
      const updated = await updateAdminPaymentSettings(patch);
      setSettings(updated);
      return updated;
    },
    [],
  );

  return (
    <PaymentSettingsContext.Provider
      value={{ settings, loading, refreshSettings, saveSettings }}
    >
      {children}
    </PaymentSettingsContext.Provider>
  );
}

export function usePaymentSettings(): PaymentSettingsContextValue {
  return useContext(PaymentSettingsContext);
}
