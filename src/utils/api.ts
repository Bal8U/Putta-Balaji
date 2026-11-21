import type {
  AdminDashboardSummary,
  ApparelCategory,
  ApparelSize,
  BulkQuote,
  OrderStatus,
  PaymentMethod,
  PaymentSettings,
  Product,
  RetailOrder,
  StoreDepartment,
} from '../types';
import { formatINR } from './pricing';
import {
  DEFAULT_MERCHANT_MOBILE,
  DEFAULT_MERCHANT_UPI_ID,
  OWNER_INSTAGRAM_HANDLE,
  OWNER_NAME,
} from './upi';
import type { EkartStepKey } from './ekart';

const ADMIN_JWT_KEY = 'themagnet_admin_token';

let firebaseTokenProvider: (() => Promise<string | null>) | null = null;

export function registerFirebaseTokenProvider(provider: () => Promise<string | null>): void {
  firebaseTokenProvider = provider;
}

export function getStoredAdminToken(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_JWT_KEY);
  } catch {
    return null;
  }
}

export function setStoredAdminToken(token: string | null): void {
  try {
    if (token) {
      sessionStorage.setItem(ADMIN_JWT_KEY, token);
    } else {
      sessionStorage.removeItem(ADMIN_JWT_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

async function resolveAuthToken(): Promise<string | null> {
  const adminJwt = getStoredAdminToken();
  if (adminJwt) return adminJwt;
  if (firebaseTokenProvider) {
    return firebaseTokenProvider();
  }
  return null;
}

async function apiJson<T>(
  url: string,
  options: RequestInit = {},
  explicitToken?: string | null,
): Promise<T> {
  const token = explicitToken !== undefined ? explicitToken : await resolveAuthToken();
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, { ...options, headers });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

export async function syncFirebaseUser(idToken: string): Promise<{
  id: number;
  uid: string;
  email: string;
  fullName: string;
  role: string;
}> {
  const data = await apiJson<{
    user: { id: number; uid: string; email: string; fullName: string; role: string };
  }>('/api/auth/sync', { method: 'POST' }, idToken);
  return data.user;
}

export async function fetchMyOrders(): Promise<{
  orders: RetailOrder[];
  quotes: BulkQuote[];
}> {
  const token = firebaseTokenProvider ? await firebaseTokenProvider() : null;
  return apiJson('/api/my-orders', {}, token);
}

export async function fetchProducts(): Promise<Product[]> {
  const data = await apiJson<{ products: Product[] }>('/api/products');
  return data.products;
}

export async function submitRetailOrder(payload: {
  orderNumber?: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: string;
  city: string;
  state: string;
  pincode: string;
  paymentMethod: PaymentMethod;
  utrNumber?: string;
  items: Array<{ productId: number; size: ApparelSize; qty: number }>;
}): Promise<RetailOrder> {
  const data = await apiJson<{ order: RetailOrder }>('/api/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.order;
}

export async function submitBulkQuote(formData: FormData): Promise<BulkQuote> {
  const data = await apiJson<{ quote: BulkQuote }>('/api/bulk-quotes', {
    method: 'POST',
    body: formData,
  });
  return data.quote;
}

export async function submitBulkQuotePayment(
  quoteId: number,
  utrNumber: string,
  advancePaidInr: number,
): Promise<BulkQuote> {
  const data = await apiJson<{ quote: BulkQuote }>(`/api/bulk-quotes/${quoteId}/payment`, {
    method: 'POST',
    body: JSON.stringify({ utrNumber, advancePaidInr }),
  });
  return data.quote;
}

export async function trackOrderOrQuote(reference: string): Promise<
  | { type: 'retail'; record: RetailOrder }
  | { type: 'bulk'; record: BulkQuote }
> {
  return apiJson(`/api/track/${encodeURIComponent(reference.trim())}`);
}

export async function fetchRecentOrders(): Promise<RetailOrder[]> {
  const data = await apiJson<{ orders: RetailOrder[] }>('/api/orders/recent');
  return data.orders;
}

export async function fetchOrderDetails(orderId: string): Promise<RetailOrder> {
  const data = await apiJson<{ order: RetailOrder }>(
    `/api/orders/lookup/${encodeURIComponent(orderId.trim())}`,
  );
  return data.order;
}

export async function loginAdmin(email: string, password: string): Promise<{
  token: string;
  user: { id: number; fullName: string; email: string; role: string };
}> {
  return apiJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function verifyAdminSession(): Promise<{
  user: { id: number; fullName: string; email: string; role: string };
}> {
  return apiJson('/api/auth/me');
}

export async function fetchAdminDashboard(): Promise<AdminDashboardSummary> {
  const data = await apiJson<{ summary: AdminDashboardSummary }>('/api/admin/dashboard');
  return data.summary;
}

export async function fetchAdminOrders(): Promise<RetailOrder[]> {
  const data = await apiJson<{ orders: RetailOrder[] }>('/api/orders');
  return data.orders;
}

export async function fetchAdminBulkQuotes(): Promise<BulkQuote[]> {
  const data = await apiJson<{ quotes: BulkQuote[] }>('/api/bulk-quotes');
  return data.quotes;
}

export async function createAdminProduct(formData: FormData): Promise<Product> {
  const data = await apiJson<{ product: Product }>('/api/products', {
    method: 'POST',
    body: formData,
  });
  return data.product;
}

export async function updateAdminProduct(
  id: number,
  patch: {
    stock?: number;
    priceInr?: number;
    listingPriceInr?: number;
    name?: string;
    category?: ApparelCategory;
    department?: Exclude<StoreDepartment, 'All'>;
  },
): Promise<Product> {
  const data = await apiJson<{ product: Product }>(`/api/products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return data.product;
}

export async function deleteAdminProduct(id: number): Promise<void> {
  await apiJson(`/api/products/${id}`, { method: 'DELETE' });
}

export async function updateAdminOrderStatus(id: number, status: OrderStatus): Promise<RetailOrder> {
  const data = await apiJson<{ order: RetailOrder }>(`/api/orders/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  return data.order;
}

export async function updateAdminOrderTracking(
  id: number,
  payload: {
    status: OrderStatus;
    hubLocation?: string;
    detail?: string;
    awbNumber?: string;
    courierPartner?: string;
  },
): Promise<RetailOrder> {
  const data = await apiJson<{ order: RetailOrder }>(`/api/orders/${id}/tracking`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return data.order;
}

export async function handoverAdminOrderToEkart(id: number): Promise<RetailOrder> {
  const data = await apiJson<{ order: RetailOrder }>(`/api/orders/${id}/handover-ekart`, {
    method: 'POST',
  });
  return data.order;
}

export async function saveAdminOrderTrackingUrl(
  orderCode: string,
  payload: {
    courierName: string;
    trackingId: string;
    trackingUrl: string;
  },
): Promise<RetailOrder> {
  const data = await apiJson<{ order: RetailOrder }>(
    `/api/admin/orders/${encodeURIComponent(orderCode)}/tracking-url`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
  );
  return data.order;
}

export async function removeAdminOrderTrackingUrl(orderCode: string): Promise<RetailOrder> {
  const data = await apiJson<{ order: RetailOrder }>(
    `/api/admin/orders/${encodeURIComponent(orderCode)}/tracking-url`,
    {
      method: 'DELETE',
    },
  );
  return data.order;
}

export async function fetchEkartShipments(): Promise<RetailOrder[]> {
  const data = await apiJson<{ shipments: RetailOrder[] }>('/api/ekart/shipments');
  return data.shipments;
}

export async function fetchEkartShipment(trackingId: string): Promise<RetailOrder> {
  const data = await apiJson<{ order: RetailOrder }>(
    `/api/ekart/track/${encodeURIComponent(trackingId.trim())}`,
  );
  return data.order;
}

export async function pushEkartHubScan(
  trackingId: string,
  payload: {
    stepKey: EkartStepKey;
    hubLocation?: string;
    detail?: string;
    executiveName?: string;
    executivePhone?: string;
    otp?: string;
  },
): Promise<RetailOrder> {
  const data = await apiJson<{ order: RetailOrder }>(
    `/api/ekart/track/${encodeURIComponent(trackingId.trim())}/scan`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );
  return data.order;
}

export async function updateAdminQuoteStatus(id: number, status: OrderStatus): Promise<BulkQuote> {
  const data = await apiJson<{ quote: BulkQuote }>(`/api/bulk-quotes/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  return data.quote;
}

export async function fetchPaymentSettings(): Promise<PaymentSettings> {
  const data = await apiJson<{ settings: PaymentSettings }>('/api/payment-settings');
  return data.settings;
}

export async function updateAdminPaymentSettings(patch: {
  merchantUpiId: string;
  merchantMobile: string;
  brandName?: string;
  defaultTrackingBaseUrl?: string;
}): Promise<PaymentSettings> {
  const data = await apiJson<{ settings: PaymentSettings }>('/api/admin/payment-settings', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return data.settings;
}

export function buildEstimateReceiptHtml(
  quote: BulkQuote,
  payment?: Partial<PaymentSettings>,
): string {
  const merchantUpiId = (payment?.merchantUpiId || DEFAULT_MERCHANT_UPI_ID).trim();
  const merchantMobile = (payment?.merchantMobile || DEFAULT_MERCHANT_MOBILE).trim();
  const dateStr = new Date(quote.createdAt).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const sizesLine = Object.entries(quote.sizeMatrix)
    .filter(([, qty]) => Number(qty) > 0)
    .map(([size, qty]) => `${size}: ${qty}`)
    .join(' · ');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>The Magnet Wholesale Estimate — ${quote.quoteNumber}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #09090b; margin: 0; padding: 32px; background: #f4f4f5; }
    .sheet { max-width: 760px; margin: 0 auto; background: #fff; border: 1px solid #e4e4e7; border-radius: 12px; overflow: hidden; }
    .banner { background: #09090b; color: #fff; padding: 28px 36px; display: flex; justify-content: space-between; align-items: center; border-bottom: 4px solid #facc15; }
    .brand { font-size: 26px; font-weight: 800; color: #facc15; margin: 0; letter-spacing: -0.02em; }
    .tagline { color: #38bdf8; font-size: 11px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; margin: 4px 0 0; }
    .content { padding: 32px 36px; }
    .muted { color: #71717a; font-size: 13px; margin: 4px 0 0; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px; }
    th, td { text-align: left; padding: 10px 0; border-bottom: 1px solid #e4e4e7; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    .total-row td { font-size: 18px; font-weight: 800; color: #09090b; border-top: 2px solid #09090b; border-bottom: none; padding-top: 14px; }
    .footer { margin-top: 28px; font-size: 12px; color: #52525b; border-top: 1px solid #e4e4e7; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="banner">
      <div>
        <h1 class="brand">THE MAGNET</h1>
        <p class="tagline">Sports Wear &amp; Trendy Fashions</p>
        <p style="color:#a1a1aa;font-size:12px;margin:6px 0 0;">Owner: ${OWNER_NAME} · Instagram: ${OWNER_INSTAGRAM_HANDLE}</p>
      </div>
      <div style="text-align:right">
        <div style="font-weight:800;font-size:14px;color:#facc15;">BULK TEAM &amp; WHOLESALE ESTIMATE</div>
        <div style="color:#e4e4e7;font-size:13px;margin-top:4px;">${quote.quoteNumber} · ${dateStr}</div>
        <div style="color:#38bdf8;font-size:12px;margin-top:2px;">Status: ${quote.status}</div>
      </div>
    </div>
    <div class="content">
      <div class="grid">
        <div>
          <strong>Prepared For</strong><br/>
          ${quote.businessName}<br/>
          Attn: ${quote.contactName}<br/>
          ${quote.contactEmail} · ${quote.contactPhone}
          ${quote.gstin ? `<br/>Buyer GSTIN: ${quote.gstin}` : ''}
        </div>
        <div>
          <strong>Kit Specification</strong><br/>
          Apparel: ${quote.apparelType} (${quote.fabric})<br/>
          Quantity: ${quote.totalQuantity} units (${sizesLine})<br/>
          Custom Team Logo / Printing: ${quote.customPrinting ? 'Yes (+₹45/unit)' : 'No'}<br/>
          Dispatch: ${quote.shippingSpeed} Delivery (Pan-India Courier)
          ${quote.utrNumber ? `<br/>UPI Advance UTR: ${quote.utrNumber} (${formatINR(quote.advancePaidInr)})` : ''}
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th class="num">Amount (INR)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Base Apparel Cost (${quote.totalQuantity} × ${formatINR(quote.unitPriceInr)}/unit)</td>
            <td class="num">${formatINR(quote.baseCostInr)}</td>
          </tr>
          ${
            quote.customPrinting
              ? `<tr><td>Custom Team Logo Sublimation / DTF Printing (${quote.totalQuantity} × ₹45/unit)</td><td class="num">${formatINR(quote.printingCostInr)}</td></tr>`
              : ''
          }
          <tr>
            <td>Tiered Volume Discount (${quote.discountPercent}%)</td>
            <td class="num">− ${formatINR(quote.discountAmountInr)}</td>
          </tr>
          <tr>
            <td>Taxable Discounted Subtotal</td>
            <td class="num">${formatINR(quote.discountedSubtotalInr)}</td>
          </tr>
          <tr>
            <td>IGST / CGST + SGST (18%)</td>
            <td class="num">${formatINR(quote.gstInr)}</td>
          </tr>
          <tr>
            <td>Freight &amp; Courier Delivery (${quote.shippingSpeed})</td>
            <td class="num">${formatINR(quote.shippingFeeInr)}</td>
          </tr>
          <tr class="total-row">
            <td>Final Estimated Total (INR)</td>
            <td class="num">${formatINR(quote.estimatedTotalInr)}</td>
          </tr>
        </tbody>
      </table>
      <div class="footer">
        <div style="margin-bottom:8px;color:#09090b;">
          <strong>Official Payment UPI ID:</strong> <span style="font-family:monospace;">${merchantUpiId}</span> &nbsp;·&nbsp;
          <strong>WhatsApp (${OWNER_NAME}):</strong> <span style="font-family:monospace;">+91 ${merchantMobile}</span>
        </div>
        This estimate is valid for 15 days from issue date. Bulk production begins upon 30% advance UPI confirmation and team artwork proof sign-off.
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function downloadEstimateReceiptHtml(
  quote: BulkQuote,
  payment?: Partial<PaymentSettings>,
): void {
  const html = buildEstimateReceiptHtml(quote, payment);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${quote.quoteNumber}-TheMagnet-Estimate.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
