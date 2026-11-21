export const DEFAULT_MERCHANT_UPI_ID = 'balajigoud11@axl';
export const DEFAULT_MERCHANT_MOBILE = '9963225798';
export const DEFAULT_BRAND_NAME = 'The Magnet';
export const OWNER_NAME = 'Kanth (Rebel)';
export const OWNER_INSTAGRAM_HANDLE = '@Kanth_0100';
export const OWNER_INSTAGRAM_URL = 'https://instagram.com/Kanth_0100';

export function getMerchantUpiId(): string {
  const configured =
    typeof import.meta !== 'undefined' &&
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_MERCHANT_UPI_ID;
  const trimmed = (configured || '').trim();
  return trimmed || DEFAULT_MERCHANT_UPI_ID;
}

export function getMerchantMobile(): string {
  const configured =
    typeof import.meta !== 'undefined' &&
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_MERCHANT_MOBILE;
  const trimmed = (configured || '').replace(/\D/g, '').slice(-10);
  return trimmed.length === 10 ? trimmed : DEFAULT_MERCHANT_MOBILE;
}

export function buildUpiPaymentUri(params: {
  merchantUpiId?: string;
  brandName?: string;
  amountInr: number;
  orderId: string;
}): string {
  const pa = (params.merchantUpiId || DEFAULT_MERCHANT_UPI_ID).trim();
  const pn = encodeURIComponent((params.brandName || DEFAULT_BRAND_NAME).trim());
  const exactAmount = Math.max(0, Number(params.amountInr) || 0).toFixed(2);
  const cleanOrderId = params.orderId.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  const tn = encodeURIComponent(`Order_${cleanOrderId}`);
  return `upi://pay?pa=${pa}&pn=${pn}&am=${exactAmount}&cu=INR&tn=${tn}`;
}

export function formatIndianWhatsAppNumber(mobile: string): string {
  const digits = mobile.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }
  const last10 = digits.slice(-10);
  return last10.length === 10 ? `91${last10}` : `91${DEFAULT_MERCHANT_MOBILE}`;
}

export function buildWhatsAppQuoteUrl(params: {
  quoteNumber: string;
  businessName: string;
  contactName: string;
  apparelType: string;
  fabric: string;
  totalQuantity: number;
  estimatedTotalInr: number;
  merchantUpiId?: string;
  merchantMobile?: string;
}): string {
  const waNumber = formatIndianWhatsAppNumber(params.merchantMobile || DEFAULT_MERCHANT_MOBILE);
  const upiId = (params.merchantUpiId || DEFAULT_MERCHANT_UPI_ID).trim();
  const advanceInr = Math.round(params.estimatedTotalInr * 0.3);
  const formattedTotal = new Intl.NumberFormat('en-IN').format(Math.round(params.estimatedTotalInr));
  const formattedAdvance = new Intl.NumberFormat('en-IN').format(advanceInr);
  const message = [
    `Hello ${OWNER_NAME} — ${DEFAULT_BRAND_NAME} (Sports Wear & Trendy Fashions),`,
    `Sharing my Bulk Sports & Wholesale Quote Request:`,
    `Quote ID: ${params.quoteNumber}`,
    `Team / Business: ${params.businessName} (Attn: ${params.contactName})`,
    `Order: ${params.totalQuantity} units × ${params.apparelType} (${params.fabric})`,
    `Estimated Total (incl. 18% GST): ₹${formattedTotal}`,
    `30% Production Advance: ₹${formattedAdvance}`,
    `Official UPI ID: ${upiId}`,
  ].join('\n');

  return `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;
}

export function buildWhatsAppOrderConfirmationUrl(
  order: {
    orderNumber: string;
    customerName: string;
    customerPhone: string;
    shippingAddress: string;
    city: string;
    state: string;
    pincode: string;
    paymentMethod: string;
    utrNumber?: string | null;
    totalInr: number;
    items: Array<{ name: string; size: string; qty: number; unitPrice: number }>;
  },
  merchantMobile?: string,
): string {
  const waNumber = formatIndianWhatsAppNumber(merchantMobile || DEFAULT_MERCHANT_MOBILE);
  const formattedTotal = new Intl.NumberFormat('en-IN').format(Math.round(order.totalInr));
  const itemLines = order.items.map((item) => {
    const lineTotal = new Intl.NumberFormat('en-IN').format(
      Math.round(item.unitPrice * item.qty),
    );
    return `• ${item.name} (${item.size}) × ${item.qty} — ₹${lineTotal}`;
  });
  const paymentLine = order.utrNumber
    ? `Payment: ${order.paymentMethod} (UTR: ${order.utrNumber})`
    : `Payment: ${order.paymentMethod}`;

  const message = [
    `✅ ORDER CONFIRMED — ${DEFAULT_BRAND_NAME} (Sports Wear & Trendy Fashions)`,
    `Order ID: ${order.orderNumber}`,
    `Customer: ${order.customerName} (${order.customerPhone})`,
    `Delivery Address: ${order.shippingAddress}, ${order.city}, ${order.state} — ${order.pincode}`,
    `Items:`,
    ...itemLines,
    paymentLine,
    `Total Amount (incl. 18% GST): ₹${formattedTotal}`,
    `Attention: ${OWNER_NAME} — Please confirm & prepare for dispatch.`,
  ].join('\n');

  return `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;
}

export function triggerDirectWhatsAppNotification(waUrl: string): boolean {
  if (typeof document === 'undefined' || !waUrl.startsWith('https://wa.me/')) {
    return false;
  }
  try {
    const anchor = document.createElement('a');
    anchor.href = waUrl;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    return true;
  } catch {
    return false;
  }
}

export function buildWhatsAppOwnerUrl(customText?: string, merchantMobile?: string): string {
  const waNumber = formatIndianWhatsAppNumber(merchantMobile || DEFAULT_MERCHANT_MOBILE);
  const msg =
    customText ||
    `Hello ${OWNER_NAME} (${DEFAULT_BRAND_NAME} — Sports Wear & Trendy Fashions), I have a query about your sportswear & trendy fashion collection.`;
  return `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`;
}

export function normalizeUtrInput(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 12);
}

export function isValidUtrNumber(utr: string): boolean {
  return /^\d{12}$/.test(utr.trim());
}

export function isValidUpiId(upiId: string): boolean {
  return /^[a-zA-Z0-9._-]{2,}@[a-zA-Z0-9]{2,}$/.test(upiId.trim());
}

export function generateDraftOrderId(prefix: 'TM-ORD' | 'TM-BLK' = 'TM-ORD'): string {
  const num = Math.floor(3000 + Math.random() * 6999);
  return `${prefix}-${num}`;
}
