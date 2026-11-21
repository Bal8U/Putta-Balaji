import type { OrderStatus, OrderTrackingEvent, RetailOrder } from '../types';
import { formatShortTimestamp } from './orderHelpers';

export const EKART_ORIGIN_LABEL = 'The Magnet Warehouse — Telangana';
export const DEFAULT_COURIER_NAME = 'Express Courier';
export const EKART_COURIER_NAME = DEFAULT_COURIER_NAME;
export const EKART_DEFAULT_EXECUTIVE_NAME = 'Raju Kumar';
export const EKART_DEFAULT_EXECUTIVE_PHONE = '+91 98480 41290';
export const DEFAULT_COURIER_TRACKING_BASE_URL = '';

/**
 * Validates and normalizes an external courier tracking URL.
 * Strictly allows only http: and https: protocols to prevent unsafe href injection.
 */
export function sanitizeExternalTrackingUrl(rawUrl: string | null | undefined): string | null {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    if (!parsed.hostname) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Builds a complete courier tracking URL from a base URL preset and a Tracking ID.
 */
export function buildAutoFillTrackingUrl(
  baseUrl: string | null | undefined,
  trackingId: string,
): string | null {
  const cleanId = trackingId.trim();
  if (!cleanId) return null;
  const candidateBase = (baseUrl || '').trim();
  if (!candidateBase) return null;
  const safeBase = sanitizeExternalTrackingUrl(candidateBase);
  if (!safeBase) return null;

  const needsSlash =
    !safeBase.endsWith('/') && !safeBase.endsWith('=') && !safeBase.endsWith('?');
  const joined = `${safeBase}${needsSlash ? '/' : ''}${encodeURIComponent(cleanId)}`;
  return sanitizeExternalTrackingUrl(joined);
}

/**
 * Friendly read-only customer status label shown when the Admin has not saved (or has removed) a Tracking URL.
 */
export function getCustomerNoTrackingStatusLabel(status: OrderStatus): string {
  switch (status) {
    case 'Delivered':
      return 'Delivered';
    case 'Out for Delivery':
      return 'Out for Delivery';
    case 'Packed & Shipped':
    case 'Handed Over to Ekart':
      return 'Order Confirmed — Preparing for Dispatch';
    case 'Payment Verification Pending':
      return 'Payment Verification Pending — Preparing for Dispatch';
    case 'Order Placed — Awaiting Store Approval':
      return 'Order Placed — Preparing for Dispatch';
    default:
      return 'Order Confirmed — Preparing for Dispatch';
  }
}

export type EkartStepKey =
  | 'CREATED'
  | 'PICKED_UP'
  | 'MOTHER_HUB'
  | 'DELIVERY_HUB'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED';

export interface EkartStepDefinition {
  key: EkartStepKey;
  title: string;
  defaultHub: string;
  orderStatus: OrderStatus;
  stage: OrderTrackingEvent['stage'];
}

export const EKART_TIMELINE_STEPS: EkartStepDefinition[] = [
  {
    key: 'CREATED',
    title: 'Shipment Created by The Magnet (Kanth)',
    defaultHub: EKART_ORIGIN_LABEL,
    orderStatus: 'Order Confirmed',
    stage: 'Order Confirmed',
  },
  {
    key: 'PICKED_UP',
    title: 'Picked Up by Courier Partner',
    defaultHub: EKART_ORIGIN_LABEL,
    orderStatus: 'Packed & Shipped',
    stage: 'Packed & Shipped',
  },
  {
    key: 'MOTHER_HUB',
    title: 'In Transit — Regional Hub (Hyderabad)',
    defaultHub: 'Hyderabad Dispatch Hub',
    orderStatus: 'Packed & Shipped',
    stage: 'Packed & Shipped',
  },
  {
    key: 'DELIVERY_HUB',
    title: 'Reached Nearest Delivery Hub',
    defaultHub: 'Bhuvanagiri / Yadagirigutta Hub',
    orderStatus: 'Packed & Shipped',
    stage: 'Packed & Shipped',
  },
  {
    key: 'OUT_FOR_DELIVERY',
    title: 'Out for Delivery',
    defaultHub: 'Local Delivery Station',
    orderStatus: 'Out for Delivery',
    stage: 'Out for Delivery',
  },
  {
    key: 'DELIVERED',
    title: 'Delivered',
    defaultHub: 'Customer Doorstep',
    orderStatus: 'Delivered',
    stage: 'Delivered',
  },
];

/**
 * Generates an official Ekart Tracking ID in format: EKRT + 10 digits (e.g. EKRT8492017462)
 */
export function generateEkartTrackingId(): string {
  let digits = '';
  for (let i = 0; i < 10; i += 1) {
    const d = i === 0 ? Math.floor(1 + Math.random() * 9) : Math.floor(Math.random() * 10);
    digits += String(d);
  }
  return `EKRT${digits}`;
}

export function isValidEkartTrackingId(id: string): boolean {
  return /^EKRT\d{10}$/i.test(id.trim());
}

/**
 * Generates a 4-digit numeric delivery OTP (1000–9999)
 */
export function generateDeliveryOtp(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function verifyDeliveryOtp(expectedOtp: string | null | undefined, enteredOtp: string): boolean {
  const expected = (expectedOtp || '').replace(/\D/g, '');
  const entered = enteredOtp.replace(/\D/g, '');
  return expected.length === 4 && entered.length === 4 && expected === entered;
}

export function computeExpectedDeliveryDate(createdAtIso: string, status: OrderStatus): string {
  if (status === 'Delivered') return 'Delivered';
  const base = new Date(createdAtIso || Date.now());
  const eta = new Date(base.getTime() + 4 * 24 * 60 * 60 * 1000);
  return eta.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export interface EkartTimelineNode {
  key: EkartStepKey;
  title: string;
  completed: boolean;
  isCurrent: boolean;
  hubLocation: string;
  timestamp: string | null;
  detail: string;
}

export function resolveEkartStepIndex(order: RetailOrder): number {
  const titles = (order.trackingEvents || []).map((e) => e.title.toLowerCase());
  if (order.status === 'Delivered' || titles.some((t) => t === 'delivered')) {
    return 5;
  }
  if (order.status === 'Out for Delivery' || titles.some((t) => t.includes('out for delivery'))) {
    return 4;
  }
  if (titles.some((t) => t.includes('nearest ekart') || t.includes('delivery hub'))) {
    return 3;
  }
  if (
    order.status === 'Packed & Shipped' ||
    titles.some((t) => t.includes('mother hub') || t.includes('in transit'))
  ) {
    return 2;
  }
  if (
    order.status === 'Handed Over to Ekart' ||
    order.ekartTrackingId ||
    titles.some((t) => t.includes('picked up'))
  ) {
    return 1;
  }
  return 0;
}

export function buildEkartTimeline(order: RetailOrder): EkartTimelineNode[] {
  const currentIdx = resolveEkartStepIndex(order);
  const events = order.trackingEvents || [];
  const baseMs = new Date(order.createdAt || Date.now()).getTime();
  const destHub =
    order.pincode === '508115'
      ? 'Bhuvanagiri / Yadagirigutta Hub'
      : `${order.city || 'Destination'} Delivery Hub`;
  const execName = order.ekartExecutiveName || EKART_DEFAULT_EXECUTIVE_NAME;
  const execPhone = order.ekartExecutivePhone || EKART_DEFAULT_EXECUTIVE_PHONE;

  return EKART_TIMELINE_STEPS.map((step, idx) => {
    const matchedEvent = events.find(
      (ev) =>
        ev.title.toLowerCase() === step.title.toLowerCase() ||
        (step.key === 'CREATED' && ev.title.toLowerCase().includes('shipment created')) ||
        (step.key === 'PICKED_UP' && ev.title.toLowerCase().includes('picked up')) ||
        (step.key === 'MOTHER_HUB' &&
          (ev.title.toLowerCase().includes('regional hub') ||
            ev.title.toLowerCase().includes('mother hub'))) ||
        (step.key === 'DELIVERY_HUB' && ev.title.toLowerCase().includes('delivery hub')) ||
        (step.key === 'OUT_FOR_DELIVERY' && ev.title.toLowerCase().includes('out for delivery')) ||
        (step.key === 'DELIVERED' && ev.title.toLowerCase() === 'delivered'),
    );

    const completed = idx <= currentIdx;
    const isCurrent = idx === currentIdx;
    const defaultHub =
      step.key === 'DELIVERY_HUB' || step.key === 'OUT_FOR_DELIVERY'
        ? destHub
        : step.key === 'DELIVERED'
        ? `${order.city}, ${order.state} — ${order.pincode}`
        : step.defaultHub;

    const fallbackDetail =
      step.key === 'CREATED'
        ? 'Order approved by Kanth (Rebel) and packed at The Magnet Warehouse — Telangana.'
        : step.key === 'PICKED_UP'
        ? `Picked up by courier partner (Tracking ID: ${order.ekartTrackingId || order.awbNumber || 'Pending'}).`
        : step.key === 'MOTHER_HUB'
        ? 'Shipment bagged and sorted at Hyderabad Dispatch Hub.'
        : step.key === 'DELIVERY_HUB'
        ? `Arrived at ${destHub} for final-mile assignment.`
        : step.key === 'OUT_FOR_DELIVERY'
        ? `Delivery Executive ${execName} (${execPhone}) is on the way. Share 4-digit OTP on arrival.`
        : `OTP verified and delivered safely to ${order.customerName}.`;

    const fallbackTs = new Date(baseMs + idx * 9 * 3600 * 1000).toISOString();

    return {
      key: step.key,
      title: step.title,
      completed,
      isCurrent,
      hubLocation: matchedEvent?.hubLocation || defaultHub,
      timestamp: completed ? formatShortTimestamp(matchedEvent?.timestamp || fallbackTs) : null,
      detail: matchedEvent?.detail || fallbackDetail,
    };
  });
}
