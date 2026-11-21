import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  LogOut,
  Menu,
  Package,
  Search,
  ShieldCheck,
  ShoppingCart,
  Tag,
  User,
  X,
} from 'lucide-react';
import type { StoreDepartment } from '../types';
import { useAuth } from '../context/AuthContext';

export type ActivePage =
  | 'store'
  | 'product'
  | 'bulk'
  | 'orders'
  | 'order-details'
  | 'admin';

interface NavbarProps {
  activePage: ActivePage;
  activeDepartment: StoreDepartment;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSearchSubmit: () => void;
  onSelectDepartment: (dept: StoreDepartment) => void;
  onNavigate: (page: ActivePage) => void;
  cartCount: number;
  onOpenCart: () => void;
}

const SUB_NAV_ITEMS: Array<{
  label: string;
  department: StoreDepartment;
}> = [
  { label: 'Sports Wear', department: 'Sports Wear' },
  { label: 'Gym & Training', department: 'Gym & Training' },
  { label: 'Trendy Fashions', department: 'Trendy Fashions' },
  { label: 'Offer Zone', department: 'Offer Zone' },
];

export function Navbar({
  activePage,
  activeDepartment,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  onSelectDepartment,
  onNavigate,
  cartCount,
  onOpenCart,
}: NavbarProps) {
  const { firebaseUser, profile, signInWithGoogle, logout } = useAuth();
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearchSubmit();
  };

  return (
    <header className="no-print sticky top-0 z-40 shadow-sm">
      {/* Row 1: The Magnet Midnight Black Sticky Header */}
      <div className="bg-zinc-950 text-white border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4 lg:gap-6">
          {/* Brand Logo */}
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onSelectDepartment('All');
              onNavigate('store');
              setMobileOpen(false);
            }}
            className="flex flex-col leading-none min-w-0 shrink group"
          >
            <span className="font-display text-lg sm:text-2xl font-extrabold tracking-tight text-yellow-400 truncate">
              THE MAGNET
            </span>
            <span className="text-[8.5px] sm:text-[10px] font-bold uppercase text-sky-400 tracking-[0.06em] sm:tracking-[0.14em] mt-0.5 truncate">
              Sports Wear &amp; Trendy Fashions
            </span>
          </a>

          {/* Central Wide Search Bar */}
          <form
            onSubmit={handleFormSubmit}
            className="hidden md:flex flex-1 max-w-xl relative"
            role="search"
          >
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search for dry-fit tees, compression wear, joggers, hoodies..."
              aria-label="Search for dry-fit tees, compression wear, joggers, hoodies"
              data-testid="header-search-input"
              className="w-full h-10 pl-4 pr-11 rounded-md bg-white text-zinc-950 placeholder:text-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
            <button
              type="submit"
              aria-label="Search catalog"
              className="absolute right-0 top-0 h-10 w-10 flex items-center justify-center text-zinc-950 hover:text-sky-600 cursor-pointer"
            >
              <Search className="w-4 h-4" />
            </button>
          </form>

          {/* Right Action Controls: My Account Dropdown, Ekart Track, Cart */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* My Account Dropdown */}
            <div ref={dropdownRef} className="relative">
              <button
                type="button"
                onClick={() => setAccountOpen((prev) => !prev)}
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                data-testid="my-account-btn"
                className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 rounded-md text-sm font-medium text-white hover:bg-zinc-800 transition-colors cursor-pointer whitespace-nowrap"
              >
                <User className="w-4 h-4 shrink-0 text-yellow-400" aria-hidden="true" />
                <span className="hidden sm:inline max-w-[110px] truncate">
                  {profile?.fullName?.split(' ')[0] || 'My Account'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 opacity-80" aria-hidden="true" />
              </button>

              {accountOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-64 rounded-xl bg-white text-zinc-900 shadow-xl border border-zinc-200 py-2 z-50"
                >
                  <div className="px-4 py-2.5 border-b border-zinc-100">
                    {firebaseUser ? (
                      <>
                        <p className="text-xs font-semibold text-zinc-900 truncate">
                          {profile?.fullName || firebaseUser.email}
                        </p>
                        <p className="text-[11px] text-zinc-500 truncate">{firebaseUser.email}</p>
                      </>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-zinc-600">Welcome Athlete</span>
                        <button
                          type="button"
                          onClick={() => {
                            setAccountOpen(false);
                            void signInWithGoogle().catch(() => {});
                          }}
                          className="text-xs font-semibold text-sky-600 hover:underline cursor-pointer"
                        >
                          Sign In
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAccountOpen(false);
                      onNavigate('orders');
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                  >
                    <Package className="w-4 h-4 text-sky-600" aria-hidden="true" />
                    <span>My Orders &amp; Tracking</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAccountOpen(false);
                      onNavigate('admin');
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4 text-zinc-900" aria-hidden="true" />
                    <span>Admin Dispatch Panel</span>
                  </button>

                  {firebaseUser && (
                    <div className="border-t border-zinc-100 mt-1 pt-1">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setAccountOpen(false);
                          void logout();
                        }}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-rose-700 hover:bg-rose-50 cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" aria-hidden="true" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Cart Icon with Electric Gold Badge */}
            <button
              type="button"
              onClick={onOpenCart}
              aria-label={`Open shopping cart with ${cartCount} items`}
              data-testid="header-cart-btn"
              className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2 rounded-md bg-yellow-400 text-zinc-950 text-sm font-bold hover:bg-yellow-300 transition-colors cursor-pointer whitespace-nowrap"
            >
              <span className="relative">
                <ShoppingCart className="w-4 h-4" aria-hidden="true" />
                {cartCount > 0 && (
                  <span
                    data-testid="cart-badge-count"
                    className="absolute -top-2 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-zinc-950 text-yellow-400 font-mono text-[10px] font-bold flex items-center justify-center"
                  >
                    {cartCount}
                  </span>
                )}
              </span>
              <span className="hidden sm:inline">Cart</span>
              <span className="sm:hidden font-mono text-xs">{cartCount}</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileOpen}
              className="md:hidden p-1.5 rounded-md text-white hover:bg-zinc-800 cursor-pointer"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Search Bar */}
        <div className="md:hidden px-4 pb-3">
          <form onSubmit={handleFormSubmit} className="relative">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search dry-fit tees, joggers, hoodies..."
              aria-label="Search catalog on mobile"
              className="w-full h-9 pl-3.5 pr-10 rounded-md bg-white text-zinc-950 placeholder:text-zinc-500 text-xs focus:outline-none"
            />
            <button
              type="submit"
              aria-label="Search"
              className="absolute right-0 top-0 h-9 w-9 flex items-center justify-center text-zinc-950"
            >
              <Search className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Row 2: Department Sub-Navigation Category Strip */}
      <nav
        aria-label="Department categories"
        data-testid="category-subnav"
        className="bg-white border-b border-zinc-200 overflow-x-auto"
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-11 flex items-center justify-between sm:justify-start gap-3 sm:gap-6 text-xs sm:text-sm font-medium whitespace-nowrap">
          {SUB_NAV_ITEMS.map((item) => {
            const isActive = activePage === 'store' && activeDepartment === item.department;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  onSelectDepartment(
                    activeDepartment === item.department && activePage === 'store'
                      ? 'All'
                      : item.department,
                  );
                  onNavigate('store');
                }}
                className={`inline-flex items-center gap-1.5 h-full border-b-2 transition-colors cursor-pointer shrink-0 ${
                  isActive
                    ? 'border-sky-600 text-zinc-950 font-bold'
                    : 'border-transparent text-zinc-700 hover:text-sky-600'
                }`}
              >
                {item.department === 'Offer Zone' && (
                  <Tag className="w-3.5 h-3.5 text-sky-600" aria-hidden="true" />
                )}
                <span>{item.label}</span>
              </button>
            );
          })}

          <div className="ml-auto hidden sm:flex items-center gap-5 h-full shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('orders')}
              className={`inline-flex items-center gap-1.5 h-full border-b-2 transition-colors cursor-pointer ${
                activePage === 'orders' || activePage === 'order-details'
                  ? 'border-sky-600 text-zinc-950 font-bold'
                  : 'border-transparent text-zinc-600 hover:text-sky-600'
              }`}
            >
              <Package className="w-3.5 h-3.5" aria-hidden="true" />
              <span>My Orders</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Drawer Menu */}
      {mobileOpen && (
        <div className="md:hidden bg-zinc-950 text-white border-b border-zinc-800 px-4 py-3 space-y-1 shadow-md">
          <button
            type="button"
            onClick={() => {
              onSelectDepartment('All');
              onNavigate('store');
              setMobileOpen(false);
            }}
            className="block w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-100 hover:bg-zinc-900"
          >
            All Sports &amp; Trendy Gear
          </button>
          <button
            type="button"
            onClick={() => {
              onNavigate('orders');
              setMobileOpen(false);
            }}
            className="block w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-100 hover:bg-zinc-900"
          >
            My Orders &amp; Live Tracking
          </button>
          <button
            type="button"
            onClick={() => {
              onNavigate('admin');
              setMobileOpen(false);
            }}
            className="block w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-sky-400 hover:bg-zinc-900"
          >
            Profile / Admin Panel
          </button>
        </div>
      )}
    </header>
  );
}
