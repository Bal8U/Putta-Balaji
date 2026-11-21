import { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  ExternalLink,
  LogOut,
  Package,
  Search,
  Truck,
  User,
} from 'lucide-react';
import type { BulkQuote, OrderStatus, RetailOrder } from '../types';
import { fetchMyOrders, fetchRecentOrders, trackOrderOrQuote } from '../utils/api';
import { formatINR } from '../utils/pricing';
import { formatFlipkartOrderId } from '../utils/orderHelpers';
import {
  getCustomerNoTrackingStatusLabel,
  sanitizeExternalTrackingUrl,
} from '../utils/ekart';
import { useAuth } from '../context/AuthContext';
import { ProductImage } from './ProductImage';

interface MyOrdersViewProps {
  onOpenOrderDetails: (orderNumber: string) => void;
  onNavigateHome: () => void;
}

const STATUS_FILTERS: Array<OrderStatus | 'All'> = [
  'All',
  'Order Placed — Awaiting Store Approval',
  'Order Confirmed',
  'Packed & Shipped',
  'Out for Delivery',
  'Delivered',
  'Payment Verification Pending',
];

function statusDotColor(status: OrderStatus): string {
  if (status === 'Delivered') return 'bg-emerald-600';
  if (status === 'Out for Delivery') return 'bg-sky-600';
  if (
    status === 'Payment Verification Pending' ||
    status === 'Order Placed — Awaiting Store Approval' ||
    status === 'Pending'
  ) {
    return 'bg-amber-500';
  }
  return 'bg-sky-600';
}

export function MyOrdersView({
  onOpenOrderDetails,
  onNavigateHome,
}: MyOrdersViewProps) {
  const { firebaseUser, profile, signInWithGoogle, logout, authError } = useAuth();
  const [recentOrders, setRecentOrders] = useState<RetailOrder[]>([]);
  const [accountOrders, setAccountOrders] = useState<RetailOrder[]>([]);
  const [accountQuotes, setAccountQuotes] = useState<BulkQuote[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'All'>('All');
  const [searchRef, setSearchRef] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [trackedQuote, setTrackedQuote] = useState<BulkQuote | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchRecentOrders()
      .then((list) => {
        if (active) setRecentOrders(list);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!firebaseUser) {
      setAccountOrders([]);
      setAccountQuotes([]);
      return;
    }
    let active = true;
    fetchMyOrders()
      .then((res) => {
        if (active) {
          setAccountOrders(res.orders);
          setAccountQuotes(res.quotes);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [firebaseUser]);

  const displayedOrders = useMemo(() => {
    const source = firebaseUser && accountOrders.length > 0 ? accountOrders : recentOrders;
    const q = searchRef.trim().toLowerCase();
    return source.filter((ord) => {
      if (statusFilter !== 'All' && ord.status !== statusFilter) return false;
      if (q) {
        const hay = `${ord.orderNumber} ${formatFlipkartOrderId(ord.orderNumber)} ${
          ord.ekartTrackingId || ''
        } ${ord.customerName} ${ord.items.map((i) => i.name).join(' ')} ${
          ord.utrNumber || ''
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [firebaseUser, accountOrders, recentOrders, statusFilter, searchRef]);

  const handleDirectLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const ref = searchRef.trim().toUpperCase();
    if (!ref) return;
    setLookupError(null);
    setTrackedQuote(null);
    setLookupLoading(true);
    try {
      const res = await trackOrderOrQuote(ref);
      if (res.type === 'retail') {
        onOpenOrderDetails(res.record.orderNumber);
      } else {
        setTrackedQuote(res.record);
      }
    } catch (err) {
      setLookupError((err as Error).message);
    } finally {
      setLookupLoading(false);
    }
  };

  return (
    <div
      data-testid="my-orders-page"
      className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6"
    >
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-zinc-500">
        <button type="button" onClick={onNavigateHome} className="hover:text-sky-600 cursor-pointer">
          Home
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
        <span>My Account</span>
        <ChevronRight className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
        <span className="font-bold text-zinc-900">My Orders</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Sidebar: Filters + Account Sign-In */}
        <aside className="lg:col-span-3 space-y-4">
          <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-bold text-zinc-950 pb-2 border-b border-zinc-100">
              Order Status
            </h2>
            <div className="space-y-1">
              {STATUS_FILTERS.map((st) => {
                const active = statusFilter === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      active
                        ? 'bg-zinc-950 text-yellow-400 font-bold'
                        : 'text-zinc-600 hover:bg-zinc-100'
                    }`}
                  >
                    {st}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-zinc-950 text-yellow-400 flex items-center justify-center">
                <User className="w-4 h-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-zinc-950 truncate">
                  {firebaseUser ? profile?.fullName || firebaseUser.email : 'Customer Account'}
                </p>
                <p className="text-[11px] text-zinc-500 truncate">
                  {firebaseUser ? firebaseUser.email : 'Sync orders across devices'}
                </p>
              </div>
            </div>
            {firebaseUser ? (
              <button
                type="button"
                onClick={() => void logout()}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border border-zinc-200 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Sign Out</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void signInWithGoogle().catch(() => {})}
                className="w-full py-2 rounded-lg bg-zinc-950 text-yellow-400 text-xs font-bold hover:bg-zinc-800 cursor-pointer"
              >
                Sign in with Google
              </button>
            )}
            {authError && (
              <p className="text-[11px] text-rose-700" role="alert">
                {authError}
              </p>
            )}
          </div>
        </aside>

        {/* Right Main Column: Search Orders + Order Cards */}
        <div className="lg:col-span-9 space-y-4">
          <form onSubmit={handleDirectLookup} className="flex gap-2">
            <div className="relative flex-1">
              <Search
                className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="text"
                value={searchRef}
                onChange={(e) => setSearchRef(e.target.value)}
                placeholder="Search by Order ID, Tracking ID, or item name..."
                aria-label="Search your orders"
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-sky-600"
              />
            </div>
            <button
              type="submit"
              disabled={lookupLoading}
              className="px-5 py-2.5 rounded-lg bg-zinc-950 text-yellow-400 text-sm font-bold hover:bg-zinc-800 cursor-pointer whitespace-nowrap"
            >
              {lookupLoading ? 'Searching...' : 'Search Orders'}
            </button>
          </form>

          {lookupError && (
            <div role="alert" className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
              {lookupError}
            </div>
          )}

          {trackedQuote && (
            <div className="bg-sky-50 border border-sky-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4 text-sm">
              <div>
                <p className="text-xs font-bold text-sky-800">Bulk Sports Kit Quote Found</p>
                <p className="font-mono font-bold text-zinc-950 mt-0.5">
                  {trackedQuote.quoteNumber} · {trackedQuote.businessName}
                </p>
                <p className="text-xs text-zinc-600 mt-0.5">
                  {trackedQuote.totalQuantity} units × {trackedQuote.apparelType} ({trackedQuote.fabric}) · Status:{' '}
                  <strong>{trackedQuote.status}</strong>
                </p>
              </div>
              <span className="font-mono text-base font-extrabold text-zinc-950">
                {formatINR(trackedQuote.estimatedTotalInr)}
              </span>
            </div>
          )}

          {/* Orders List */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-28 bg-white border border-zinc-200 rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : displayedOrders.length === 0 ? (
            <div className="bg-white border border-zinc-200 rounded-xl p-10 text-center space-y-2">
              <Package className="w-8 h-8 text-zinc-300 mx-auto" aria-hidden="true" />
              <p className="text-sm font-bold text-zinc-950">No matching orders found</p>
              <p className="text-xs text-zinc-500">
                Try clearing the status filter or enter your Order ID (e.g. TM-ORD-2601).
              </p>
            </div>
          ) : (
            <div data-testid="my-orders-list" className="space-y-3">
              {displayedOrders.map((ord) => {
                const first = ord.items[0];
                const extraCount = Math.max(0, ord.items.length - 1);
                const safeTrackingUrl = sanitizeExternalTrackingUrl(ord.trackingUrl);
                return (
                  <div
                    key={ord.id}
                    data-testid={`order-card-${ord.orderNumber}`}
                    className="bg-white border border-zinc-200 hover:border-zinc-400 rounded-xl p-4 sm:p-5 transition-all hover:shadow-sm grid grid-cols-1 sm:grid-cols-12 gap-4 items-center"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenOrderDetails(ord.orderNumber)}
                      className="sm:col-span-6 flex items-center gap-4 min-w-0 text-left cursor-pointer"
                    >
                      <div className="w-16 h-16 rounded-lg overflow-hidden bg-zinc-100 border border-zinc-200 shrink-0">
                        <ProductImage
                          src={
                            first?.imageUrl ||
                            '/src/assets/images/magnet_dryfit_tshirt_1795261556794.jpg'
                          }
                          alt={first?.name || ord.orderNumber}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-zinc-950 truncate hover:text-sky-600">
                          {first?.name || `The Magnet Order ${ord.orderNumber}`}
                        </p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {first ? `Size: ${first.size} · Qty: ${first.qty}` : ''}
                          {extraCount > 0 ? ` + ${extraCount} more` : ''}
                        </p>
                        <p className="font-mono text-[11px] text-sky-600 font-semibold mt-1">
                          {ord.orderNumber}
                          {ord.ekartTrackingId ? ` · Tracking ID: ${ord.ekartTrackingId}` : ''}
                        </p>
                      </div>
                    </button>

                    <div className="sm:col-span-2 font-mono tabular-nums text-sm font-extrabold text-zinc-950">
                      {formatINR(ord.totalInr)}
                    </div>

                    <div className="sm:col-span-4 space-y-1.5">
                      <div className="flex items-center gap-2 text-xs font-bold text-zinc-950">
                        <span
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusDotColor(ord.status)}`}
                          aria-hidden="true"
                        />
                        <span>{ord.status}</span>
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        {ord.paymentMethod}
                        {ord.utrNumber ? ` · UTR ${ord.utrNumber}` : ''}
                      </p>
                      <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
                        <button
                          type="button"
                          onClick={() => onOpenOrderDetails(ord.orderNumber)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-sky-600 hover:underline cursor-pointer"
                        >
                          <span>Order Details</span>
                          <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        {safeTrackingUrl ? (
                          <a
                            href={safeTrackingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid={`customer-track-package-${ord.orderNumber}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-950 text-yellow-400 text-[11px] font-bold hover:bg-zinc-800 transition-colors"
                          >
                            <Truck className="w-3 h-3" aria-hidden="true" />
                            <span>Track Package</span>
                            <ExternalLink className="w-3 h-3" aria-hidden="true" />
                          </a>
                        ) : (
                          <span
                            data-testid={`customer-no-tracking-status-${ord.orderNumber}`}
                            className="text-[11px] font-medium text-zinc-500"
                          >
                            {getCustomerNoTrackingStatusLabel(ord.status)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {accountQuotes.length > 0 && (
            <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-zinc-950">Your Bulk Sports Kit Quotes</h3>
              <div className="space-y-2 text-xs">
                {accountQuotes.map((qt) => (
                  <div
                    key={qt.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-zinc-50 border border-zinc-200"
                  >
                    <div>
                      <span className="font-mono font-bold text-sky-600">{qt.quoteNumber}</span>
                      <span className="mx-2 text-zinc-300">·</span>
                      <span className="text-zinc-700">
                        {qt.apparelType} ({qt.totalQuantity} pcs) · {qt.status}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-zinc-950">
                      {formatINR(qt.estimatedTotalInr)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
