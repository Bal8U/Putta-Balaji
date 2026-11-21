import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBulkEstimate,
  calculateCartTotals,
  filterProducts,
  formatINR,
} from './pricing';
import type { Product } from '../types';

test('formatINR formats Indian currency with en-IN grouping', () => {
  assert.equal(formatINR(1499), '₹1,499');
  assert.equal(formatINR(131675), '₹1,31,675');
});

test('calculateBulkEstimate enforces 50-unit minimum and Bulk Team Jersey ₹450/unit base price', () => {
  const belowMin = calculateBulkEstimate({
    apparelType: 'Bulk Team Jersey / Custom Sports Kit',
    fabric: 'Dry-Fit Micro Mesh',
    sizes: { S: 10, M: 10, L: 10, XL: 10 },
    customPrinting: false,
    shippingSpeed: 'Standard',
  });
  assert.equal(belowMin.totalQuantity, 40);
  assert.equal(belowMin.meetsMinimum, false);
  assert.equal(belowMin.discountPercent, 0);

  const atMin = calculateBulkEstimate({
    apparelType: 'Bulk Team Jersey / Custom Sports Kit',
    fabric: 'Dry-Fit Micro Mesh',
    sizes: { S: 10, M: 15, L: 15, XL: 10 },
    customPrinting: false,
    shippingSpeed: 'Standard',
  });
  assert.equal(atMin.totalQuantity, 50);
  assert.equal(atMin.meetsMinimum, true);
  assert.equal(atMin.effectiveUnitPrice, 450);
  assert.equal(atMin.baseCost, 22500);
  assert.equal(atMin.discountPercent, 0);
  assert.equal(atMin.gstAmount, Math.round(22500 * 0.18));
  assert.equal(atMin.shippingFee, 850 + 50 * 4);
});

test('calculateBulkEstimate applies 10%, 15%, and 20% volume discounts, fabric delta, +₹45 printing, and 18% GST on discounted subtotal', () => {
  // 150 units -> 10% discount, 4-Way Lycra Stretch (+₹55), custom printing (+₹45)
  const tier10 = calculateBulkEstimate({
    apparelType: 'Bulk Team Jersey / Custom Sports Kit', // 450 + 55 = 505
    fabric: '4-Way Lycra Stretch',
    sizes: { S: 30, M: 50, L: 40, XL: 30 },
    customPrinting: true,
    shippingSpeed: 'Standard',
  });
  assert.equal(tier10.totalQuantity, 150);
  assert.equal(tier10.effectiveUnitPrice, 505);
  assert.equal(tier10.baseCost, 75750);
  assert.equal(tier10.printingFeePerUnit, 45);
  assert.equal(tier10.printingCost, 6750);
  assert.equal(tier10.grossSubtotal, 82500);
  assert.equal(tier10.discountPercent, 10);
  assert.equal(tier10.discountAmount, 8250);
  assert.equal(tier10.discountedSubtotal, 74250);
  assert.equal(tier10.gstAmount, 13365); // Math.round(74250 * 0.18)
  assert.equal(tier10.shippingFee, 1450); // 850 + 150*4
  assert.equal(tier10.grandTotal, 89065);

  // 500 units -> 15% discount, Express shipping
  const tier15 = calculateBulkEstimate({
    apparelType: 'Techno Sports Dry-Fit Gym T-Shirt', // 360
    fabric: 'Dry-Fit Micro Mesh',
    sizes: { S: 60, M: 180, L: 160, XL: 100 },
    customPrinting: true,
    shippingSpeed: 'Express',
  });
  assert.equal(tier15.discountPercent, 15);
  assert.equal(tier15.discountedSubtotal, 172125); // (360 + 45) * 500 * 0.85
  assert.equal(tier15.gstAmount, 30983); // Math.round(172125 * 0.18)
  assert.equal(tier15.shippingFee, 6300); // 1800 + 500*9
  assert.equal(tier15.grandTotal, 209408);

  // 1000 units -> 20% discount + admin rate override test
  const tier20 = calculateBulkEstimate({
    apparelType: 'Oversized Streetwear Hoodie', // 720 + 120 = 840
    fabric: 'Heavyweight 360 GSM Fleece',
    sizes: { S: 200, M: 300, L: 300, XL: 200 },
    customPrinting: false,
    shippingSpeed: 'Standard',
  });
  assert.equal(tier20.discountPercent, 20);
  assert.equal(tier20.effectiveUnitPrice, 840);
  assert.equal(tier20.discountedSubtotal, 672000);
  assert.equal(tier20.gstAmount, 120960);
  assert.equal(tier20.shippingFee, 4850);

  const customOverride = calculateBulkEstimate(
    {
      apparelType: 'Bulk Team Jersey / Custom Sports Kit',
      fabric: 'Dry-Fit Micro Mesh',
      sizes: { S: 20, M: 30, L: 30, XL: 20 },
      customPrinting: true,
      shippingSpeed: 'Standard',
    },
    { baseUnitPrice: 480, fabricDelta: 20 },
  );
  assert.equal(customOverride.effectiveUnitPrice, 500);
  assert.equal(customOverride.printingFeePerUnit, 45);
});

test('calculateCartTotals computes 18% GST and free shipping threshold at ₹1,999', () => {
  const belowFree = calculateCartTotals([
    {
      productId: 1,
      sku: 'TM-DRY-101',
      name: 'Techno Sports Dry-Fit Gym T-Shirt',
      category: 'Dry-Fit Tees',
      size: 'M',
      colorName: 'Midnight Black & Cyan',
      qty: 2,
      unitPrice: 599,
      imageUrl: '/x.jpg',
    },
  ]);
  assert.equal(belowFree.subtotalInr, 1198);
  assert.equal(belowFree.gstInr, Math.round(1198 * 0.18));
  assert.equal(belowFree.shippingInr, 149);
  assert.equal(belowFree.amountToFreeShipping, 801);

  const aboveFree = calculateCartTotals([
    {
      productId: 5,
      sku: 'TM-CRD-501',
      name: 'Sports Co-Ord Activewear Set',
      category: 'Co-Ord Sets',
      size: 'L',
      colorName: 'Black & Electric Gold',
      qty: 2,
      unitPrice: 1499,
      imageUrl: '/y.jpg',
    },
  ]);
  assert.equal(aboveFree.subtotalInr, 2998);
  assert.equal(aboveFree.shippingInr, 0);
  assert.equal(aboveFree.amountToFreeShipping, 0);
  assert.equal(aboveFree.totalInr, 2998 + Math.round(2998 * 0.18));
});

test('filterProducts filters accurately by category, size, color, price range, and query', () => {
  const catalog: Product[] = [
    {
      id: 1,
      sku: 'TM-DRY-101',
      name: 'Techno Sports Dry-Fit Gym T-Shirt',
      category: 'Dry-Fit Tees',
      department: 'Sports Wear',
      description: 'Breathable dry-fit',
      fabric: 'Dry-Fit Micro Mesh',
      priceInr: 599,
      listingPriceInr: 999,
      rating: 4.7,
      ratingCount: 280,
      stock: 50,
      sizes: ['S', 'M', 'L'],
      colorName: 'Midnight Black',
      colorHex: '#09090B',
      imageUrl: '/a.jpg',
      featured: true,
    },
    {
      id: 4,
      sku: 'TM-HDY-401',
      name: 'Trendy Oversized Streetwear Hoodie',
      category: 'Streetwear Hoodies',
      department: 'Trendy Fashions',
      description: 'Heavy terry hoodie',
      fabric: '320 GSM Heavy Terry Cotton',
      priceInr: 1299,
      listingPriceInr: 2199,
      rating: 4.8,
      ratingCount: 340,
      stock: 25,
      sizes: ['M', 'L', 'XL'],
      colorName: 'Electric Gold',
      colorHex: '#FACC15',
      imageUrl: '/b.jpg',
      featured: true,
    },
  ];

  const bySizeAndCat = filterProducts(catalog, {
    category: 'Dry-Fit Tees',
    size: 'S',
    colorName: 'All',
    minPrice: 200,
    maxPrice: 5000,
    query: '',
  });
  assert.equal(bySizeAndCat.length, 1);
  assert.equal(bySizeAndCat[0].sku, 'TM-DRY-101');

  const byPrice = filterProducts(catalog, {
    category: 'All',
    size: 'All',
    colorName: 'All',
    minPrice: 1000,
    maxPrice: 2000,
    query: '',
  });
  assert.equal(byPrice.length, 1);
  assert.equal(byPrice[0].sku, 'TM-HDY-401');
});
