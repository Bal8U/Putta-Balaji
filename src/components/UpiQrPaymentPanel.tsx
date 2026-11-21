import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, ExternalLink, Phone, QrCode, ShieldCheck } from 'lucide-react';
import { usePaymentSettings } from '../context/PaymentSettingsContext';
import { formatINR } from '../utils/pricing';
import {
  buildUpiPaymentUri,
  isValidUtrNumber,
  normalizeUtrInput,
} from '../utils/upi';

interface UpiQrPaymentPanelProps {
  orderId: string;
  amountInr: number;
  label?: string;
  submitting: boolean;
  error?: string | null;
  onConfirmPayment: (utrNumber: string) => Promise<void> | void;
  onBack?: () => void;
}

const SUPPORTED_UPI_APPS = ['Google Pay', 'PhonePe', 'Paytm', 'BHIM UPI'] as const;

export function UpiQrPaymentPanel({
  orderId,
  amountInr,
  label = 'Order Total',
  submitting,
  error,
  onConfirmPayment,
  onBack,
}: UpiQrPaymentPanelProps) {
  const { settings } = usePaymentSettings();
  const merchantUpiId = settings.merchantUpiId;
  const merchantMobile = settings.merchantMobile;
  const brandName = settings.brandName;

  const upiUri = buildUpiPaymentUri({
    merchantUpiId,
    brandName,
    amountInr,
    orderId,
  });

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [utrNumber, setUtrNumber] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(upiUri, {
      width: 240,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0F172A',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (!cancelled) {
          setQrDataUrl(url);
          setQrError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrError('Unable to render QR image. Please use the UPI ID or app link below.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [upiUri]);

  const handleCopyUpi = async () => {
    try {
      await navigator.clipboard.writeText(merchantUpiId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!isValidUtrNumber(utrNumber)) {
      setLocalError('Please enter the exact 12-digit UPI Transaction ID / UTR Number from your UPI app.');
      return;
    }
    await onConfirmPayment(utrNumber);
  };

  const activeError = localError || error;
  const utrReady = isValidUtrNumber(utrNumber);

  return (
    <div data-testid="upi-qr-payment-panel" className="space-y-5">
      {/* Amount & Reference Banner */}
      <div className="p-4 rounded-xl bg-zinc-950 text-white border-b-2 border-yellow-400 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-sky-400">{label}</p>
          <p className="font-mono tabular-nums text-2xl font-extrabold text-yellow-400 mt-0.5">
            {formatINR(amountInr)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-zinc-400">Reference</p>
          <p className="font-mono text-xs font-bold text-white">Order_{orderId}</p>
        </div>
      </div>

      {/* Crisp Scannable QR Code Frame */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col items-center text-center space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900">Scan &amp; Pay with any UPI App</p>
          <p className="text-xs text-slate-500">
            Open your UPI app and scan this dynamic QR code with the exact payable amount pre-filled.
          </p>
        </div>

        <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`UPI QR code to pay ${formatINR(amountInr)} to ${merchantUpiId} for Order ${orderId}`}
              data-testid="upi-qr-image"
              className="w-52 h-52 block"
            />
          ) : qrError ? (
            <div className="w-52 h-52 flex flex-col items-center justify-center p-4 text-xs text-slate-500">
              <QrCode className="w-8 h-8 mb-2 text-slate-400" aria-hidden="true" />
              <span>{qrError}</span>
            </div>
          ) : (
            <div className="w-52 h-52 bg-slate-100 rounded animate-pulse" />
          )}
        </div>

        {/* Supported UPI Apps Strip & Merchant Contact */}
        <div className="w-full pt-2 border-t border-slate-100 space-y-2.5">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs font-semibold text-slate-700">
            {SUPPORTED_UPI_APPS.map((appName, idx) => (
              <span key={appName} className="inline-flex items-center gap-3">
                <span>{appName}</span>
                {idx < SUPPORTED_UPI_APPS.length - 1 && (
                  <span className="text-slate-300 font-normal" aria-hidden="true">
                    ·
                  </span>
                )}
              </span>
            ))}
          </div>

          {/* Merchant UPI ID & Mobile Row */}
          <div className="px-3.5 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-left min-w-0">
                <span className="text-slate-600 font-medium">UPI ID: </span>
                <span
                  data-testid="merchant-upi-id"
                  className="font-mono font-semibold text-slate-900 break-all"
                >
                  {merchantUpiId}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyUpi}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 text-xs font-medium cursor-pointer shrink-0 whitespace-nowrap"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-sky-600" aria-hidden="true" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Copy UPI ID</span>
                  </>
                )}
              </button>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-200/70 text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-sky-600" aria-hidden="true" />
                <span>
                  Mobile:{' '}
                  <strong
                    data-testid="merchant-mobile"
                    className="font-mono tabular-nums text-slate-900"
                  >
                    {merchantMobile}
                  </strong>
                </span>
              </span>
              <span className="text-[11px] text-slate-500">{brandName} Verified</span>
            </div>
          </div>

          {/* Mobile UPI Deep-Link Button */}
          <a
            href={upiUri}
            data-testid="upi-deep-link"
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-sky-600 bg-sky-50 text-sky-900 text-xs font-bold hover:bg-sky-100 transition-colors"
          >
            <span>Pay via UPI App</span>
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>

      {/* 12-Digit UTR Confirmation Form */}
      <form onSubmit={handleSubmit} className="space-y-3.5">
        {activeError && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800"
          >
            {activeError}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="upi-utr-input" className="text-xs font-semibold text-slate-800">
              12-Digit UPI Transaction ID / UTR Number *
            </label>
            <span
              className={`font-mono tabular-nums text-[11px] ${
                utrReady ? 'text-sky-600 font-semibold' : 'text-slate-500'
              }`}
            >
              {utrNumber.length}/12 digits
            </span>
          </div>
          <input
            id="upi-utr-input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={12}
            required
            value={utrNumber}
            onChange={(e) => {
              setUtrNumber(normalizeUtrInput(e.target.value));
              if (localError) setLocalError(null);
            }}
            placeholder="e.g. 432518902341"
            className="w-full px-3.5 py-2.5 font-mono tabular-nums tracking-wider text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/15"
          />
          <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-sky-600 shrink-0" aria-hidden="true" />
            <span>
              After completing payment in GPay, PhonePe, or Paytm, paste the 12-digit UTR/Ref No.
              below for verification.
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2.5 pt-1">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-3 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              Back
            </button>
          )}
          <button
            type="submit"
            disabled={submitting || !utrReady}
            className="flex-1 py-3 px-4 rounded-lg bg-zinc-950 text-yellow-400 text-sm font-extrabold hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {submitting ? 'Confirming Payment...' : 'Confirm Payment'}
          </button>
        </div>
      </form>
    </div>
  );
}
