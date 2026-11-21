import { desc, eq, sql } from 'drizzle-orm';
import { db } from './index.ts';
import { bulkQuotes, orders, paymentSettings, products, users } from './schema.ts';
import type {
  AdminDashboardSummary,
  ApparelCategory,
  ApparelSize,
  BulkApparelType,
  BulkQuote,
  FabricType,
  OrderStatus,
  OrderTrackingEvent,
  PaymentMethod,
  PaymentSettings,
  Product,
  RetailOrder,
  ShippingSpeed,
  StoreDepartment,
} from '../types.ts';
import {
  DEFAULT_BRAND_NAME,
  DEFAULT_MERCHANT_MOBILE,
  DEFAULT_MERCHANT_UPI_ID,
} from '../utils/upi.ts';
import { computeListingPrice } from '../utils/orderHelpers.ts';
import {
  DEFAULT_COURIER_TRACKING_BASE_URL,
  EKART_COURIER_NAME,
  EKART_DEFAULT_EXECUTIVE_NAME,
  EKART_DEFAULT_EXECUTIVE_PHONE,
  EKART_ORIGIN_LABEL,
  EKART_TIMELINE_STEPS,
  generateDeliveryOtp,
  generateEkartTrackingId,
  sanitizeExternalTrackingUrl,
  verifyDeliveryOtp,
  type EkartStepKey,
} from '../utils/ekart.ts';

const OWNER_ADMIN_EMAILS = new Set(
  [
    'admin@themagnet.in',
    'admin@vastraloom.in',
    'puttabalajip@gmail.com',
    (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
    (process.env.VITE_ADMIN_EMAIL || '').trim().toLowerCase(),
  ].filter(Boolean),
);

function mapProductRow(row: typeof products.$inferSelect): Product {
  const listingPriceInr = computeListingPrice(row.priceInr, row.listingPriceInr);
  const parsedRating = Number(row.rating);
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category as ApparelCategory,
    department: (row.department || 'Men') as Exclude<StoreDepartment, 'All'>,
    description: row.description,
    fabric: row.fabric,
    listingPriceInr,
    priceInr: row.priceInr,
    rating: Number.isFinite(parsedRating) && parsedRating > 0 ? parsedRating : 4.4,
    ratingCount: row.ratingCount || 142,
    stock: row.stock,
    sizes: (row.sizes || ['S', 'M', 'L', 'XL']) as ApparelSize[],
    colorName: row.colorName,
    colorHex: row.colorHex,
    imageUrl: row.imageUrl,
    featured: row.featured,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapOrderRow(row: typeof orders.$inferSelect): RetailOrder {
  const listingTotalInr =
    row.listingTotalInr > row.subtotalInr
      ? row.listingTotalInr
      : computeListingPrice(row.subtotalInr);
  const discountInr =
    row.discountInr > 0 ? row.discountInr : Math.max(0, listingTotalInr - row.subtotalInr);

  return {
    id: row.id,
    orderNumber: row.orderNumber,
    userUid: row.userUid,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    customerPhone: row.customerPhone,
    shippingAddress: row.shippingAddress,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    paymentMethod: row.paymentMethod as PaymentMethod,
    utrNumber: row.utrNumber,
    paymentReference: row.paymentReference,
    items: row.items || [],
    listingTotalInr,
    discountInr,
    subtotalInr: row.subtotalInr,
    gstInr: row.gstInr,
    shippingInr: row.shippingInr,
    totalInr: row.totalInr,
    awbNumber: row.awbNumber || row.ekartTrackingId || `TMX${String(row.id).padStart(4, '0')}90814`,
    ekartTrackingId: row.ekartTrackingId ?? null,
    trackingUrl: row.trackingUrl ?? null,
    deliveryOtp: row.deliveryOtp ?? null,
    ekartExecutiveName: row.ekartExecutiveName ?? null,
    ekartExecutivePhone: row.ekartExecutivePhone ?? null,
    courierPartner: row.courierPartner || 'The Magnet Store Dispatch',
    trackingEvents: Array.isArray(row.trackingEvents) ? row.trackingEvents : [],
    status: row.status as OrderStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapBulkQuoteRow(row: typeof bulkQuotes.$inferSelect): BulkQuote {
  return {
    id: row.id,
    quoteNumber: row.quoteNumber,
    userUid: row.userUid,
    businessName: row.businessName,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    gstin: row.gstin,
    apparelType: row.apparelType as BulkApparelType,
    fabric: row.fabric as FabricType,
    sizeMatrix: row.sizeMatrix,
    totalQuantity: row.totalQuantity,
    customPrinting: row.customPrinting,
    logoUrl: row.logoUrl,
    shippingSpeed: row.shippingSpeed as ShippingSpeed,
    unitPriceInr: row.unitPriceInr,
    baseCostInr: row.baseCostInr,
    printingCostInr: row.printingCostInr,
    discountPercent: row.discountPercent,
    discountAmountInr: row.discountAmountInr,
    discountedSubtotalInr: row.discountedSubtotalInr,
    gstInr: row.gstInr,
    shippingFeeInr: row.shippingFeeInr,
    estimatedTotalInr: row.estimatedTotalInr,
    utrNumber: row.utrNumber,
    advancePaidInr: row.advancePaidInr,
    notes: row.notes,
    status: row.status as OrderStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

// -----------------------------------------------------------------------------
// Users (Firebase Auth UID upsert)
// -----------------------------------------------------------------------------
export async function getOrCreateUser(uid: string, email: string, fullName = '') {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const assignedRole = OWNER_ADMIN_EMAILS.has(normalizedEmail) ? 'admin' : 'customer';

    const result = await db
      .insert(users)
      .values({
        uid,
        email: normalizedEmail,
        fullName: fullName.trim() || normalizedEmail.split('@')[0] || 'Customer',
        role: assignedRole,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: normalizedEmail,
          fullName: fullName.trim() || normalizedEmail.split('@')[0] || 'Customer',
          ...(assignedRole === 'admin' ? { role: 'admin' } : {}),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed (getOrCreateUser):', error);
    throw new Error('Unable to synchronize user profile. Please try again.', { cause: error });
  }
}

// -----------------------------------------------------------------------------
// Products
// -----------------------------------------------------------------------------
export async function listProducts(): Promise<Product[]> {
  try {
    const rows = await db
      .select()
      .from(products)
      .orderBy(desc(products.featured), desc(products.id));
    return rows.map(mapProductRow);
  } catch (error) {
    console.error('Database query failed (listProducts):', error);
    throw new Error('Failed to load apparel catalog. Please try again later.', { cause: error });
  }
}

export async function createProduct(input: Omit<Product, 'id' | 'createdAt'>): Promise<Product> {
  try {
    const [inserted] = await db
      .insert(products)
      .values({
        sku: input.sku,
        name: input.name,
        category: input.category,
        department: input.department || 'Men',
        description: input.description,
        fabric: input.fabric,
        listingPriceInr: computeListingPrice(input.priceInr, input.listingPriceInr),
        priceInr: input.priceInr,
        rating: String(input.rating || 4.4),
        ratingCount: input.ratingCount || 124,
        stock: input.stock,
        sizes: input.sizes,
        colorName: input.colorName,
        colorHex: input.colorHex,
        imageUrl: input.imageUrl,
        featured: input.featured,
      })
      .returning();
    return mapProductRow(inserted);
  } catch (error) {
    console.error('Database query failed (createProduct):', error);
    throw new Error('Failed to create product. Please verify fields and retry.', { cause: error });
  }
}

export async function updateProduct(
  id: number,
  patch: Partial<
    Pick<
      Product,
      'name' | 'category' | 'department' | 'listingPriceInr' | 'priceInr' | 'stock' | 'fabric' | 'description' | 'featured' | 'imageUrl'
    >
  >,
): Promise<Product | null> {
  try {
    const [updated] = await db
      .update(products)
      .set(patch)
      .where(eq(products.id, id))
      .returning();
    return updated ? mapProductRow(updated) : null;
  } catch (error) {
    console.error('Database query failed (updateProduct):', error);
    throw new Error('Failed to update product inventory.', { cause: error });
  }
}

export async function deleteProduct(id: number): Promise<boolean> {
  try {
    const deleted = await db
      .delete(products)
      .where(eq(products.id, id))
      .returning({ id: products.id });
    return deleted.length > 0;
  } catch (error) {
    console.error('Database query failed (deleteProduct):', error);
    throw new Error('Failed to remove product from inventory.', { cause: error });
  }
}

// -----------------------------------------------------------------------------
// Retail Orders
// -----------------------------------------------------------------------------
export async function listOrders(): Promise<RetailOrder[]> {
  try {
    const rows = await db.select().from(orders).orderBy(desc(orders.createdAt));
    return rows.map(mapOrderRow);
  } catch (error) {
    console.error('Database query failed (listOrders):', error);
    throw new Error('Failed to load retail orders.', { cause: error });
  }
}

export async function listOrdersByUser(uid: string): Promise<RetailOrder[]> {
  try {
    const rows = await db
      .select()
      .from(orders)
      .where(eq(orders.userUid, uid))
      .orderBy(desc(orders.createdAt));
    return rows.map(mapOrderRow);
  } catch (error) {
    console.error('Database query failed (listOrdersByUser):', error);
    throw new Error('Failed to load your order history.', { cause: error });
  }
}

export async function listRecentOrders(limit = 20): Promise<RetailOrder[]> {
  try {
    const rows = await db
      .select()
      .from(orders)
      .orderBy(desc(orders.createdAt))
      .limit(limit);
    return rows.map(mapOrderRow);
  } catch (error) {
    console.error('Database query failed (listRecentOrders):', error);
    throw new Error('Failed to load orders.', { cause: error });
  }
}

export async function getOrderByIdentifier(identifier: string): Promise<RetailOrder | null> {
  try {
    const raw = identifier.trim();
    if (!raw) return null;
    const upper = raw.toUpperCase();

    // 1. Exact orderNumber match (e.g. VL-ORD-2601)
    const exact = await db
      .select()
      .from(orders)
      .where(eq(orders.orderNumber, upper))
      .limit(1);
    if (exact.length > 0) return mapOrderRow(exact[0]);

    // 2. Numeric ID match
    if (/^\d+$/.test(raw)) {
      const byId = await db
        .select()
        .from(orders)
        .where(eq(orders.id, Number(raw)))
        .limit(1);
      if (byId.length > 0) return mapOrderRow(byId[0]);
    }

    // 3. Normalized OD-prefixed match (e.g. ODVLORD2601 -> VL-ORD-2601)
    const all = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(100);
    const cleanedTarget = upper.replace(/^OD/, '').replace(/[^A-Z0-9]/g, '');
    const matched = all.find(
      (o) => o.orderNumber.toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanedTarget,
    );
    return matched ? mapOrderRow(matched) : null;
  } catch (error) {
    console.error('Database query failed (getOrderByIdentifier):', error);
    throw new Error('Failed to load order details.', { cause: error });
  }
}

export async function createOrder(
  input: Omit<RetailOrder, 'id' | 'createdAt'>,
): Promise<RetailOrder> {
  try {
    const [inserted] = await db
      .insert(orders)
      .values({
        orderNumber: input.orderNumber,
        userUid: input.userUid ?? null,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhone: input.customerPhone,
        shippingAddress: input.shippingAddress,
        city: input.city,
        state: input.state,
        pincode: input.pincode,
        paymentMethod: input.paymentMethod,
        utrNumber: input.utrNumber ?? null,
        paymentReference: input.paymentReference ?? null,
        items: input.items,
        listingTotalInr: input.listingTotalInr,
        discountInr: input.discountInr,
        subtotalInr: input.subtotalInr,
        gstInr: input.gstInr,
        shippingInr: input.shippingInr,
        totalInr: input.totalInr,
        awbNumber: input.awbNumber ?? null,
        ekartTrackingId: input.ekartTrackingId ?? null,
        deliveryOtp: input.deliveryOtp ?? null,
        ekartExecutiveName: input.ekartExecutiveName ?? null,
        ekartExecutivePhone: input.ekartExecutivePhone ?? null,
        courierPartner: input.courierPartner || 'The Magnet Store Dispatch',
        trackingEvents: input.trackingEvents || [],
        status: input.status,
      })
      .returning();

    for (const item of input.items) {
      await db
        .update(products)
        .set({
          stock: sql`GREATEST(0, ${products.stock} - ${item.qty})`,
        })
        .where(eq(products.id, item.productId));
    }

    return mapOrderRow(inserted);
  } catch (error) {
    console.error('Database query failed (createOrder):', error);
    throw new Error('Unable to save your order. Please try again.', { cause: error });
  }
}

export async function updateOrderStatus(id: number, status: OrderStatus): Promise<RetailOrder | null> {
  try {
    const [updated] = await db
      .update(orders)
      .set({ status })
      .where(eq(orders.id, id))
      .returning();
    return updated ? mapOrderRow(updated) : null;
  } catch (error) {
    console.error('Database query failed (updateOrderStatus):', error);
    throw new Error('Failed to update order status.', { cause: error });
  }
}

export async function updateOrderTracking(
  id: number,
  patch: {
    status: OrderStatus;
    hubLocation?: string;
    detail?: string;
    awbNumber?: string;
    courierPartner?: string;
  },
): Promise<RetailOrder | null> {
  try {
    const existingRows = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (existingRows.length === 0) return null;
    const existing = existingRows[0];
    const currentEvents: OrderTrackingEvent[] = Array.isArray(existing.trackingEvents)
      ? [...existing.trackingEvents]
      : [];

    const stageMap: Record<string, OrderTrackingEvent['stage']> = {
      'Order Confirmed': 'Order Confirmed',
      'Packed & Shipped': 'Packed & Shipped',
      'In Production': 'Packed & Shipped',
      'Out for Delivery': 'Out for Delivery',
      Delivered: 'Delivered',
    };
    const mappedStage: OrderTrackingEvent['stage'] = stageMap[patch.status] || 'Order Confirmed';

    if (patch.hubLocation?.trim() || patch.detail?.trim()) {
      currentEvents.push({
        id: `ev-${Date.now()}`,
        stage: mappedStage,
        title: patch.status,
        hubLocation: patch.hubLocation?.trim() || 'Hyderabad Hub → Bhuvanagiri / Yadagirigutta Hub',
        timestamp: new Date().toISOString(),
        detail:
          patch.detail?.trim() ||
          `Shipment status updated to ${patch.status} at ${patch.hubLocation?.trim() || 'Regional Dispatch Hub'}.`,
      });
    }

    const [updated] = await db
      .update(orders)
      .set({
        status: patch.status,
        ...(patch.awbNumber?.trim() ? { awbNumber: patch.awbNumber.trim() } : {}),
        ...(patch.courierPartner?.trim() ? { courierPartner: patch.courierPartner.trim() } : {}),
        trackingEvents: currentEvents,
      })
      .where(eq(orders.id, id))
      .returning();

    return updated ? mapOrderRow(updated) : null;
  } catch (error) {
    console.error('Database query failed (updateOrderTracking):', error);
    throw new Error('Failed to update order tracking timeline.', { cause: error });
  }
}

export async function saveOrderTrackingUrl(
  orderCodeOrId: string,
  payload: {
    courierName?: string;
    trackingId?: string;
    trackingUrl: string;
  },
): Promise<RetailOrder | null> {
  try {
    const existing = await getOrderByIdentifier(orderCodeOrId);
    if (!existing) return null;

    const safeUrl = sanitizeExternalTrackingUrl(payload.trackingUrl);
    if (!safeUrl) {
      throw new Error('Please enter a valid http:// or https:// tracking URL.');
    }

    const cleanCourier = (payload.courierName || '').trim() || EKART_COURIER_NAME;
    const cleanTrackingId = (payload.trackingId || '').trim();

    const [updated] = await db
      .update(orders)
      .set({
        courierPartner: cleanCourier,
        trackingUrl: safeUrl,
        ...(cleanTrackingId
          ? { ekartTrackingId: cleanTrackingId, awbNumber: cleanTrackingId }
          : {}),
      })
      .where(eq(orders.id, existing.id))
      .returning();

    return updated ? mapOrderRow(updated) : null;
  } catch (error) {
    console.error('Database query failed (saveOrderTrackingUrl):', error);
    if (error instanceof Error && error.message.includes('http:// or https://')) {
      throw error;
    }
    throw new Error('Failed to save order tracking URL.', { cause: error });
  }
}

export async function clearOrderTrackingUrl(orderCodeOrId: string): Promise<RetailOrder | null> {
  try {
    const existing = await getOrderByIdentifier(orderCodeOrId);
    if (!existing) return null;

    const [updated] = await db
      .update(orders)
      .set({
        trackingUrl: null,
        ekartTrackingId: null,
        awbNumber: null,
      })
      .where(eq(orders.id, existing.id))
      .returning();

    return updated ? mapOrderRow(updated) : null;
  } catch (error) {
    console.error('Database query failed (clearOrderTrackingUrl):', error);
    throw new Error('Failed to remove order tracking URL.', { cause: error });
  }
}

// -----------------------------------------------------------------------------
// Courier Tracking & Delivery OTP Scan Operations
// -----------------------------------------------------------------------------
export async function handoverOrderToEkart(id: number): Promise<RetailOrder | null> {
  try {
    const existingRows = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (existingRows.length === 0) return null;
    const existing = existingRows[0];

    const trackingId = existing.ekartTrackingId || generateEkartTrackingId();
    const deliveryOtp = existing.deliveryOtp || generateDeliveryOtp();
    const execName = existing.ekartExecutiveName || EKART_DEFAULT_EXECUTIVE_NAME;
    const execPhone = existing.ekartExecutivePhone || EKART_DEFAULT_EXECUTIVE_PHONE;

    const currentEvents: OrderTrackingEvent[] = Array.isArray(existing.trackingEvents)
      ? [...existing.trackingEvents]
      : [];
    const now = Date.now();

    const hasCreated = currentEvents.some((ev) =>
      ev.title.toLowerCase().includes('shipment created'),
    );
    if (!hasCreated) {
      currentEvents.push({
        id: `ship-created-${now}`,
        stage: 'Order Confirmed',
        title: 'Shipment Created by The Magnet (Kanth)',
        hubLocation: EKART_ORIGIN_LABEL,
        timestamp: new Date(now).toISOString(),
        detail: `Order approved by Kanth (Rebel) and packed for courier pickup (Tracking ID: ${trackingId}).`,
      });
    }

    const hasPickup = currentEvents.some((ev) => ev.title.toLowerCase().includes('picked up'));
    if (!hasPickup) {
      currentEvents.push({
        id: `ship-pickup-${now + 1}`,
        stage: 'Packed & Shipped',
        title: 'Picked Up by Courier Partner',
        hubLocation: EKART_ORIGIN_LABEL,
        timestamp: new Date(now + 60_000).toISOString(),
        detail: `Dispatched with delivery executive ${execName} (${execPhone}). Tracking ID: ${trackingId}.`,
      });
    }

    const [updated] = await db
      .update(orders)
      .set({
        ekartTrackingId: trackingId,
        awbNumber: trackingId,
        deliveryOtp,
        ekartExecutiveName: execName,
        ekartExecutivePhone: execPhone,
        courierPartner: EKART_COURIER_NAME,
        status: 'Packed & Shipped',
        trackingEvents: currentEvents,
      })
      .where(eq(orders.id, id))
      .returning();

    return updated ? mapOrderRow(updated) : null;
  } catch (error) {
    console.error('Database query failed (handoverOrderToEkart):', error);
    throw new Error('Failed to mark order as dispatched.', { cause: error });
  }
}

export async function getOrderByEkartTrackingId(trackingId: string): Promise<RetailOrder | null> {
  try {
    const clean = trackingId.trim().toUpperCase();
    if (!clean) return null;

    const byEkart = await db
      .select()
      .from(orders)
      .where(eq(orders.ekartTrackingId, clean))
      .limit(1);
    if (byEkart.length > 0) return mapOrderRow(byEkart[0]);

    const byAwb = await db
      .select()
      .from(orders)
      .where(eq(orders.awbNumber, clean))
      .limit(1);
    if (byAwb.length > 0) return mapOrderRow(byAwb[0]);

    return getOrderByIdentifier(clean);
  } catch (error) {
    console.error('Database query failed (getOrderByEkartTrackingId):', error);
    throw new Error('Failed to locate shipment.', { cause: error });
  }
}

export async function listEkartShipments(limit = 20): Promise<RetailOrder[]> {
  try {
    const rows = await db
      .select()
      .from(orders)
      .orderBy(desc(orders.createdAt))
      .limit(limit);
    return rows.map(mapOrderRow).filter((o) => Boolean(o.ekartTrackingId));
  } catch (error) {
    console.error('Database query failed (listEkartShipments):', error);
    throw new Error('Failed to load shipments.', { cause: error });
  }
}

export async function updateEkartScan(
  trackingId: string,
  payload: {
    stepKey: EkartStepKey;
    hubLocation?: string;
    detail?: string;
    executiveName?: string;
    executivePhone?: string;
    otp?: string;
  },
): Promise<RetailOrder | null> {
  try {
    const order = await getOrderByEkartTrackingId(trackingId);
    if (!order) return null;

    const stepDef = EKART_TIMELINE_STEPS.find((s) => s.key === payload.stepKey);
    if (!stepDef) {
      throw new Error('Invalid shipment scan milestone.');
    }

    const expectedOtp = order.deliveryOtp || generateDeliveryOtp();
    if (payload.stepKey === 'DELIVERED') {
      if (!verifyDeliveryOtp(expectedOtp, payload.otp || '')) {
        throw new Error('Invalid 4-digit Delivery OTP. Please verify the customer OTP and try again.');
      }
    }

    const execName = payload.executiveName?.trim() || order.ekartExecutiveName || EKART_DEFAULT_EXECUTIVE_NAME;
    const execPhone = payload.executivePhone?.trim() || order.ekartExecutivePhone || EKART_DEFAULT_EXECUTIVE_PHONE;

    const destHub =
      order.pincode === '508115'
        ? 'Bhuvanagiri / Yadagirigutta Hub'
        : `${order.city || 'Destination'} Delivery Hub`;

    const resolvedHub =
      payload.hubLocation?.trim() ||
      (payload.stepKey === 'DELIVERY_HUB' || payload.stepKey === 'OUT_FOR_DELIVERY'
        ? destHub
        : payload.stepKey === 'DELIVERED'
        ? `${order.city}, ${order.state} — ${order.pincode}`
        : stepDef.defaultHub);

    const resolvedDetail =
      payload.detail?.trim() ||
      (payload.stepKey === 'OUT_FOR_DELIVERY'
        ? `Delivery Executive ${execName} (${execPhone}) is out for delivery. Share 4-digit Delivery OTP on arrival.`
        : payload.stepKey === 'DELIVERED'
        ? `4-digit Delivery OTP verified by ${execName}. Handed over safely to ${order.customerName}.`
        : `${stepDef.title} scanned at ${resolvedHub}.`);

    const currentEvents: OrderTrackingEvent[] = Array.isArray(order.trackingEvents)
      ? [...order.trackingEvents]
      : [];

    currentEvents.push({
      id: `ship-scan-${Date.now()}`,
      stage: stepDef.stage,
      title: stepDef.title,
      hubLocation: resolvedHub,
      timestamp: new Date().toISOString(),
      detail: resolvedDetail,
    });

    const [updated] = await db
      .update(orders)
      .set({
        status: stepDef.orderStatus,
        courierPartner:
          order.courierPartner && !/ekart/i.test(order.courierPartner)
            ? order.courierPartner
            : EKART_COURIER_NAME,
        ekartTrackingId: order.ekartTrackingId || generateEkartTrackingId(),
        deliveryOtp: expectedOtp,
        ekartExecutiveName: execName,
        ekartExecutivePhone: execPhone,
        trackingEvents: currentEvents,
      })
      .where(eq(orders.id, order.id))
      .returning();

    return updated ? mapOrderRow(updated) : null;
  } catch (error) {
    console.error('Database query failed (updateEkartScan):', error);
    if (error instanceof Error && error.message.includes('OTP')) {
      throw error;
    }
    throw new Error('Failed to update shipment scan.', { cause: error });
  }
}

// -----------------------------------------------------------------------------
// Bulk Quotes
// -----------------------------------------------------------------------------
export async function listBulkQuotes(): Promise<BulkQuote[]> {
  try {
    const rows = await db.select().from(bulkQuotes).orderBy(desc(bulkQuotes.createdAt));
    return rows.map(mapBulkQuoteRow);
  } catch (error) {
    console.error('Database query failed (listBulkQuotes):', error);
    throw new Error('Failed to load bulk quotes.', { cause: error });
  }
}

export async function listBulkQuotesByUser(uid: string): Promise<BulkQuote[]> {
  try {
    const rows = await db
      .select()
      .from(bulkQuotes)
      .where(eq(bulkQuotes.userUid, uid))
      .orderBy(desc(bulkQuotes.createdAt));
    return rows.map(mapBulkQuoteRow);
  } catch (error) {
    console.error('Database query failed (listBulkQuotesByUser):', error);
    throw new Error('Failed to load your bulk quotes.', { cause: error });
  }
}

export async function createBulkQuote(
  input: Omit<BulkQuote, 'id' | 'createdAt'>,
): Promise<BulkQuote> {
  try {
    const [inserted] = await db
      .insert(bulkQuotes)
      .values({
        quoteNumber: input.quoteNumber,
        userUid: input.userUid ?? null,
        businessName: input.businessName,
        contactName: input.contactName,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        gstin: input.gstin ?? null,
        apparelType: input.apparelType,
        fabric: input.fabric,
        sizeMatrix: input.sizeMatrix,
        totalQuantity: input.totalQuantity,
        customPrinting: input.customPrinting,
        logoUrl: input.logoUrl ?? null,
        shippingSpeed: input.shippingSpeed,
        unitPriceInr: input.unitPriceInr,
        baseCostInr: input.baseCostInr,
        printingCostInr: input.printingCostInr,
        discountPercent: input.discountPercent,
        discountAmountInr: input.discountAmountInr,
        discountedSubtotalInr: input.discountedSubtotalInr,
        gstInr: input.gstInr,
        shippingFeeInr: input.shippingFeeInr,
        estimatedTotalInr: input.estimatedTotalInr,
        utrNumber: input.utrNumber ?? null,
        advancePaidInr: input.advancePaidInr ?? 0,
        notes: input.notes ?? null,
        status: input.status,
      })
      .returning();

    return mapBulkQuoteRow(inserted);
  } catch (error) {
    console.error('Database query failed (createBulkQuote):', error);
    throw new Error('Failed to save bulk quote request.', { cause: error });
  }
}

export async function recordBulkQuoteUpiPayment(
  id: number,
  utrNumber: string,
  advancePaidInr: number,
): Promise<BulkQuote | null> {
  try {
    const [updated] = await db
      .update(bulkQuotes)
      .set({
        utrNumber,
        advancePaidInr,
        status: 'Payment Verification Pending',
      })
      .where(eq(bulkQuotes.id, id))
      .returning();
    return updated ? mapBulkQuoteRow(updated) : null;
  } catch (error) {
    console.error('Database query failed (recordBulkQuoteUpiPayment):', error);
    throw new Error('Failed to record bulk advance UPI payment.', { cause: error });
  }
}

export async function updateBulkQuoteStatus(id: number, status: OrderStatus): Promise<BulkQuote | null> {
  try {
    const [updated] = await db
      .update(bulkQuotes)
      .set({ status })
      .where(eq(bulkQuotes.id, id))
      .returning();
    return updated ? mapBulkQuoteRow(updated) : null;
  } catch (error) {
    console.error('Database query failed (updateBulkQuoteStatus):', error);
    throw new Error('Failed to update bulk quote status.', { cause: error });
  }
}

export async function trackReference(
  ref: string,
): Promise<{ type: 'retail'; record: RetailOrder } | { type: 'bulk'; record: BulkQuote } | null> {
  try {
    const code = ref.trim().toUpperCase();
    if (!code) return null;

    const orderRows = await db
      .select()
      .from(orders)
      .where(eq(orders.orderNumber, code))
      .limit(1);
    if (orderRows[0]) {
      return { type: 'retail', record: mapOrderRow(orderRows[0]) };
    }

    const quoteRows = await db
      .select()
      .from(bulkQuotes)
      .where(eq(bulkQuotes.quoteNumber, code))
      .limit(1);
    if (quoteRows[0]) {
      return { type: 'bulk', record: mapBulkQuoteRow(quoteRows[0]) };
    }

    return null;
  } catch (error) {
    console.error('Database query failed (trackReference):', error);
    throw new Error('Failed to look up reference number.', { cause: error });
  }
}

export async function getAdminDashboardSummary(): Promise<AdminDashboardSummary> {
  const [allProducts, allOrders, allQuotes] = await Promise.all([
    listProducts(),
    listOrders(),
    listBulkQuotes(),
  ]);

  const retailSalesInr = allOrders.reduce((sum, o) => sum + o.totalInr, 0);
  const approvedBulkValueInr = allQuotes
    .filter((q) => q.status !== 'Pending' && q.status !== 'Payment Verification Pending')
    .reduce((sum, q) => sum + q.estimatedTotalInr, 0);

  const activeBulkOrdersCount = allQuotes.filter(
    (q) => q.status === 'Approved / Quote Sent' || q.status === 'In Production',
  ).length;

  const pendingEstimatesCount = allQuotes.filter(
    (q) => q.status === 'Pending' || q.status === 'Payment Verification Pending',
  ).length;

  const pendingPaymentVerificationsCount =
    allOrders.filter((o) => o.status === 'Payment Verification Pending').length +
    allQuotes.filter((q) => q.status === 'Payment Verification Pending').length;

  const lowStockCount = allProducts.filter((p) => p.stock < 25).length;

  const currentRetail = Math.round(retailSalesInr);
  const currentWholesale = Math.round(
    allQuotes.reduce((sum, q) => sum + q.estimatedTotalInr, 0),
  );

  const monthlySales = [
    { month: 'Jun', retailInr: 42500, wholesaleInr: 148000 },
    { month: 'Jul', retailInr: 51200, wholesaleInr: 184500 },
    { month: 'Aug', retailInr: 64800, wholesaleInr: 215000 },
    { month: 'Sep', retailInr: 78400, wholesaleInr: 262000 },
    { month: 'Oct', retailInr: 96200, wholesaleInr: 318000 },
    { month: 'Nov', retailInr: currentRetail, wholesaleInr: currentWholesale },
  ];

  return {
    totalSalesInr: Math.round(retailSalesInr + approvedBulkValueInr),
    retailSalesInr: Math.round(retailSalesInr),
    approvedBulkValueInr: Math.round(approvedBulkValueInr),
    activeBulkOrdersCount,
    pendingEstimatesCount,
    pendingPaymentVerificationsCount,
    totalProductsCount: allProducts.length,
    lowStockCount,
    monthlySales,
  };
}

// -----------------------------------------------------------------------------
// Payment Settings (Merchant UPI ID & Mobile persisted in Cloud SQL)
// -----------------------------------------------------------------------------
export async function getPaymentSettings(): Promise<PaymentSettings> {
  try {
    const rows = await db
      .select()
      .from(paymentSettings)
      .where(eq(paymentSettings.id, 1))
      .limit(1);

    if (rows.length > 0) {
      return {
        merchantUpiId: rows[0].merchantUpiId || DEFAULT_MERCHANT_UPI_ID,
        merchantMobile: rows[0].merchantMobile || DEFAULT_MERCHANT_MOBILE,
        brandName: rows[0].brandName || DEFAULT_BRAND_NAME,
        defaultTrackingBaseUrl: rows[0].defaultTrackingBaseUrl ?? DEFAULT_COURIER_TRACKING_BASE_URL,
        updatedAt: rows[0].updatedAt.toISOString(),
      };
    }

    const [created] = await db
      .insert(paymentSettings)
      .values({
        id: 1,
        merchantUpiId: DEFAULT_MERCHANT_UPI_ID,
        merchantMobile: DEFAULT_MERCHANT_MOBILE,
        brandName: DEFAULT_BRAND_NAME,
        defaultTrackingBaseUrl: DEFAULT_COURIER_TRACKING_BASE_URL,
      })
      .onConflictDoNothing()
      .returning();

    if (created) {
      return {
        merchantUpiId: created.merchantUpiId,
        merchantMobile: created.merchantMobile,
        brandName: created.brandName,
        defaultTrackingBaseUrl: created.defaultTrackingBaseUrl ?? DEFAULT_COURIER_TRACKING_BASE_URL,
        updatedAt: created.updatedAt.toISOString(),
      };
    }

    return {
      merchantUpiId: DEFAULT_MERCHANT_UPI_ID,
      merchantMobile: DEFAULT_MERCHANT_MOBILE,
      brandName: DEFAULT_BRAND_NAME,
      defaultTrackingBaseUrl: DEFAULT_COURIER_TRACKING_BASE_URL,
    };
  } catch (error) {
    console.error('Database query failed (getPaymentSettings):', error);
    return {
      merchantUpiId: DEFAULT_MERCHANT_UPI_ID,
      merchantMobile: DEFAULT_MERCHANT_MOBILE,
      brandName: DEFAULT_BRAND_NAME,
      defaultTrackingBaseUrl: DEFAULT_COURIER_TRACKING_BASE_URL,
    };
  }
}

export async function updatePaymentSettings(patch: {
  merchantUpiId: string;
  merchantMobile: string;
  brandName?: string;
  defaultTrackingBaseUrl?: string;
}): Promise<PaymentSettings> {
  try {
    const cleanUpi = patch.merchantUpiId.trim() || DEFAULT_MERCHANT_UPI_ID;
    const cleanMobile = patch.merchantMobile.replace(/\D/g, '').slice(-10) || DEFAULT_MERCHANT_MOBILE;
    const cleanBrand = (patch.brandName || DEFAULT_BRAND_NAME).trim() || DEFAULT_BRAND_NAME;

    let cleanTrackingBase = DEFAULT_COURIER_TRACKING_BASE_URL;
    if (patch.defaultTrackingBaseUrl !== undefined) {
      const trimmedBase = patch.defaultTrackingBaseUrl.trim();
      if (trimmedBase === '') {
        cleanTrackingBase = '';
      } else {
        const safeBase = sanitizeExternalTrackingUrl(trimmedBase);
        if (!safeBase) {
          throw new Error('Default Courier Tracking Base URL must be a valid http:// or https:// URL.');
        }
        cleanTrackingBase = safeBase;
      }
    } else {
      const current = await getPaymentSettings();
      cleanTrackingBase = current.defaultTrackingBaseUrl;
    }

    const [saved] = await db
      .insert(paymentSettings)
      .values({
        id: 1,
        merchantUpiId: cleanUpi,
        merchantMobile: cleanMobile,
        brandName: cleanBrand,
        defaultTrackingBaseUrl: cleanTrackingBase,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: paymentSettings.id,
        set: {
          merchantUpiId: cleanUpi,
          merchantMobile: cleanMobile,
          brandName: cleanBrand,
          defaultTrackingBaseUrl: cleanTrackingBase,
          updatedAt: new Date(),
        },
      })
      .returning();

    return {
      merchantUpiId: saved.merchantUpiId,
      merchantMobile: saved.merchantMobile,
      brandName: saved.brandName,
      defaultTrackingBaseUrl: saved.defaultTrackingBaseUrl ?? '',
      updatedAt: saved.updatedAt.toISOString(),
    };
  } catch (error) {
    console.error('Database query failed (updatePaymentSettings):', error);
    if (error instanceof Error && error.message.includes('http:// or https://')) {
      throw error;
    }
    throw new Error('Failed to save payment settings. Please try again.', { cause: error });
  }
}
