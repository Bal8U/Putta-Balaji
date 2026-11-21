import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  ExternalLink,
  MessageCircle,
  Minus,
  Plus,
  QrCode,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react';
import type { CartItem, PaymentMethod, RetailOrder } from '../types';
import { calculateCartTotals, formatINR, RETAIL_FREE_SHIPPING_THRESHOLD } from '../utils/pricing';
import {
  buildWhatsAppOrderConfirmationUrl,
  DEFAULT_MERCHANT_MOBILE,
  generateDraftOrderId,
  triggerDirectWhatsAppNotification,
} from '../utils/upi';
import { submitRetailOrder } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { usePaymentSettings } from '../context/PaymentSettingsContext';
import { ProductImage } from './ProductImage';
import { UpiQrPaymentPanel } from './UpiQrPaymentPanel';

export type CartDrawerStep = 'cart' | 'checkout' | 'upi-pay' | 'confirmed';

interface CartDrawerProps {
  open: boolean;
  initialStep?: 'cart' | 'checkout';
  onClose: () => void;
  items: CartItem[];
  onUpdateQty: (productId: number, size: CartItem['size'], delta: number) => void;
  onRemoveItem: (productId: number, size: CartItem['size']) => void;
  onClearCart: () => void;
  onOrderComplete: (order: RetailOrder) => void;
  onViewOrderDetails?: (orderNumber: string) => void;
}

export function CartDrawer({
  open,
  initialStep = 'cart',
  onClose,
  items,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  onOrderComplete,
  onViewOrderDetails,
}: CartDrawerProps) {
  const { profile } = useAuth();
  const { settings } = usePaymentSettings();
  const [step, setStep] = useState<CartDrawerStep>(initialStep);
  const [draftOrderId, setDraftOrderId] = useState<string>(() => generateDraftOrderId('TM-ORD'));
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('Telangana');
  const [pincode, setPincode] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI QR');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<RetailOrder | null>(null);
  const [whatsappNotifyUrl, setWhatsappNotifyUrl] = useState<string | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setConfirmedOrder(null);
      setWhatsappNotifyUrl(null);
      setStep(items.length === 0 ? 'cart' : initialStep);
      setDraftOrderId(generateDraftOrderId('TM-ORD'));
      setError(null);
    }
    wasOpenRef.current = open;
  }, [open, initialStep, items.length]);

  useEffect(() => {
    if (profile) {
      setCustomerName((prev) => prev || profile.fullName || '');
      setCustomerEmail((prev) => prev || profile.email || '');
    }
  }, [profile]);

  if (!open) return null;

  const totals = calculateCartTotals(items);

  const handleClose = () => {
    if (step === 'confirmed') {
      setStep('cart');
      setConfirmedOrder(null);
      setWhatsappNotifyUrl(null);
    }
    setError(null);
    onClose();
  };

  const validateShipping = (): boolean => {
    if (
      !customerName.trim() ||
      !customerEmail.trim() ||
      !customerPhone.trim() ||
      !shippingAddress.trim() ||
      !city.trim() ||
      !stateName.trim() ||
      !pincode.trim()
    ) {
      setError('Please complete all required delivery details before continuing.');
      return false;
    }

    if (!/^\d{6}$/.test(pincode.trim())) {
      setError('Please enter a valid 6-digit Indian PIN code.');
      return false;
    }

    return true;
  };

  const finalizeOrder = async (method: PaymentMethod, utrNumber?: string) => {
    setError(null);
    setSubmitting(true);
    try {
      const order = await submitRetailOrder({
        orderNumber: draftOrderId,
        customerName,
        customerEmail,
        customerPhone,
        shippingAddress,
        city,
        state: stateName,
        pincode,
        paymentMethod: method,
        utrNumber,
        items: items.map((i) => ({
          productId: i.productId,
          size: i.size,
          qty: i.qty,
        })),
      });
      const waTargetMobile = settings.merchantMobile || DEFAULT_MERCHANT_MOBILE;
      const waUrl = buildWhatsAppOrderConfirmationUrl(order, waTargetMobile);
      setWhatsappNotifyUrl(waUrl);
      setConfirmedOrder(order);
      setStep('confirmed');
      onClearCart();
      onOrderComplete(order);
      // Directly launch pre-filled "Order Confirmed" WhatsApp message to +91 9963225798
      triggerDirectWhatsAppNotification(waUrl);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validateShipping()) return;

    if (paymentMethod === 'UPI QR') {
      setStep('upi-pay');
      return;
    }

    await finalizeOrder(paymentMethod);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/45 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="Shopping bag and UPI payment checkout"
    >
      <div className="w-full max-w-lg bg-white h-full flex flex-col shadow-2xl border-l border-slate-200">
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold text-slate-900">
              {step === 'cart'
                ? 'Shopping Bag'
                : step === 'checkout'
                ? 'Delivery & Payment'
                : step === 'upi-pay'
                ? 'Scan & Pay via UPI QR'
                : 'Order Received'}
            </h2>
            {step !== 'confirmed' && (
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                {totals.itemCount} {totals.itemCount === 1 ? 'item' : 'items'} · 18% GST invoice included
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close shopping bag"
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 'confirmed' && confirmedOrder ? (
            <div data-testid="order-confirmation-receipt" className="space-y-6 py-3">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-zinc-950 text-white border-b-2 border-yellow-400">
                <CheckCircle2 className="w-6 h-6 text-yellow-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-sm font-bold text-yellow-400">
                    Order #{confirmedOrder.orderNumber} Confirmed — Sent to +91{' '}
                    {settings.merchantMobile || DEFAULT_MERCHANT_MOBILE}
                  </p>
                  <p className="text-xs text-zinc-300 mt-1">
                    {confirmedOrder.paymentMethod === 'UPI QR'
                      ? `UTR ${confirmedOrder.utrNumber} recorded. Order confirmation has been triggered for Kanth (Rebel) on WhatsApp (+91 ${settings.merchantMobile || DEFAULT_MERCHANT_MOBILE}) for dispatch.`
                      : `Your order is saved at The Magnet Warehouse and confirmation has been triggered directly to Kanth (Rebel) on WhatsApp (+91 ${settings.merchantMobile || DEFAULT_MERCHANT_MOBILE}).`}
                  </p>
                </div>
              </div>

              {whatsappNotifyUrl && (
                <a
                  href={whatsappNotifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="order-confirmed-whatsapp-btn"
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold transition-colors flex items-center justify-center gap-2 shadow-xs"
                >
                  <MessageCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>
                    Send Order Confirmed on WhatsApp (+91{' '}
                    {settings.merchantMobile || DEFAULT_MERCHANT_MOBILE})
                  </span>
                </a>
              )}

              <div className="border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="text-xs text-slate-500 space-y-1">
                  <div>
                    <strong className="text-slate-800">Deliver To:</strong>{' '}
                    {confirmedOrder.customerName}, {confirmedOrder.shippingAddress},{' '}
                    {confirmedOrder.city}, {confirmedOrder.state} — {confirmedOrder.pincode}
                  </div>
                  <div>
                    <strong className="text-slate-800">Payment Method:</strong>{' '}
                    {confirmedOrder.paymentMethod}
                  </div>
                  {confirmedOrder.utrNumber && (
                    <div>
                      <strong className="text-slate-800">UPI UTR Number:</strong>{' '}
                      <span className="font-mono font-semibold text-sky-700">
                        {confirmedOrder.utrNumber}
                      </span>
                    </div>
                  )}
                  <div>
                    <strong className="text-slate-800">Order Status:</strong>{' '}
                    <span className="font-semibold text-slate-900">{confirmedOrder.status}</span>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-3 space-y-2 text-sm">
                  {confirmedOrder.items.map((item, idx) => (
                    <div key={`${item.productId}-${idx}`} className="flex justify-between gap-2">
                      <span className="text-slate-700">
                        {item.name} ({item.size}) × {item.qty}
                      </span>
                      <span className="font-mono tabular-nums text-slate-900">
                        {formatINR(item.unitPrice * item.qty)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-slate-200 pt-3 space-y-1.5 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <span className="font-mono tabular-nums">{formatINR(confirmedOrder.subtotalInr)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>18% GST</span>
                    <span className="font-mono tabular-nums">{formatINR(confirmedOrder.gstInr)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Shipping</span>
                    <span className="font-mono tabular-nums">
                      {confirmedOrder.shippingInr === 0 ? 'Free' : formatINR(confirmedOrder.shippingInr)}
                    </span>
                  </div>
                  <div className="flex justify-between text-base font-semibold text-sky-700 pt-2 border-t border-slate-100">
                    <span>Total Amount</span>
                    <span className="font-mono tabular-nums">{formatINR(confirmedOrder.totalInr)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2.5">
                {onViewOrderDetails && (
                  <button
                    type="button"
                    onClick={() => {
                      const orderNum = confirmedOrder.orderNumber;
                      handleClose();
                      onViewOrderDetails(orderNum);
                    }}
                    className="w-full py-3 rounded-lg bg-zinc-950 text-yellow-400 text-sm font-bold hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>View Order Details &amp; Tracking</span>
                    <ExternalLink className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleClose}
                  className={`w-full py-3 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                    onViewOrderDetails
                      ? 'border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50'
                      : 'bg-zinc-950 text-yellow-400 hover:bg-zinc-800'
                  }`}
                >
                  Continue Shopping
                </button>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12 space-y-3">
              <ShoppingBag className="w-10 h-10 text-slate-300" aria-hidden="true" />
              <p className="text-base font-semibold text-slate-900">Your shopping bag is empty</p>
              <p className="text-sm text-slate-500 max-w-xs">
                Click Buy Now or Add to Bag on any garment to pay instantly via dynamic UPI QR Code
                or Cash on Delivery.
              </p>
              <button
                type="button"
                onClick={handleClose}
                className="mt-2 px-5 py-2.5 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 cursor-pointer"
              >
                Browse Collection
              </button>
            </div>
          ) : step === 'upi-pay' ? (
            <UpiQrPaymentPanel
              orderId={draftOrderId}
              amountInr={totals.totalInr}
              label="Total Payable (incl. 18% GST)"
              submitting={submitting}
              error={error}
              onBack={() => {
                setError(null);
                setStep('checkout');
              }}
              onConfirmPayment={(utr) => finalizeOrder('UPI QR', utr)}
            />
          ) : step === 'cart' ? (
            <div className="space-y-5">
              {totals.amountToFreeShipping > 0 ? (
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
                  Add{' '}
                  <span className="font-mono tabular-nums font-semibold text-sky-700">
                    {formatINR(totals.amountToFreeShipping)}
                  </span>{' '}
                  more for free Pan-India delivery (orders above{' '}
                  {formatINR(RETAIL_FREE_SHIPPING_THRESHOLD)}).
                </div>
              ) : (
                <div className="p-3.5 rounded-lg bg-sky-50 border border-sky-200 text-xs text-sky-900 font-medium">
                  Free Pan-India shipping unlocked on your order.
                </div>
              )}

              <ul className="divide-y divide-slate-200">
                {items.map((item) => (
                  <li key={`${item.productId}-${item.size}`} className="py-4 flex gap-4">
                    <div className="w-20 h-20 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                      <ProductImage
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900 truncate">{item.name}</p>
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.productId, item.size)}
                          aria-label={`Remove ${item.name} size ${item.size}`}
                          className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Size {item.size} · {item.colorName}
                      </p>
                      <div className="flex items-center justify-between mt-3">
                        <div className="inline-flex items-center border border-slate-200 rounded-lg">
                          <button
                            type="button"
                            onClick={() => onUpdateQty(item.productId, item.size, -1)}
                            aria-label={`Decrease quantity for ${item.name}`}
                            className="p-1.5 text-slate-600 hover:bg-slate-50 cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="px-3 text-xs font-mono tabular-nums font-medium text-slate-900">
                            {item.qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => onUpdateQty(item.productId, item.size, 1)}
                            aria-label={`Increase quantity for ${item.name}`}
                            className="p-1.5 text-slate-600 hover:bg-slate-50 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <span className="font-mono tabular-nums text-sm font-semibold text-slate-900">
                          {formatINR(item.unitPrice * item.qty)}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <form id="retail-checkout-form" onSubmit={handleCheckoutSubmit} className="space-y-4">
              {error && (
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800"
                >
                  {error}
                </div>
              )}

              {/* Mini Order Items Recap */}
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                <div className="flex items-center justify-between font-semibold text-slate-800">
                  <span>Order Summary ({totals.itemCount} items)</span>
                  <button
                    type="button"
                    onClick={() => setStep('cart')}
                    className="text-sky-700 hover:underline cursor-pointer"
                  >
                    Edit Bag
                  </button>
                </div>
                {items.map((item) => (
                  <div
                    key={`${item.productId}-${item.size}`}
                    className="flex justify-between text-slate-600"
                  >
                    <span className="truncate pr-2">
                      {item.name} ({item.size}) × {item.qty}
                    </span>
                    <span className="font-mono tabular-nums shrink-0">
                      {formatINR(item.unitPrice * item.qty)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-700">Delivery Information</h3>
                <div>
                  <label htmlFor="checkout-name" className="block text-xs font-medium text-slate-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    id="checkout-name"
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. Kavita Sharma"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="checkout-email" className="block text-xs font-medium text-slate-700 mb-1">
                      Email Address *
                    </label>
                    <input
                      id="checkout-email"
                      type="email"
                      required
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="kavita@example.in"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                    />
                  </div>
                  <div>
                    <label htmlFor="checkout-phone" className="block text-xs font-medium text-slate-700 mb-1">
                      Phone Number *
                    </label>
                    <input
                      id="checkout-phone"
                      type="tel"
                      required
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="+91 98201 00000"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="checkout-address" className="block text-xs font-medium text-slate-700 mb-1">
                    Street Address *
                  </label>
                  <input
                    id="checkout-address"
                    type="text"
                    required
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                    placeholder="House / Flat, Street, Landmark"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="checkout-city" className="block text-xs font-medium text-slate-700 mb-1">
                      City *
                    </label>
                    <input
                      id="checkout-city"
                      type="text"
                      required
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Jaipur"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                    />
                  </div>
                  <div>
                    <label htmlFor="checkout-state" className="block text-xs font-medium text-slate-700 mb-1">
                      State *
                    </label>
                    <input
                      id="checkout-state"
                      type="text"
                      required
                      value={stateName}
                      onChange={(e) => setStateName(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                    />
                  </div>
                  <div>
                    <label htmlFor="checkout-pincode" className="block text-xs font-medium text-slate-700 mb-1">
                      PIN Code *
                    </label>
                    <input
                      id="checkout-pincode"
                      type="text"
                      required
                      maxLength={6}
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="302001"
                      className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                    />
                  </div>
                </div>
              </div>

              {/* Payment Method Selector */}
              <div className="space-y-3 pt-3 border-t border-slate-200">
                <h3 className="text-xs font-semibold text-slate-700">Payment Method</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {(['UPI QR', 'Razorpay Online', 'Cash on Delivery'] as PaymentMethod[]).map(
                    (method) => {
                      const selected = paymentMethod === method;
                      return (
                        <button
                          key={method}
                          type="button"
                          onClick={() => setPaymentMethod(method)}
                          className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                            selected
                              ? 'border-sky-600 bg-sky-50 text-sky-950'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <div className="text-xs font-semibold flex items-center gap-1.5">
                            {method === 'UPI QR' && (
                              <QrCode className="w-3.5 h-3.5 text-sky-600 shrink-0" aria-hidden="true" />
                            )}
                            {method === 'Razorpay Online' && (
                              <CreditCard
                                className="w-3.5 h-3.5 text-sky-600 shrink-0"
                                aria-hidden="true"
                              />
                            )}
                            <span>
                              {method === 'UPI QR'
                                ? 'UPI QR Code'
                                : method === 'Razorpay Online'
                                ? 'Razorpay'
                                : 'Cash on Delivery'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {method === 'UPI QR'
                              ? 'GPay, PhonePe, Paytm'
                              : method === 'Razorpay Online'
                              ? 'Cards, NetBanking, UPI'
                              : 'Pay cash at doorstep'}
                          </div>
                        </button>
                      );
                    },
                  )}
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Drawer Footer Summary & Actions */}
        {(step === 'cart' || step === 'checkout') && items.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 space-y-3">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-mono tabular-nums">{formatINR(totals.subtotalInr)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>18% GST</span>
                <span className="font-mono tabular-nums">{formatINR(totals.gstInr)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Shipping</span>
                <span className="font-mono tabular-nums">
                  {totals.shippingInr === 0 ? 'Free' : formatINR(totals.shippingInr)}
                </span>
              </div>
              <div className="flex justify-between text-base font-bold text-zinc-950 pt-2 border-t border-zinc-200">
                <span>Total Payable</span>
                <span className="font-mono tabular-nums text-zinc-950">
                  {formatINR(totals.totalInr)}
                </span>
              </div>
            </div>

            {step === 'cart' ? (
              <button
                type="button"
                onClick={() => setStep('checkout')}
                className="w-full py-3 rounded-lg bg-zinc-950 text-yellow-400 text-sm font-extrabold hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Proceed to Checkout
              </button>
            ) : (
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setStep('cart')}
                  className="px-4 py-3 rounded-lg border border-zinc-300 bg-white text-zinc-700 text-sm font-semibold hover:bg-zinc-50 cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="submit"
                  form="retail-checkout-form"
                  disabled={submitting}
                  className="flex-1 py-3 rounded-lg bg-zinc-950 text-yellow-400 text-sm font-extrabold hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-60"
                >
                  {submitting
                    ? 'Processing...'
                    : paymentMethod === 'UPI QR'
                    ? `Generate UPI QR · ${formatINR(totals.totalInr)}`
                    : paymentMethod === 'Razorpay Online'
                    ? `Pay via Razorpay · ${formatINR(totals.totalInr)}`
                    : `Place COD Order · ${formatINR(totals.totalInr)}`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
