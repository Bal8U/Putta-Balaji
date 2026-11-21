import type { OrderStatus, OrderTrackingEvent, PaymentSettings, RetailOrder } from '../types';
import { formatINR, RETAIL_FREE_SHIPPING_THRESHOLD } from './pricing';
import {
  DEFAULT_BRAND_NAME,
  DEFAULT_MERCHANT_MOBILE,
  DEFAULT_MERCHANT_UPI_ID,
  OWNER_INSTAGRAM_HANDLE,
  OWNER_NAME,
  formatIndianWhatsAppNumber,
} from './upi';

export const FLIPKART_TRACKING_STAGES: Array<OrderTrackingEvent['stage']> = [
  'Order Confirmed',
  'Packed & Shipped',
  'Out for Delivery',
  'Delivered',
];

export function computeListingPrice(priceInr: number, storedListingPrice?: number): number {
  if (storedListingPrice && storedListingPrice > priceInr) {
    return Math.round(storedListingPrice);
  }
  return Math.round((priceInr * 1.38) / 10) * 10;
}

export function getDiscountPercent(listingPriceInr: number, sellingPriceInr: number): number {
  if (!Number.isFinite(listingPriceInr) || listingPriceInr <= sellingPriceInr || sellingPriceInr <= 0) {
    return 0;
  }
  return Math.round(((listingPriceInr - sellingPriceInr) / listingPriceInr) * 100);
}

export interface PincodeDeliveryResult {
  valid: boolean;
  pincode: string;
  serviceable: boolean;
  regionLabel: string;
  deliveryDayLabel: string;
  isFree: boolean;
  shippingNote: string;
  codAvailable: boolean;
  message: string;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function checkPincodeDelivery(
  rawPincode: string,
  orderAmountInr = 0,
  nowDate = new Date(),
): PincodeDeliveryResult {
  const pincode = rawPincode.replace(/\D/g, '').slice(0, 6);
  if (!/^[1-9]\d{5}$/.test(pincode)) {
    return {
      valid: false,
      pincode,
      serviceable: false,
      regionLabel: '',
      deliveryDayLabel: '',
      isFree: false,
      shippingNote: '',
      codAvailable: false,
      message: 'Please enter a valid 6-digit Indian PIN code (e.g. 508115).',
    };
  }

  let daysToAdd = 4;
  let regionLabel = 'Pan-India Express Dispatch Hub';

  if (pincode === '508115') {
    daysToAdd = 3;
    regionLabel = 'Bhuvanagiri / Yadagirigutta Hub (Telangana)';
  } else if (pincode.startsWith('50') || pincode.startsWith('51')) {
    daysToAdd = 3;
    regionLabel = 'Hyderabad Dispatch Hub (Telangana)';
  } else if (pincode.startsWith('40') || pincode.startsWith('11') || pincode.startsWith('56')) {
    daysToAdd = 2;
    regionLabel = 'Metro Express Dispatch Hub';
  }

  const eta = new Date(nowDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
  const weekday = pincode === '508115' ? 'Wednesday' : WEEKDAYS[eta.getDay()];
  const dateText = eta.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const isFree = orderAmountInr >= RETAIL_FREE_SHIPPING_THRESHOLD || pincode === '508115';
  const shippingNote = isFree ? 'Free' : '₹149';

  return {
    valid: true,
    pincode,
    serviceable: true,
    regionLabel,
    deliveryDayLabel: `${weekday}, ${dateText}`,
    isFree,
    shippingNote,
    codAvailable: true,
    message: `Delivery by ${weekday}, ${shippingNote}`,
  };
}

export function getCompletedStageCount(status: OrderStatus): number {
  switch (status) {
    case 'Delivered':
      return 4;
    case 'Out for Delivery':
      return 3;
    case 'Handed Over to Ekart':
    case 'Packed & Shipped':
    case 'In Production':
      return 2;
    case 'Order Confirmed':
    case 'Order Placed — Awaiting Store Approval':
    case 'Approved / Quote Sent':
    case 'Pending':
    case 'Payment Verification Pending':
    default:
      return 1;
  }
}

export interface VerticalStepperNode {
  stage: OrderTrackingEvent['stage'];
  label: string;
  completed: boolean;
  timestamp: string | null;
  hubLocation: string;
  detail: string;
}

export function formatShortTimestamp(isoOrStr: string): string {
  const dt = new Date(isoOrStr);
  if (Number.isNaN(dt.getTime())) return isoOrStr;
  return dt.toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function buildVerticalStepper(order: RetailOrder): VerticalStepperNode[] {
  const completedCount = getCompletedStageCount(order.status);
  const baseDate = new Date(order.createdAt || Date.now());
  const eventByStage = new Map<OrderTrackingEvent['stage'], OrderTrackingEvent>();

  for (const ev of order.trackingEvents || []) {
    eventByStage.set(ev.stage, ev);
  }

  const destHub =
    order.pincode === '508115'
      ? 'Bhuvanagiri / Yadagirigutta Hub'
      : `${order.city || 'Destination'} Local Delivery Hub`;

  const safeCourier =
    order.courierPartner && !/ekart/i.test(order.courierPartner)
      ? order.courierPartner
      : 'Express Courier';

  const defaults: Record<
    OrderTrackingEvent['stage'],
    { hub: string; detail: string; offsetHours: number }
  > = {
    'Order Confirmed': {
      hub: 'The Magnet Warehouse — Telangana',
      detail:
        order.status === 'Order Placed — Awaiting Store Approval'
          ? 'Order placed and awaiting store approval from Kanth (Rebel) for dispatch.'
          : order.status === 'Payment Verification Pending'
          ? 'Order received; verifying 12-digit UPI UTR payment before dispatch.'
          : 'Approved by The Magnet (Kanth) and packed for courier pickup.',
      offsetHours: 0,
    },
    'Packed & Shipped': {
      hub: 'Hyderabad Dispatch Hub',
      detail: order.ekartTrackingId
        ? `Dispatched via ${safeCourier} (Tracking ID: ${order.ekartTrackingId}).`
        : `Packed at The Magnet Warehouse and assigned to ${safeCourier}.`,
      offsetHours: 18,
    },
    'Out for Delivery': {
      hub: destHub,
      detail: `Delivery executive out for delivery from ${destHub}. Share 4-digit OTP on arrival.`,
      offsetHours: 46,
    },
    Delivered: {
      hub: `${order.city}, ${order.state} - ${order.pincode}`,
      detail: `OTP verified and delivered safely to ${order.customerName}.`,
      offsetHours: 54,
    },
  };

  return FLIPKART_TRACKING_STAGES.map((stage, idx) => {
    const completed = idx < completedCount;
    const customEv = eventByStage.get(stage);
    const def = defaults[stage];
    const fallbackTs = new Date(baseDate.getTime() + def.offsetHours * 3600 * 1000).toISOString();

    return {
      stage,
      label: stage,
      completed,
      timestamp: completed ? formatShortTimestamp(customEv?.timestamp || fallbackTs) : null,
      hubLocation: customEv?.hubLocation || def.hub,
      detail: customEv?.detail || def.detail,
    };
  });
}

export function buildFullTrackingTimeline(order: RetailOrder): OrderTrackingEvent[] {
  if (Array.isArray(order.trackingEvents) && order.trackingEvents.length > 0) {
    return order.trackingEvents;
  }

  const stepper = buildVerticalStepper(order);
  const completedSteps = stepper.filter((n) => n.completed);
  const events: OrderTrackingEvent[] = [];

  for (const step of completedSteps) {
    events.push({
      id: `auto-${step.stage}`,
      stage: step.stage,
      title: step.stage,
      hubLocation: step.hubLocation,
      timestamp: step.timestamp || formatShortTimestamp(order.createdAt),
      detail: step.detail,
    });
    if (step.stage === 'Packed & Shipped') {
      events.push({
        id: 'auto-transit-hub',
        stage: 'Packed & Shipped',
        title: 'In Transit — Regional Hub Scan',
        hubLocation:
          order.pincode === '508115'
            ? 'Hyderabad Hub → Bhuvanagiri / Yadagirigutta Hub'
            : `Jaipur Sorting Hub → ${order.city} Regional Hub`,
        timestamp: step.timestamp || formatShortTimestamp(order.createdAt),
        detail: `AWB ${order.awbNumber || `VLX${order.id}88421`} scanned and dispatched via surface express.`,
      });
    }
  }

  return events;
}

export function formatFlipkartOrderId(orderNumber: string): string {
  const clean = orderNumber.trim().toUpperCase();
  if (clean.startsWith('OD')) return clean;
  const digits = clean.replace(/[^A-Z0-9]/g, '');
  return `OD${digits}`;
}

export function buildWhatsAppSupportUrl(params: {
  orderNumber: string;
  customerName?: string;
  topic?: string;
  merchantMobile?: string;
}): string {
  const waNumber = formatIndianWhatsAppNumber(params.merchantMobile || DEFAULT_MERCHANT_MOBILE);
  const lines = [
    `Hello ${OWNER_NAME} (${DEFAULT_BRAND_NAME} — Sports Wear & Trendy Fashions),`,
    `I need assistance with Order ${params.orderNumber} (${formatFlipkartOrderId(params.orderNumber)}).`,
  ];
  if (params.customerName) {
    lines.push(`Customer: ${params.customerName}`);
  }
  if (params.topic) {
    lines.push(`Query: ${params.topic}`);
  }
  return `https://wa.me/${waNumber}?text=${encodeURIComponent(lines.join('\n'))}`;
}

export function buildRetailTaxInvoiceHtml(
  order: RetailOrder,
  payment?: Partial<PaymentSettings>,
): string {
  const merchantUpiId = (payment?.merchantUpiId || DEFAULT_MERCHANT_UPI_ID).trim();
  const merchantMobile = (payment?.merchantMobile || DEFAULT_MERCHANT_MOBILE).trim();
  const dateStr = new Date(order.createdAt).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const listingTotal =
    order.listingTotalInr > order.subtotalInr
      ? order.listingTotalInr
      : Math.round((order.subtotalInr * 1.38) / 10) * 10;
  const discount = Math.max(0, listingTotal - order.subtotalInr);
  const paidByLabel =
    order.paymentMethod === 'UPI QR'
      ? `UPI QR (${merchantUpiId})`
      : order.paymentMethod;

  const itemRows = order.items
    .map(
      (item) => `
      <tr>
        <td>${item.name} (Size ${item.size}${item.colorName ? ` · ${item.colorName}` : ''})</td>
        <td class="num">${item.qty}</td>
        <td class="num">${formatINR(item.unitPrice)}</td>
        <td class="num">${formatINR(item.unitPrice * item.qty)}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Tax Invoice — ${order.orderNumber} | ${DEFAULT_BRAND_NAME}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #09090b; margin: 0; padding: 32px; background: #f8fafc; }
    .sheet { max-width: 780px; margin: 0 auto; background: #fff; border: 1px solid #e4e4e7; border-radius: 12px; padding: 36px; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #09090b; padding-bottom: 18px; margin-bottom: 22px; }
    .brand { font-size: 26px; font-weight: 800; color: #09090b; margin: 0; letter-spacing: -0.02em; }
    .tagline { font-size: 11px; font-weight: 700; color: #0284c7; letter-spacing: 0.08em; margin: 2px 0 0; text-transform: uppercase; }
    .muted { color: #52525b; font-size: 13px; margin: 4px 0 0; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 22px; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px; }
    th, td { text-align: left; padding: 10px 6px; border-bottom: 1px solid #e4e4e7; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    .summary { margin-top: 20px; margin-left: auto; width: 320px; font-size: 14px; }
    .summary-row { display: flex; justify-content: space-between; padding: 6px 0; }
    .total { border-top: 2px solid #09090b; margin-top: 8px; padding-top: 10px; font-size: 17px; font-weight: 700; color: #09090b; }
    .footer { margin-top: 28px; font-size: 12px; color: #52525b; border-top: 1px solid #e4e4e7; padding-top: 14px; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div>
        <h1 class="brand">${DEFAULT_BRAND_NAME}</h1>
        <p class="tagline">SPORTS WEAR &amp; TRENDY FASHIONS</p>
        <p class="muted">Owner: ${OWNER_NAME} · Telangana · GSTIN: 36AABCM9021K1Z8</p>
        <p class="muted">WhatsApp Support: +91 ${merchantMobile} · Instagram: ${OWNER_INSTAGRAM_HANDLE} · UPI: ${merchantUpiId}</p>
      </div>
      <div style="text-align:right">
        <div style="font-weight:700;font-size:15px;">GST TAX INVOICE</div>
        <div class="muted">Order: ${order.orderNumber} (${formatFlipkartOrderId(order.orderNumber)})</div>
        <div class="muted">Date: ${dateStr} · Status: ${order.status}</div>
      </div>
    </div>
    <div class="grid">
      <div>
        <strong>Billing &amp; Delivery Address</strong><br/>
        ${order.customerName}<br/>
        ${order.shippingAddress}<br/>
        ${order.city}, ${order.state} - ${order.pincode}<br/>
        Phone: ${order.customerPhone} · ${order.customerEmail}
      </div>
      <div>
        <strong>Payment &amp; Dispatch Details</strong><br/>
        Paid By: ${paidByLabel}<br/>
        ${order.utrNumber ? `UTR / Transaction ID: ${order.utrNumber}<br/>` : ''}
        Courier Partner: ${order.courierPartner && !/ekart/i.test(order.courierPartner) ? order.courierPartner : 'Express Courier'}<br/>
        ${order.ekartTrackingId ? `Tracking ID: ${order.ekartTrackingId}` : `AWB: ${order.awbNumber || 'Pending Dispatch'}`}
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Garment Description</th>
          <th class="num">Qty</th>
          <th class="num">Unit Price</th>
          <th class="num">Amount (INR)</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
    <div class="summary">
      <div class="summary-row"><span>Listing Price (MRP)</span><span>${formatINR(listingTotal)}</span></div>
      <div class="summary-row" style="color:#15803d;"><span>Instant Savings / Discount</span><span>− ${formatINR(discount)}</span></div>
      <div class="summary-row"><span>Selling Price (Taxable)</span><span>${formatINR(order.subtotalInr)}</span></div>
      <div class="summary-row"><span>18% GST (CGST 9% + SGST 9%)</span><span>${formatINR(order.gstInr)}</span></div>
      <div class="summary-row"><span>Shipping &amp; Handling</span><span>${order.shippingInr === 0 ? 'Free' : formatINR(order.shippingInr)}</span></div>
      <div class="summary-row total"><span>Total Paid (INR)</span><span>${formatINR(order.totalInr)}</span></div>
    </div>
    <div class="footer">
      Computer-generated GST tax invoice issued by ${DEFAULT_BRAND_NAME} — Sports Wear &amp; Trendy Fashions (Owner: ${OWNER_NAME}, WhatsApp: +91 ${merchantMobile}).
    </div>
  </div>
</body>
</html>`;
}

export function downloadRetailTaxInvoiceHtml(
  order: RetailOrder,
  payment?: Partial<PaymentSettings>,
): void {
  const html = buildRetailTaxInvoiceHtml(order, payment);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `TaxInvoice-${order.orderNumber}-TheMagnet.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
