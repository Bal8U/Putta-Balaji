import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  Instagram,
  MessageCircle,
  Package,
  RotateCcw,
  SlidersHorizontal,
  Star,
} from 'lucide-react';
import type { ApparelCategory, ApparelSize, Product, StoreDepartment } from '../types';
import { filterProducts, formatINR } from '../utils/pricing';
import { computeListingPrice, getDiscountPercent } from '../utils/orderHelpers';
import {
  buildWhatsAppOwnerUrl,
  OWNER_INSTAGRAM_HANDLE,
  OWNER_INSTAGRAM_URL,
  OWNER_NAME,
} from '../utils/upi';
import { ProductImage } from './ProductImage';

interface StorefrontViewProps {
  products: Product[];
  loading: boolean;
  activeDepartment: StoreDepartment;
  searchQuery: string;
  onClearDepartment: () => void;
  onClearSearch: () => void;
  onSelectProduct: (product: Product) => void;
  onAddToCart: (product: Product, size: ApparelSize) => void;
  onBuyNow: (product: Product, size: ApparelSize) => void;
  onOpenOrders: () => void;
}

const CATEGORIES: Array<ApparelCategory | 'All'> = [
  'All',
  'Dry-Fit Tees',
  'Compression Wear',
  'Track Pants & Joggers',
  'Streetwear Hoodies',
  'Co-Ord Sets',
];

const SIZES: Array<ApparelSize | 'All'> = ['All', 'S', 'M', 'L', 'XL', 'XXL'];
const MAGNET_BANNER_URL = '/magnet-banner.jpg';

function isWholesaleOnlyProduct(product: Product): boolean {
  return (
    product.category === 'Team Jerseys' ||
    product.department === 'Team Kits' ||
    /\b(bulk|wholesale|custom sports kit)\b/i.test(product.name)
  );
}

export function StorefrontView({
  products,
  loading,
  activeDepartment,
  searchQuery,
  onClearDepartment,
  onClearSearch,
  onSelectProduct,
  onAddToCart,
  onBuyNow,
  onOpenOrders,
}: StorefrontViewProps) {
  const [category, setCategory] = useState<ApparelCategory | 'All'>('All');
  const [size, setSize] = useState<ApparelSize | 'All'>('All');
  const [colorName, setColorName] = useState<string | 'All'>('All');
  const [minPrice, setMinPrice] = useState<number>(0);
  const [maxPrice, setMaxPrice] = useState<number>(5000);
  const [selectedSizes, setSelectedSizes] = useState<Record<number, ApparelSize>>({});
  const [recentlyAddedId, setRecentlyAddedId] = useState<number | null>(null);

  const retailProducts = useMemo(
    () => products.filter((p) => !isWholesaleOnlyProduct(p)),
    [products],
  );

  const availableColors = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of retailProducts) {
      if (!map.has(p.colorName)) {
        map.set(p.colorName, p.colorHex);
      }
    }
    return Array.from(map.entries()).map(([name, hex]) => ({ name, hex }));
  }, [retailProducts]);

  const filteredProducts = useMemo(() => {
    const base = filterProducts(retailProducts, {
      category,
      size,
      colorName,
      minPrice,
      maxPrice,
      query: searchQuery,
    });

    if (activeDepartment === 'All') return base;
    if (activeDepartment === 'Offer Zone') {
      return base.filter((p) => {
        const mrp = computeListingPrice(p.priceInr, p.listingPriceInr);
        return getDiscountPercent(mrp, p.priceInr) >= 35 || p.department === 'Offer Zone';
      });
    }
    if (activeDepartment === 'Sports Wear') {
      return base.filter(
        (p) =>
          p.department === 'Sports Wear' ||
          p.category === 'Dry-Fit Tees' ||
          p.category === 'Track Pants & Joggers' ||
          p.category === 'Co-Ord Sets',
      );
    }
    if (activeDepartment === 'Gym & Training') {
      return base.filter(
        (p) =>
          p.department === 'Gym & Training' ||
          p.category === 'Dry-Fit Tees' ||
          p.category === 'Compression Wear' ||
          p.category === 'Track Pants & Joggers',
      );
    }
    if (activeDepartment === 'Trendy Fashions') {
      return base.filter(
        (p) =>
          p.department === 'Trendy Fashions' ||
          p.category === 'Streetwear Hoodies' ||
          p.category === 'Co-Ord Sets',
      );
    }
    return base.filter((p) => p.department === activeDepartment);
  }, [retailProducts, category, size, colorName, minPrice, maxPrice, searchQuery, activeDepartment]);

  const hasActiveFilters =
    activeDepartment !== 'All' ||
    category !== 'All' ||
    size !== 'All' ||
    colorName !== 'All' ||
    minPrice !== 0 ||
    maxPrice !== 5000 ||
    searchQuery.trim().length > 0;

  const resetFilters = () => {
    onClearDepartment();
    onClearSearch();
    setCategory('All');
    setSize('All');
    setColorName('All');
    setMinPrice(0);
    setMaxPrice(5000);
  };

  const getActiveSize = (product: Product): ApparelSize => {
    const chosen = selectedSizes[product.id];
    if (chosen && product.sizes.includes(chosen)) return chosen;
    return product.sizes.includes('M') ? 'M' : product.sizes[0] || 'M';
  };

  const handleQuickAdd = (product: Product) => {
    const chosenSize = getActiveSize(product);
    onAddToCart(product, chosenSize);
    setRecentlyAddedId(product.id);
    window.setTimeout(() => {
      setRecentlyAddedId((cur) => (cur === product.id ? null : cur));
    }, 1400);
  };

  return (
    <div data-testid="storefront-view" className="space-y-12 pb-20">
      {/* Section 1: The Magnet Brand Banner & Midnight Black Hero */}
      <section className="bg-zinc-950 text-white border-b-4 border-yellow-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-10 space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-5 flex flex-col justify-center space-y-5">
              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-400">
                  Sports Wear &amp; Trendy Fashions · Owner: {OWNER_NAME}
                </p>
                <h1 className="font-display text-4xl sm:text-5xl font-extrabold text-white leading-[1.06] tracking-tight">
                  THE <span className="text-yellow-400">MAGNET</span>
                </h1>
              </div>

              <p className="text-sm sm:text-base text-zinc-300 leading-relaxed max-w-prose">
                Performance Techno dry-fit tees, compression athletic wear, tapered track joggers,
                oversized streetwear hoodies, and sports co-ord sets — shipped fast across India
                with live order updates and direct UPI QR checkout.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <a
                  href="#catalog"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-yellow-400 text-zinc-950 text-sm font-extrabold hover:bg-yellow-300 transition-colors whitespace-nowrap shrink-0"
                >
                  <span>Shop Collection</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </a>
                <button
                  type="button"
                  onClick={onOpenOrders}
                  className="inline-flex items-center gap-1.5 px-5 py-3 rounded-lg bg-sky-600 text-white text-sm font-bold hover:bg-sky-500 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Package className="w-4 h-4" aria-hidden="true" />
                  <span>My Orders</span>
                </button>
              </div>

              {/* Direct Owner Contact Strip: WhatsApp +91 9963225798 & Instagram @Kanth_0100 */}
              <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-zinc-800 text-xs">
                <a
                  href={buildWhatsAppOwnerUrl(
                    'Hello Kanth (Rebel), I want to enquire about The Magnet Sports Wear & Trendy Fashions.',
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="hero-whatsapp-link"
                  className="inline-flex items-center gap-1.5 font-semibold text-emerald-400 hover:text-emerald-300"
                >
                  <MessageCircle className="w-4 h-4" aria-hidden="true" />
                  <span>WhatsApp Kanth: +91 9963225798</span>
                </a>
                <a
                  href={OWNER_INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="hero-instagram-link"
                  className="inline-flex items-center gap-1.5 font-semibold text-sky-400 hover:text-sky-300"
                >
                  <Instagram className="w-4 h-4" aria-hidden="true" />
                  <span>Instagram: {OWNER_INSTAGRAM_HANDLE}</span>
                </a>
              </div>
            </div>

            <div className="lg:col-span-7 min-w-0">
              <div className="w-full aspect-[16/9] rounded-xl overflow-hidden bg-zinc-900 border-2 border-zinc-800 shadow-2xl">
                <img
                  src={MAGNET_BANNER_URL}
                  alt="The Magnet — Sports Wear & Trendy Fashions official brand banner"
                  data-testid="magnet-hero-banner-img"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>

          {/* 4-column Commerce & Delivery Value Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 pt-6 border-t border-zinc-800">
            <div>
              <p className="text-sm font-bold text-yellow-400">Fast Pan-India Dispatch</p>
              <p className="text-xs text-zinc-400 mt-1">
                Quick warehouse dispatch from Telangana with live shipment tracking updates.
              </p>
            </div>
            <div>
              <p className="text-sm font-bold text-sky-400">Performance Activewear</p>
              <p className="text-xs text-zinc-400 mt-1">
                180–360 GSM quick-dry tees, 4-way stretch compression &amp; heavyweight streetwear fleece.
              </p>
            </div>
            <div>
              <p className="text-sm font-bold text-white">Direct UPI QR &amp; COD</p>
              <p className="text-xs text-zinc-400 mt-1">
                Scan &amp; pay to balajigoud11@axl via GPay, PhonePe, Paytm, or pay on delivery.
              </p>
            </div>
            <div>
              <button
                type="button"
                onClick={onOpenOrders}
                className="text-left group cursor-pointer"
              >
                <p className="text-sm font-bold text-yellow-400 inline-flex items-center gap-1.5 group-hover:underline">
                  <Package className="w-4 h-4" aria-hidden="true" />
                  <span>View My Orders →</span>
                </p>
                <p className="text-xs text-zinc-400 mt-1">
                  Check live order progress, courier tracking links, and downloadable GST invoices.
                </p>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Retail Catalog & Interactive Filters */}
      <section id="catalog" className="scroll-mt-28 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-zinc-950">
              {activeDepartment === 'All'
                ? 'Sports Wear & Trendy Fashions'
                : `${activeDepartment} Drop`}
            </h2>
            <p className="text-sm text-zinc-600 mt-1">
              Showing{' '}
              <span className="font-mono tabular-nums font-bold text-zinc-950">
                {filteredProducts.length}
              </span>{' '}
              of <span className="font-mono tabular-nums">{retailProducts.length}</span> ready-to-ship
              styles
              {searchQuery.trim() && (
                <span>
                  {' '}
                  matching <strong className="text-sky-600">“{searchQuery.trim()}”</strong>
                </span>
              )}
            </p>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-600 hover:underline cursor-pointer self-start sm:self-end"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Clear All Filters</span>
            </button>
          )}
        </div>

        {/* Filter Bar */}
        <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-5 shadow-xs">
          <div
            role="group"
            aria-label="Filter by category"
            className="flex flex-wrap items-center gap-1.5 pb-4 border-b border-zinc-100"
          >
            {CATEGORIES.map((cat) => {
              const active = category === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-zinc-950 text-yellow-400'
                      : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200/80'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            {/* Size Filter */}
            <div className="md:col-span-4 space-y-2">
              <span className="text-xs font-bold text-zinc-700 block">Size</span>
              <div role="group" aria-label="Filter by size" className="flex flex-wrap gap-1.5">
                {SIZES.map((s) => {
                  const active = size === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSize(s)}
                      className={`min-w-[40px] h-9 px-2.5 text-xs font-bold rounded-md border transition-colors cursor-pointer ${
                        active
                          ? 'border-zinc-950 bg-zinc-950 text-yellow-400'
                          : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400'
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Color Swatches */}
            <div className="md:col-span-4 space-y-2">
              <span className="text-xs font-bold text-zinc-700 block">
                Colorway{colorName !== 'All' ? ` — ${colorName}` : ''}
              </span>
              <div role="group" aria-label="Filter by color" className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setColorName('All')}
                  className={`h-8 px-2.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${
                    colorName === 'All'
                      ? 'border-zinc-950 bg-zinc-950 text-yellow-400'
                      : 'border-zinc-200 text-zinc-600 hover:border-zinc-400'
                  }`}
                >
                  All
                </button>
                {availableColors.map((swatch) => {
                  const active = colorName === swatch.name;
                  return (
                    <button
                      key={swatch.name}
                      type="button"
                      onClick={() => setColorName(active ? 'All' : swatch.name)}
                      aria-label={`Filter by color ${swatch.name}`}
                      title={swatch.name}
                      className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-transform cursor-pointer ${
                        active
                          ? 'border-sky-600 scale-110 ring-2 ring-sky-600/25'
                          : 'border-zinc-300 hover:scale-105'
                      }`}
                      style={{ backgroundColor: swatch.hex }}
                    >
                      {active && (
                        <Check
                          className={`w-3.5 h-3.5 ${
                            swatch.hex.toLowerCase() === '#facc15' ||
                            swatch.hex.toLowerCase() === '#ffffff'
                              ? 'text-zinc-950'
                              : 'text-white'
                          }`}
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Price Range Slider */}
            <div className="md:col-span-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label
                  htmlFor="max-price-range"
                  className="font-bold text-zinc-700 inline-flex items-center gap-1.5"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
                  <span>Max Price</span>
                </label>
                <span className="font-mono tabular-nums font-bold text-sky-600">
                  ₹200 — {maxPrice >= 5000 ? '₹5,000+' : formatINR(maxPrice)}
                </span>
              </div>
              <input
                id="max-price-range"
                type="range"
                min={500}
                max={5000}
                step={250}
                value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                className="w-full accent-sky-600 cursor-pointer"
              />
              <div className="flex justify-between text-[11px] font-mono tabular-nums text-zinc-400">
                <span>₹200</span>
                <span>₹1,500</span>
                <span>₹3,000</span>
                <span>₹5,000+</span>
              </div>
            </div>
          </div>
        </div>

        {/* Product Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div
                key={n}
                className="bg-white border border-zinc-200 rounded-xl overflow-hidden animate-pulse"
              >
                <div className="aspect-[4/3] bg-zinc-100" />
                <div className="p-5 space-y-3">
                  <div className="h-3 w-28 bg-zinc-100 rounded" />
                  <div className="h-5 w-3/4 bg-zinc-200 rounded" />
                  <div className="h-9 w-full bg-zinc-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center space-y-3">
            <p className="text-lg font-bold text-zinc-950">
              No styles match your current filters
            </p>
            <p className="text-sm text-zinc-600">
              Try widening your price ceiling or clearing a department, size, or search filter.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-2 px-5 py-2.5 rounded-lg bg-zinc-950 text-yellow-400 text-sm font-bold hover:bg-zinc-800 cursor-pointer"
            >
              Show All Styles
            </button>
          </div>
        ) : (
          <div
            data-testid="product-grid"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {filteredProducts.map((product) => {
              const activeSize = getActiveSize(product);
              const isAdded = recentlyAddedId === product.id;
              const outOfStock = product.stock <= 0;
              const listingPrice = computeListingPrice(product.priceInr, product.listingPriceInr);
              const discountPct = getDiscountPercent(listingPrice, product.priceInr);

              return (
                <article
                  key={product.id}
                  data-testid={`product-card-${product.id}`}
                  className="group bg-white border border-zinc-200 rounded-xl overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-zinc-300"
                >
                  <button
                    type="button"
                    onClick={() => onSelectProduct(product)}
                    aria-label={`View full details for ${product.name}`}
                    className="aspect-[4/3] w-full bg-zinc-100 overflow-hidden text-left cursor-pointer"
                  >
                    <ProductImage
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  </button>

                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      {/* Rating Pill + Category & Fabric */}
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-zinc-500 truncate">
                          {product.category} · {product.fabric}
                        </span>
                        <span
                          data-testid="product-rating-pill"
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-700 text-white text-[11px] font-semibold tabular-nums shrink-0"
                        >
                          <span>{product.rating.toFixed(1)}</span>
                          <Star className="w-2.5 h-2.5 fill-white" aria-hidden="true" />
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => onSelectProduct(product)}
                        className="text-left block w-full cursor-pointer"
                      >
                        <h3 className="text-base font-bold text-zinc-950 leading-snug group-hover:text-sky-600 transition-colors">
                          {product.name}
                        </h3>
                      </button>

                      {/* Selling Price + Strikethrough MRP + Green % OFF */}
                      <div className="flex flex-wrap items-baseline gap-2 pt-0.5">
                        <span className="font-mono tabular-nums text-lg font-extrabold text-zinc-950">
                          {formatINR(product.priceInr)}
                        </span>
                        {listingPrice > product.priceInr && (
                          <span className="font-mono tabular-nums text-xs text-zinc-400 line-through">
                            {formatINR(listingPrice)}
                          </span>
                        )}
                        {discountPct > 0 && (
                          <span className="text-xs font-bold text-emerald-700">
                            {discountPct}% off
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">
                        {product.description}
                      </p>
                    </div>

                    <div className="space-y-3 pt-2 border-t border-zinc-100">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          {product.sizes.map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() =>
                                setSelectedSizes((prev) => ({ ...prev, [product.id]: s }))
                              }
                              aria-label={`Select size ${s} for ${product.name}`}
                              className={`w-8 h-7 text-xs font-bold rounded border transition-colors cursor-pointer ${
                                activeSize === s
                                  ? 'border-zinc-950 bg-zinc-950 text-yellow-400'
                                  : 'border-zinc-200 text-zinc-600 hover:border-zinc-400'
                              }`}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                        <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                          <span
                            className="w-3 h-3 rounded-full border border-zinc-300 shrink-0"
                            style={{ backgroundColor: product.colorHex }}
                            aria-hidden="true"
                          />
                          <span className="truncate max-w-[88px]">{product.colorName}</span>
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={outOfStock}
                          onClick={() => onBuyNow(product, activeSize)}
                          aria-label={`Buy ${product.name} size ${activeSize} now`}
                          className="py-2.5 px-3 rounded-lg bg-zinc-950 text-yellow-400 text-xs sm:text-sm font-bold hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {outOfStock ? 'Out of Stock' : 'Buy Now'}
                        </button>
                        <button
                          type="button"
                          disabled={outOfStock}
                          onClick={() => handleQuickAdd(product)}
                          aria-label={`Add ${product.name} size ${activeSize} to cart`}
                          className={`py-2.5 px-3 rounded-lg text-xs sm:text-sm font-bold border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap ${
                            isAdded
                              ? 'border-sky-600 bg-sky-600 text-white'
                              : 'border-yellow-400 bg-yellow-400 text-zinc-950 hover:bg-yellow-300'
                          }`}
                        >
                          {isAdded ? `Added (${activeSize})` : 'Add to Cart'}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
