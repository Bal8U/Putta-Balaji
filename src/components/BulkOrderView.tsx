import { useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileImage,
  MessageCircle,
  Printer,
  Truck,
  Upload,
  X,
} from 'lucide-react';
import { usePaymentSettings } from '../context/PaymentSettingsContext';
import {
  buildWhatsAppQuoteUrl,
  OWNER_INSTAGRAM_HANDLE,
  OWNER_NAME,
  triggerDirectWhatsAppNotification,
} from '../utils/upi';
import type {
  BulkApparelType,
  BulkQuote,
  FabricType,
  ShippingSpeed,
  SizeMatrix,
} from '../types';
import {
  BULK_APPAREL_PRICES,
  BULK_MIN_UNITS,
  calculateBulkEstimate,
  CUSTOM_PRINTING_FEE_PER_UNIT,
  FABRIC_MODIFIERS,
  formatINR,
} from '../utils/pricing';
import {
  downloadEstimateReceiptHtml,
  submitBulkQuote,
  submitBulkQuotePayment,
} from '../utils/api';
import { UpiQrPaymentPanel } from './UpiQrPaymentPanel';

const APPAREL_TYPES = Object.keys(BULK_APPAREL_PRICES) as BulkApparelType[];
const FABRIC_TYPES = Object.keys(FABRIC_MODIFIERS) as FabricType[];
const MATRIX_SIZES: Array<keyof SizeMatrix> = ['S', 'M', 'L', 'XL', 'XXL'];
const MATERIAL_STORAGE_KEY = 'themagnet_admin_bulk_materials_v1';

interface MaterialRowState {
  gsm: number;
  delta: number;
  stockMeters: number;
}

interface PersistedBulkRates {
  fabrics: Record<FabricType, MaterialRowState>;
  apparelRates: Record<BulkApparelType, number>;
}

function getDefaultBulkRates(): PersistedBulkRates {
  const fabrics = {} as Record<FabricType, MaterialRowState>;
  for (const fab of FABRIC_TYPES) {
    fabrics[fab] = {
      gsm: FABRIC_MODIFIERS[fab].gsm,
      delta: FABRIC_MODIFIERS[fab].delta,
      stockMeters: FABRIC_MODIFIERS[fab].defaultStockMeters,
    };
  }
  const apparelRates = {} as Record<BulkApparelType, number>;
  for (const app of APPAREL_TYPES) {
    apparelRates[app] = BULK_APPAREL_PRICES[app].unitPrice;
  }
  return { fabrics, apparelRates };
}

function loadBulkRates(): PersistedBulkRates {
  const fallback = getDefaultBulkRates();
  try {
    const raw = localStorage.getItem(MATERIAL_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PersistedBulkRates>;
    return {
      fabrics: { ...fallback.fabrics, ...(parsed.fabrics || {}) },
      apparelRates: { ...fallback.apparelRates, ...(parsed.apparelRates || {}) },
    };
  } catch {
    return fallback;
  }
}

interface BulkOrderViewProps {
  embeddedInAdmin?: boolean;
  onQuoteCreated?: (quote: BulkQuote) => void;
}

export function BulkOrderView({ embeddedInAdmin = false, onQuoteCreated }: BulkOrderViewProps = {}) {
  const { settings } = usePaymentSettings();
  const [bulkRates, setBulkRates] = useState<PersistedBulkRates>(() => loadBulkRates());
  const [materialSavedNote, setMaterialSavedNote] = useState<string | null>(null);
  const [apparelType, setApparelType] = useState<BulkApparelType>(
    'Bulk Team Jersey / Custom Sports Kit',
  );
  const [fabric, setFabric] = useState<FabricType>('Dry-Fit Micro Mesh');
  const [sizes, setSizes] = useState<SizeMatrix>({ S: 15, M: 35, L: 30, XL: 20, XXL: 0 });
  const [customPrinting, setCustomPrinting] = useState<boolean>(true);
  const [shippingSpeed, setShippingSpeed] = useState<ShippingSpeed>('Standard');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [gstin, setGstin] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedQuote, setSubmittedQuote] = useState<BulkQuote | null>(null);
  const [showAdvanceUpi, setShowAdvanceUpi] = useState(false);
  const [submittingAdvance, setSubmittingAdvance] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);
  const [copiedReceiptUpi, setCopiedReceiptUpi] = useState(false);

  const activeBaseRate =
    bulkRates.apparelRates[apparelType] ?? BULK_APPAREL_PRICES[apparelType].unitPrice;
  const activeFabricRow = bulkRates.fabrics[fabric] ?? {
    gsm: FABRIC_MODIFIERS[fabric].gsm,
    delta: FABRIC_MODIFIERS[fabric].delta,
    stockMeters: FABRIC_MODIFIERS[fabric].defaultStockMeters,
  };

  const estimate = useMemo(
    () =>
      calculateBulkEstimate(
        {
          apparelType,
          fabric,
          sizes,
          customPrinting,
          shippingSpeed,
        },
        {
          baseUnitPrice: activeBaseRate,
          fabricDelta: activeFabricRow.delta,
        },
      ),
    [apparelType, fabric, sizes, customPrinting, shippingSpeed, activeBaseRate, activeFabricRow.delta],
  );

  const handleSaveMaterialRates = () => {
    try {
      localStorage.setItem(MATERIAL_STORAGE_KEY, JSON.stringify(bulkRates));
      setMaterialSavedNote('Bulk raw material GSM, stock meters & unit rates saved and applied live.');
      window.setTimeout(() => setMaterialSavedNote(null), 2800);
    } catch {
      setMaterialSavedNote('Rates applied for this session.');
    }
  };

  const handleSizeChange = (key: keyof SizeMatrix, raw: string) => {
    const num = Math.max(0, Math.min(25000, Math.floor(Number(raw) || 0)));
    setSizes((prev) => ({ ...prev, [key]: num }));
  };

  const applyQuantityPreset = (targetQty: number) => {
    const s = Math.round(targetQty * 0.15);
    const m = Math.round(targetQty * 0.35);
    const l = Math.round(targetQty * 0.3);
    const xl = targetQty - (s + m + l);
    setSizes({ S: s, M: m, L: l, XL: xl, XXL: 0 });
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (logoPreview) {
      URL.revokeObjectURL(logoPreview);
    }
    setLogoFile(file);
    if (file) {
      setLogoPreview(URL.createObjectURL(file));
      setCustomPrinting(true);
    } else {
      setLogoPreview(null);
    }
  };

  const clearLogo = () => {
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoFile(null);
    setLogoPreview(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!estimate.meetsMinimum) {
      setError(`Minimum wholesale order is ${BULK_MIN_UNITS} units. Please increase your size quantities.`);
      return;
    }
    if (!businessName.trim() || !contactName.trim() || !contactEmail.trim() || !contactPhone.trim()) {
      setError('Please complete your business name, contact person, email, and phone number.');
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('businessName', businessName.trim());
      fd.append('contactName', contactName.trim());
      fd.append('contactEmail', contactEmail.trim());
      fd.append('contactPhone', contactPhone.trim());
      fd.append('gstin', gstin.trim());
      fd.append('notes', notes.trim());
      fd.append('apparelType', apparelType);
      fd.append('fabric', fabric);
      fd.append('sizeMatrix', JSON.stringify(sizes));
      fd.append('customPrinting', String(customPrinting));
      fd.append('shippingSpeed', shippingSpeed);
      fd.append('overrideBaseUnitPrice', String(activeBaseRate));
      fd.append('overrideFabricDelta', String(activeFabricRow.delta));
      if (logoFile) {
        fd.append('logo', logoFile);
      }

      const quote = await submitBulkQuote(fd);
      setSubmittedQuote(quote);
      onQuoteCreated?.(quote);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const quoteWaUrl = buildWhatsAppQuoteUrl({
        quoteNumber: quote.quoteNumber,
        businessName: quote.businessName,
        contactName: quote.contactName,
        apparelType: quote.apparelType,
        fabric: `${quote.fabric} (${activeFabricRow.gsm} GSM)`,
        totalQuantity: quote.totalQuantity,
        estimatedTotalInr: quote.estimatedTotalInr,
        merchantUpiId: settings.merchantUpiId,
        merchantMobile: settings.merchantMobile,
      });
      triggerDirectWhatsAppNotification(quoteWaUrl);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (submittedQuote) {
    const sizeBreakdown = Object.entries(submittedQuote.sizeMatrix)
      .filter(([, q]) => Number(q) > 0)
      .map(([k, q]) => `${k}: ${q}`)
      .join(' · ');

    return (
      <div className={embeddedInAdmin ? 'space-y-6' : 'max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8'}>
        <div className="no-print flex flex-wrap items-center justify-between gap-4 bg-zinc-950 text-white border-b-4 border-yellow-400 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-yellow-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h1 className="font-display text-xl font-bold text-yellow-400">
                Bulk Team Quote Submitted — {submittedQuote.quoteNumber}
              </h1>
              <p className="text-sm text-zinc-300 mt-0.5">
                Saved to The Magnet production desk ({OWNER_NAME}). Send directly on WhatsApp or
                download your GST estimate receipt below.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <a
              href={buildWhatsAppQuoteUrl({
                quoteNumber: submittedQuote.quoteNumber,
                businessName: submittedQuote.businessName,
                contactName: submittedQuote.contactName,
                apparelType: submittedQuote.apparelType,
                fabric: submittedQuote.fabric,
                totalQuantity: submittedQuote.totalQuantity,
                estimatedTotalInr: submittedQuote.estimatedTotalInr,
                merchantUpiId: settings.merchantUpiId,
                merchantMobile: settings.merchantMobile,
              })}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="whatsapp-quote-link"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500 whitespace-nowrap"
            >
              <MessageCircle className="w-4 h-4" aria-hidden="true" />
              <span>Send Quote on WhatsApp (+91 {settings.merchantMobile})</span>
            </a>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-zinc-600 text-white bg-zinc-900 text-xs font-semibold hover:bg-zinc-800 cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-4 h-4" aria-hidden="true" />
              <span>Print / PDF</span>
            </button>
            <button
              type="button"
              onClick={() => downloadEstimateReceiptHtml(submittedQuote, settings)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-yellow-400 text-zinc-950 text-xs font-bold hover:bg-yellow-300 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>Download HTML Receipt</span>
            </button>
          </div>
        </div>

        {/* Printable Estimate Receipt */}
        <article
          data-testid="bulk-estimate-receipt"
          className="bg-white border border-zinc-200 rounded-xl p-8 sm:p-10 space-y-8"
        >
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-zinc-200">
            <div>
              <h2 className="font-display text-2xl font-extrabold text-zinc-950">
                THE MAGNET <span className="text-sky-600 text-base font-bold">WHOLESALE</span>
              </h2>
              <p className="text-xs text-zinc-500 mt-1">
                Sports Wear &amp; Trendy Fashions · Owner: {OWNER_NAME} · Instagram:{' '}
                {OWNER_INSTAGRAM_HANDLE}
              </p>
            </div>
            <div className="sm:text-right">
              <p className="text-xs font-bold tracking-wider text-zinc-500">
                BULK TEAM &amp; WHOLESALE ESTIMATE
              </p>
              <p className="font-mono text-base font-bold text-zinc-950 mt-0.5">
                {submittedQuote.quoteNumber}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {new Date(submittedQuote.createdAt).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}{' '}
                · Status: {submittedQuote.status}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-500">Buyer Details</p>
              <p className="font-semibold text-slate-900">{submittedQuote.businessName}</p>
              <p className="text-slate-600">Attn: {submittedQuote.contactName}</p>
              <p className="text-slate-600">
                {submittedQuote.contactEmail} · {submittedQuote.contactPhone}
              </p>
              {submittedQuote.gstin && (
                <p className="font-mono text-xs text-slate-600">GSTIN: {submittedQuote.gstin}</p>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-500">Production Specification</p>
              <p className="font-semibold text-slate-900">
                {submittedQuote.apparelType} · {submittedQuote.fabric}
              </p>
              <p className="text-slate-600 font-mono tabular-nums text-xs">
                Total: {submittedQuote.totalQuantity} units ({sizeBreakdown})
              </p>
              <p className="text-slate-600">
                Custom Logo Printing:{' '}
                {submittedQuote.customPrinting
                  ? `Included (+₹${CUSTOM_PRINTING_FEE_PER_UNIT}/unit)`
                  : 'No'}
              </p>
              <p className="text-slate-600">Shipping: {submittedQuote.shippingSpeed}</p>
            </div>
          </div>

          {submittedQuote.logoUrl && (
            <div className="flex items-center gap-4 p-4 rounded-lg bg-slate-50 border border-slate-200">
              <img
                src={submittedQuote.logoUrl}
                alt="Uploaded buyer logo"
                className="w-14 h-14 object-contain rounded bg-white border border-slate-200 p-1"
              />
              <div className="text-xs text-slate-600">
                <p className="font-semibold text-slate-900">Uploaded Custom Logo Attached</p>
                <p className="mt-0.5">Saved for pre-production screen/DTF proof verification.</p>
              </div>
            </div>
          )}

          <div className="border-t border-slate-200 pt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="text-left py-2.5 font-medium">Cost Line Item</th>
                  <th className="text-right py-2.5 font-medium">Amount (INR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="py-3 text-slate-700">
                    Base Garment Cost ({submittedQuote.totalQuantity} ×{' '}
                    {formatINR(submittedQuote.unitPriceInr)}/unit)
                  </td>
                  <td className="py-3 text-right font-mono tabular-nums text-slate-900">
                    {formatINR(submittedQuote.baseCostInr)}
                  </td>
                </tr>
                {submittedQuote.customPrinting && (
                  <tr>
                    <td className="py-3 text-slate-700">
                      Custom Logo Printing ({submittedQuote.totalQuantity} × ₹
                      {CUSTOM_PRINTING_FEE_PER_UNIT}/unit)
                    </td>
                    <td className="py-3 text-right font-mono tabular-nums text-slate-900">
                      {formatINR(submittedQuote.printingCostInr)}
                    </td>
                  </tr>
                )}
                <tr>
                  <td className="py-3 text-sky-700">
                    Volume Discount ({submittedQuote.discountPercent}% tier)
                  </td>
                  <td className="py-3 text-right font-mono tabular-nums text-sky-700">
                    − {formatINR(submittedQuote.discountAmountInr)}
                  </td>
                </tr>
                <tr>
                  <td className="py-3 text-slate-700 font-medium">Discounted Taxable Subtotal</td>
                  <td className="py-3 text-right font-mono tabular-nums font-medium text-slate-900">
                    {formatINR(submittedQuote.discountedSubtotalInr)}
                  </td>
                </tr>
                <tr>
                  <td className="py-3 text-slate-700">18% GST (IGST / CGST + SGST)</td>
                  <td className="py-3 text-right font-mono tabular-nums text-slate-900">
                    {formatINR(submittedQuote.gstInr)}
                  </td>
                </tr>
                <tr>
                  <td className="py-3 text-slate-700">
                    Freight &amp; Dispatch ({submittedQuote.shippingSpeed})
                  </td>
                  <td className="py-3 text-right font-mono tabular-nums text-slate-900">
                    {formatINR(submittedQuote.shippingFeeInr)}
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-900">
                  <td className="pt-4 text-base font-semibold text-slate-900">
                    Final Estimated Total (INR)
                  </td>
                  <td className="pt-4 text-right font-mono tabular-nums text-xl font-bold text-sky-700">
                    {formatINR(submittedQuote.estimatedTotalInr)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Official Payment UPI ID & Wholesale WhatsApp Desk (Printed & On-Screen) */}
          <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-1">
              <p className="font-semibold text-zinc-950">
                Official Payment UPI ID:{' '}
                <span data-testid="receipt-upi-id" className="font-mono text-sky-600 font-bold">
                  {settings.merchantUpiId}
                </span>
              </p>
              <p className="text-zinc-600">
                Owner WhatsApp ({OWNER_NAME}):{' '}
                <span className="font-mono font-bold text-zinc-950">
                  +91 {settings.merchantMobile}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(settings.merchantUpiId);
                  setCopiedReceiptUpi(true);
                  window.setTimeout(() => setCopiedReceiptUpi(false), 1800);
                } catch {
                  // ignore clipboard error
                }
              }}
              className="no-print inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100 font-semibold cursor-pointer self-start sm:self-center whitespace-nowrap"
            >
              {copiedReceiptUpi ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
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

          {/* Optional 30% Production Advance UPI QR Payment */}
          <div className="no-print pt-6 border-t border-zinc-200 space-y-4">
            {submittedQuote.utrNumber ? (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-950 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold">
                    30% Production Advance Submitted — {submittedQuote.status}
                  </p>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    Advance Amount:{' '}
                    <span className="font-mono font-semibold">
                      {formatINR(submittedQuote.advancePaidInr)}
                    </span>{' '}
                    · UTR: <span className="font-mono font-semibold">{submittedQuote.utrNumber}</span>
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-zinc-950">
                      Lock Production Slot — Pay 30% Advance via UPI QR ({settings.merchantUpiId})
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Pay{' '}
                      <span className="font-mono tabular-nums font-bold text-sky-600">
                        {formatINR(Math.round(submittedQuote.estimatedTotalInr * 0.3))}
                      </span>{' '}
                      via dynamic UPI QR Code and enter your 12-digit UTR number.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAdvanceUpi((prev) => !prev)}
                    className="px-4 py-2 rounded-lg bg-zinc-950 text-yellow-400 text-xs font-bold hover:bg-zinc-800 cursor-pointer whitespace-nowrap"
                  >
                    {showAdvanceUpi ? 'Hide UPI QR' : 'Pay 30% Advance via UPI QR'}
                  </button>
                </div>

                {showAdvanceUpi && (
                  <div className="max-w-md">
                    <UpiQrPaymentPanel
                      orderId={submittedQuote.quoteNumber}
                      amountInr={Math.round(submittedQuote.estimatedTotalInr * 0.3)}
                      label="30% Wholesale Production Advance"
                      submitting={submittingAdvance}
                      error={advanceError}
                      onConfirmPayment={async (utr) => {
                        setAdvanceError(null);
                        setSubmittingAdvance(true);
                        try {
                          const advanceAmt = Math.round(submittedQuote.estimatedTotalInr * 0.3);
                          const updated = await submitBulkQuotePayment(
                            submittedQuote.id,
                            utr,
                            advanceAmt,
                          );
                          setSubmittedQuote(updated);
                          setShowAdvanceUpi(false);
                          const paidWaUrl = buildWhatsAppQuoteUrl({
                            quoteNumber: `${updated.quoteNumber} (CONFIRMED · UTR ${utr})`,
                            businessName: updated.businessName,
                            contactName: updated.contactName,
                            apparelType: updated.apparelType,
                            fabric: updated.fabric,
                            totalQuantity: updated.totalQuantity,
                            estimatedTotalInr: updated.estimatedTotalInr,
                            merchantUpiId: settings.merchantUpiId,
                            merchantMobile: settings.merchantMobile,
                          });
                          triggerDirectWhatsAppNotification(paidWaUrl);
                        } catch (err) {
                          setAdvanceError((err as Error).message);
                        } finally {
                          setSubmittingAdvance(false);
                        }
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setSubmittedQuote(null);
                  setShowAdvanceUpi(false);
                }}
                className="px-4 py-2 text-sm font-medium text-sky-700 hover:text-sky-900 underline underline-offset-4 cursor-pointer"
              >
                Configure Another Bulk Order
              </button>
            </div>
          </div>
        </article>
      </div>
    );
  }

  return (
    <div
      data-testid="admin-bulk-estimator"
      className={
        embeddedInAdmin
          ? 'space-y-6'
          : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14 space-y-8'
      }
    >
      <div className="space-y-1.5">
        <p className="text-xs font-bold uppercase tracking-wider text-sky-600">
          Admin-Only Wholesale &amp; Raw Material Desk · Minimum Order {BULK_MIN_UNITS} Units
        </p>
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-zinc-950">
          Bulk Material &amp; Quote Estimator
        </h1>
        <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
          Manage fabric GSM &amp; raw material stock/rates, calculate custom manufacturing costs
          (Apparel Type, Fabric GSM, S–XXL matrix, Custom Printing +₹{CUSTOM_PRINTING_FEE_PER_UNIT}
          /unit, 10%–20% volume tiers, 18% GST &amp; Shipping), save B2B client quotes, and send
          directly via WhatsApp (+91 {settings.merchantMobile}).
        </p>
      </div>

      {/* Admin Bulk Raw Material Stock & Rates Management Card */}
      <section
        data-testid="bulk-material-rates-card"
        className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4 shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-zinc-950">
              Bulk Raw Material Stock &amp; Fabric GSM Rates
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Edit GSM, rate delta (₹/unit), and fabric roll stock (meters). Updates calculate live below.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSaveMaterialRates}
            data-testid="save-material-rates-btn"
            className="px-4 py-2 rounded-lg bg-zinc-950 text-yellow-400 text-xs font-bold hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            Save Material Rates &amp; Stock
          </button>
        </div>

        {materialSavedNote && (
          <div
            role="status"
            data-testid="material-rates-saved-note"
            className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-semibold"
          >
            {materialSavedNote}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500 bg-zinc-50">
                <th className="px-3 py-2 font-semibold">Fabric Grade</th>
                <th className="px-3 py-2 font-semibold text-right">Fabric GSM</th>
                <th className="px-3 py-2 font-semibold text-right">Rate Delta (₹/unit)</th>
                <th className="px-3 py-2 font-semibold text-right">Stock (Meters)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {FABRIC_TYPES.map((fab) => {
                const row = bulkRates.fabrics[fab];
                return (
                  <tr key={fab}>
                    <td className="px-3 py-2 font-semibold text-zinc-900">{fab}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={100}
                        max={600}
                        aria-label={`${fab} GSM`}
                        value={row.gsm}
                        onChange={(e) =>
                          setBulkRates((prev) => ({
                            ...prev,
                            fabrics: {
                              ...prev.fabrics,
                              [fab]: {
                                ...prev.fabrics[fab],
                                gsm: Math.max(100, Math.floor(Number(e.target.value) || 0)),
                              },
                            },
                          }))
                        }
                        className="w-20 px-2 py-1 text-right font-mono tabular-nums border border-zinc-200 rounded focus:outline-none focus:border-sky-600"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        max={500}
                        aria-label={`${fab} rate delta`}
                        value={row.delta}
                        onChange={(e) =>
                          setBulkRates((prev) => ({
                            ...prev,
                            fabrics: {
                              ...prev.fabrics,
                              [fab]: {
                                ...prev.fabrics[fab],
                                delta: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                              },
                            },
                          }))
                        }
                        className="w-20 px-2 py-1 text-right font-mono tabular-nums border border-zinc-200 rounded focus:outline-none focus:border-sky-600"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        max={50000}
                        aria-label={`${fab} stock meters`}
                        value={row.stockMeters}
                        onChange={(e) =>
                          setBulkRates((prev) => ({
                            ...prev,
                            fabrics: {
                              ...prev.fabrics,
                              [fab]: {
                                ...prev.fabrics[fab],
                                stockMeters: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                              },
                            },
                          }))
                        }
                        className="w-24 px-2 py-1 text-right font-mono tabular-nums border border-zinc-200 rounded focus:outline-none focus:border-sky-600"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
      >
        {/* Left Column: Interactive Step-by-Step Form */}
        <div className="lg:col-span-7 space-y-6">
          {error && (
            <div
              role="alert"
              className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800"
            >
              {error}
            </div>
          )}

          {/* Step 1: Apparel Type */}
          <section className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
            <div>
              <h2 className="font-sans text-base font-bold text-zinc-950">
                01. Select Apparel Type &amp; Base Rate
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Factory-direct bulk unit pricing before fabric GSM upgrades.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {APPAREL_TYPES.map((type, idx) => {
                const info = BULK_APPAREL_PRICES[type];
                const rate = bulkRates.apparelRates[type] ?? info.unitPrice;
                const active = apparelType === type;
                const isOddLast = idx === APPAREL_TYPES.length - 1 && APPAREL_TYPES.length % 2 === 1;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setApparelType(type)}
                    className={`p-4 rounded-lg border text-left transition-colors cursor-pointer ${
                      isOddLast ? 'sm:col-span-2' : ''
                    } ${
                      active
                        ? 'border-zinc-950 bg-zinc-950 text-white'
                        : 'border-zinc-200 bg-white hover:border-zinc-400'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-sm font-bold ${
                          active ? 'text-yellow-400' : 'text-zinc-950'
                        }`}
                      >
                        {type}
                      </span>
                      <span
                        className={`font-mono tabular-nums text-sm font-bold ${
                          active ? 'text-sky-400' : 'text-sky-600'
                        }`}
                      >
                        {formatINR(rate)}
                      </span>
                    </div>
                    <p
                      className={`text-xs mt-1 line-clamp-2 ${
                        active ? 'text-zinc-300' : 'text-zinc-500'
                      }`}
                    >
                      {info.description}
                    </p>
                    <p className="text-[11px] text-zinc-400 mt-2">Lead time: {info.leadDays}</p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Step 2: Size-Wise Quantity Matrix */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-sans text-base font-semibold text-slate-900">
                  02. Size-Wise Quantity Matrix
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Enter units per size (minimum {BULK_MIN_UNITS} total units).
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {[100, 500, 1000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => applyQuantityPreset(preset)}
                    className="px-2.5 py-1 text-xs font-mono tabular-nums rounded border border-slate-200 text-slate-600 hover:border-sky-600 hover:text-sky-700 cursor-pointer"
                  >
                    {preset} pcs
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {MATRIX_SIZES.map((sz) => (
                <div key={sz}>
                  <label
                    htmlFor={`bulk-size-${sz}`}
                    className="block text-xs font-semibold text-slate-700 mb-1.5 text-center"
                  >
                    Size {sz}
                  </label>
                  <input
                    id={`bulk-size-${sz}`}
                    type="number"
                    min={0}
                    max={25000}
                    value={sizes[sz] ?? 0}
                    onChange={(e) => handleSizeChange(sz, e.target.value)}
                    className="w-full px-2.5 py-2.5 text-center font-mono tabular-nums text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/15"
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 text-xs">
              <span className="text-slate-600">
                Total Units:{' '}
                <strong
                  data-testid="bulk-total-qty"
                  className={`font-mono tabular-nums text-sm ${
                    estimate.meetsMinimum ? 'text-slate-900' : 'text-rose-600'
                  }`}
                >
                  {estimate.totalQuantity} units
                </strong>
              </span>
              {!estimate.meetsMinimum ? (
                <span className="text-rose-600 font-medium">
                  Add {BULK_MIN_UNITS - estimate.totalQuantity} more units to meet MOQ
                </span>
              ) : estimate.nextTierUnits && estimate.nextTierPercent ? (
                <span className="text-sky-700">
                  Add {estimate.nextTierUnits - estimate.totalQuantity} units to unlock{' '}
                  {estimate.nextTierPercent}% volume discount
                </span>
              ) : (
                <span className="text-sky-700 font-medium">
                  Maximum 20% volume discount tier active
                </span>
              )}
            </div>
          </section>

          {/* Step 3: Fabric, Custom Printing & Logo Upload */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div>
              <h2 className="font-sans text-base font-semibold text-slate-900">
                03. Fabric Grade &amp; Custom Logo Printing
              </h2>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-700 block">
                Fabric &amp; GSM Selector
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {FABRIC_TYPES.map((fab) => {
                  const row = bulkRates.fabrics[fab];
                  const active = fabric === fab;
                  return (
                    <button
                      key={fab}
                      type="button"
                      onClick={() => setFabric(fab)}
                      className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                        active
                          ? 'border-sky-600 bg-sky-50/70 text-sky-950'
                          : 'border-slate-200 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <div className="text-xs font-semibold">{fab}</div>
                      <div className="text-[11px] font-mono tabular-nums text-sky-700 mt-0.5">
                        {row.gsm} GSM ·{' '}
                        {row.delta === 0 ? 'Base' : `+${formatINR(row.delta)}/u`}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        Stock: {row.stockMeters}m
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 space-y-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={customPrinting}
                  onChange={(e) => setCustomPrinting(e.target.checked)}
                  className="mt-1 w-4 h-4 accent-sky-600 rounded cursor-pointer"
                />
                <div>
                  <span className="text-sm font-semibold text-slate-900">
                    Add Custom Logo / Screen Printing (+₹{CUSTOM_PRINTING_FEE_PER_UNIT}/unit)
                  </span>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Includes chest or back print setup, Pantone matching, and pre-run sample photo.
                  </p>
                </div>
              </label>

              {customPrinting && (
                <div className="p-4 rounded-lg bg-slate-50 border border-dashed border-slate-300 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileImage className="w-5 h-5 text-sky-600 shrink-0" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">
                          {logoFile ? logoFile.name : 'Upload Brand Logo (PNG, JPG, SVG, WEBP)'}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Max 5MB · Saved directly to our production server
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer">
                        <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{logoFile ? 'Replace' : 'Choose File'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoChange}
                          className="sr-only"
                        />
                      </label>
                      {logoFile && (
                        <button
                          type="button"
                          onClick={clearLogo}
                          aria-label="Remove uploaded logo"
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  {logoPreview && (
                    <div className="flex items-center gap-3 pt-2 border-t border-slate-200">
                      <img
                        src={logoPreview}
                        alt="Logo preview"
                        className="w-12 h-12 object-contain rounded bg-white border border-slate-200 p-1"
                      />
                      <span className="text-xs text-sky-700 font-medium">
                        Logo ready for upload with your quote request
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Shipping Speed */}
            <div className="pt-4 border-t border-slate-100 space-y-2.5">
              <span className="text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                <span>Shipping Speed</span>
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(['Standard', 'Express'] as ShippingSpeed[]).map((speed) => {
                  const active = shippingSpeed === speed;
                  return (
                    <button
                      key={speed}
                      type="button"
                      onClick={() => setShippingSpeed(speed)}
                      className={`p-3.5 rounded-lg border text-left transition-colors cursor-pointer ${
                        active
                          ? 'border-sky-600 bg-sky-50/70'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="text-sm font-semibold text-slate-900">{speed} Freight</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {speed === 'Standard'
                          ? '5–7 business days · Road transport'
                          : '2–3 business days · Priority air cargo'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Step 4: Buyer & Business Information */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div>
              <h2 className="font-sans text-base font-semibold text-slate-900">
                04. Business &amp; Dispatch Contact
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Required to generate your official GST estimate receipt and lock pricing.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="bulk-business" className="block text-xs font-medium text-slate-700 mb-1">
                  Company / Brand Name *
                </label>
                <input
                  id="bulk-business"
                  type="text"
                  required
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Bharat Retail Exports"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>
              <div>
                <label htmlFor="bulk-contact" className="block text-xs font-medium text-slate-700 mb-1">
                  Contact Person *
                </label>
                <input
                  id="bulk-contact"
                  type="text"
                  required
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="e.g. Rajesh Verma"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>
              <div>
                <label htmlFor="bulk-email" className="block text-xs font-medium text-slate-700 mb-1">
                  Business Email *
                </label>
                <input
                  id="bulk-email"
                  type="email"
                  required
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="procurement@company.in"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>
              <div>
                <label htmlFor="bulk-phone" className="block text-xs font-medium text-slate-700 mb-1">
                  Phone / WhatsApp *
                </label>
                <input
                  id="bulk-phone"
                  type="tel"
                  required
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+91 98290 00000"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>
              <div>
                <label htmlFor="bulk-gstin" className="block text-xs font-medium text-slate-700 mb-1">
                  GSTIN (Optional for B2B Input Credit)
                </label>
                <input
                  id="bulk-gstin"
                  type="text"
                  maxLength={15}
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  placeholder="27AABCU9603R1ZM"
                  className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>
              <div>
                <label htmlFor="bulk-notes" className="block text-xs font-medium text-slate-700 mb-1">
                  Color / Packaging Notes (Optional)
                </label>
                <input
                  id="bulk-notes"
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Individual polybag + woven neck label"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Sticky Live Cost Breakdown Card */}
        <aside className="lg:col-span-5 lg:sticky lg:top-24">
          <div
            data-testid="live-cost-breakdown"
            className="bg-white border border-slate-200 rounded-xl p-6 sm:p-7 space-y-6"
          >
            <div className="pb-4 border-b border-zinc-200">
              <p className="text-xs font-bold uppercase tracking-wider text-sky-600">
                Real-Time Cost Breakdown
              </p>
              <h2 className="font-display text-2xl font-bold text-zinc-950 mt-1">
                {apparelType}
              </h2>
              <p className="text-xs text-zinc-500 mt-1">
                {fabric} ·{' '}
                <span className="font-mono tabular-nums">
                  {estimate.totalQuantity} units @ {formatINR(estimate.effectiveUnitPrice)}/unit
                </span>
              </p>
            </div>

            {/* Volume Tier Table */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              {[
                { label: '100+ units', pct: 10 },
                { label: '500+ units', pct: 15 },
                { label: '1,000+ units', pct: 20 },
              ].map((tier) => {
                const active = estimate.discountPercent === tier.pct;
                return (
                  <div
                    key={tier.pct}
                    className={`py-2 px-2 rounded-lg border ${
                      active
                        ? 'border-zinc-950 bg-zinc-950 text-yellow-400 font-bold'
                        : 'border-zinc-200 text-zinc-500'
                    }`}
                  >
                    <div>{tier.label}</div>
                    <div className="font-mono tabular-nums mt-0.5">{tier.pct}% off</div>
                  </div>
                );
              })}
            </div>

            {/* Live Math Breakdown */}
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between text-zinc-700">
                <dt>
                  Base Cost ({estimate.totalQuantity} × {formatINR(estimate.effectiveUnitPrice)})
                </dt>
                <dd className="font-mono tabular-nums font-medium text-zinc-950">
                  {formatINR(estimate.baseCost)}
                </dd>
              </div>

              {customPrinting && (
                <div className="flex items-center justify-between text-zinc-700">
                  <dt>
                    Custom Printing ({estimate.totalQuantity} × ₹{CUSTOM_PRINTING_FEE_PER_UNIT})
                  </dt>
                  <dd className="font-mono tabular-nums font-medium text-zinc-950">
                    {formatINR(estimate.printingCost)}
                  </dd>
                </div>
              )}

              <div className="flex items-center justify-between text-emerald-700">
                <dt>Volume Discount ({estimate.discountPercent}%)</dt>
                <dd className="font-mono tabular-nums font-semibold">
                  − {formatINR(estimate.discountAmount)}
                </dd>
              </div>

              <div className="flex items-center justify-between pt-2.5 border-t border-zinc-100 text-zinc-800 font-semibold">
                <dt>Discounted Subtotal</dt>
                <dd className="font-mono tabular-nums">{formatINR(estimate.discountedSubtotal)}</dd>
              </div>

              <div className="flex items-center justify-between text-zinc-700">
                <dt>18% GST (on discounted subtotal)</dt>
                <dd className="font-mono tabular-nums">{formatINR(estimate.gstAmount)}</dd>
              </div>

              <div className="flex items-center justify-between text-zinc-700">
                <dt>Bulk Freight ({shippingSpeed})</dt>
                <dd className="font-mono tabular-nums">{formatINR(estimate.shippingFee)}</dd>
              </div>

              <div className="flex items-baseline justify-between pt-4 border-t-2 border-zinc-950">
                <dt className="text-base font-bold text-zinc-950">Final Estimated Total</dt>
                <dd
                  data-testid="bulk-grand-total"
                  className="font-mono tabular-nums text-2xl font-extrabold text-zinc-950"
                >
                  {formatINR(estimate.grandTotal)}
                </dd>
              </div>

              {estimate.totalQuantity > 0 && (
                <p className="text-right text-xs text-zinc-500 font-mono tabular-nums">
                  Effective landed cost ≈{' '}
                  {formatINR(Math.round(estimate.grandTotal / estimate.totalQuantity))}/unit incl. GST
                </p>
              )}
            </dl>

            <button
              type="submit"
              disabled={submitting || !estimate.meetsMinimum}
              className="w-full py-3.5 px-5 rounded-lg bg-zinc-950 text-yellow-400 text-sm font-extrabold hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting
                ? 'Saving Quote & Generating Receipt...'
                : !estimate.meetsMinimum
                ? `Minimum ${BULK_MIN_UNITS} Units Required`
                : 'Submit Bulk Quote Request'}
            </button>

            <p className="text-[11px] text-zinc-500 leading-relaxed text-center">
              Generates an instant GST Estimate Receipt with UPI QR ({settings.merchantUpiId}) and
              one-click WhatsApp sharing to {OWNER_NAME} (+91 {settings.merchantMobile}).
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}
