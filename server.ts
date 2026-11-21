import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import {
  clearOrderTrackingUrl,
  createBulkQuote,
  createOrder,
  createProduct,
  deleteProduct,
  getAdminDashboardSummary,
  getOrderByEkartTrackingId,
  getOrderByIdentifier,
  getPaymentSettings,
  listBulkQuotes,
  listBulkQuotesByUser,
  listEkartShipments,
  listOrders,
  listOrdersByUser,
  listProducts,
  listRecentOrders,
  recordBulkQuoteUpiPayment,
  saveOrderTrackingUrl,
  trackReference,
  updateBulkQuoteStatus,
  updateEkartScan,
  updateOrderStatus,
  updateOrderTracking,
  updatePaymentSettings,
  updateProduct,
} from './src/db/repository.ts';
import {
  optionalFirebaseAuth,
  requireAdmin,
  requireAuth,
  signAdminToken,
  type AuthRequest,
} from './src/middleware/auth.ts';
import {
  BULK_APPAREL_PRICES,
  BULK_MIN_UNITS,
  calculateBulkEstimate,
  calculateCartTotals,
  FABRIC_MODIFIERS,
} from './src/utils/pricing.ts';
import { isValidUpiId, isValidUtrNumber } from './src/utils/upi.ts';
import { computeListingPrice } from './src/utils/orderHelpers.ts';
import type {
  ApparelCategory,
  ApparelSize,
  BulkApparelType,
  CartItem,
  FabricType,
  OrderStatus,
  PaymentMethod,
  ShippingSpeed,
  SizeMatrix,
  StoreDepartment,
} from './src/types.ts';

import {
  EKART_TIMELINE_STEPS,
  sanitizeExternalTrackingUrl,
  type EkartStepKey,
} from './src/utils/ekart.ts';

const PORT = Number(process.env.PORT || 3000);
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_ADMIN_EMAILS = new Set(
  [
    'admin@themagnet.in',
    'admin@vastraloom.in',
    (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
    (process.env.VITE_ADMIN_EMAIL || '').trim().toLowerCase(),
  ].filter(Boolean),
);
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'VastraAdmin2026';

const ALLOWED_STATUSES: OrderStatus[] = [
  'Order Placed — Awaiting Store Approval',
  'Payment Verification Pending',
  'Order Confirmed',
  'Handed Over to Ekart',
  'Packed & Shipped',
  'Out for Delivery',
  'Delivered',
  'Pending',
  'Approved / Quote Sent',
  'In Production',
];

const ALLOWED_DEPARTMENTS: Array<Exclude<StoreDepartment, 'All'>> = [
  'Sports Wear',
  'Gym & Training',
  'Trendy Fashions',
  'Team Kits',
  'Offer Zone',
];

const ALLOWED_CATEGORIES: ApparelCategory[] = [
  'Dry-Fit Tees',
  'Compression Wear',
  'Track Pants & Joggers',
  'Streetwear Hoodies',
  'Co-Ord Sets',
  'Team Jerseys',
];

const ALLOWED_SIZES: ApparelSize[] = ['S', 'M', 'L', 'XL', 'XXL'];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
    const safeExt = ['.png', '.jpg', '.jpeg', '.webp', '.svg'].includes(ext) ? ext : '.png';
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}${safeExt}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (PNG, JPG, WEBP, SVG) are allowed.'));
    }
  },
});

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use('/uploads', express.static(UPLOADS_DIR));
  if (fs.existsSync(PUBLIC_DIR)) {
    app.use(express.static(PUBLIC_DIR));
  }

  // ---------------------------------------------------------------------------
  // Health Check
  // ---------------------------------------------------------------------------
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ---------------------------------------------------------------------------
  // Firebase User Sync & Customer Order History
  // ---------------------------------------------------------------------------
  app.post('/api/auth/sync', requireAuth, (req: AuthRequest, res) => {
    res.json({ user: req.dbUser });
  });

  app.get('/api/my-orders', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const [myOrders, myQuotes] = await Promise.all([
        listOrdersByUser(uid),
        listBulkQuotesByUser(uid),
      ]);
      res.json({ orders: myOrders, quotes: myQuotes });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ---------------------------------------------------------------------------
  // Admin Authentication (Email/Password JWT + Firebase Google Sign-In)
  // ---------------------------------------------------------------------------
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body as { email?: string; password?: string };
      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required.' });
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      if (!ALLOWED_ADMIN_EMAILS.has(normalizedEmail) || password !== DEFAULT_ADMIN_PASSWORD) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      const token = signAdminToken({
        id: 1,
        email: normalizedEmail,
        fullName: 'Kanth (Rebel)',
        role: 'admin',
      });

      res.json({
        token,
        user: {
          id: 1,
          fullName: 'Kanth (Rebel)',
          email: normalizedEmail,
          role: 'admin',
        },
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/auth/me', requireAdmin, (req: AuthRequest, res) => {
    res.json({ user: req.admin });
  });

  // ---------------------------------------------------------------------------
  // Products API
  // ---------------------------------------------------------------------------
  app.get('/api/products', async (_req, res) => {
    try {
      const items = await listProducts();
      res.json({ products: items });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post(
    '/api/products',
    requireAdmin,
    upload.single('image'),
    async (req: AuthRequest, res) => {
      try {
        const body = req.body as Record<string, string>;
        const name = (body.name || '').trim();
        const category = body.category as ApparelCategory;
        const priceInr = Number(body.priceInr);
        const stock = Number(body.stock);
        const fabric = (body.fabric || 'Dry-Fit Micro Mesh').trim();
        const description =
          (body.description || '').trim() ||
          `Performance ${name} crafted in ${fabric} by The Magnet — Sports Wear & Trendy Fashions.`;
        const colorName = (body.colorName || 'Midnight Black').trim();
        const colorHex = (body.colorHex || '#09090B').trim();
        const sku =
          (body.sku || '').trim() ||
          `TM-${category.slice(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 899)}`;

        let sizes: ApparelSize[] = ['S', 'M', 'L', 'XL'];
        if (body.sizes) {
          try {
            const parsed = JSON.parse(body.sizes);
            if (Array.isArray(parsed) && parsed.length > 0) {
              sizes = parsed.filter((s): s is ApparelSize => ALLOWED_SIZES.includes(s));
            }
          } catch {
            // keep default sizes
          }
        }

        if (!name || !ALLOWED_CATEGORIES.includes(category)) {
          res.status(400).json({ error: 'Valid product name and category are required.' });
          return;
        }
        if (!Number.isFinite(priceInr) || priceInr < 100) {
          res.status(400).json({ error: 'Price (₹) must be at least ₹100.' });
          return;
        }
        if (!Number.isFinite(stock) || stock < 0) {
          res.status(400).json({ error: 'Stock count must be 0 or greater.' });
          return;
        }

        const defaultImageByCategory: Record<ApparelCategory, string> = {
          'Dry-Fit Tees': '/src/assets/images/magnet_dryfit_tshirt_1795261556794.jpg',
          'Compression Wear': '/src/assets/images/magnet_compression_tee_1795261427755.jpg',
          'Track Pants & Joggers': '/src/assets/images/magnet_track_joggers_1795261437111.jpg',
          'Streetwear Hoodies': '/src/assets/images/magnet_oversized_hoodie_1795261554494.jpg',
          'Co-Ord Sets': '/src/assets/images/magnet_coord_activewear_1795261595833.jpg',
          'Team Jerseys': '/src/assets/images/magnet_team_jersey_1795261427551.jpg',
        };

        const imageUrl = req.file
          ? `/uploads/${req.file.filename}`
          : (body.imageUrl || '').trim() || defaultImageByCategory[category];

        const rawListing = Number(body.listingPriceInr);
        const listingPriceInr = computeListingPrice(
          Math.round(priceInr),
          Number.isFinite(rawListing) && rawListing > priceInr ? Math.round(rawListing) : undefined,
        );
        const rawDept = (body.department || '').trim() as Exclude<StoreDepartment, 'All'>;
        const department: Exclude<StoreDepartment, 'All'> = ALLOWED_DEPARTMENTS.includes(rawDept)
          ? rawDept
          : category === 'Streetwear Hoodies' || category === 'Co-Ord Sets'
          ? 'Trendy Fashions'
          : category === 'Team Jerseys'
          ? 'Team Kits'
          : 'Sports Wear';

        const product = await createProduct({
          sku,
          name,
          category,
          department,
          description,
          fabric,
          listingPriceInr,
          priceInr: Math.round(priceInr),
          rating: 4.5,
          ratingCount: 128,
          stock: Math.floor(stock),
          sizes,
          colorName,
          colorHex,
          imageUrl,
          featured: body.featured === 'true',
        });

        res.status(201).json({ product });
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    },
  );

  app.patch('/api/products/:id', requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { stock, priceInr, listingPriceInr, name, category, department } = req.body as {
        stock?: number;
        priceInr?: number;
        listingPriceInr?: number;
        name?: string;
        category?: ApparelCategory;
        department?: Exclude<StoreDepartment, 'All'>;
      };

      const patch: Parameters<typeof updateProduct>[1] = {};
      if (stock !== undefined) {
        if (!Number.isFinite(Number(stock)) || Number(stock) < 0) {
          res.status(400).json({ error: 'Invalid stock count.' });
          return;
        }
        patch.stock = Math.floor(Number(stock));
      }
      if (priceInr !== undefined) {
        if (!Number.isFinite(Number(priceInr)) || Number(priceInr) < 100) {
          res.status(400).json({ error: 'Invalid price.' });
          return;
        }
        patch.priceInr = Math.round(Number(priceInr));
      }
      if (
        listingPriceInr !== undefined &&
        Number.isFinite(Number(listingPriceInr)) &&
        Number(listingPriceInr) >= 100
      ) {
        patch.listingPriceInr = Math.round(Number(listingPriceInr));
      }
      if (name !== undefined && name.trim()) patch.name = name.trim();
      if (category !== undefined && ALLOWED_CATEGORIES.includes(category)) {
        patch.category = category;
      }
      if (department !== undefined && ALLOWED_DEPARTMENTS.includes(department)) {
        patch.department = department;
      }

      const updated = await updateProduct(id, patch);
      if (!updated) {
        res.status(404).json({ error: 'Product not found.' });
        return;
      }
      res.json({ product: updated });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/products/:id', requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const ok = await deleteProduct(id);
      if (!ok) {
        res.status(404).json({ error: 'Product not found.' });
        return;
      }
      res.json({ deleted: true, id });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ---------------------------------------------------------------------------
  // Retail Orders API (Dynamic UPI QR + 12-Digit UTR, Razorpay & COD)
  // ---------------------------------------------------------------------------
  app.get('/api/orders/recent', async (_req, res) => {
    try {
      const list = await listRecentOrders(20);
      res.json({ orders: list });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/orders/lookup/:orderId', async (req, res) => {
    try {
      const order = await getOrderByIdentifier(req.params.orderId);
      if (!order) {
        res.status(404).json({ error: 'Order not found for that Order ID.' });
        return;
      }
      res.json({ order });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/orders', requireAdmin, async (_req, res) => {
    try {
      const list = await listOrders();
      res.json({ orders: list });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/orders', optionalFirebaseAuth, async (req: AuthRequest, res) => {
    try {
      const {
        orderNumber: requestedOrderNumber,
        customerName,
        customerEmail,
        customerPhone,
        shippingAddress,
        city,
        state,
        pincode,
        paymentMethod,
        utrNumber,
        items,
      } = req.body as {
        orderNumber?: string;
        customerName?: string;
        customerEmail?: string;
        customerPhone?: string;
        shippingAddress?: string;
        city?: string;
        state?: string;
        pincode?: string;
        paymentMethod?: PaymentMethod;
        utrNumber?: string;
        items?: Array<{ productId: number; size: ApparelSize; qty: number }>;
      };

      if (
        !customerName?.trim() ||
        !customerEmail?.trim() ||
        !customerPhone?.trim() ||
        !shippingAddress?.trim() ||
        !city?.trim() ||
        !state?.trim() ||
        !pincode?.trim()
      ) {
        res.status(400).json({ error: 'Please complete all required delivery details.' });
        return;
      }

      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: 'Your cart is empty.' });
        return;
      }

      const method: PaymentMethod =
        paymentMethod === 'Cash on Delivery'
          ? 'Cash on Delivery'
          : paymentMethod === 'Razorpay Online'
          ? 'Razorpay Online'
          : 'UPI QR';

      const cleanUtr = (utrNumber || '').trim();
      if (method === 'UPI QR' && !isValidUtrNumber(cleanUtr)) {
        res.status(400).json({
          error: 'Please enter a valid 12-digit UPI Transaction ID / UTR Number to confirm payment.',
        });
        return;
      }

      const catalog = await listProducts();
      const cartItems: CartItem[] = [];
      let listingTotalInr = 0;

      for (const reqItem of items) {
        const prod = catalog.find((p) => p.id === Number(reqItem.productId));
        if (!prod) {
          res.status(400).json({ error: `Product #${reqItem.productId} is no longer available.` });
          return;
        }
        const qty = Math.max(1, Math.floor(Number(reqItem.qty) || 1));
        const prodListing = computeListingPrice(prod.priceInr, prod.listingPriceInr);
        listingTotalInr += prodListing * qty;
        cartItems.push({
          productId: prod.id,
          sku: prod.sku,
          name: prod.name,
          category: prod.category,
          size: ALLOWED_SIZES.includes(reqItem.size) ? reqItem.size : 'M',
          colorName: prod.colorName,
          qty,
          listingPrice: prodListing,
          unitPrice: prod.priceInr,
          imageUrl: prod.imageUrl,
        });
      }

      const totals = calculateCartTotals(cartItems);
      const discountInr = Math.max(0, listingTotalInr - totals.subtotalInr);
      const orderNumber =
        requestedOrderNumber && /^(TM|VL)-ORD-[A-Z0-9-]+$/i.test(requestedOrderNumber.trim())
          ? requestedOrderNumber.trim().toUpperCase()
          : `TM-ORD-${Math.floor(3000 + Math.random() * 6999)}`;

      const status: OrderStatus =
        method === 'UPI QR'
          ? 'Payment Verification Pending'
          : 'Order Placed — Awaiting Store Approval';
      const awbNumber = `TMX${Math.floor(100000000 + Math.random() * 899999999)}`;

      const order = await createOrder({
        orderNumber,
        userUid: req.user?.uid ?? null,
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        customerPhone: customerPhone.trim(),
        shippingAddress: shippingAddress.trim(),
        city: city.trim(),
        state: state.trim(),
        pincode: pincode.trim(),
        paymentMethod: method,
        utrNumber: method === 'UPI QR' ? cleanUtr : null,
        paymentReference:
          method === 'UPI QR'
            ? `UTR-${cleanUtr}`
            : method === 'Razorpay Online'
            ? `RZP-${Date.now().toString().slice(-8)}`
            : null,
        items: cartItems.map((i) => ({
          productId: i.productId,
          name: i.name,
          size: i.size,
          colorName: i.colorName,
          qty: i.qty,
          listingPrice: i.listingPrice,
          unitPrice: i.unitPrice,
          imageUrl: i.imageUrl,
        })),
        listingTotalInr,
        discountInr,
        subtotalInr: totals.subtotalInr,
        gstInr: totals.gstInr,
        shippingInr: totals.shippingInr,
        totalInr: totals.totalInr,
        awbNumber,
        ekartTrackingId: null,
        deliveryOtp: null,
        ekartExecutiveName: null,
        ekartExecutivePhone: null,
        courierPartner: 'The Magnet Store Dispatch',
        trackingEvents: [
          {
            id: `ev-${Date.now()}`,
            stage: 'Order Confirmed',
            title:
              method === 'UPI QR'
                ? 'Order Placed (UPI UTR Submitted)'
                : 'Order Placed — Awaiting Store Approval',
            hubLocation: 'The Magnet Warehouse — Telangana',
            timestamp: new Date().toISOString(),
            detail:
              method === 'UPI QR'
                ? `UTR ${cleanUtr} received for verification via balajigoud11@axl. Kanth (Rebel) will approve and prepare your order for dispatch.`
                : 'Order received at The Magnet Warehouse — Telangana. Awaiting store approval for dispatch.',
          },
        ],
        status,
      });

      res.status(201).json({ order });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.patch('/api/orders/:id/status', requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { status } = req.body as { status?: OrderStatus };
      if (!status || !ALLOWED_STATUSES.includes(status)) {
        res.status(400).json({ error: 'Invalid status.' });
        return;
      }
      const order = await updateOrderStatus(id, status);
      if (!order) {
        res.status(404).json({ error: 'Order not found.' });
        return;
      }
      res.json({ order });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.patch('/api/orders/:id/tracking', requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { status, hubLocation, detail, awbNumber, courierPartner } = req.body as {
        status?: OrderStatus;
        hubLocation?: string;
        detail?: string;
        awbNumber?: string;
        courierPartner?: string;
      };
      if (!status || !ALLOWED_STATUSES.includes(status)) {
        res.status(400).json({ error: 'Invalid tracking stage.' });
        return;
      }
      const order = await updateOrderTracking(id, {
        status,
        hubLocation,
        detail,
        awbNumber,
        courierPartner,
      });
      if (!order) {
        res.status(404).json({ error: 'Order not found.' });
        return;
      }
      res.json({ order });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ---------------------------------------------------------------------------
  // Admin-Only Tracking URL Manager CRUD (Add, Edit, Remove)
  // ---------------------------------------------------------------------------
  app.put('/api/admin/orders/:orderCode/tracking-url', requireAdmin, async (req, res) => {
    try {
      const { courierName, trackingId, trackingUrl } = req.body as {
        courierName?: string;
        trackingId?: string;
        trackingUrl?: string;
      };
      const safeUrl = sanitizeExternalTrackingUrl(trackingUrl);
      if (!safeUrl) {
        res.status(400).json({
          error:
            'Please provide a valid http:// or https:// tracking URL (for example: https://track.delhivery.com/waybill/AWB8492017462).',
        });
        return;
      }

      const order = await saveOrderTrackingUrl(req.params.orderCode, {
        courierName,
        trackingId,
        trackingUrl: safeUrl,
      });
      if (!order) {
        res.status(404).json({ error: 'Order not found.' });
        return;
      }
      res.json({ order });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/admin/orders/:orderCode/tracking-url', requireAdmin, async (req, res) => {
    try {
      const order = await clearOrderTrackingUrl(req.params.orderCode);
      if (!order) {
        res.status(404).json({ error: 'Order not found.' });
        return;
      }
      res.json({ order });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ---------------------------------------------------------------------------
  // Courier Delivery OTP & Scan APIs
  // ---------------------------------------------------------------------------
  app.get('/api/ekart/shipments', async (_req, res) => {
    try {
      const shipments = await listEkartShipments(20);
      res.json({ shipments });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/ekart/track/:trackingId', async (req, res) => {
    try {
      const order = await getOrderByEkartTrackingId(req.params.trackingId);
      if (!order) {
        res.status(404).json({ error: 'No shipment found for that Tracking ID.' });
        return;
      }
      res.json({ order });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.patch('/api/ekart/track/:trackingId/scan', async (req, res) => {
    try {
      const { stepKey, hubLocation, detail, executiveName, executivePhone, otp } = req.body as {
        stepKey?: EkartStepKey;
        hubLocation?: string;
        detail?: string;
        executiveName?: string;
        executivePhone?: string;
        otp?: string;
      };
      const allowedKeys = new Set(EKART_TIMELINE_STEPS.map((s) => s.key));
      if (!stepKey || !allowedKeys.has(stepKey)) {
        res.status(400).json({ error: 'Please select a valid shipment scan stage.' });
        return;
      }
      const order = await updateEkartScan(req.params.trackingId, {
        stepKey,
        hubLocation,
        detail,
        executiveName,
        executivePhone,
        otp,
      });
      if (!order) {
        res.status(404).json({ error: 'Shipment not found for that Tracking ID.' });
        return;
      }
      res.json({ order });
    } catch (err) {
      const msg = (err as Error).message || 'Failed to update shipment.';
      res.status(msg.includes('OTP') ? 400 : 500).json({ error: msg });
    }
  });

  // ---------------------------------------------------------------------------
  // Bulk Wholesale Quotes API (multer logo upload + optional 40% UPI Advance)
  // ---------------------------------------------------------------------------
  app.get('/api/bulk-quotes', requireAdmin, async (_req, res) => {
    try {
      const quotes = await listBulkQuotes();
      res.json({ quotes });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post(
    '/api/bulk-quotes',
    requireAdmin,
    upload.single('logo'),
    async (req: AuthRequest, res) => {
      try {
        const body = req.body as Record<string, string>;
        const businessName = (body.businessName || '').trim();
        const contactName = (body.contactName || '').trim();
        const contactEmail = (body.contactEmail || '').trim();
        const contactPhone = (body.contactPhone || '').trim();
        const gstin = (body.gstin || '').trim() || null;
        const notes = (body.notes || '').trim() || null;

        if (!businessName || !contactName || !contactEmail || !contactPhone) {
          res
            .status(400)
            .json({ error: 'Business name, contact person, email, and phone number are required.' });
          return;
        }

        const apparelType = body.apparelType as BulkApparelType;
        const fabric = body.fabric as FabricType;
        const shippingSpeed: ShippingSpeed =
          body.shippingSpeed === 'Express' ? 'Express' : 'Standard';
        const customPrinting = body.customPrinting === 'true' || body.customPrinting === '1';

        if (!BULK_APPAREL_PRICES[apparelType]) {
          res.status(400).json({ error: 'Please select a valid apparel type.' });
          return;
        }
        if (!FABRIC_MODIFIERS[fabric]) {
          res.status(400).json({ error: 'Please select a valid fabric.' });
          return;
        }

        let sizeMatrix: SizeMatrix = { S: 0, M: 0, L: 0, XL: 0, XXL: 0 };
        if (body.sizeMatrix) {
          try {
            const parsed = JSON.parse(body.sizeMatrix);
            sizeMatrix = {
              S: Math.max(0, Math.floor(Number(parsed.S) || 0)),
              M: Math.max(0, Math.floor(Number(parsed.M) || 0)),
              L: Math.max(0, Math.floor(Number(parsed.L) || 0)),
              XL: Math.max(0, Math.floor(Number(parsed.XL) || 0)),
              XXL: Math.max(0, Math.floor(Number(parsed.XXL) || 0)),
            };
          } catch {
            res.status(400).json({ error: 'Invalid size matrix payload.' });
            return;
          }
        }

        const parsedBaseRate = body.overrideBaseUnitPrice ? Number(body.overrideBaseUnitPrice) : undefined;
        const parsedFabricDelta = body.overrideFabricDelta ? Number(body.overrideFabricDelta) : undefined;

        const calc = calculateBulkEstimate(
          {
            apparelType,
            fabric,
            sizes: sizeMatrix,
            customPrinting,
            shippingSpeed,
          },
          {
            baseUnitPrice: Number.isFinite(parsedBaseRate) ? parsedBaseRate : undefined,
            fabricDelta: Number.isFinite(parsedFabricDelta) ? parsedFabricDelta : undefined,
          },
        );

        if (!calc.meetsMinimum) {
          res.status(400).json({
            error: `Wholesale orders require a minimum of ${BULK_MIN_UNITS} total units (currently ${calc.totalQuantity}).`,
          });
          return;
        }

        const logoUrl = req.file ? `/uploads/${req.file.filename}` : null;
        const quoteNumber = `TM-BLK-${Math.floor(8500 + Math.random() * 1499)}`;

        const quote = await createBulkQuote({
          quoteNumber,
          userUid: req.user?.uid ?? null,
          businessName,
          contactName,
          contactEmail,
          contactPhone,
          gstin,
          apparelType,
          fabric,
          sizeMatrix,
          totalQuantity: calc.totalQuantity,
          customPrinting,
          logoUrl,
          shippingSpeed,
          unitPriceInr: calc.effectiveUnitPrice,
          baseCostInr: calc.baseCost,
          printingCostInr: calc.printingCost,
          discountPercent: calc.discountPercent,
          discountAmountInr: calc.discountAmount,
          discountedSubtotalInr: calc.discountedSubtotal,
          gstInr: calc.gstAmount,
          shippingFeeInr: calc.shippingFee,
          estimatedTotalInr: calc.grandTotal,
          utrNumber: null,
          advancePaidInr: 0,
          notes,
          status: 'Pending',
        });

        res.status(201).json({ quote });
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    },
  );

  app.post('/api/bulk-quotes/:id/payment', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { utrNumber, advancePaidInr } = req.body as {
        utrNumber?: string;
        advancePaidInr?: number;
      };
      const cleanUtr = (utrNumber || '').trim();
      if (!isValidUtrNumber(cleanUtr)) {
        res.status(400).json({ error: 'Please enter a valid 12-digit UPI UTR number.' });
        return;
      }
      const amount = Math.max(1, Math.round(Number(advancePaidInr) || 0));
      const updated = await recordBulkQuoteUpiPayment(id, cleanUtr, amount);
      if (!updated) {
        res.status(404).json({ error: 'Bulk quote not found.' });
        return;
      }
      res.json({ quote: updated });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.patch('/api/bulk-quotes/:id/status', requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { status } = req.body as { status?: OrderStatus };
      if (!status || !ALLOWED_STATUSES.includes(status)) {
        res.status(400).json({ error: 'Invalid quote status.' });
        return;
      }
      const quote = await updateBulkQuoteStatus(id, status);
      if (!quote) {
        res.status(404).json({ error: 'Bulk quote not found.' });
        return;
      }
      res.json({ quote });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ---------------------------------------------------------------------------
  // Public Order / Quote Reference Tracking
  // ---------------------------------------------------------------------------
  app.get('/api/track/:reference', async (req, res) => {
    try {
      const result = await trackReference(req.params.reference);
      if (!result) {
        res.status(404).json({ error: 'No retail order or bulk quote found for that reference.' });
        return;
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ---------------------------------------------------------------------------
  // Admin Dashboard Analytics
  // ---------------------------------------------------------------------------
  app.get('/api/admin/dashboard', requireAdmin, async (_req, res) => {
    try {
      const summary = await getAdminDashboardSummary();
      res.json({ summary });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ---------------------------------------------------------------------------
  // Payment Settings API (Public Read + Admin Update)
  // ---------------------------------------------------------------------------
  app.get('/api/payment-settings', async (_req, res) => {
    try {
      const settings = await getPaymentSettings();
      res.json({ settings });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.patch('/api/admin/payment-settings', requireAdmin, async (req, res) => {
    try {
      const { merchantUpiId, merchantMobile, brandName, defaultTrackingBaseUrl } = req.body as {
        merchantUpiId?: string;
        merchantMobile?: string;
        brandName?: string;
        defaultTrackingBaseUrl?: string;
      };

      const cleanUpi = (merchantUpiId || '').trim();
      if (!isValidUpiId(cleanUpi)) {
        res.status(400).json({
          error: 'Please enter a valid UPI ID (for example: balajigoud11@axl).',
        });
        return;
      }

      const digits = (merchantMobile || '').replace(/\D/g, '');
      const cleanMobile = digits.slice(-10);
      if (cleanMobile.length !== 10) {
        res.status(400).json({
          error: 'Please enter a valid 10-digit Indian mobile number.',
        });
        return;
      }

      let validatedTrackingBase: string | undefined = undefined;
      if (defaultTrackingBaseUrl !== undefined) {
        const trimmedBase = defaultTrackingBaseUrl.trim();
        if (trimmedBase === '') {
          validatedTrackingBase = '';
        } else {
          const safeBase = sanitizeExternalTrackingUrl(trimmedBase);
          if (!safeBase) {
            res.status(400).json({
              error:
                'Default Courier Tracking Base URL must start with http:// or https:// (or leave blank to clear).',
            });
            return;
          }
          validatedTrackingBase = safeBase;
        }
      }

      const settings = await updatePaymentSettings({
        merchantUpiId: cleanUpi,
        merchantMobile: cleanMobile,
        brandName: brandName?.trim() || 'The Magnet',
        defaultTrackingBaseUrl: validatedTrackingBase,
      });
      res.json({ settings });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(400).json({ error: err.message || 'Request failed.' });
  });

  const isProd =
    process.env.NODE_ENV === 'production' &&
    fs.existsSync(path.resolve(process.cwd(), 'dist', 'index.html'));

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[The Magnet] Full-stack server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start The Magnet server:', err);
  process.exit(1);
});
