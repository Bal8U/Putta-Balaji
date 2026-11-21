import type {
  ApparelCategory,
  ApparelSize,
  BulkApparelType,
  BulkCalculationInput,
  BulkCalculationResult,
  CartItem,
  FabricType,
  Product,
} from '../types';

export const GST_RATE = 0.18;
export const RETAIL_FREE_SHIPPING_THRESHOLD = 1999;
export const RETAIL_FLAT_SHIPPING_INR = 149;
export const BULK_MIN_UNITS = 50;
export const CUSTOM_PRINTING_FEE_PER_UNIT = 45;

export const BULK_APPAREL_PRICES: Record<
  BulkApparelType,
  { unitPrice: number; leadDays: string; description: string }
> = {
  'Bulk Team Jersey / Custom Sports Kit': {
    unitPrice: 450,
    leadDays: '7–10 days',
    description: 'Full-sublimation cricket, football & club jersey + shorts kit with squad names & numbers',
  },
  'Techno Sports Dry-Fit Gym T-Shirt': {
    unitPrice: 360,
    leadDays: '5–8 days',
    description: '180 GSM quick-dry performance micro-mesh gym & marathon t-shirt',
  },
  'Compression Athletic Tee': {
    unitPrice: 420,
    leadDays: '7–10 days',
    description: '4-way stretch athletic compression base layer with flatlock seam reinforcement',
  },
  "Men's Track Pants & Joggers": {
    unitPrice: 540,
    leadDays: '8–12 days',
    description: 'Tapered tech-fleece athletic joggers with zippered pockets & drawstring waist',
  },
  'Oversized Streetwear Hoodie': {
    unitPrice: 720,
    leadDays: '10–14 days',
    description: '360 GSM drop-shoulder brushed fleece hoodie with double-lined hood',
  },
};

export const FABRIC_MODIFIERS: Record<
  FabricType,
  { delta: number; gsm: number; defaultStockMeters: number; note: string }
> = {
  'Dry-Fit Micro Mesh': {
    delta: 0,
    gsm: 180,
    defaultStockMeters: 1450,
    note: '180 GSM breathable moisture-wicking athletic knit',
  },
  '4-Way Lycra Stretch': {
    delta: 55,
    gsm: 220,
    defaultStockMeters: 820,
    note: '220 GSM pro athletic compression stretch (+₹55/unit)',
  },
  'Heavyweight 360 GSM Fleece': {
    delta: 120,
    gsm: 360,
    defaultStockMeters: 640,
    note: '360 GSM brushed streetwear fleece (+₹120/unit)',
  },
  '100% Combed Cotton': {
    delta: 20,
    gsm: 240,
    defaultStockMeters: 1100,
    note: '240 GSM bio-washed ring-spun cotton (+₹20/unit)',
  },
};

export function formatINR(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(safe);
}

export function getVolumeDiscountTier(totalQty: number): {
  percent: number;
  nextTierUnits: number | null;
  nextTierPercent: number | null;
} {
  if (totalQty >= 1000) {
    return { percent: 20, nextTierUnits: null, nextTierPercent: null };
  }
  if (totalQty >= 500) {
    return { percent: 15, nextTierUnits: 1000, nextTierPercent: 20 };
  }
  if (totalQty >= 100) {
    return { percent: 10, nextTierUnits: 500, nextTierPercent: 15 };
  }
  return { percent: 0, nextTierUnits: 100, nextTierPercent: 10 };
}

export interface BulkEstimateOverrides {
  baseUnitPrice?: number;
  fabricDelta?: number;
  printingFeePerUnit?: number;
}

export function calculateBulkEstimate(
  input: BulkCalculationInput,
  overrides?: BulkEstimateOverrides,
): BulkCalculationResult {
  const s = Math.max(0, Math.floor(Number(input.sizes.S) || 0));
  const m = Math.max(0, Math.floor(Number(input.sizes.M) || 0));
  const l = Math.max(0, Math.floor(Number(input.sizes.L) || 0));
  const xl = Math.max(0, Math.floor(Number(input.sizes.XL) || 0));
  const xxl = Math.max(0, Math.floor(Number(input.sizes.XXL) || 0));

  const totalQuantity = s + m + l + xl + xxl;
  const apparelInfo =
    BULK_APPAREL_PRICES[input.apparelType] ??
    BULK_APPAREL_PRICES['Bulk Team Jersey / Custom Sports Kit'];
  const fabricInfo = FABRIC_MODIFIERS[input.fabric] ?? FABRIC_MODIFIERS['Dry-Fit Micro Mesh'];

  const baseApparelPrice =
    overrides?.baseUnitPrice !== undefined && Number.isFinite(overrides.baseUnitPrice)
      ? Math.max(0, Math.round(overrides.baseUnitPrice))
      : apparelInfo.unitPrice;
  const fabricModifier =
    overrides?.fabricDelta !== undefined && Number.isFinite(overrides.fabricDelta)
      ? Math.round(overrides.fabricDelta)
      : fabricInfo.delta;
  const effectiveUnitPrice = Math.max(120, baseApparelPrice + fabricModifier);

  const baseCost = effectiveUnitPrice * totalQuantity;
  const printRate =
    overrides?.printingFeePerUnit !== undefined && Number.isFinite(overrides.printingFeePerUnit)
      ? Math.max(0, Math.round(overrides.printingFeePerUnit))
      : CUSTOM_PRINTING_FEE_PER_UNIT;
  const printingFeePerUnit = input.customPrinting ? printRate : 0;
  const printingCost = printingFeePerUnit * totalQuantity;
  const grossSubtotal = baseCost + printingCost;

  const tier = getVolumeDiscountTier(totalQuantity);
  const discountAmount = Math.round((grossSubtotal * tier.percent) / 100);
  const discountedSubtotal = grossSubtotal - discountAmount;
  const gstAmount = Math.round(discountedSubtotal * GST_RATE);

  let shippingFee = 0;
  if (totalQuantity > 0) {
    if (input.shippingSpeed === 'Express') {
      shippingFee = Math.min(14000, 1800 + totalQuantity * 9);
    } else {
      shippingFee = Math.min(6500, 850 + totalQuantity * 4);
    }
  }

  const grandTotal = discountedSubtotal + gstAmount + shippingFee;

  return {
    totalQuantity,
    baseApparelPrice,
    fabricModifier,
    effectiveUnitPrice,
    baseCost,
    printingFeePerUnit,
    printingCost,
    grossSubtotal,
    discountPercent: tier.percent,
    discountAmount,
    discountedSubtotal,
    gstRate: GST_RATE,
    gstAmount,
    shippingFee,
    grandTotal,
    meetsMinimum: totalQuantity >= BULK_MIN_UNITS,
    minimumUnits: BULK_MIN_UNITS,
    nextTierUnits: tier.nextTierUnits,
    nextTierPercent: tier.nextTierPercent,
  };
}

export interface RetailCartTotals {
  itemCount: number;
  subtotalInr: number;
  gstInr: number;
  shippingInr: number;
  totalInr: number;
  amountToFreeShipping: number;
}

export function calculateCartTotals(items: CartItem[]): RetailCartTotals {
  const itemCount = items.reduce((acc, item) => acc + Math.max(0, item.qty), 0);
  const subtotalInr = items.reduce(
    (acc, item) => acc + Math.max(0, item.qty) * Math.max(0, item.unitPrice),
    0,
  );
  const gstInr = Math.round(subtotalInr * GST_RATE);
  const shippingInr =
    subtotalInr === 0 || subtotalInr >= RETAIL_FREE_SHIPPING_THRESHOLD
      ? 0
      : RETAIL_FLAT_SHIPPING_INR;
  const totalInr = subtotalInr + gstInr + shippingInr;
  const amountToFreeShipping =
    subtotalInr > 0 && subtotalInr < RETAIL_FREE_SHIPPING_THRESHOLD
      ? RETAIL_FREE_SHIPPING_THRESHOLD - subtotalInr
      : 0;

  return {
    itemCount,
    subtotalInr,
    gstInr,
    shippingInr,
    totalInr,
    amountToFreeShipping,
  };
}

export interface ProductFilterCriteria {
  category: ApparelCategory | 'All';
  size: ApparelSize | 'All';
  colorName: string | 'All';
  minPrice: number;
  maxPrice: number;
  query: string;
}

export function filterProducts(products: Product[], criteria: ProductFilterCriteria): Product[] {
  const q = criteria.query.trim().toLowerCase();
  return products.filter((p) => {
    if (criteria.category !== 'All' && p.category !== criteria.category) return false;
    if (criteria.size !== 'All' && !p.sizes.includes(criteria.size)) return false;
    if (criteria.colorName !== 'All' && p.colorName !== criteria.colorName) return false;
    if (p.priceInr < criteria.minPrice) return false;
    if (criteria.maxPrice < 5000 && p.priceInr > criteria.maxPrice) return false;
    if (q) {
      const hay = `${p.name} ${p.category} ${p.fabric} ${p.colorName} ${p.sku}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
