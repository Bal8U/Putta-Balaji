import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAutoFillTrackingUrl,
  buildEkartTimeline,
  DEFAULT_COURIER_TRACKING_BASE_URL,
  generateDeliveryOtp,
  generateEkartTrackingId,
  getCustomerNoTrackingStatusLabel,
  isValidEkartTrackingId,
  sanitizeExternalTrackingUrl,
  verifyDeliveryOtp,
} from './ekart';
import type { RetailOrder } from '../types';

const SAMPLE_ORDER: RetailOrder = {
  id: 10,
  orderNumber: 'TM-ORD-4021',
  customerName: 'Vikram Rao',
  customerEmail: 'vikram@example.in',
  customerPhone: '+91 98480 11223',
  shippingAddress: 'Plot 14, Sports Enclave',
  city: 'Bhuvanagiri',
  state: 'Telangana',
  pincode: '508115',
  paymentMethod: 'UPI QR',
  utrNumber: '432518902341',
  items: [
    {
      productId: 1,
      name: 'Techno Sports Dry-Fit Gym T-Shirt',
      size: 'L',
      qty: 2,
      listingPrice: 999,
      unitPrice: 599,
    },
  ],
  listingTotalInr: 1998,
  discountInr: 800,
  subtotalInr: 1198,
  gstInr: 216,
  shippingInr: 149,
  totalInr: 1563,
  awbNumber: 'EKRT8492017462',
  ekartTrackingId: 'EKRT8492017462',
  deliveryOtp: '4829',
  ekartExecutiveName: 'Raju Kumar',
  ekartExecutivePhone: '+91 98480 41290',
  courierPartner: 'Ekart Logistics',
  trackingEvents: [],
  status: 'Out for Delivery',
  createdAt: '2026-11-20T09:00:00.000Z',
};

test('generateEkartTrackingId generates EKRT followed by 10 digits', () => {
  for (let i = 0; i < 10; i += 1) {
    const id = generateEkartTrackingId();
    assert.equal(isValidEkartTrackingId(id), true);
    assert.match(id, /^EKRT\d{10}$/);
  }
  assert.equal(isValidEkartTrackingId('VLX123456'), false);
});

test('generateDeliveryOtp and verifyDeliveryOtp enforce exact 4-digit OTP match', () => {
  const otp = generateDeliveryOtp();
  assert.match(otp, /^\d{4}$/);
  assert.equal(verifyDeliveryOtp('4829', '4829'), true);
  assert.equal(verifyDeliveryOtp('4829', '4820'), false);
  assert.equal(verifyDeliveryOtp('4829', '482'), false);
  assert.equal(verifyDeliveryOtp(null, '4829'), false);
});

test('buildEkartTimeline builds 6 generic courier stages without Ekart branding and highlights Out for Delivery progress', () => {
  const timeline = buildEkartTimeline(SAMPLE_ORDER);
  assert.equal(timeline.length, 6);
  assert.equal(timeline[0].title, 'Shipment Created by The Magnet (Kanth)');
  assert.equal(timeline[1].title, 'Picked Up by Courier Partner');
  assert.equal(timeline[2].title, 'In Transit — Regional Hub (Hyderabad)');
  assert.equal(timeline[3].title, 'Reached Nearest Delivery Hub');
  assert.equal(timeline[4].title, 'Out for Delivery');
  assert.equal(timeline[5].title, 'Delivered');

  for (const node of timeline) {
    assert.equal(/ekart/i.test(node.title), false);
    assert.equal(/ekart/i.test(node.hubLocation), false);
    assert.equal(/ekart/i.test(node.detail), false);
  }

  // Out for Delivery means stages 0..4 are completed, stage 5 (Delivered) is pending
  assert.equal(timeline[4].completed, true);
  assert.equal(timeline[4].isCurrent, true);
  assert.equal(timeline[5].completed, false);
});

test('sanitizeExternalTrackingUrl allows http/https and rejects unsafe protocols', () => {
  assert.equal(
    sanitizeExternalTrackingUrl('https://track.delhivery.com/waybill/AWB8492017462'),
    'https://track.delhivery.com/waybill/AWB8492017462',
  );
  assert.equal(sanitizeExternalTrackingUrl('javascript:alert(1)'), null);
  assert.equal(sanitizeExternalTrackingUrl('data:text/html,<h1>x</h1>'), null);
  assert.equal(sanitizeExternalTrackingUrl('not-a-url'), null);
  assert.equal(sanitizeExternalTrackingUrl(''), null);
});

test('buildAutoFillTrackingUrl builds valid courier URLs from configured custom presets and returns null when blank', () => {
  assert.equal(DEFAULT_COURIER_TRACKING_BASE_URL, '');
  assert.equal(buildAutoFillTrackingUrl(DEFAULT_COURIER_TRACKING_BASE_URL, 'AWB8492017462'), null);
  assert.equal(
    buildAutoFillTrackingUrl('https://track.delhivery.com/waybill', 'DLV992011'),
    'https://track.delhivery.com/waybill/DLV992011',
  );
  assert.equal(
    buildAutoFillTrackingUrl('https://courier.example.com/track?id=', 'AWB123'),
    'https://courier.example.com/track?id=AWB123',
  );
  assert.equal(buildAutoFillTrackingUrl('https://track.delhivery.com/waybill/', '   '), null);
});

test('getCustomerNoTrackingStatusLabel returns preparing-for-dispatch messaging when URL is unset', () => {
  assert.equal(
    getCustomerNoTrackingStatusLabel('Order Confirmed'),
    'Order Confirmed — Preparing for Dispatch',
  );
  assert.equal(
    getCustomerNoTrackingStatusLabel('Delivered'),
    'Delivered',
  );
});
