import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import type {
  ApparelSize,
  OrderTrackingEvent,
  RetailOrderItem,
  SizeMatrix,
} from '../types.ts';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  fullName: text('full_name').notNull().default(''),
  role: text('role').notNull().default('customer'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  sku: text('sku').notNull().unique(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  department: text('department').notNull().default('Men'),
  description: text('description').notNull(),
  fabric: text('fabric').notNull().default('100% Cotton'),
  listingPriceInr: integer('listing_price_inr').notNull().default(0),
  priceInr: integer('price_inr').notNull(),
  rating: text('rating').notNull().default('4.4'),
  ratingCount: integer('rating_count').notNull().default(142),
  stock: integer('stock').notNull().default(0),
  sizes: jsonb('sizes').$type<ApparelSize[]>().notNull(),
  colorName: text('color_name').notNull(),
  colorHex: text('color_hex').notNull(),
  imageUrl: text('image_url').notNull(),
  featured: boolean('featured').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  orderNumber: text('order_number').notNull().unique(),
  userUid: text('user_uid'),
  customerName: text('customer_name').notNull(),
  customerEmail: text('customer_email').notNull(),
  customerPhone: text('customer_phone').notNull(),
  shippingAddress: text('shipping_address').notNull(),
  city: text('city').notNull(),
  state: text('state').notNull(),
  pincode: text('pincode').notNull(),
  paymentMethod: text('payment_method').notNull().default('UPI QR'),
  utrNumber: text('utr_number'),
  paymentReference: text('payment_reference'),
  items: jsonb('items').$type<RetailOrderItem[]>().notNull(),
  listingTotalInr: integer('listing_total_inr').notNull().default(0),
  discountInr: integer('discount_inr').notNull().default(0),
  subtotalInr: integer('subtotal_inr').notNull(),
  gstInr: integer('gst_inr').notNull(),
  shippingInr: integer('shipping_inr').notNull().default(0),
  totalInr: integer('total_inr').notNull(),
  awbNumber: text('awb_number'),
  ekartTrackingId: text('ekart_tracking_id'),
  trackingUrl: text('tracking_url'),
  deliveryOtp: text('delivery_otp'),
  ekartExecutiveName: text('ekart_executive_name'),
  ekartExecutivePhone: text('ekart_executive_phone'),
  courierPartner: text('courier_partner').notNull().default('The Magnet Store Dispatch'),
  trackingEvents: jsonb('tracking_events').$type<OrderTrackingEvent[]>().notNull().default([]),
  status: text('status').notNull().default('Order Placed — Awaiting Store Approval'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const bulkQuotes = pgTable('bulk_quotes', {
  id: serial('id').primaryKey(),
  quoteNumber: text('quote_number').notNull().unique(),
  userUid: text('user_uid'),
  businessName: text('business_name').notNull(),
  contactName: text('contact_name').notNull(),
  contactEmail: text('contact_email').notNull(),
  contactPhone: text('contact_phone').notNull(),
  gstin: text('gstin'),
  apparelType: text('apparel_type').notNull(),
  fabric: text('fabric').notNull(),
  sizeMatrix: jsonb('size_matrix').$type<SizeMatrix>().notNull(),
  totalQuantity: integer('total_quantity').notNull(),
  customPrinting: boolean('custom_printing').notNull().default(false),
  logoUrl: text('logo_url'),
  shippingSpeed: text('shipping_speed').notNull().default('Standard'),
  unitPriceInr: integer('unit_price_inr').notNull(),
  baseCostInr: integer('base_cost_inr').notNull(),
  printingCostInr: integer('printing_cost_inr').notNull().default(0),
  discountPercent: integer('discount_percent').notNull().default(0),
  discountAmountInr: integer('discount_amount_inr').notNull().default(0),
  discountedSubtotalInr: integer('discounted_subtotal_inr').notNull(),
  gstInr: integer('gst_inr').notNull(),
  shippingFeeInr: integer('shipping_fee_inr').notNull(),
  estimatedTotalInr: integer('estimated_total_inr').notNull(),
  utrNumber: text('utr_number'),
  advancePaidInr: integer('advance_paid_inr').notNull().default(0),
  notes: text('notes'),
  status: text('status').notNull().default('Pending'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const paymentSettings = pgTable('payment_settings', {
  id: serial('id').primaryKey(),
  merchantUpiId: text('merchant_upi_id').notNull().default('balajigoud11@axl'),
  merchantMobile: text('merchant_mobile').notNull().default('9963225798'),
  brandName: text('brand_name').notNull().default('The Magnet'),
  defaultTrackingBaseUrl: text('default_tracking_base_url').notNull().default(''),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  orders: many(orders),
  bulkQuotes: many(bulkQuotes),
}));

export const ordersRelations = relations(orders, ({ one }) => ({
  user: one(users, {
    fields: [orders.userUid],
    references: [users.uid],
  }),
}));

export const bulkQuotesRelations = relations(bulkQuotes, ({ one }) => ({
  user: one(users, {
    fields: [bulkQuotes.userUid],
    references: [users.uid],
  }),
}));
