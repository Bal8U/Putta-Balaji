export type ApparelCategory =
  | 'Dry-Fit Tees'
  | 'Compression Wear'
  | 'Track Pants & Joggers'
  | 'Streetwear Hoodies'
  | 'Co-Ord Sets'
  | 'Team Jerseys';

export type StoreDepartment =
  | 'All'
  | 'Sports Wear'
  | 'Gym & Training'
  | 'Trendy Fashions'
  | 'Team Kits'
  | 'Offer Zone';

export type ApparelSize = 'S' | 'M' | 'L' | 'XL' | 'XXL';

export type OrderStatus =
  | 'Order Placed — Awaiting Store Approval'
  | 'Payment Verification Pending'
  | 'Order Confirmed'
  | 'Handed Over to Ekart'
  | 'Packed & Shipped'
  | 'Out for Delivery'
  | 'Delivered'
  | 'Pending'
  | 'Approved / Quote Sent'
  | 'In Production';

export type PaymentMethod = 'UPI QR' | 'Razorpay Online' | 'Cash on Delivery';

export type FabricType =
  | 'Dry-Fit Micro Mesh'
  | '4-Way Lycra Stretch'
  | 'Heavyweight 360 GSM Fleece'
  | '100% Combed Cotton';

export type BulkApparelType =
  | 'Bulk Team Jersey / Custom Sports Kit'
  | 'Techno Sports Dry-Fit Gym T-Shirt'
  | 'Compression Athletic Tee'
  | 'Men\'s Track Pants & Joggers'
  | 'Oversized Streetwear Hoodie';

export type ShippingSpeed = 'Standard' | 'Express';

export interface Product {
  id: number;
  sku: string;
  name: string;
  category: ApparelCategory;
  department: Exclude<StoreDepartment, 'All'>;
  description: string;
  fabric: string;
  listingPriceInr: number;
  priceInr: number;
  rating: number;
  ratingCount: number;
  stock: number;
  sizes: ApparelSize[];
  colorName: string;
  colorHex: string;
  imageUrl: string;
  featured: boolean;
  createdAt?: string;
}

export interface CartItem {
  productId: number;
  sku: string;
  name: string;
  category: ApparelCategory;
  size: ApparelSize;
  colorName: string;
  qty: number;
  listingPrice?: number;
  unitPrice: number;
  imageUrl: string;
}

export interface RetailOrderItem {
  productId: number;
  name: string;
  size: ApparelSize;
  colorName?: string;
  qty: number;
  listingPrice?: number;
  unitPrice: number;
  imageUrl?: string;
}

export interface OrderTrackingEvent {
  id: string;
  stage: 'Order Confirmed' | 'Packed & Shipped' | 'Out for Delivery' | 'Delivered';
  title: string;
  hubLocation: string;
  timestamp: string;
  detail?: string;
}

export interface RetailOrder {
  id: number;
  orderNumber: string;
  userUid?: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: string;
  city: string;
  state: string;
  pincode: string;
  paymentMethod: PaymentMethod;
  utrNumber?: string | null;
  paymentReference?: string | null;
  items: RetailOrderItem[];
  listingTotalInr: number;
  discountInr: number;
  subtotalInr: number;
  gstInr: number;
  shippingInr: number;
  totalInr: number;
  awbNumber?: string | null;
  ekartTrackingId?: string | null;
  trackingUrl?: string | null;
  deliveryOtp?: string | null;
  ekartExecutiveName?: string | null;
  ekartExecutivePhone?: string | null;
  courierPartner?: string;
  trackingEvents: OrderTrackingEvent[];
  status: OrderStatus;
  createdAt: string;
}

export interface SizeMatrix {
  S: number;
  M: number;
  L: number;
  XL: number;
  XXL?: number;
}

export interface BulkCalculationInput {
  apparelType: BulkApparelType;
  fabric: FabricType;
  sizes: SizeMatrix;
  customPrinting: boolean;
  shippingSpeed: ShippingSpeed;
}

export interface BulkCalculationResult {
  totalQuantity: number;
  baseApparelPrice: number;
  fabricModifier: number;
  effectiveUnitPrice: number;
  baseCost: number;
  printingFeePerUnit: number;
  printingCost: number;
  grossSubtotal: number;
  discountPercent: number;
  discountAmount: number;
  discountedSubtotal: number;
  gstRate: number;
  gstAmount: number;
  shippingFee: number;
  grandTotal: number;
  meetsMinimum: boolean;
  minimumUnits: number;
  nextTierUnits: number | null;
  nextTierPercent: number | null;
}

export interface BulkQuote {
  id: number;
  quoteNumber: string;
  userUid?: string | null;
  businessName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  gstin?: string | null;
  apparelType: BulkApparelType;
  fabric: FabricType;
  sizeMatrix: SizeMatrix;
  totalQuantity: number;
  customPrinting: boolean;
  logoUrl?: string | null;
  shippingSpeed: ShippingSpeed;
  unitPriceInr: number;
  baseCostInr: number;
  printingCostInr: number;
  discountPercent: number;
  discountAmountInr: number;
  discountedSubtotalInr: number;
  gstInr: number;
  shippingFeeInr: number;
  estimatedTotalInr: number;
  utrNumber?: string | null;
  advancePaidInr: number;
  notes?: string | null;
  status: OrderStatus;
  createdAt: string;
}

export interface AdminDashboardSummary {
  totalSalesInr: number;
  retailSalesInr: number;
  approvedBulkValueInr: number;
  activeBulkOrdersCount: number;
  pendingEstimatesCount: number;
  pendingPaymentVerificationsCount: number;
  totalProductsCount: number;
  lowStockCount: number;
  monthlySales: Array<{
    month: string;
    retailInr: number;
    wholesaleInr: number;
  }>;
}

export interface PaymentSettings {
  merchantUpiId: string;
  merchantMobile: string;
  brandName: string;
  defaultTrackingBaseUrl: string;
  updatedAt?: string;
}
