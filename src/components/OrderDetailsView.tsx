import { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Download,
  ExternalLink,
  Home,
  KeyRound,
  MessageCircle,
  Package,
  Send,
  ShieldCheck,
  Truck,
  User,
  X,
} from 'lucide-react';
import type { RetailOrder } from '../types';
import { fetchOrderDetails, pushEkartHubScan } from '../utils/api';
import { usePaymentSettings } from '../context/PaymentSettingsContext';
import { formatINR } from '../utils/pricing';
import {
  buildFullTrackingTimeline,
  buildVerticalStepper,
  buildWhatsAppSupportUrl,
  downloadRetailTaxInvoiceHtml,
  formatFlipkartOrderId,
  formatShortTimestamp,
} from '../utils/orderHelpers';
import { OWNER_NAME } from '../utils/upi';
import {
  getCustomerNoTrackingStatusLabel,
  sanitizeExternalTrackingUrl,
} from '../utils/ekart';
import { ProductImage } from './ProductImage';

interface OrderDetailsViewProps {
  orderId: string;
  onNavigateHome: () => void;
  onNavigateMyOrders: () => void;
}

const SUPPORT_TOPICS = [
  'Where is my shipment right now?',
  'Verify my 12-digit UPI UTR payment',
  'Request size exchange / return',
  'Download GST invoice with business GSTIN',
];

export function OrderDetailsView({
  orderId,
  onNavigateHome,
  onNavigateMyOrders,
}: OrderDetailsViewProps) {
  const { settings } = usePaymentSettings();
  const [order, setOrder] = useState<RetailOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [viewAllItemsOpen, setViewAllItemsOpen] = useState(false);
  const [allUpdatesOpen, setAllUpdatesOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [feesExpanded, setFeesExpanded] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpNotice, setOtpNotice] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ from: 'support' | 'user'; text: string }>>([
    {
      from: 'support',
      text: `Hello! Welcome to The Magnet Order Support (${OWNER_NAME}). Pick a quick question below or chat with us directly on WhatsApp (+91 9963225798).`,
    },
  ]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setOtpInput('');
    setOtpError(null);
    setOtpNotice(null);
    fetchOrderDetails(orderId)
      .then((data) => {
        if (active) setOrder(data);
      })
      .catch((err) => {
        if (active) setError((err as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [orderId]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6 animate-pulse">
        <div className="h-4 w-72 bg-zinc-200 rounded" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 h-96 bg-white rounded-xl border border-zinc-200" />
          <div className="lg:col-span-4 space-y-4">
            <div className="h-40 bg-white rounded-xl border border-zinc-200" />
            <div className="h-56 bg-white rounded-xl border border-zinc-200" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-14 text-center space-y-4">
        <Package className="w-10 h-10 text-zinc-400 mx-auto" aria-hidden="true" />
        <h1 className="font-display text-2xl font-bold text-zinc-950">Order Not Found</h1>
        <p className="text-sm text-zinc-600">
          {error || `We couldn't locate an order matching "${orderId}".`}
        </p>
        <button
          type="button"
          onClick={onNavigateMyOrders}
          className="px-5 py-2.5 rounded-lg bg-zinc-950 text-yellow-400 text-sm font-bold hover:bg-zinc-800 cursor-pointer"
        >
          Back to My Orders
        </button>
      </div>
    );
  }

  const odCode = formatFlipkartOrderId(order.orderNumber);
  const totalItemCount = order.items.reduce((sum, i) => sum + i.qty, 0);
  const firstItem = order.items[0];
  const stepperNodes = buildVerticalStepper(order);
  const fullTimeline = buildFullTrackingTimeline(order);
  const safeAdminTrackingUrl = sanitizeExternalTrackingUrl(order.trackingUrl);

  const listingTotal =
    order.listingTotalInr > order.subtotalInr
      ? order.listingTotalInr
      : Math.round((order.subtotalInr * 1.38) / 10) * 10;
  const discountInr = Math.max(0, listingTotal - order.subtotalInr);
  const feesAndTaxTotal = order.gstInr + order.shippingInr;

  const paidByLabel =
    order.paymentMethod === 'UPI QR'
      ? `UPI QR - ${settings.merchantUpiId}`
      : order.paymentMethod === 'Razorpay Online'
      ? 'Razorpay Online'
      : 'Cash On Delivery';

  const handleSendQuickChat = (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setChatMessages((prev) => [
      ...prev,
      { from: 'user', text: clean },
      {
        from: 'support',
        text: `Thanks! We've logged "${clean}" for ${order.orderNumber}. Tap "Continue on WhatsApp (+91 ${settings.merchantMobile})" below to reach ${OWNER_NAME} directly.`,
      },
    ]);
    setChatInput('');
  };

  const handleVerifyDeliveryOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order.ekartTrackingId) return;
    const cleanOtp = otpInput.replace(/\D/g, '').slice(0, 4);
    if (cleanOtp.length !== 4) {
      setOtpError('Please enter a valid 4-digit numeric delivery OTP.');
      return;
    }
    setOtpSubmitting(true);
    setOtpError(null);
    setOtpNotice(null);
    try {
      const updated = await pushEkartHubScan(order.ekartTrackingId, {
        stepKey: 'DELIVERED',
        otp: cleanOtp,
      });
      setOrder(updated);
      setOtpInput('');
      setOtpNotice(
        `Delivery OTP verified for ${order.ekartTrackingId}. Order ${order.orderNumber} is now marked Delivered across the order management system.`,
      );
    } catch (err) {
      setOtpError((err as Error).message || 'Invalid 4-digit delivery OTP.');
    } finally {
      setOtpSubmitting(false);
    }
  };

  return (
    <div
      data-testid="order-details-page"
      className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-5"
    >
      {/* Flipkart-Style Breadcrumb Bar */}
      <nav
        aria-label="Order breadcrumb"
        data-testid="order-breadcrumb"
        className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500"
      >
        <button type="button" onClick={onNavigateHome} className="hover:text-sky-600 cursor-pointer">
          Home
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
        <button
          type="button"
          onClick={onNavigateMyOrders}
          className="hover:text-sky-600 cursor-pointer"
        >
          My Account
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
        <button
          type="button"
          onClick={onNavigateMyOrders}
          className="hover:text-sky-600 cursor-pointer"
        >
          My Orders
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
        <span className="font-mono font-bold text-zinc-900">{odCode}</span>
      </nav>

      {/* Two-Column Flipkart-Style Order Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Main Order & Live Vertical Tracking Card */}
        <div className="lg:col-span-8 bg-white border border-zinc-200 rounded-xl shadow-xs overflow-hidden">
          {/* Card Header */}
          <div className="px-6 py-4 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-3 bg-zinc-50/70">
            <div>
              <h1 className="font-sans text-base sm:text-lg font-bold text-zinc-950">
                The Magnet Order — {totalItemCount} {totalItemCount === 1 ? 'item' : 'items'}
              </h1>
              <p className="text-xs text-zinc-500 font-mono mt-0.5">
                Order ID: {order.orderNumber} ({odCode}) ·{' '}
                {order.ekartTrackingId
                  ? `Tracking ID: ${order.ekartTrackingId}`
                  : `Ref: ${order.awbNumber}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setViewAllItemsOpen(true)}
              data-testid="view-all-items-btn"
              className="text-xs sm:text-sm font-bold text-sky-600 hover:text-sky-800 hover:underline cursor-pointer"
            >
              View all ({order.items.length})
            </button>
          </div>

          {/* Primary Product Row */}
          {firstItem && (
            <div className="px-6 py-5 border-b border-zinc-200 flex items-start gap-4">
              <div className="w-20 h-20 rounded-lg overflow-hidden bg-zinc-100 border border-zinc-200 shrink-0">
                <ProductImage
                  src={
                    firstItem.imageUrl ||
                    '/src/assets/images/magnet_dryfit_tshirt_1795261556794.jpg'
                  }
                  alt={firstItem.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm sm:text-base font-bold text-zinc-950">{firstItem.name}</h2>
                <p className="text-xs text-zinc-500 mt-1">
                  Size: <strong className="text-zinc-800">{firstItem.size}</strong>
                  {firstItem.colorName && (
                    <>
                      {' '}
                      · Color: <strong className="text-zinc-800">{firstItem.colorName}</strong>
                    </>
                  )}{' '}
                  · Qty: <strong className="text-zinc-800">{firstItem.qty}</strong>
                </p>
                {order.items.length > 1 && (
                  <p className="text-xs text-sky-600 font-semibold mt-1">
                    + {order.items.length - 1} more{' '}
                    {order.items.length - 1 === 1 ? 'item' : 'items'} in this shipment
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="font-mono tabular-nums text-base sm:text-lg font-extrabold text-zinc-950">
                  {formatINR(order.totalInr)}
                </p>
                <p className="text-[11px] text-zinc-500">incl. 18% GST</p>
              </div>
            </div>
          )}

          {/* Read-Only Customer Courier Tracking Bar (Admin-Controlled URL Only) */}
          {safeAdminTrackingUrl ? (
            <div className="px-6 py-4 bg-zinc-950 text-white flex flex-wrap items-center justify-between gap-4 border-b-2 border-yellow-400">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded bg-yellow-400 text-zinc-950 text-[10px] font-extrabold uppercase tracking-wider">
                    {order.courierPartner && !/ekart/i.test(order.courierPartner)
                      ? order.courierPartner
                      : 'Courier Dispatch'}
                  </span>
                  {order.ekartTrackingId && (
                    <span className="font-mono text-sm font-bold">{order.ekartTrackingId}</span>
                  )}
                </div>
                <p className="text-xs text-zinc-300">
                  Current Status: <strong className="text-white">{order.status}</strong>
                  {order.deliveryOtp && order.status !== 'Delivered' && (
                    <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/10 font-mono text-yellow-400">
                      <KeyRound className="w-3 h-3" aria-hidden="true" />
                      OTP: {order.deliveryOtp}
                    </span>
                  )}
                </p>
              </div>
              <a
                href={safeAdminTrackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="customer-track-package-btn"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-yellow-400 text-zinc-950 text-xs font-extrabold hover:bg-yellow-300 transition-colors whitespace-nowrap"
              >
                <Truck className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Track Package</span>
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              </a>
            </div>
          ) : (
            <div
              data-testid="customer-preparing-dispatch-status"
              className="px-6 py-3.5 bg-zinc-50 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-2 text-xs"
            >
              <div className="flex items-center gap-2 text-zinc-700 font-semibold">
                <Package className="w-4 h-4 text-sky-600 shrink-0" aria-hidden="true" />
                <span>{getCustomerNoTrackingStatusLabel(order.status)}</span>
              </div>
              {order.ekartTrackingId && (
                <span className="text-[11px] font-mono font-semibold text-zinc-600">
                  Tracking ID: {order.ekartTrackingId}
                </span>
              )}
            </div>
          )}

          {/* Vertical Green Delivery Progress Stepper */}
          <div className="px-6 py-6 space-y-5">
            {order.status === 'Order Placed — Awaiting Store Approval' && (
              <div className="p-3.5 rounded-lg bg-sky-50 border border-sky-200 text-xs text-sky-900">
                <strong>Order Placed — Awaiting Store Approval:</strong> {OWNER_NAME} is reviewing
                your order at The Magnet Warehouse. Once approved and dispatched, your courier
                tracking link will appear here.
              </div>
            )}

            {order.status === 'Payment Verification Pending' && (
              <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                <strong>Payment Verification Pending:</strong> UTR{' '}
                <span className="font-mono font-semibold">{order.utrNumber}</span> is being verified
                against <span className="font-mono">{settings.merchantUpiId}</span>. Dispatch begins
                right after store approval.
              </div>
            )}

            {/* 4-Digit Delivery OTP Verification Box */}
            {order.ekartTrackingId && order.status !== 'Delivered' && (
              <section
                data-testid="order-otp-verification-panel"
                className="p-4 rounded-xl bg-sky-50/70 border border-sky-200 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-zinc-950">
                    <ShieldCheck className="w-4 h-4 text-sky-600 shrink-0" aria-hidden="true" />
                    <span>Delivery OTP Verification</span>
                  </div>
                  {order.ekartExecutiveName && (
                    <span className="text-[11px] text-zinc-600 font-medium">
                      Executive: <strong className="text-zinc-900">{order.ekartExecutiveName}</strong>
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-700 leading-relaxed">
                  Enter the 4-digit delivery OTP for shipment{' '}
                  <span className="font-mono font-semibold text-zinc-900">{order.ekartTrackingId}</span>{' '}
                  to confirm doorstep handover and update the order status to{' '}
                  <strong className="text-emerald-700">Delivered</strong>.
                </p>

                {otpError && (
                  <div
                    role="alert"
                    data-testid="order-otp-error"
                    className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 font-medium"
                  >
                    {otpError}
                  </div>
                )}

                <form
                  onSubmit={(e) => void handleVerifyDeliveryOtp(e)}
                  className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
                >
                  <label htmlFor="order-delivery-otp-input" className="sr-only">
                    4-digit Delivery OTP
                  </label>
                  <input
                    id="order-delivery-otp-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    autoComplete="one-time-code"
                    value={otpInput}
                    onChange={(e) => {
                      setOtpError(null);
                      setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 4));
                    }}
                    placeholder="4-digit OTP"
                    aria-label="4-digit Delivery OTP"
                    data-testid="order-delivery-otp-input"
                    className="sm:w-44 px-3.5 py-2.5 rounded-lg border border-zinc-300 bg-white font-mono text-sm font-bold tracking-[0.3em] text-center text-zinc-950 focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/15"
                  />
                  <button
                    type="submit"
                    disabled={otpSubmitting || otpInput.length !== 4}
                    data-testid="order-verify-confirm-delivery-btn"
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{otpSubmitting ? 'Verifying OTP...' : 'Verify & Confirm Delivery'}</span>
                  </button>
                </form>
              </section>
            )}

            {order.ekartTrackingId && order.status === 'Delivered' && (
              <div
                data-testid="order-otp-verified-badge"
                className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center gap-2.5 text-xs text-emerald-900 font-semibold"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                <span>
                  {otpNotice ||
                    `Delivery OTP verified for ${order.ekartTrackingId} — Delivery confirmed in the order management system.`}
                </span>
              </div>
            )}

            <ol data-testid="vertical-delivery-stepper" className="relative space-y-6">
              {stepperNodes.map((node, idx) => {
                const isLast = idx === stepperNodes.length - 1;
                const nextCompleted = !isLast && stepperNodes[idx + 1].completed;
                return (
                  <li key={node.stage} className="relative flex items-start gap-4">
                    {/* Vertical Connecting Line */}
                    {!isLast && (
                      <span
                        aria-hidden="true"
                        className={`absolute left-[11px] top-6 w-0.5 h-[calc(100%+12px)] ${
                          node.completed && nextCompleted ? 'bg-emerald-600' : 'bg-zinc-200'
                        }`}
                      />
                    )}

                    {/* Circular Checkmark Node */}
                    <span
                      className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                        node.completed
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-white border-2 border-zinc-300 text-transparent'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" aria-hidden="true" />
                    </span>

                    <div className="flex-1 min-w-0 pb-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p
                          className={`text-sm font-semibold ${
                            node.completed ? 'text-zinc-950' : 'text-zinc-400'
                          }`}
                        >
                          {node.label}
                        </p>
                        {node.timestamp && (
                          <span className="text-xs text-zinc-500 font-mono tabular-nums">
                            {node.timestamp}
                          </span>
                        )}
                      </div>
                      <p
                        className={`text-xs mt-0.5 ${
                          node.completed ? 'text-zinc-600' : 'text-zinc-400'
                        }`}
                      >
                        {node.completed ? `${node.hubLocation} — ${node.detail}` : 'Scheduled'}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>

            {/* See All Updates Button */}
            <div className="pt-2 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setAllUpdatesOpen(true)}
                data-testid="see-all-updates-btn"
                className="inline-flex items-center gap-1 text-sm font-bold text-sky-600 hover:text-sky-800 cursor-pointer"
              >
                <span>See All Updates</span>
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
              <span className="text-xs text-zinc-500 inline-flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-sky-600" aria-hidden="true" />
                <span>
                  {order.courierPartner && !/ekart/i.test(order.courierPartner)
                    ? order.courierPartner
                    : 'The Magnet Store Dispatch'}
                </span>
              </span>
            </div>
          </div>

          {/* Card Footer: Chat with us */}
          <div className="px-6 py-4 border-t border-zinc-200 bg-zinc-50/70 flex items-center justify-between gap-4">
            <p className="text-xs text-zinc-600">
              Need help with delivery, sizing, or GST invoice?
            </p>
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              data-testid="chat-with-us-btn"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-900 text-xs sm:text-sm font-bold hover:border-zinc-950 transition-colors cursor-pointer whitespace-nowrap"
            >
              <MessageCircle className="w-4 h-4 text-sky-600" aria-hidden="true" />
              <span>Chat with us</span>
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: 2 Stacked Cards (Delivery details + Price details) */}
        <div className="lg:col-span-4 space-y-5">
          {/* Card 1: Delivery details */}
          <section
            data-testid="delivery-details-card"
            className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs space-y-4"
          >
            <h2 className="text-sm font-bold text-zinc-950 pb-3 border-b border-zinc-100">
              Delivery details
            </h2>
            <div className="space-y-3.5 text-xs sm:text-sm">
              <div className="flex items-start gap-3">
                <Home className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="text-zinc-700 leading-relaxed">
                  <p className="font-semibold text-zinc-950">Home / Delivery Address</p>
                  <p className="mt-0.5">
                    {order.shippingAddress}, {order.city}, {order.state} —{' '}
                    <span className="font-mono font-medium">{order.pincode}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 pt-3 border-t border-zinc-100">
                <User className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="text-zinc-700">
                  <p className="font-semibold text-zinc-950">{order.customerName}</p>
                  <p className="font-mono text-xs text-zinc-600 mt-0.5">{order.customerPhone}</p>
                </div>
              </div>
            </div>
          </section>

          {/* Card 2: Price details */}
          <section
            data-testid="price-details-card"
            className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs space-y-4"
          >
            <h2 className="text-sm font-bold text-zinc-950 pb-3 border-b border-zinc-100">
              Price details
            </h2>

            <div className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between text-zinc-600">
                <span>Listing price</span>
                <span className="font-mono tabular-nums text-zinc-500 line-through">
                  {formatINR(listingTotal)}
                </span>
              </div>

              <div className="flex items-center justify-between text-zinc-700">
                <span>Selling price</span>
                <span className="font-mono tabular-nums font-medium text-zinc-950">
                  {formatINR(order.subtotalInr)}
                </span>
              </div>

              {discountInr > 0 && (
                <div className="flex items-center justify-between text-emerald-700">
                  <span>Instant / Drop Discount</span>
                  <span className="font-mono tabular-nums font-medium">
                    − {formatINR(discountInr)}
                  </span>
                </div>
              )}

              {/* Expandable 18% GST & Shipping Fees */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setFeesExpanded((prev) => !prev)}
                  className="w-full flex items-center justify-between text-zinc-600 hover:text-zinc-950 cursor-pointer"
                >
                  <span className="inline-flex items-center gap-1">
                    <span>18% GST &amp; Shipping fees</span>
                    {feesExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                  </span>
                  <span className="font-mono tabular-nums text-zinc-950">
                    {formatINR(feesAndTaxTotal)}
                  </span>
                </button>

                {feesExpanded && (
                  <div className="mt-2 pl-3 border-l-2 border-zinc-200 space-y-1 text-xs text-zinc-500">
                    <div className="flex justify-between">
                      <span>18% GST (CGST 9% + SGST 9%)</span>
                      <span className="font-mono tabular-nums">{formatINR(order.gstInr)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Courier Shipping</span>
                      <span className="font-mono tabular-nums">
                        {order.shippingInr === 0 ? 'Free' : formatINR(order.shippingInr)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-zinc-200 text-base font-bold text-zinc-950">
                <span>Total amount</span>
                <span className="font-mono tabular-nums text-zinc-950">
                  {formatINR(order.totalInr)}
                </span>
              </div>
            </div>

            {/* Paid By Row */}
            <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200 space-y-1 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-zinc-500">Paid By</span>
                <span
                  data-testid="order-paid-by"
                  className="font-semibold text-zinc-950 font-mono text-right"
                >
                  {paidByLabel}
                </span>
              </div>
              {order.utrNumber && (
                <div className="flex items-center justify-between gap-2 text-zinc-600">
                  <span>UTR / Transaction ID</span>
                  <span className="font-mono font-semibold text-zinc-950">{order.utrNumber}</span>
                </div>
              )}
              {!order.utrNumber && order.paymentReference && (
                <div className="flex items-center justify-between gap-2 text-zinc-600">
                  <span>Payment Ref</span>
                  <span className="font-mono font-semibold text-zinc-950">
                    {order.paymentReference}
                  </span>
                </div>
              )}
            </div>

            {/* Full-Width Download Invoice CTA */}
            <button
              type="button"
              onClick={() => downloadRetailTaxInvoiceHtml(order, settings)}
              data-testid="download-invoice-btn"
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-zinc-950 text-yellow-400 text-sm font-bold hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>Download GST Invoice</span>
            </button>
          </section>
        </div>
      </div>

      {/* Modal 1: View All Items */}
      {viewAllItemsOpen && (
        <div
          className="fixed inset-0 z-50 bg-zinc-950/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="All items in this order"
          data-testid="view-all-items-modal"
        >
          <div className="bg-white rounded-xl max-w-lg w-full p-6 space-y-4 border border-zinc-200 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <h3 className="text-base font-bold text-zinc-950">
                Items in {order.orderNumber} ({totalItemCount})
              </h3>
              <button
                type="button"
                onClick={() => setViewAllItemsOpen(false)}
                aria-label="Close items list"
                className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ul className="divide-y divide-zinc-100 max-h-80 overflow-y-auto">
              {order.items.map((item, idx) => (
                <li key={`${item.productId}-${idx}`} className="py-3 flex items-center gap-3.5">
                  <div className="w-14 h-14 rounded-lg overflow-hidden bg-zinc-100 border border-zinc-200 shrink-0">
                    <ProductImage
                      src={
                        item.imageUrl ||
                        '/src/assets/images/magnet_dryfit_tshirt_1795261556794.jpg'
                      }
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-zinc-950 truncate">{item.name}</p>
                    <p className="text-xs text-zinc-500">
                      Size {item.size} {item.colorName ? `· ${item.colorName}` : ''} · Qty {item.qty}
                    </p>
                  </div>
                  <span className="font-mono tabular-nums text-sm font-bold text-zinc-950">
                    {formatINR(item.unitPrice * item.qty)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Modal 2: See All Updates (Full Hub & Warehouse Scan Timeline) */}
      {allUpdatesOpen && (
        <div
          className="fixed inset-0 z-50 bg-zinc-950/60 flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label="Detailed courier hub updates"
          data-testid="all-updates-modal"
        >
          <div className="bg-white w-full max-w-md h-full flex flex-col shadow-2xl border-l border-zinc-200">
            <div className="px-6 py-4 bg-zinc-950 text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-yellow-400">Shipment Updates</h3>
                <p className="text-xs font-mono text-zinc-300 mt-0.5">
                  {order.courierPartner && !/ekart/i.test(order.courierPartner)
                    ? order.courierPartner
                    : 'The Magnet Dispatch'}{' '}
                  · {order.ekartTrackingId || order.awbNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAllUpdatesOpen(false)}
                aria-label="Close shipment updates"
                className="p-2 rounded-lg text-zinc-300 hover:bg-zinc-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {safeAdminTrackingUrl && (
                <a
                  href={safeAdminTrackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-4 rounded-lg bg-zinc-950 text-yellow-400 text-xs font-bold flex items-center justify-center gap-2 hover:bg-zinc-800 transition-colors"
                >
                  <Truck className="w-4 h-4" aria-hidden="true" />
                  <span>Open Courier Tracking Link</span>
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </a>
              )}

              <ol className="space-y-6">
                {fullTimeline.map((ev, idx) => (
                  <li key={ev.id || idx} className="relative flex items-start gap-3.5">
                    {idx < fullTimeline.length - 1 && (
                      <span
                        aria-hidden="true"
                        className="absolute left-[9px] top-5 w-0.5 h-[calc(100%+16px)] bg-emerald-600"
                      />
                    )}
                    <span className="relative z-10 w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-3 h-3 stroke-[2.5]" aria-hidden="true" />
                    </span>
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold text-zinc-950">{ev.title}</p>
                      <p className="text-xs font-semibold text-sky-600">{ev.hubLocation}</p>
                      {ev.detail && <p className="text-xs text-zinc-600">{ev.detail}</p>}
                      <p className="text-[11px] font-mono text-zinc-400">
                        {formatShortTimestamp(ev.timestamp)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Built-in Support / WhatsApp Quick-Chat Drawer (Kanth Rebel) */}
      {chatOpen && (
        <div
          className="fixed inset-0 z-50 bg-zinc-950/60 flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label="The Magnet Order Support Chat"
          data-testid="support-chat-drawer"
        >
          <div className="bg-white w-full max-w-md h-full flex flex-col shadow-2xl border-l border-zinc-200">
            <div className="px-5 py-4 bg-zinc-950 text-white flex items-center justify-between border-b-2 border-yellow-400">
              <div>
                <h3 className="text-sm font-bold text-yellow-400">
                  The Magnet Support · {OWNER_NAME}
                </h3>
                <p className="text-[11px] text-sky-400 font-mono">
                  Order {order.orderNumber} · +91 {settings.merchantMobile}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                aria-label="Close support chat"
                className="p-1.5 rounded-lg text-white hover:bg-zinc-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-zinc-50">
              {chatMessages.map((m, idx) => (
                <div
                  key={idx}
                  className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    m.from === 'user'
                      ? 'ml-auto bg-zinc-950 text-yellow-400 font-medium'
                      : 'bg-white border border-zinc-200 text-zinc-800'
                  }`}
                >
                  {m.text}
                </div>
              ))}

              <div className="pt-2 space-y-1.5">
                <p className="text-[11px] font-bold text-zinc-500">Quick Questions</p>
                <div className="flex flex-wrap gap-1.5">
                  {SUPPORT_TOPICS.map((topic) => (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => handleSendQuickChat(topic)}
                      className="px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-xs text-zinc-700 hover:border-zinc-950 hover:text-zinc-950 cursor-pointer text-left"
                    >
                      {topic}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-zinc-200 bg-white space-y-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendQuickChat(chatInput);
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type your query about this order..."
                  className="flex-1 px-3 py-2 text-xs border border-zinc-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
                <button
                  type="submit"
                  aria-label="Send message"
                  className="px-3 py-2 rounded-lg bg-zinc-950 text-yellow-400 hover:bg-zinc-800 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>

              <a
                href={buildWhatsAppSupportUrl({
                  orderNumber: order.orderNumber,
                  customerName: order.customerName,
                  topic: chatMessages.filter((m) => m.from === 'user').slice(-1)[0]?.text,
                  merchantMobile: settings.merchantMobile,
                })}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="support-whatsapp-link"
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800"
              >
                <MessageCircle className="w-4 h-4" aria-hidden="true" />
                <span>WhatsApp {OWNER_NAME} (+91 {settings.merchantMobile})</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
