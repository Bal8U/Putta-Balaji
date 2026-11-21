import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFullTrackingTimeline,
  buildVerticalStepper,
  buildWhatsAppSupportUrl,
  checkPincodeDelivery,
  formatFlipkartOrderId,
  getDiscountPercent,
} from './orderHelpers';
import type { RetailOrder } from '../types';

test('getDiscountPercent calculates MRP percentage off accurately', () => {
  assert.equal(getDiscountPercent(999, 599), 40);
  assert.equal(getDiscountPercent(1000, 1000), 0);
  assert.equal(getDiscountPercent(800, 1000), 0);
});

test('checkPincodeDelivery returns Delivery by Wednesday, Free for 508115 and validates invalid PINs', () => {
  const res = checkPincodeDelivery('508115', 1299);
  assert.equal(res.valid, true);
  assert.equal(res.serviceable, true);
  assert.equal(res.message, 'Delivery by Wednesday, Free');
  assert.ok(res.regionLabel.includes('Bhuvanagiri'));

  const invalid = checkPincodeDelivery('0012', 1299);
  assert.equal(invalid.valid, false);
});

test('buildVerticalStepper maps packed status to 4 Flipkart-style vertical green stages without Ekart wording', () => {
  const sampleOrder: RetailOrder = {
    id: 10,
    orderNumber: 'TM-ORD-2601',
    customerName: 'Arjun Reddy',
    customerEmail: 'arjun@example.in',
    customerPhone: '+91 98201 11223',
    shippingAddress: '14 Banjara Hills',
    city: 'Hyderabad',
    state: 'Telangana',
    pincode: '508115',
    paymentMethod: 'UPI QR',
    utrNumber: '432518902341',
    ekartTrackingId: 'AWB8492017462',
    deliveryOtp: '4829',
    courierPartner: 'Delhivery',
    items: [
      {
        productId: 1,
        name: 'Techno Sports Dry-Fit Gym T-Shirt',
        size: 'M',
        qty: 2,
        unitPrice: 599,
      },
    ],
    listingTotalInr: 1998,
    discountInr: 800,
    subtotalInr: 1198,
    gstInr: 216,
    shippingInr: 149,
    totalInr: 1563,
    trackingEvents: [],
    status: 'Packed & Shipped',
    createdAt: '2026-11-18T09:00:00.000Z',
  };

  const steps = buildVerticalStepper(sampleOrder);
  assert.equal(steps.length, 4);
  assert.equal(steps[0].completed, true);
  assert.equal(steps[1].completed, true);
  assert.equal(steps[2].completed, false);
  assert.equal(steps[3].completed, false);
  for (const s of steps) {
    assert.equal(/ekart/i.test(s.hubLocation), false);
    assert.equal(/ekart/i.test(s.detail), false);
  }

  const timeline = buildFullTrackingTimeline(sampleOrder);
  assert.ok(timeline.some((ev) => ev.hubLocation.includes('Bhuvanagiri')));
});

test('buildWhatsAppSupportUrl links to +91 9963225798 (Kanth Rebel) with Order ID context', () => {
  const url = buildWhatsAppSupportUrl({
    orderNumber: 'TM-ORD-2601',
    customerName: 'Arjun Reddy',
    topic: 'Delivery update',
  });
  assert.ok(url.startsWith('https://wa.me/919963225798?text='));
  assert.ok(decodeURIComponent(url).includes('TM-ORD-2601'));
  assert.equal(formatFlipkartOrderId('TM-ORD-2601'), 'ODTMORD2601');
});
