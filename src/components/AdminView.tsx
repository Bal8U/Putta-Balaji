import { useCallback, useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import {
  BarChart3,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Layers,
  Link2,
  Lock,
  LogOut,
  MapPin,
  Package,
  Plus,
  QrCode,
  Trash2,
  Truck,
  Wand2,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePaymentSettings } from '../context/PaymentSettingsContext';
import { buildUpiPaymentUri } from '../utils/upi';
import {
  buildAutoFillTrackingUrl,
  DEFAULT_COURIER_NAME,
  DEFAULT_COURIER_TRACKING_BASE_URL,
  sanitizeExternalTrackingUrl,
} from '../utils/ekart';
import type {
  AdminDashboardSummary,
  ApparelCategory,
  ApparelSize,
  BulkQuote,
  OrderStatus,
  Product,
  RetailOrder,
  StoreDepartment,
} from '../types';
import {
  createAdminProduct,
  deleteAdminProduct,
  fetchAdminBulkQuotes,
  fetchAdminDashboard,
  fetchAdminOrders,
  getStoredAdminToken,
  loginAdmin,
  removeAdminOrderTrackingUrl,
  saveAdminOrderTrackingUrl,
  setStoredAdminToken,
  updateAdminOrderStatus,
  updateAdminOrderTracking,
  updateAdminProduct,
  updateAdminQuoteStatus,
  verifyAdminSession,
} from '../utils/api';
import { formatINR } from '../utils/pricing';
import { computeListingPrice } from '../utils/orderHelpers';
import { ProductImage } from './ProductImage';
import { BulkOrderView } from './BulkOrderView';

export type AdminTab = 'overview' | 'inventory' | 'orders' | 'bulk' | 'settings';

interface AdminViewProps {
  products: Product[];
  initialTab?: AdminTab;
  onProductsChanged: () => Promise<void>;
  onOpenOrderDetails?: (orderNumber: string) => void;
}

const ORDER_STATUSES: OrderStatus[] = [
  'Order Placed — Awaiting Store Approval',
  'Payment Verification Pending',
  'Order Confirmed',
  'Packed & Shipped',
  'Out for Delivery',
  'Delivered',
  'Pending',
  'Approved / Quote Sent',
  'In Production',
];

const RETAIL_TRACKING_STAGES: OrderStatus[] = [
  'Order Placed — Awaiting Store Approval',
  'Order Confirmed',
  'Packed & Shipped',
  'Out for Delivery',
  'Delivered',
  'Payment Verification Pending',
];

const HUB_PRESETS = [
  'The Magnet Warehouse — Telangana',
  'Hyderabad Dispatch Hub',
  'Bhuvanagiri / Yadagirigutta Hub',
  'Secunderabad Sorting Hub',
  'Local Delivery Station',
];

const DEPARTMENTS: StoreDepartment[] = [
  'Sports Wear',
  'Gym & Training',
  'Trendy Fashions',
  'Team Kits',
  'Offer Zone',
];

const CATEGORIES: ApparelCategory[] = [
  'Dry-Fit Tees',
  'Compression Wear',
  'Track Pants & Joggers',
  'Streetwear Hoodies',
  'Co-Ord Sets',
  'Team Jerseys',
];

const ALL_SIZES: ApparelSize[] = ['S', 'M', 'L', 'XL', 'XXL'];

export function AdminView({
  products,
  initialTab = 'orders',
  onProductsChanged,
  onOpenOrderDetails,
}: AdminViewProps) {
  const { firebaseUser, profile, signInWithGoogle, logout: firebaseLogout } = useAuth();
  const { settings: paymentSettings, saveSettings: savePaymentSettings } = usePaymentSettings();
  const [authChecking, setAuthChecking] = useState(true);
  const [adminUser, setAdminUser] = useState<{
    fullName: string;
    email: string;
    role: string;
  } | null>(null);

  const [loginEmail, setLoginEmail] = useState('admin@themagnet.in');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  const [orderSubTab, setOrderSubTab] = useState<'bulk' | 'retail'>('retail');

  const [summary, setSummary] = useState<AdminDashboardSummary | null>(null);
  const [orders, setOrders] = useState<RetailOrder[]>([]);
  const [quotes, setQuotes] = useState<BulkQuote[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // New Product Form State
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<ApparelCategory>('Dry-Fit Tees');
  const [newDepartment, setNewDepartment] = useState<StoreDepartment>('Sports Wear');
  const [newFabric, setNewFabric] = useState('Dry-Fit Micro Mesh');
  const [newPrice, setNewPrice] = useState('699');
  const [newListingPrice, setNewListingPrice] = useState('1199');
  const [newStock, setNewStock] = useState('80');
  const [newColorName, setNewColorName] = useState('Midnight Black');
  const [newColorHex, setNewColorHex] = useState('#09090B');
  const [newSizes, setNewSizes] = useState<ApparelSize[]>(['S', 'M', 'L', 'XL']);
  const [newDescription, setNewDescription] = useState('');
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [addingProduct, setAddingProduct] = useState(false);

  // Stock & Price inline edits
  const [stockDrafts, setStockDrafts] = useState<Record<number, string>>({});
  const [priceDrafts, setPriceDrafts] = useState<Record<number, string>>({});
  const [listingDrafts, setListingDrafts] = useState<Record<number, string>>({});
  const [logoModalUrl, setLogoModalUrl] = useState<string | null>(null);

  // Live Tracking Update Modal State
  const [trackingOrder, setTrackingOrder] = useState<RetailOrder | null>(null);
  const [trackStatus, setTrackStatus] = useState<OrderStatus>('Packed & Shipped');
  const [trackHub, setTrackHub] = useState('Hyderabad Dispatch Hub');
  const [trackDetail, setTrackDetail] = useState('');
  const [trackAwb, setTrackAwb] = useState('');
  const [trackCourier, setTrackCourier] = useState(DEFAULT_COURIER_NAME);
  const [savingTracking, setSavingTracking] = useState(false);

  // Payment & Courier Settings form state (pre-filled with balajigoud11@axl & 9963225798)
  const [upiIdDraft, setUpiIdDraft] = useState(paymentSettings.merchantUpiId);
  const [mobileDraft, setMobileDraft] = useState(paymentSettings.merchantMobile);
  const [brandDraft, setBrandDraft] = useState(paymentSettings.brandName);
  const [trackingBaseUrlDraft, setTrackingBaseUrlDraft] = useState(
    paymentSettings.defaultTrackingBaseUrl ?? DEFAULT_COURIER_TRACKING_BASE_URL,
  );
  const [savingSettings, setSavingSettings] = useState(false);

  // Per-order Tracking URL Manager state (Admin-only CRUD)
  const [trackingUrlDrafts, setTrackingUrlDrafts] = useState<
    Record<string, { courierName: string; trackingId: string; trackingUrl: string }>
  >({});
  const [savingTrackingUrlOrder, setSavingTrackingUrlOrder] = useState<string | null>(null);
  const [removingTrackingUrlOrder, setRemovingTrackingUrlOrder] = useState<string | null>(null);

  useEffect(() => {
    setUpiIdDraft(paymentSettings.merchantUpiId);
    setMobileDraft(paymentSettings.merchantMobile);
    setBrandDraft(paymentSettings.brandName);
    setTrackingBaseUrlDraft(paymentSettings.defaultTrackingBaseUrl ?? '');
  }, [paymentSettings]);

  const getOrderTrackingDraft = (order: RetailOrder) => {
    const existing = trackingUrlDrafts[order.orderNumber];
    if (existing) return existing;
    const defaultCourier =
      order.courierPartner &&
      order.courierPartner !== 'The Magnet Store Dispatch' &&
      !/ekart/i.test(order.courierPartner)
        ? order.courierPartner
        : DEFAULT_COURIER_NAME;
    return {
      courierName: defaultCourier,
      trackingId: order.ekartTrackingId || '',
      trackingUrl: order.trackingUrl || '',
    };
  };

  const updateOrderTrackingDraft = (
    order: RetailOrder,
    patch: Partial<{ courierName: string; trackingId: string; trackingUrl: string }>,
  ) => {
    setTrackingUrlDrafts((prev) => {
      const current = prev[order.orderNumber] || getOrderTrackingDraft(order);
      return {
        ...prev,
        [order.orderNumber]: {
          ...current,
          ...patch,
        },
      };
    });
  };

  const chartCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<Chart | null>(null);

  const loadAdminData = useCallback(async () => {
    try {
      setDataError(null);
      const [sum, ord, qts] = await Promise.all([
        fetchAdminDashboard(),
        fetchAdminOrders(),
        fetchAdminBulkQuotes(),
      ]);
      setSummary(sum);
      setOrders(ord);
      setQuotes(qts);
    } catch (err) {
      setDataError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      const token = getStoredAdminToken();
      const canUseGoogleAdmin = Boolean(firebaseUser && profile?.role === 'admin');
      if (!token && !canUseGoogleAdmin) {
        setAuthChecking(false);
        return;
      }
      try {
        const { user } = await verifyAdminSession();
        setAdminUser(user);
        await loadAdminData();
      } catch {
        setStoredAdminToken(null);
        setAdminUser(null);
      } finally {
        setAuthChecking(false);
      }
    };
    void checkAuth();
  }, [loadAdminData, firebaseUser, profile]);

  // Render Chart.js monthly sales chart on Overview tab
  useEffect(() => {
    if (activeTab !== 'overview' || !summary || !chartCanvasRef.current) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
      chartInstanceRef.current = null;
    }

    const ctx = chartCanvasRef.current.getContext('2d');
    if (!ctx) return;

    chartInstanceRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: summary.monthlySales.map((m) => m.month),
        datasets: [
          {
            label: 'Bulk Team Kits (₹)',
            data: summary.monthlySales.map((m) => m.wholesaleInr),
            backgroundColor: '#09090B',
            borderRadius: 6,
            maxBarThickness: 32,
          },
          {
            label: 'Retail Storefront (₹)',
            data: summary.monthlySales.map((m) => m.retailInr),
            backgroundColor: '#0284C7',
            borderRadius: 6,
            maxBarThickness: 32,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: {
              boxWidth: 12,
              usePointStyle: true,
              font: { family: 'Plus Jakarta Sans, sans-serif', size: 12 },
            },
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const value = Number(context.parsed.y || 0);
                return `${context.dataset.label}: ${formatINR(value)}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            grid: { color: '#F1F5F9' },
            ticks: {
              callback: (val) => `₹${Math.round(Number(val) / 1000)}k`,
              font: { family: 'JetBrains Mono, monospace', size: 11 },
            },
          },
        },
      },
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [activeTab, summary]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoggingIn(true);
    try {
      const res = await loginAdmin(loginEmail, loginPassword);
      setStoredAdminToken(res.token);
      setAdminUser(res.user);
      setLoginPassword('');
      await loadAdminData();
    } catch (err) {
      setLoginError((err as Error).message);
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    setStoredAdminToken(null);
    setAdminUser(null);
    setSummary(null);
    setOrders([]);
    setQuotes([]);
    if (firebaseUser) {
      await firebaseLogout();
    }
  };

  const showNotice = (msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => setFeedback((cur) => (cur === msg ? null : cur)), 3200);
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setDataError(null);
    if (!newName.trim()) {
      setDataError('Product name is required.');
      return;
    }
    setAddingProduct(true);
    try {
      const fd = new FormData();
      fd.append('name', newName.trim());
      fd.append('category', newCategory);
      fd.append('department', newDepartment);
      fd.append('fabric', newFabric.trim() || '100% Cotton');
      fd.append('priceInr', newPrice);
      fd.append('listingPriceInr', newListingPrice || newPrice);
      fd.append('stock', newStock);
      fd.append('colorName', newColorName.trim() || 'Heritage Teal');
      fd.append('colorHex', newColorHex);
      fd.append('sizes', JSON.stringify(newSizes.length > 0 ? newSizes : ['M', 'L']));
      fd.append('description', newDescription.trim());
      if (newImageFile) {
        fd.append('image', newImageFile);
      }

      await createAdminProduct(fd);
      setNewName('');
      setNewPrice('1290');
      setNewListingPrice('1990');
      setNewStock('75');
      setNewDescription('');
      setNewImageFile(null);
      await onProductsChanged();
      await loadAdminData();
      showNotice('New garment added to catalog inventory.');
    } catch (err) {
      setDataError((err as Error).message);
    } finally {
      setAddingProduct(false);
    }
  };

  const handleSaveProductEdits = async (product: Product) => {
    const rawStock = stockDrafts[product.id];
    const rawPrice = priceDrafts[product.id];
    const rawListing = listingDrafts[product.id];
    const payload: { stock?: number; priceInr?: number; listingPriceInr?: number } = {};
    if (rawStock !== undefined) {
      const n = Number(rawStock);
      if (Number.isFinite(n) && n >= 0) payload.stock = Math.floor(n);
    }
    if (rawPrice !== undefined) {
      const n = Number(rawPrice);
      if (Number.isFinite(n) && n > 0) payload.priceInr = Math.round(n);
    }
    if (rawListing !== undefined) {
      const n = Number(rawListing);
      if (Number.isFinite(n) && n > 0) payload.listingPriceInr = Math.round(n);
    }
    if (Object.keys(payload).length === 0) return;

    try {
      await updateAdminProduct(product.id, payload);
      setStockDrafts((prev) => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
      setPriceDrafts((prev) => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
      setListingDrafts((prev) => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
      await onProductsChanged();
      await loadAdminData();
      showNotice(`Updated pricing & stock for ${product.name}.`);
    } catch (err) {
      setDataError((err as Error).message);
    }
  };

  const handleDeleteProduct = async (product: Product) => {
    try {
      await deleteAdminProduct(product.id);
      await onProductsChanged();
      await loadAdminData();
      showNotice(`Deleted ${product.name} from inventory.`);
    } catch (err) {
      setDataError((err as Error).message);
    }
  };

  const handleQuoteStatusChange = async (quoteId: number, status: OrderStatus) => {
    try {
      const updated = await updateAdminQuoteStatus(quoteId, status);
      setQuotes((prev) => prev.map((q) => (q.id === quoteId ? updated : q)));
      const sum = await fetchAdminDashboard();
      setSummary(sum);
      showNotice(`Quote ${updated.quoteNumber} updated to "${status}".`);
    } catch (err) {
      setDataError((err as Error).message);
    }
  };

  const handleOrderStatusChange = async (orderId: number, status: OrderStatus) => {
    try {
      const updated = await updateAdminOrderStatus(orderId, status);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      const sum = await fetchAdminDashboard();
      setSummary(sum);
      showNotice(`Order ${updated.orderNumber} updated to "${status}".`);
    } catch (err) {
      setDataError((err as Error).message);
    }
  };

  const handleAutoFillTrackingUrl = (order: RetailOrder) => {
    const draft = getOrderTrackingDraft(order);
    const candidateId = draft.trackingId.trim() || order.ekartTrackingId || '';
    if (!candidateId) {
      setDataError(`Enter a Tracking ID for ${order.orderNumber} first to auto-fill the courier URL.`);
      return;
    }
    const basePreset = paymentSettings.defaultTrackingBaseUrl?.trim() || '';
    if (!basePreset) {
      setDataError(
        'Set a Default Courier Tracking Base URL in Admin Settings first, or paste the full tracking URL directly.',
      );
      return;
    }
    const autoUrl = buildAutoFillTrackingUrl(basePreset, candidateId);
    if (!autoUrl) {
      setDataError('Configured Default Courier Tracking Base URL is invalid. Update it in Admin Settings.');
      return;
    }
    setDataError(null);
    updateOrderTrackingDraft(order, {
      courierName: draft.courierName.trim() || DEFAULT_COURIER_NAME,
      trackingId: candidateId,
      trackingUrl: autoUrl,
    });
    showNotice(`Auto-filled tracking URL for ${order.orderNumber}. Click "Save Tracking URL" to publish.`);
  };

  const handleSaveTrackingUrl = async (order: RetailOrder) => {
    const draft = getOrderTrackingDraft(order);
    const safeUrl = sanitizeExternalTrackingUrl(draft.trackingUrl);
    if (!safeUrl) {
      setDataError(
        `Please enter a valid http:// or https:// tracking URL for ${order.orderNumber} before saving.`,
      );
      return;
    }
    setSavingTrackingUrlOrder(order.orderNumber);
    setDataError(null);
    try {
      const updated = await saveAdminOrderTrackingUrl(order.orderNumber, {
        courierName: draft.courierName.trim() || DEFAULT_COURIER_NAME,
        trackingId: draft.trackingId.trim(),
        trackingUrl: safeUrl,
      });
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      setTrackingUrlDrafts((prev) => ({
        ...prev,
        [order.orderNumber]: {
          courierName: updated.courierPartner || DEFAULT_COURIER_NAME,
          trackingId: updated.ekartTrackingId || '',
          trackingUrl: updated.trackingUrl || '',
        },
      }));
      showNotice(`Tracking URL saved for ${updated.orderNumber} (${updated.courierPartner}).`);
    } catch (err) {
      setDataError((err as Error).message);
    } finally {
      setSavingTrackingUrlOrder(null);
    }
  };

  const handleRemoveTrackingUrl = async (order: RetailOrder) => {
    setRemovingTrackingUrlOrder(order.orderNumber);
    setDataError(null);
    try {
      const updated = await removeAdminOrderTrackingUrl(order.orderNumber);
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      setTrackingUrlDrafts((prev) => ({
        ...prev,
        [order.orderNumber]: {
          courierName: DEFAULT_COURIER_NAME,
          trackingId: '',
          trackingUrl: '',
        },
      }));
      showNotice(`Tracking URL & Tracking ID removed for ${updated.orderNumber}. Customer link hidden.`);
    } catch (err) {
      setDataError((err as Error).message);
    } finally {
      setRemovingTrackingUrlOrder(null);
    }
  };

  const openTrackingModal = (order: RetailOrder) => {
    setTrackingOrder(order);
    const nextStage: OrderStatus =
      order.status === 'Order Confirmed'
        ? 'Packed & Shipped'
        : order.status === 'Packed & Shipped'
        ? 'Out for Delivery'
        : order.status === 'Out for Delivery'
        ? 'Delivered'
        : order.status === 'Payment Verification Pending'
        ? 'Order Confirmed'
        : order.status;
    setTrackStatus(nextStage);
    setTrackHub(
      nextStage === 'Out for Delivery'
        ? 'Bhuvanagiri / Yadagirigutta Hub'
        : nextStage === 'Packed & Shipped'
        ? 'Hyderabad Dispatch Hub'
        : 'The Magnet Warehouse — Telangana',
    );
    setTrackDetail('');
    setTrackAwb(order.ekartTrackingId || order.awbNumber || `AWB${String(order.id).padStart(10, '0')}`);
    setTrackCourier(
      order.courierPartner && !/ekart/i.test(order.courierPartner)
        ? order.courierPartner
        : DEFAULT_COURIER_NAME,
    );
  };

  const handleSaveTrackingUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackingOrder) return;
    setSavingTracking(true);
    setDataError(null);
    try {
      const updated = await updateAdminOrderTracking(trackingOrder.id, {
        status: trackStatus,
        hubLocation: trackHub.trim() || 'Hyderabad Hub',
        detail:
          trackDetail.trim() ||
          `Shipment updated to ${trackStatus} at ${trackHub.trim() || 'Hyderabad Hub'}.`,
        awbNumber: trackAwb.trim() || undefined,
        courierPartner: trackCourier.trim() || undefined,
      });
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      const sum = await fetchAdminDashboard();
      setSummary(sum);
      setTrackingOrder(null);
      showNotice(
        `Tracking updated for ${updated.orderNumber}: ${updated.status} (${trackHub.trim() || 'Hyderabad Hub'}).`,
      );
    } catch (err) {
      setDataError((err as Error).message);
    } finally {
      setSavingTracking(false);
    }
  };

  if (authChecking) {
    return (
      <div className="max-w-md mx-auto px-4 py-24 text-center text-sm text-slate-500">
        Verifying admin session...
      </div>
    );
  }

  // Protected Admin Login Screen
  if (!adminUser) {
    return (
      <div className="max-w-md mx-auto px-4 sm:px-6 py-16">
        <div className="bg-white border border-zinc-200 rounded-xl p-8 space-y-6 shadow-sm">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-lg bg-zinc-950 flex items-center justify-center text-yellow-400">
              <Lock className="w-5 h-5" aria-hidden="true" />
            </div>
            <h1 className="font-display text-2xl font-bold text-zinc-950">
              The Magnet Admin Dispatch
            </h1>
            <p className="text-sm text-zinc-600">
              Sign in as Kanth (Rebel) to approve orders, manage courier tracking links, and update
              inventory.
            </p>
          </div>

          {loginError && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800"
            >
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="admin-email" className="block text-xs font-semibold text-zinc-700 mb-1">
                Admin Email
              </label>
              <input
                id="admin-email"
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-sky-600"
              />
            </div>

            <div>
              <label htmlFor="admin-password" className="block text-xs font-semibold text-zinc-700 mb-1">
                Password
              </label>
              <input
                id="admin-password"
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Enter admin password"
                className="w-full px-3.5 py-2.5 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-sky-600"
              />
            </div>

            <button
              type="submit"
              disabled={loggingIn}
              className="w-full py-3 rounded-lg bg-zinc-950 text-yellow-400 text-sm font-extrabold hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-60"
            >
              {loggingIn ? 'Signing In...' : 'Sign In to Admin Panel'}
            </button>
          </form>

          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-zinc-200" />
            <span className="mx-3 text-[11px] text-zinc-400">or</span>
            <div className="flex-grow border-t border-zinc-200" />
          </div>

          <button
            type="button"
            onClick={async () => {
              setLoginError(null);
              try {
                await signInWithGoogle();
              } catch (err) {
                setLoginError((err as Error).message);
              }
            }}
            className="w-full py-2.5 px-4 rounded-lg border border-zinc-300 bg-white text-zinc-800 text-sm font-semibold hover:bg-zinc-50 transition-colors cursor-pointer"
          >
            Sign in with Google (Firebase Auth)
          </button>

          <div className="pt-4 border-t border-zinc-100 text-xs text-zinc-500 space-y-1">
            <p className="font-semibold text-zinc-700">Default Admin Credentials</p>
            <p className="font-mono">Email: admin@themagnet.in</p>
            <p className="font-mono">Password: VastraAdmin2026</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-10">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Admin Sidebar Navigation */}
        <aside className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <div className="px-2 pb-3 border-b border-slate-100">
            <p className="text-xs text-slate-500">Signed in as</p>
            <p className="text-sm font-semibold text-slate-900 mt-0.5">{adminUser.fullName}</p>
            <p className="text-xs text-slate-500 truncate">{adminUser.email}</p>
          </div>

          <nav aria-label="Admin sections" className="space-y-1">
            {(
              [
                { id: 'overview', label: 'Dashboard Overview', icon: BarChart3 },
                { id: 'inventory', label: 'Inventory Management', icon: Package },
                { id: 'orders', label: 'Orders & Bulk Quotes', icon: ClipboardList },
                { id: 'bulk', label: 'Bulk Material & Quote Estimator', icon: Layers },
                { id: 'settings', label: 'Payment Settings', icon: QrCode },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  data-testid={`admin-tab-${item.id}`}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer text-left ${
                    active
                      ? 'bg-zinc-950 text-yellow-400'
                      : 'text-zinc-700 hover:bg-zinc-100'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="leading-snug">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span>Sign Out</span>
            </button>
          </div>
        </aside>

        {/* Admin Main Content */}
        <div className="lg:col-span-9 space-y-6">
          {dataError && (
            <div role="alert" className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
              {dataError}
            </div>
          )}

          {feedback && (
            <div
              role="status"
              className="p-3.5 rounded-lg bg-sky-50 border border-sky-200 text-xs font-medium text-sky-900"
            >
              {feedback}
            </div>
          )}

          {/* TAB 1: DASHBOARD OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900">
                  Operations Overview
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  Live retail revenue, wholesale production pipeline, and 6-month sales performance
                  in INR (₹).
                </p>
              </div>

              {/* 4 KPI Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs font-medium text-slate-500">Total Sales (₹)</p>
                  <p
                    data-testid="kpi-total-sales"
                    className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-2"
                  >
                    {summary ? formatINR(summary.totalSalesInr) : '—'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Retail + Approved Bulk Orders
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs font-medium text-slate-500">Active Bulk Orders</p>
                  <p
                    data-testid="kpi-active-bulk"
                    className="font-mono tabular-nums text-2xl font-bold text-sky-700 mt-2"
                  >
                    {summary ? summary.activeBulkOrdersCount : '—'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Approved or In Production
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs font-medium text-slate-500">Pending Estimates / UPI</p>
                  <p
                    data-testid="kpi-pending-estimates"
                    className="font-mono tabular-nums text-2xl font-bold text-amber-700 mt-2"
                  >
                    {summary ? summary.pendingEstimatesCount : '—'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {summary
                      ? `${summary.pendingPaymentVerificationsCount} UPI UTR verification pending`
                      : 'Awaiting approval'}
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs font-medium text-slate-500">Active SKUs</p>
                  <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-2">
                    {summary ? summary.totalProductsCount : products.length}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {summary ? `${summary.lowStockCount} low stock (< 25)` : ''}
                  </p>
                </div>
              </div>

              {/* Chart.js Sales Chart */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-sans text-base font-semibold text-slate-900">
                      Monthly Revenue Breakdown (INR)
                    </h2>
                    <p className="text-xs text-slate-500">
                      Wholesale Bulk Orders vs Retail Storefront (last 6 months)
                    </p>
                  </div>
                </div>
                <div className="h-72 w-full">
                  <canvas
                    ref={chartCanvasRef}
                    data-testid="sales-chart-canvas"
                    aria-label="Monthly retail and wholesale revenue chart"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: INVENTORY MANAGEMENT */}
          {activeTab === 'inventory' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900">
                  Inventory Management
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  Add new clothing SKUs, upload product photos, adjust stock counts, or retire
                  items.
                </p>
              </div>

              {/* Add New Garment Form */}
              <form
                onSubmit={handleAddProduct}
                className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
              >
                <h2 className="font-sans text-sm font-semibold text-slate-900">
                  Add New Apparel Item
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="sm:col-span-2">
                    <label htmlFor="inv-name" className="block text-xs font-medium text-slate-700 mb-1">
                      Product Name *
                    </label>
                    <input
                      id="inv-name"
                      type="text"
                      required
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. Surat Mulmul Festive Kurta"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                    />
                  </div>
                  <div>
                    <label htmlFor="inv-category" className="block text-xs font-medium text-slate-700 mb-1">
                      Category *
                    </label>
                    <select
                      id="inv-category"
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value as ApparelCategory)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-sky-600"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="inv-department" className="block text-xs font-medium text-slate-700 mb-1">
                      Store Department
                    </label>
                    <select
                      id="inv-department"
                      value={newDepartment}
                      onChange={(e) => setNewDepartment(e.target.value as StoreDepartment)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-sky-600"
                    >
                      {DEPARTMENTS.map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="inv-fabric" className="block text-xs font-medium text-slate-700 mb-1">
                      Fabric
                    </label>
                    <input
                      id="inv-fabric"
                      type="text"
                      value={newFabric}
                      onChange={(e) => setNewFabric(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                    />
                  </div>
                  <div>
                    <label htmlFor="inv-listing-price" className="block text-xs font-medium text-slate-700 mb-1">
                      Listing Price / MRP (₹) *
                    </label>
                    <input
                      id="inv-listing-price"
                      type="number"
                      min={100}
                      required
                      value={newListingPrice}
                      onChange={(e) => setNewListingPrice(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                    />
                  </div>
                  <div>
                    <label htmlFor="inv-price" className="block text-xs font-medium text-slate-700 mb-1">
                      Selling Price (₹ INR) *
                    </label>
                    <input
                      id="inv-price"
                      type="number"
                      min={100}
                      required
                      value={newPrice}
                      onChange={(e) => setNewPrice(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                    />
                  </div>
                  <div>
                    <label htmlFor="inv-stock" className="block text-xs font-medium text-slate-700 mb-1">
                      Stock Count *
                    </label>
                    <input
                      id="inv-stock"
                      type="number"
                      min={0}
                      required
                      value={newStock}
                      onChange={(e) => setNewStock(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                    />
                  </div>
                  <div>
                    <label htmlFor="inv-color" className="block text-xs font-medium text-slate-700 mb-1">
                      Color Name
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="inv-color"
                        type="text"
                        value={newColorName}
                        onChange={(e) => setNewColorName(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                      />
                      <input
                        type="color"
                        aria-label="Color swatch hex"
                        value={newColorHex}
                        onChange={(e) => setNewColorHex(e.target.value)}
                        className="w-10 h-9 p-0.5 rounded border border-slate-200 cursor-pointer shrink-0"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="inv-image" className="block text-xs font-medium text-slate-700 mb-1">
                      Product Image (Optional)
                    </label>
                    <input
                      id="inv-image"
                      type="file"
                      accept="image/*"
                      onChange={(e) => setNewImageFile(e.target.files?.[0] || null)}
                      className="w-full text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-2.5 file:rounded-md file:border file:border-slate-200 file:bg-slate-50 file:text-xs file:font-medium"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-slate-700">Sizes:</span>
                    {ALL_SIZES.map((sz) => {
                      const checked = newSizes.includes(sz);
                      return (
                        <button
                          key={sz}
                          type="button"
                          onClick={() =>
                            setNewSizes((prev) =>
                              checked ? prev.filter((s) => s !== sz) : [...prev, sz],
                            )
                          }
                          className={`px-2.5 py-1 text-xs font-medium rounded border cursor-pointer ${
                            checked
                              ? 'border-sky-600 bg-sky-50 text-sky-900'
                              : 'border-slate-200 text-slate-500'
                          }`}
                        >
                          {sz}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="submit"
                    disabled={addingProduct}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 cursor-pointer disabled:opacity-60 whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    <span>{addingProduct ? 'Saving...' : 'Add Product'}</span>
                  </button>
                </div>
              </form>

              {/* Inventory Table */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                      <tr>
                        <th className="py-3 px-4 font-medium">Garment</th>
                        <th className="py-3 px-4 font-medium">Category / Dept</th>
                        <th className="py-3 px-4 font-medium text-right">MRP (₹)</th>
                        <th className="py-3 px-4 font-medium text-right">Selling (₹)</th>
                        <th className="py-3 px-4 font-medium text-right">Stock</th>
                        <th className="py-3 px-4 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {products.map((product) => {
                        const currentListing = computeListingPrice(
                          product.priceInr,
                          product.listingPriceInr,
                        );
                        const stockDraft = stockDrafts[product.id];
                        const priceDraft = priceDrafts[product.id];
                        const listingDraft = listingDrafts[product.id];
                        const isDirty =
                          (stockDraft !== undefined && stockDraft !== String(product.stock)) ||
                          (priceDraft !== undefined && priceDraft !== String(product.priceInr)) ||
                          (listingDraft !== undefined && listingDraft !== String(currentListing));
                        return (
                          <tr key={product.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-md overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                                  <ProductImage
                                    src={product.imageUrl}
                                    alt={product.name}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                                <div>
                                  <div className="font-medium text-slate-900">{product.name}</div>
                                  <div className="text-xs text-slate-500 font-mono">
                                    {product.sku} · {product.colorName}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-xs text-slate-600">
                              <div className="font-medium text-slate-800">{product.category}</div>
                              <div className="text-[11px] text-slate-500">
                                {product.department || 'Men'}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <input
                                type="number"
                                min={100}
                                aria-label={`Listing MRP for ${product.name}`}
                                value={listingDraft ?? String(currentListing)}
                                onChange={(e) =>
                                  setListingDrafts((prev) => ({
                                    ...prev,
                                    [product.id]: e.target.value,
                                  }))
                                }
                                className="w-20 px-2 py-1 text-right font-mono tabular-nums text-xs border border-slate-200 rounded focus:outline-none focus:border-sky-600"
                              />
                            </td>
                            <td className="py-3 px-4 text-right">
                              <input
                                type="number"
                                min={100}
                                aria-label={`Selling price for ${product.name}`}
                                value={priceDraft ?? String(product.priceInr)}
                                onChange={(e) =>
                                  setPriceDrafts((prev) => ({
                                    ...prev,
                                    [product.id]: e.target.value,
                                  }))
                                }
                                className="w-20 px-2 py-1 text-right font-mono tabular-nums text-xs border border-slate-200 rounded focus:outline-none focus:border-sky-600"
                              />
                            </td>
                            <td className="py-3 px-4 text-right">
                              <input
                                type="number"
                                min={0}
                                aria-label={`Stock count for ${product.name}`}
                                value={stockDraft ?? String(product.stock)}
                                onChange={(e) =>
                                  setStockDrafts((prev) => ({
                                    ...prev,
                                    [product.id]: e.target.value,
                                  }))
                                }
                                className="w-16 px-2 py-1 text-right font-mono tabular-nums text-xs border border-slate-200 rounded focus:outline-none focus:border-sky-600"
                              />
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex items-center justify-end gap-1.5">
                                {isDirty && (
                                  <button
                                    type="button"
                                    onClick={() => handleSaveProductEdits(product)}
                                    className="px-2.5 py-1 rounded bg-sky-600 text-white text-xs font-medium hover:bg-sky-700 cursor-pointer"
                                  >
                                    Save
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteProduct(product)}
                                  aria-label={`Delete ${product.name}`}
                                  className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ORDER & BULK QUOTE MANAGER */}
          {activeTab === 'orders' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900">
                    Orders &amp; Bulk Quotes
                  </h1>
                  <p className="text-xs text-slate-500 mt-1">
                    Inspect customer logos, verify GST totals, and update production or dispatch
                    statuses.
                  </p>
                </div>

                <div className="inline-flex p-1 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setOrderSubTab('bulk')}
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      orderSubTab === 'bulk'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Bulk Quotes ({quotes.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderSubTab('retail')}
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      orderSubTab === 'retail'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Retail Orders ({orders.length})
                  </button>
                </div>
              </div>

              {orderSubTab === 'bulk' ? (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                        <tr>
                          <th className="py-3 px-4 font-medium">Quote / Buyer</th>
                          <th className="py-3 px-4 font-medium">Specification</th>
                          <th className="py-3 px-4 font-medium">Logo</th>
                          <th className="py-3 px-4 font-medium text-right">Estimate (₹)</th>
                          <th className="py-3 px-4 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {quotes.map((quote) => (
                          <tr key={quote.id} className="hover:bg-slate-50/70 align-top">
                            <td className="py-3.5 px-4">
                              <div className="font-mono text-xs font-semibold text-sky-700">
                                {quote.quoteNumber}
                              </div>
                              <div className="font-medium text-slate-900 mt-0.5">
                                {quote.businessName}
                              </div>
                              <div className="text-xs text-slate-500">
                                {quote.contactName} · {quote.contactPhone}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-xs text-slate-600 space-y-0.5">
                              <div className="font-medium text-slate-900">
                                {quote.apparelType} · {quote.fabric}
                              </div>
                              <div className="font-mono tabular-nums">
                                {quote.totalQuantity} units · {quote.discountPercent}% tier off
                              </div>
                              <div>
                                {quote.customPrinting ? 'Custom Print (+₹45/u)' : 'No Print'} ·{' '}
                                {quote.shippingSpeed}
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              {quote.logoUrl ? (
                                <button
                                  type="button"
                                  onClick={() => setLogoModalUrl(quote.logoUrl || null)}
                                  className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 hover:underline cursor-pointer"
                                >
                                  <img
                                    src={quote.logoUrl}
                                    alt={`Logo for ${quote.businessName}`}
                                    className="w-8 h-8 object-contain rounded border border-slate-200 bg-white p-0.5"
                                  />
                                  <span>Inspect</span>
                                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400">None</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <div className="font-mono tabular-nums font-semibold text-slate-900">
                                {formatINR(quote.estimatedTotalInr)}
                              </div>
                              <div className="text-[11px] font-mono tabular-nums text-slate-500">
                                GST {formatINR(quote.gstInr)}
                              </div>
                              {quote.utrNumber && (
                                <div className="text-[11px] font-mono text-sky-700 mt-0.5">
                                  UTR: {quote.utrNumber}
                                </div>
                              )}
                            </td>
                            <td className="py-3.5 px-4 space-y-2">
                              <select
                                aria-label={`Status for quote ${quote.quoteNumber}`}
                                value={quote.status}
                                onChange={(e) =>
                                  handleQuoteStatusChange(quote.id, e.target.value as OrderStatus)
                                }
                                className="px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:border-sky-600 cursor-pointer"
                              >
                                {ORDER_STATUSES.map((st) => (
                                  <option key={st} value={st}>
                                    {st}
                                  </option>
                                ))}
                              </select>
                              {quote.status === 'Payment Verification Pending' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleQuoteStatusChange(quote.id, 'Approved / Quote Sent')
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-sky-600 text-white text-[11px] font-medium hover:bg-sky-700 cursor-pointer whitespace-nowrap"
                                >
                                  <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                                  <span>Approve UTR</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map((order) => {
                    const draft = getOrderTrackingDraft(order);
                    const savedSafeUrl = sanitizeExternalTrackingUrl(order.trackingUrl);
                    const isSavingUrl = savingTrackingUrlOrder === order.orderNumber;
                    const isRemovingUrl = removingTrackingUrlOrder === order.orderNumber;

                    return (
                      <article
                        key={order.id}
                        data-testid={`admin-order-card-${order.orderNumber}`}
                        className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs"
                      >
                        {/* Top Row: Order Meta, Items, Payment, Total & Status */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                          <div className="lg:col-span-3 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs font-bold text-sky-600">
                                {order.orderNumber}
                              </span>
                              {onOpenOrderDetails && (
                                <button
                                  type="button"
                                  onClick={() => onOpenOrderDetails(order.orderNumber)}
                                  className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-zinc-700 hover:text-sky-600 hover:underline cursor-pointer"
                                >
                                  <span>View</span>
                                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                                </button>
                              )}
                            </div>
                            <div className="font-semibold text-zinc-950 text-sm">
                              {order.customerName}
                            </div>
                            <div className="text-xs text-zinc-500">
                              {order.city}, {order.state} ({order.pincode})
                            </div>
                            {order.ekartTrackingId ? (
                              <div className="pt-1 space-y-1">
                                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-950 text-yellow-400 font-mono text-[11px] font-bold">
                                  <Truck className="w-3 h-3" aria-hidden="true" />
                                  <span>{order.ekartTrackingId}</span>
                                </div>
                                {order.deliveryOtp && (
                                  <div className="text-[11px] font-mono text-zinc-600">
                                    Delivery OTP:{' '}
                                    <strong className="text-zinc-950">{order.deliveryOtp}</strong>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-[11px] font-medium text-amber-700 pt-1">
                                Awaiting Courier Tracking Assignment
                              </div>
                            )}
                          </div>

                          <div className="lg:col-span-3 text-xs text-zinc-600 space-y-1">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                              Items
                            </p>
                            {order.items.map((it, idx) => (
                              <div key={`${order.id}-${idx}`} className="text-zinc-800">
                                {it.name} ({it.size}) × {it.qty}
                              </div>
                            ))}
                          </div>

                          <div className="lg:col-span-2 text-xs text-zinc-600 space-y-1">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                              Payment &amp; Total
                            </p>
                            <div className="font-mono tabular-nums font-bold text-sm text-zinc-950">
                              {formatINR(order.totalInr)}
                            </div>
                            <div className="font-semibold text-zinc-800">{order.paymentMethod}</div>
                            {order.utrNumber ? (
                              <div className="font-mono text-[11px] font-bold text-sky-600">
                                UTR: {order.utrNumber}
                              </div>
                            ) : (
                              order.paymentReference && (
                                <div className="font-mono text-[11px] text-zinc-500">
                                  {order.paymentReference}
                                </div>
                              )
                            )}
                          </div>

                          <div className="lg:col-span-4 space-y-2">
                            <select
                              aria-label={`Status for order ${order.orderNumber}`}
                              value={order.status}
                              onChange={(e) =>
                                handleOrderStatusChange(order.id, e.target.value as OrderStatus)
                              }
                              className="w-full px-2.5 py-1.5 text-xs font-semibold border border-zinc-200 rounded-lg bg-white text-zinc-900 focus:outline-none focus:border-sky-600 cursor-pointer"
                            >
                              {ORDER_STATUSES.map((st) => (
                                <option key={st} value={st}>
                                  {st}
                                </option>
                              ))}
                            </select>
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                data-testid={`update-tracking-${order.orderNumber}`}
                                onClick={() => openTrackingModal(order)}
                                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 text-xs font-semibold hover:border-zinc-950 hover:text-zinc-950 cursor-pointer whitespace-nowrap"
                              >
                                <MapPin className="w-3.5 h-3.5 text-sky-600" aria-hidden="true" />
                                <span>Update Dispatch Hub</span>
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Admin-Only Tracking URL Manager Box (Add, Edit, Open/Test, Remove) */}
                        <div
                          data-testid={`tracking-url-manager-${order.orderNumber}`}
                          className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Link2 className="w-4 h-4 text-sky-600 shrink-0" aria-hidden="true" />
                              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900">
                                Tracking URL Manager
                              </h3>
                              <span
                                data-testid={`tracking-url-status-${order.orderNumber}`}
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                                  savedSafeUrl
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-zinc-200 text-zinc-600'
                                }`}
                              >
                                {savedSafeUrl ? 'Active Customer Link' : 'No Tracking URL Set'}
                              </span>
                            </div>

                            <button
                              type="button"
                              data-testid={`autofill-tracking-url-${order.orderNumber}`}
                              onClick={() => handleAutoFillTrackingUrl(order)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-sky-200 text-sky-700 text-[11px] font-bold hover:bg-sky-50 transition-colors cursor-pointer"
                            >
                              <Wand2 className="w-3 h-3" aria-hidden="true" />
                              <span>Auto-Fill Courier URL</span>
                            </button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                            <div className="md:col-span-3">
                              <label
                                htmlFor={`courier-name-${order.orderNumber}`}
                                className="block text-[11px] font-semibold text-zinc-600 mb-1"
                              >
                                Courier Name
                              </label>
                              <input
                                id={`courier-name-${order.orderNumber}`}
                                type="text"
                                data-testid={`tracking-courier-${order.orderNumber}`}
                                value={draft.courierName}
                                onChange={(e) =>
                                  updateOrderTrackingDraft(order, { courierName: e.target.value })
                                }
                                placeholder="e.g. Delhivery, Blue Dart, DTDC"
                                className="w-full px-3 py-2 text-xs bg-white border border-zinc-300 rounded-lg focus:outline-none focus:border-sky-600"
                              />
                            </div>

                            <div className="md:col-span-3">
                              <label
                                htmlFor={`tracking-id-${order.orderNumber}`}
                                className="block text-[11px] font-semibold text-zinc-600 mb-1"
                              >
                                Tracking ID
                              </label>
                              <input
                                id={`tracking-id-${order.orderNumber}`}
                                type="text"
                                data-testid={`tracking-id-${order.orderNumber}`}
                                value={draft.trackingId}
                                onChange={(e) =>
                                  updateOrderTrackingDraft(order, {
                                    trackingId: e.target.value.toUpperCase(),
                                  })
                                }
                                placeholder="AWB8492017462"
                                className="w-full px-3 py-2 text-xs font-mono bg-white border border-zinc-300 rounded-lg focus:outline-none focus:border-sky-600"
                              />
                            </div>

                            <div className="md:col-span-6">
                              <label
                                htmlFor={`tracking-url-${order.orderNumber}`}
                                className="block text-[11px] font-semibold text-zinc-600 mb-1"
                              >
                                Tracking URL (https://...)
                              </label>
                              <input
                                id={`tracking-url-${order.orderNumber}`}
                                type="url"
                                data-testid={`tracking-url-input-${order.orderNumber}`}
                                value={draft.trackingUrl}
                                onChange={(e) =>
                                  updateOrderTrackingDraft(order, { trackingUrl: e.target.value })
                                }
                                placeholder="https://track.delhivery.com/waybill/AWB8492017462"
                                className="w-full px-3 py-2 text-xs font-mono bg-white border border-zinc-300 rounded-lg focus:outline-none focus:border-sky-600"
                              />
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                disabled={isSavingUrl || isRemovingUrl}
                                data-testid={`save-tracking-url-${order.orderNumber}`}
                                onClick={() => void handleSaveTrackingUrl(order)}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-zinc-950 text-yellow-400 text-xs font-bold hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-60"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>{isSavingUrl ? 'Saving...' : 'Save Tracking URL'}</span>
                              </button>

                              {savedSafeUrl && (
                                <a
                                  href={savedSafeUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  data-testid={`test-tracking-url-${order.orderNumber}`}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 text-white text-xs font-bold hover:bg-sky-700 transition-colors"
                                >
                                  <span>Open / Test Link</span>
                                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                                </a>
                              )}

                              {(savedSafeUrl || order.ekartTrackingId) && (
                                <button
                                  type="button"
                                  disabled={isRemovingUrl || isSavingUrl}
                                  data-testid={`remove-tracking-url-${order.orderNumber}`}
                                  onClick={() => void handleRemoveTrackingUrl(order)}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-colors cursor-pointer disabled:opacity-60"
                                >
                                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>{isRemovingUrl ? 'Removing...' : 'Remove URL'}</span>
                                </button>
                              )}
                            </div>

                            {savedSafeUrl && (
                              <span className="text-[11px] font-mono text-zinc-500 truncate max-w-md">
                                Live: {savedSafeUrl}
                              </span>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Tab 4: Admin-Only Bulk Material & Quote Estimator */}
          {activeTab === 'bulk' && (
            <BulkOrderView
              embeddedInAdmin
              onQuoteCreated={(quote) => {
                setQuotes((prev) => [quote, ...prev]);
                setFeedback(
                  `B2B Wholesale Quote ${quote.quoteNumber} saved for ${quote.businessName} (${formatINR(quote.estimatedTotalInr)}).`,
                );
              }}
            />
          )}

          {/* Tab 5: Payment & Courier Settings (UPI ID, WhatsApp Mobile & Default Tracking Base URL) */}
          {activeTab === 'settings' && (
            <div data-testid="admin-payment-settings" className="space-y-6">
              <div>
                <h1 className="font-display text-2xl font-semibold text-slate-900">
                  Payment &amp; Courier Settings
                </h1>
                <p className="text-sm text-slate-500 mt-1">
                  Configure the active Merchant UPI ID, WhatsApp contact, and Default Courier
                  Tracking Base URL preset used by the Admin Tracking URL Manager.
                </p>
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setDataError(null);
                  setSavingSettings(true);
                  try {
                    const updated = await savePaymentSettings({
                      merchantUpiId: upiIdDraft,
                      merchantMobile: mobileDraft,
                      brandName: brandDraft,
                      defaultTrackingBaseUrl: trackingBaseUrlDraft,
                    });
                    setFeedback(
                      `Settings updated. Active UPI ID: ${updated.merchantUpiId} · Mobile: +91 ${updated.merchantMobile}${
                        updated.defaultTrackingBaseUrl
                          ? ` · Tracking Base URL saved`
                          : ' · Tracking Base URL cleared'
                      }`,
                    );
                    window.setTimeout(() => setFeedback(null), 4000);
                  } catch (err) {
                    setDataError((err as Error).message);
                  } finally {
                    setSavingSettings(false);
                  }
                }}
                className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 max-w-2xl"
              >
                <div>
                  <label
                    htmlFor="settings-upi-id"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Merchant UPI ID (VPA) *
                  </label>
                  <input
                    id="settings-upi-id"
                    type="text"
                    required
                    value={upiIdDraft}
                    onChange={(e) => setUpiIdDraft(e.target.value)}
                    placeholder="balajigoud11@axl"
                    className="w-full px-3.5 py-2.5 font-mono text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Used to generate scannable QR codes across Google Pay, PhonePe, Paytm, and BHIM UPI.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="settings-mobile"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Mobile / WhatsApp Number (10 digits) *
                    </label>
                    <input
                      id="settings-mobile"
                      type="tel"
                      required
                      value={mobileDraft}
                      onChange={(e) => setMobileDraft(e.target.value)}
                      placeholder="9963225798"
                      className="w-full px-3.5 py-2.5 font-mono text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-sky-600"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="settings-brand"
                      className="block text-xs font-semibold text-zinc-700 mb-1"
                    >
                      Merchant Payee Name *
                    </label>
                    <input
                      id="settings-brand"
                      type="text"
                      required
                      value={brandDraft}
                      onChange={(e) => setBrandDraft(e.target.value)}
                      placeholder="The Magnet"
                      className="w-full px-3.5 py-2.5 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-sky-600"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-100 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="settings-tracking-base-url"
                      className="block text-xs font-semibold text-zinc-700"
                    >
                      Default Courier Tracking Base URL (Optional Preset)
                    </label>
                    <button
                      type="button"
                      data-testid="clear-tracking-base-url-btn"
                      onClick={() => setTrackingBaseUrlDraft('')}
                      className="text-[11px] font-semibold text-rose-600 hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                  <input
                    id="settings-tracking-base-url"
                    data-testid="settings-tracking-base-url"
                    type="url"
                    value={trackingBaseUrlDraft}
                    onChange={(e) => setTrackingBaseUrlDraft(e.target.value)}
                    placeholder="https://track.delhivery.com/waybill/"
                    className="w-full px-3.5 py-2.5 font-mono text-xs sm:text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-sky-600"
                  />
                  <p className="text-[11px] text-zinc-500">
                    Used by the 1-click <strong>Auto-Fill Courier URL</strong> helper in the Admin
                    Orders tab. Leave blank to clear the preset anytime.
                  </p>
                  {trackingBaseUrlDraft.trim() && (
                    <p className="font-mono text-[11px] text-sky-700 break-all">
                      Auto-fill preview:{' '}
                      {buildAutoFillTrackingUrl(trackingBaseUrlDraft, 'AWB8492017462') ||
                        'Enter a valid https:// URL'}
                    </p>
                  )}
                </div>

                <div className="p-3.5 rounded-lg bg-zinc-50 border border-zinc-200 space-y-1">
                  <p className="text-[11px] font-semibold text-zinc-600">
                    Active Dynamic UPI QR URI Preview
                  </p>
                  <p className="font-mono text-xs text-sky-600 break-all">
                    {buildUpiPaymentUri({
                      merchantUpiId: upiIdDraft || 'balajigoud11@axl',
                      brandName: brandDraft || 'The Magnet',
                      amountInr: 1499,
                      orderId: 'TM-ORD-2601',
                    })}
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setUpiIdDraft(paymentSettings.merchantUpiId);
                      setMobileDraft(paymentSettings.merchantMobile);
                      setBrandDraft(paymentSettings.brandName);
                      setTrackingBaseUrlDraft(paymentSettings.defaultTrackingBaseUrl ?? '');
                    }}
                    className="px-4 py-2.5 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                  >
                    Reset
                  </button>
                  <button
                    type="submit"
                    disabled={savingSettings}
                    data-testid="save-settings-btn"
                    className="px-5 py-2.5 rounded-lg bg-zinc-950 text-yellow-400 text-xs font-extrabold hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {savingSettings ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Live Tracking & Courier Hub Update Modal */}
      {trackingOrder && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Update live order tracking stage and courier hub"
        >
          <form
            onSubmit={handleSaveTrackingUpdate}
            className="bg-white rounded-xl max-w-lg w-full p-6 space-y-4 border border-slate-200 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Truck className="w-4 h-4 text-sky-600" aria-hidden="true" />
                  <span>Update Live Delivery Tracking</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">
                  {trackingOrder.orderNumber} · {trackingOrder.customerName} ({trackingOrder.city})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTrackingOrder(null)}
                aria-label="Close tracking modal"
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label
                  htmlFor="track-stage"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Vertical Stepper Delivery Stage *
                </label>
                <select
                  id="track-stage"
                  value={trackStatus}
                  onChange={(e) => setTrackStatus(e.target.value as OrderStatus)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-sky-600"
                >
                  {RETAIL_TRACKING_STAGES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="track-hub"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Courier Hub Location *
                </label>
                <div className="relative">
                  <MapPin
                    className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <input
                    id="track-hub"
                    type="text"
                    required
                    value={trackHub}
                    onChange={(e) => setTrackHub(e.target.value)}
                    placeholder="e.g. Bhuvanagiri / Yadagirigutta Hub"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {HUB_PRESETS.map((hub) => (
                    <button
                      key={hub}
                      type="button"
                      onClick={() => setTrackHub(hub)}
                      className={`px-2 py-1 text-[11px] rounded border cursor-pointer ${
                        trackHub === hub
                          ? 'border-sky-600 bg-sky-50 text-sky-900 font-medium'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {hub}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="track-detail"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Scan Update Note
                </label>
                <input
                  id="track-detail"
                  type="text"
                  value={trackDetail}
                  onChange={(e) => setTrackDetail(e.target.value)}
                  placeholder="e.g. Dispatched from Hyderabad Hub to local delivery station"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="track-courier"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Courier Partner
                  </label>
                  <input
                    id="track-courier"
                    type="text"
                    value={trackCourier}
                    onChange={(e) => setTrackCourier(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                  />
                </div>
                <div>
                  <label
                    htmlFor="track-awb"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    AWB Tracking Number
                  </label>
                  <input
                    id="track-awb"
                    type="text"
                    value={trackAwb}
                    onChange={(e) => setTrackAwb(e.target.value)}
                    className="w-full px-3 py-2 font-mono text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setTrackingOrder(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingTracking}
                className="px-4 py-2 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700 transition-colors cursor-pointer disabled:opacity-60"
              >
                {savingTracking ? 'Saving...' : 'Push Live Tracking Update'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Logo Inspection Modal */}
      {logoModalUrl && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Customer uploaded logo preview"
        >
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 border border-slate-200 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Uploaded Customer Logo</h3>
              <button
                type="button"
                onClick={() => setLogoModalUrl(null)}
                className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 flex items-center justify-center">
              <img
                src={logoModalUrl}
                alt="Customer logo artwork"
                className="max-h-64 object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
