import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUpiPaymentUri,
  buildWhatsAppOrderConfirmationUrl,
  buildWhatsAppOwnerUrl,
  buildWhatsAppQuoteUrl,
  DEFAULT_BRAND_NAME,
  DEFAULT_MERCHANT_MOBILE,
  DEFAULT_MERCHANT_UPI_ID,
  isValidUpiId,
  isValidUtrNumber,
  normalizeUtrInput,
  OWNER_INSTAGRAM_HANDLE,
  OWNER_NAME,
} from './upi';

test('default merchant UPI ID, brand name, and owner WhatsApp match The Magnet configuration', () => {
  assert.equal(DEFAULT_BRAND_NAME, 'The Magnet');
  assert.equal(DEFAULT_MERCHANT_UPI_ID, 'balajigoud11@axl');
  assert.equal(DEFAULT_MERCHANT_MOBILE, '9963225798');
  assert.equal(OWNER_NAME, 'Kanth (Rebel)');
  assert.equal(OWNER_INSTAGRAM_HANDLE, '@Kanth_0100');
});

test('buildUpiPaymentUri generates standard INR UPI deep link with exact balajigoud11@axl ID and order reference', () => {
  const uri = buildUpiPaymentUri({
    merchantUpiId: 'balajigoud11@axl',
    brandName: 'The Magnet',
    amountInr: 1758,
    orderId: 'TM-ORD-4521',
  });
  assert.equal(
    uri,
    'upi://pay?pa=balajigoud11@axl&pn=The%20Magnet&am=1758.00&cu=INR&tn=Order_TM-ORD-4521',
  );
});

test('buildWhatsAppQuoteUrl, buildWhatsAppOrderConfirmationUrl, and buildWhatsAppOwnerUrl target +91 9963225798 (Kanth Rebel)', () => {
  const url = buildWhatsAppQuoteUrl({
    quoteNumber: 'TM-BLK-8401',
    businessName: 'Rebel Fitness Club',
    contactName: 'Kiran Reddy',
    apparelType: 'Bulk Team Jersey / Custom Sports Kit',
    fabric: 'Dry-Fit Micro Mesh',
    totalQuantity: 100,
    estimatedTotalInr: 52500,
    merchantUpiId: 'balajigoud11@axl',
    merchantMobile: '9963225798',
  });
  assert.ok(url.startsWith('https://wa.me/919963225798?text='));
  assert.ok(decodeURIComponent(url).includes('TM-BLK-8401'));
  assert.ok(decodeURIComponent(url).includes('balajigoud11@axl'));

  const orderWaUrl = buildWhatsAppOrderConfirmationUrl({
    orderNumber: 'TM-ORD-7712',
    customerName: 'Rohan Verma',
    customerPhone: '9848011223',
    shippingAddress: '14-2-90 Jubilee Hills',
    city: 'Hyderabad',
    state: 'Telangana',
    pincode: '500033',
    paymentMethod: 'UPI QR',
    utrNumber: '432518902341',
    totalInr: 1414,
    items: [
      {
        name: 'Techno Sports Dry-Fit Gym T-Shirt',
        size: 'L',
        qty: 2,
        unitPrice: 599,
      },
    ],
  });
  assert.ok(orderWaUrl.startsWith('https://wa.me/919963225798?text='));
  const decoded = decodeURIComponent(orderWaUrl);
  assert.ok(decoded.includes('ORDER CONFIRMED'));
  assert.ok(decoded.includes('TM-ORD-7712'));
  assert.ok(decoded.includes('Rohan Verma'));
  assert.ok(decoded.includes('432518902341'));
  assert.ok(decoded.includes('₹1,414'));

  const ownerUrl = buildWhatsAppOwnerUrl('Hi Kanth, checking order status.');
  assert.ok(ownerUrl.startsWith('https://wa.me/919963225798?text='));
});

test('isValidUtrNumber enforces exactly 12 numeric digits and isValidUpiId validates handle format', () => {
  assert.equal(isValidUtrNumber('432518902341'), true);
  assert.equal(isValidUtrNumber('43251890234'), false);
  assert.equal(isValidUtrNumber('4325189023419'), false);
  assert.equal(isValidUtrNumber('43251890ABCD'), false);
  assert.equal(normalizeUtrInput('4325-1890-234199'), '432518902341');
  assert.equal(isValidUpiId('balajigoud11@axl'), true);
  assert.equal(isValidUpiId('invalid-upi'), false);
});
