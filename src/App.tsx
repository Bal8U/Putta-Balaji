import { useCallback, useEffect, useState } from 'react';
import { Package, ShieldCheck, Store } from 'lucide-react';
import type { ApparelSize, CartItem, Product, StoreDepartment } from './types';
import { fetchProducts, getStoredAdminToken } from './utils/api';
import {
  buildWhatsAppOwnerUrl,
  OWNER_INSTAGRAM_HANDLE,
  OWNER_INSTAGRAM_URL,
  OWNER_NAME,
} from './utils/upi';
import { useAuth } from './context/AuthContext';
import { Navbar, type ActivePage } from './components/Navbar';
import { StorefrontView } from './components/StorefrontView';
import { ProductDetailView } from './components/ProductDetailView';
import { MyOrdersView } from './components/MyOrdersView';
import { OrderDetailsView } from './components/OrderDetailsView';
import { AdminView } from './components/AdminView';
import { CartDrawer } from './components/CartDrawer';

const CART_STORAGE_KEY = 'themagnet_retail_cart_v1';

interface ParsedRoute {
  page: ActivePage;
  productId?: number;
  orderId?: string;
}

function parseRoute(pathname: string): ParsedRoute {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean.startsWith('/bulk')) return { page: 'bulk' };
  if (clean.startsWith('/admin')) return { page: 'admin' };

  if (clean.startsWith('/ekart-track')) {
    return { page: 'orders' };
  }

  const orderMatch = clean.match(/^\/orders\/([^/]+)$/);
  if (orderMatch) {
    return { page: 'order-details', orderId: decodeURIComponent(orderMatch[1]) };
  }
  if (clean === '/orders' || clean.startsWith('/track')) {
    return { page: 'orders' };
  }

  const productMatch = clean.match(/^\/products\/(\d+)$/);
  if (productMatch) {
    return { page: 'product', productId: Number(productMatch[1]) };
  }

  return { page: 'store' };
}

function pathForRoute(route: ParsedRoute): string {
  switch (route.page) {
    case 'bulk':
      return '/bulk-orders';
    case 'orders':
      return '/orders';
    case 'order-details':
      return `/orders/${encodeURIComponent(route.orderId || '')}`;
    case 'product':
      return `/products/${route.productId || ''}`;
    case 'admin':
      return '/admin';
    default:
      return '/';
  }
}

export default function App() {
  const { profile, loading: authLoading } = useAuth();
  const [route, setRoute] = useState<ParsedRoute>(() => {
    const pathname = window.location.pathname;
    if (pathname.startsWith('/ekart-track')) {
      window.history.replaceState({}, '', '/orders');
      return { page: 'orders' };
    }
    const parsed = parseRoute(pathname);
    // Immediately guard /bulk-orders before first paint if no admin token is present
    if (parsed.page === 'bulk' && !getStoredAdminToken()) {
      window.history.replaceState({}, '', '/');
      return { page: 'store' };
    }
    return parsed;
  });
  const [adminInitialTab, setAdminInitialTab] = useState<'overview' | 'inventory' | 'orders' | 'bulk' | 'settings'>('orders');
  const [activeDepartment, setActiveDepartment] = useState<StoreDepartment>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartInitialStep, setCartInitialStep] = useState<'cart' | 'checkout'>('cart');
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as CartItem[]) : [];
    } catch {
      return [];
    }
  });

  const loadProducts = useCallback(async () => {
    try {
      const list = await fetchProducts();
      setProducts(list);
    } catch (err) {
      console.error('Failed to load catalog:', err);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // ignore storage errors
    }
  }, [cart]);

  const isAdminSession = Boolean(getStoredAdminToken()) || profile?.role === 'admin';

  useEffect(() => {
    if (route.page === 'bulk' && !authLoading) {
      if (isAdminSession) {
        setAdminInitialTab('bulk');
        setRoute({ page: 'admin' });
        window.history.replaceState({}, '', '/admin');
      } else {
        setRoute({ page: 'store' });
        window.history.replaceState({}, '', '/');
      }
    }
  }, [route.page, isAdminSession, authLoading]);

  useEffect(() => {
    const onPopState = () => {
      const parsed = parseRoute(window.location.pathname);
      if (parsed.page === 'bulk') {
        if (Boolean(getStoredAdminToken()) || profile?.role === 'admin') {
          setAdminInitialTab('bulk');
          setRoute({ page: 'admin' });
          window.history.replaceState({}, '', '/admin');
        } else {
          setRoute({ page: 'store' });
          window.history.replaceState({}, '', '/');
        }
        return;
      }
      setRoute(parsed);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [profile?.role]);

  const pushRoute = (next: ParsedRoute) => {
    if (next.page === 'bulk') {
      if (isAdminSession) {
        setAdminInitialTab('bulk');
        setRoute({ page: 'admin' });
        if (window.location.pathname !== '/admin') {
          window.history.pushState({}, '', '/admin');
        }
      } else {
        setRoute({ page: 'store' });
        if (window.location.pathname !== '/') {
          window.history.replaceState({}, '', '/');
        }
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setRoute(next);
    const nextPath = pathForRoute(next);
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigate = (page: ActivePage) => {
    if (page === 'store') {
      setActiveDepartment('All');
    }
    pushRoute({ page });
  };

  const openProductDetail = (product: Product) => {
    pushRoute({ page: 'product', productId: product.id });
  };

  const openOrderDetails = (orderNumber: string) => {
    pushRoute({ page: 'order-details', orderId: orderNumber });
  };

  const handleSelectDepartment = (dept: StoreDepartment) => {
    setActiveDepartment(dept);
    pushRoute({ page: 'store' });
  };

  const handleSearchSubmit = () => {
    if (route.page !== 'store') {
      pushRoute({ page: 'store' });
    }
  };

  const handleAddToCart = (product: Product, size: ApparelSize) => {
    setCart((prev) => {
      const idx = prev.findIndex(
        (item) => item.productId === product.id && item.size === size,
      );
      if (idx >= 0) {
        return prev.map((item, i) =>
          i === idx ? { ...item, qty: item.qty + 1 } : item,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          category: product.category,
          size,
          colorName: product.colorName,
          qty: 1,
          unitPrice: product.priceInr,
          imageUrl: product.imageUrl,
        },
      ];
    });
  };

  const handleBuyNow = (product: Product, size: ApparelSize) => {
    setCart((prev) => {
      const exists = prev.some((item) => item.productId === product.id && item.size === size);
      if (exists) return prev;
      return [
        ...prev,
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          category: product.category,
          size,
          colorName: product.colorName,
          qty: 1,
          unitPrice: product.priceInr,
          imageUrl: product.imageUrl,
        },
      ];
    });
    setCartInitialStep('checkout');
    setCartOpen(true);
  };

  const handleUpdateQty = (productId: number, size: ApparelSize, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.productId === productId && item.size === size
            ? { ...item, qty: item.qty + delta }
            : item,
        )
        .filter((item) => item.qty > 0),
    );
  };

  const handleRemoveItem = (productId: number, size: ApparelSize) => {
    setCart((prev) =>
      prev.filter((item) => !(item.productId === productId && item.size === size)),
    );
  };

  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const selectedProduct =
    route.page === 'product'
      ? products.find((p) => p.id === route.productId) || products[0] || null
      : null;

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 text-zinc-950 pb-16 md:pb-0">
      <Navbar
        activePage={route.page}
        activeDepartment={activeDepartment}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchSubmit={handleSearchSubmit}
        onSelectDepartment={handleSelectDepartment}
        onNavigate={navigate}
        cartCount={cartCount}
        onOpenCart={() => {
          setCartInitialStep('cart');
          setCartOpen(true);
        }}
      />

      <main className="flex-1">
        {route.page === 'store' && (
          <StorefrontView
            products={products}
            loading={loadingProducts}
            activeDepartment={activeDepartment}
            searchQuery={searchQuery}
            onClearDepartment={() => setActiveDepartment('All')}
            onClearSearch={() => setSearchQuery('')}
            onSelectProduct={openProductDetail}
            onAddToCart={handleAddToCart}
            onBuyNow={handleBuyNow}
            onOpenOrders={() => navigate('orders')}
          />
        )}

        {route.page === 'product' &&
          (selectedProduct ? (
            <ProductDetailView
              product={selectedProduct}
              onBack={() => pushRoute({ page: 'store' })}
              onAddToCart={handleAddToCart}
              onBuyNow={handleBuyNow}
            />
          ) : (
            <div className="max-w-7xl mx-auto px-4 py-16 text-center text-sm text-zinc-500">
              {loadingProducts ? 'Loading gear details...' : 'Product not found.'}
            </div>
          ))}

        {route.page === 'orders' && (
          <MyOrdersView
            onOpenOrderDetails={openOrderDetails}
            onNavigateHome={() => navigate('store')}
          />
        )}

        {route.page === 'order-details' && route.orderId && (
          <OrderDetailsView
            orderId={route.orderId}
            onNavigateHome={() => navigate('store')}
            onNavigateMyOrders={() => navigate('orders')}
          />
        )}

        {route.page === 'admin' && (
          <AdminView
            products={products}
            initialTab={adminInitialTab}
            onProductsChanged={loadProducts}
            onOpenOrderDetails={openOrderDetails}
          />
        )}
      </main>

      <footer className="no-print border-t-2 border-yellow-400 bg-zinc-950 text-zinc-300 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs">
          <div className="space-y-1">
            <div>
              <span className="font-display text-sm font-extrabold text-yellow-400">
                THE MAGNET
              </span>
              <span className="mx-2 text-zinc-600" aria-hidden="true">
                ·
              </span>
              <span className="text-sky-400 font-semibold">
                Sports Wear &amp; Trendy Fashions
              </span>
            </div>
            <p className="text-zinc-400">
              Owner: <strong className="text-white">{OWNER_NAME}</strong> ·{' '}
              <a
                href={buildWhatsAppOwnerUrl('Hello Kanth (Rebel), reaching out from The Magnet store.')}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 hover:underline"
              >
                WhatsApp: +91 9963225798
              </a>{' '}
              ·{' '}
              <a
                href={OWNER_INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-400 hover:underline"
              >
                Instagram: {OWNER_INSTAGRAM_HANDLE}
              </a>{' '}
              · UPI: <span className="font-mono text-zinc-200">balajigoud11@axl</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-5 font-medium">
            <button
              type="button"
              onClick={() => navigate('store')}
              className="hover:text-yellow-400 cursor-pointer"
            >
              Shop
            </button>
            <button
              type="button"
              onClick={() => navigate('orders')}
              className="hover:text-yellow-400 cursor-pointer"
            >
              My Orders
            </button>
            <button
              type="button"
              onClick={() => navigate('admin')}
              className="hover:text-sky-400 cursor-pointer"
            >
              Profile / Admin
            </button>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Navigation Bar (Shop, My Orders, Profile / Admin) */}
      <nav
        aria-label="Mobile bottom navigation"
        data-testid="mobile-bottom-nav"
        className="no-print md:hidden fixed bottom-0 inset-x-0 z-40 bg-zinc-950 border-t border-zinc-800 grid grid-cols-3 h-16"
      >
        {(
          [
            { id: 'store', label: 'Shop', icon: Store },
            { id: 'orders', label: 'My Orders', icon: Package },
            { id: 'admin', label: 'Profile / Admin', icon: ShieldCheck },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const isActive =
            route.page === tab.id ||
            (tab.id === 'store' && route.page === 'product') ||
            (tab.id === 'orders' && route.page === 'order-details');
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => navigate(tab.id)}
              className={`flex flex-col items-center justify-center gap-1 text-[10px] font-bold transition-colors cursor-pointer ${
                isActive ? 'text-yellow-400' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              <span className="truncate max-w-full px-1">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <CartDrawer
        open={cartOpen}
        initialStep={cartInitialStep}
        onClose={() => setCartOpen(false)}
        items={cart}
        onUpdateQty={handleUpdateQty}
        onRemoveItem={handleRemoveItem}
        onClearCart={() => setCart([])}
        onOrderComplete={() => {
          void loadProducts();
        }}
        onViewOrderDetails={openOrderDetails}
      />
    </div>
  );
}
