import { useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  MapPin,
  MessageCircle,
  Ruler,
  ShieldCheck,
  ShoppingCart,
  Star,
  Truck,
  X,
  Zap,
} from 'lucide-react';
import type { ApparelSize, Product } from '../types';
import { formatINR } from '../utils/pricing';
import {
  checkPincodeDelivery,
  computeListingPrice,
  getDiscountPercent,
  type PincodeDeliveryResult,
} from '../utils/orderHelpers';
import { buildWhatsAppOwnerUrl, OWNER_NAME } from '../utils/upi';
import { ProductImage } from './ProductImage';

interface ProductDetailViewProps {
  product: Product;
  onBack: () => void;
  onAddToCart: (product: Product, size: ApparelSize) => void;
  onBuyNow: (product: Product, size: ApparelSize) => void;
}

const SIZE_CHART_ROWS = [
  { size: 'S', chest: '38"', shoulder: '16.5"', length: '27.0"' },
  { size: 'M', chest: '40"', shoulder: '17.2"', length: '28.0"' },
  { size: 'L', chest: '42"', shoulder: '18.0"', length: '29.0"' },
  { size: 'XL', chest: '44"', shoulder: '18.8"', length: '30.0"' },
  { size: 'XXL', chest: '46"', shoulder: '19.5"', length: '31.0"' },
];

export function ProductDetailView({
  product,
  onBack,
  onAddToCart,
  onBuyNow,
}: ProductDetailViewProps) {
  const [selectedSize, setSelectedSize] = useState<ApparelSize>(
    product.sizes.includes('M') ? 'M' : product.sizes[0] || 'M',
  );
  const [pincode, setPincode] = useState('');
  const [deliveryCheck, setDeliveryCheck] = useState<PincodeDeliveryResult | null>(null);
  const [sizeChartOpen, setSizeChartOpen] = useState(false);
  const [addedBanner, setAddedBanner] = useState(false);

  const listingPrice = computeListingPrice(product.priceInr, product.listingPriceInr);
  const discountPercent = getDiscountPercent(listingPrice, product.priceInr);
  const outOfStock = product.stock <= 0;

  const handleCheckPincode = (e: React.FormEvent) => {
    e.preventDefault();
    setDeliveryCheck(checkPincodeDelivery(pincode, product.priceInr));
  };

  const handleAdd = () => {
    onAddToCart(product, selectedSize);
    setAddedBanner(true);
    window.setTimeout(() => setAddedBanner(false), 1800);
  };

  return (
    <div
      data-testid="product-detail-page"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6"
    >
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 hover:text-sky-600 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Home</span>
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
        <span>{product.department}</span>
        <ChevronRight className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
        <span>{product.category}</span>
        <ChevronRight className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
        <span className="text-zinc-900 font-semibold truncate max-w-[260px]">{product.name}</span>
      </nav>

      {/* Main 2-Column Product Detail Card */}
      <div className="bg-white border border-zinc-200 rounded-xl p-5 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10">
        {/* Left: Product Image + Action Buttons */}
        <div className="lg:col-span-5 space-y-4">
          <div className="aspect-[4/4] rounded-xl overflow-hidden bg-zinc-100 border border-zinc-200">
            <ProductImage
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={outOfStock}
              onClick={handleAdd}
              data-testid="pdp-add-to-cart"
              className="inline-flex items-center justify-center gap-2 py-3.5 px-4 rounded-lg bg-yellow-400 text-zinc-950 text-sm font-extrabold hover:bg-yellow-300 transition-colors cursor-pointer disabled:opacity-50"
            >
              <ShoppingCart className="w-4 h-4" aria-hidden="true" />
              <span>{addedBanner ? `Added (${selectedSize})` : 'Add to Cart'}</span>
            </button>
            <button
              type="button"
              disabled={outOfStock}
              onClick={() => onBuyNow(product, selectedSize)}
              data-testid="pdp-buy-now"
              className="inline-flex items-center justify-center gap-2 py-3.5 px-4 rounded-lg bg-zinc-950 text-yellow-400 text-sm font-extrabold hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Zap className="w-4 h-4" aria-hidden="true" />
              <span>{outOfStock ? 'Out of Stock' : 'Buy Now'}</span>
            </button>
          </div>

          <a
            href={buildWhatsAppOwnerUrl(
              `Hello ${OWNER_NAME}, I am interested in ${product.name} (Size ${selectedSize}, ${formatINR(product.priceInr)}) on The Magnet.`,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-emerald-600 text-emerald-700 text-xs font-bold hover:bg-emerald-50 transition-colors"
          >
            <MessageCircle className="w-4 h-4" aria-hidden="true" />
            <span>Ask {OWNER_NAME} on WhatsApp (+91 9963225798)</span>
          </a>
        </div>

        {/* Right: Pricing, Rating, Size Chart, PIN Checker & Details */}
        <div className="lg:col-span-7 space-y-6">
          <div className="space-y-2.5 border-b border-zinc-100 pb-5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span className="font-bold text-sky-600">The Magnet Official</span>
              <span>·</span>
              <span>{product.category}</span>
              <span>·</span>
              <span className="font-mono">{product.sku}</span>
            </div>

            <h1 className="font-display text-2xl sm:text-3xl font-bold text-zinc-950">
              {product.name}
            </h1>

            {/* Rating Pill + Verified Count */}
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-700 text-white text-xs font-semibold tabular-nums">
                <span>{product.rating.toFixed(1)}</span>
                <Star className="w-3 h-3 fill-white" aria-hidden="true" />
              </span>
              <span className="text-xs font-medium text-zinc-500 tabular-nums">
                {product.ratingCount} Ratings &amp; Verified Buyer Reviews
              </span>
            </div>

            {/* Special Price Block */}
            <div className="pt-2 space-y-1">
              <p className="text-xs font-bold text-emerald-700">Special Drop Price</p>
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="font-mono tabular-nums text-3xl font-extrabold text-zinc-950">
                  {formatINR(product.priceInr)}
                </span>
                {listingPrice > product.priceInr && (
                  <>
                    <span className="font-mono tabular-nums text-base text-zinc-400 line-through">
                      {formatINR(listingPrice)}
                    </span>
                    <span className="text-sm font-bold text-emerald-700">
                      {discountPercent}% off
                    </span>
                  </>
                )}
              </div>
              <p className="text-xs text-zinc-500">
                + 18% GST tax invoice generated at checkout · Direct UPI QR (balajigoud11@axl) &amp; COD accepted
              </p>
            </div>
          </div>

          {/* Size Selector + Size Chart Modal Trigger */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-zinc-950">
                Select Size: <span className="text-sky-600">{selectedSize}</span>
              </span>
              <button
                type="button"
                onClick={() => setSizeChartOpen(true)}
                data-testid="open-size-chart-btn"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-600 hover:underline cursor-pointer"
              >
                <Ruler className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Size Chart</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {product.sizes.map((s) => {
                const active = selectedSize === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSelectedSize(s)}
                    className={`min-w-[48px] h-10 px-3 rounded-lg border text-sm font-bold transition-colors cursor-pointer ${
                      active
                        ? 'border-zinc-950 bg-zinc-950 text-yellow-400 ring-2 ring-yellow-400/40'
                        : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-950'
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          {/* PIN Code Delivery Checker */}
          <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-zinc-950">
              <MapPin className="w-4 h-4 text-sky-600" aria-hidden="true" />
              <span>Delivery &amp; PIN Code Check</span>
            </div>

            <form onSubmit={handleCheckPincode} className="flex flex-wrap sm:flex-nowrap gap-2 max-w-md">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={pincode}
                onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter Delivery PIN Code (e.g. 508115)"
                aria-label="Enter Delivery PIN Code"
                data-testid="pdp-pincode-input"
                className="flex-1 px-3.5 py-2 text-sm font-mono bg-white border border-zinc-300 rounded-lg focus:outline-none focus:border-sky-600"
              />
              <button
                type="submit"
                data-testid="pdp-pincode-check-btn"
                className="px-4 py-2 rounded-lg bg-zinc-950 text-yellow-400 text-xs font-bold hover:bg-zinc-800 cursor-pointer whitespace-nowrap"
              >
                Check
              </button>
            </form>

            {deliveryCheck ? (
              deliveryCheck.valid ? (
                <div
                  data-testid="pdp-pincode-result"
                  className="space-y-1 text-xs bg-white border border-emerald-200 rounded-lg p-3"
                >
                  <p className="font-bold text-emerald-800 flex items-center gap-1.5">
                    <Truck className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{deliveryCheck.message}</span>
                  </p>
                  <p className="text-zinc-600">
                    Dispatch Route: The Magnet Warehouse (Telangana) → {deliveryCheck.regionLabel}
                  </p>
                  <p className="text-zinc-500">
                    Cash on Delivery available · Live Order Tracking &amp; GST Tax Invoice
                  </p>
                </div>
              ) : (
                <p role="alert" className="text-xs text-rose-700 font-medium">
                  {deliveryCheck.message}
                </p>
              )
            ) : (
              <p className="text-xs text-zinc-500">
                Try PIN{' '}
                <button
                  type="button"
                  onClick={() => {
                    setPincode('508115');
                    setDeliveryCheck(checkPincodeDelivery('508115', product.priceInr));
                  }}
                  className="font-mono text-sky-600 font-semibold underline cursor-pointer"
                >
                  508115
                </button>{' '}
                to check Telangana / Bhuvanagiri express delivery ETA.
              </p>
            )}
          </div>

          {/* Product Details & Specifications */}
          <div className="space-y-3 pt-2 border-t border-zinc-100">
            <h2 className="text-sm font-bold text-zinc-950">Performance Specs &amp; Fit</h2>
            <p className="text-sm text-zinc-600 leading-relaxed">{product.description}</p>

            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2 text-xs">
              <div>
                <dt className="text-zinc-500">Fabric</dt>
                <dd className="font-semibold text-zinc-900 mt-0.5">{product.fabric}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Colorway</dt>
                <dd className="font-semibold text-zinc-900 mt-0.5 inline-flex items-center gap-1.5">
                  <span
                    className="w-3 h-3 rounded-full border border-zinc-300"
                    style={{ backgroundColor: product.colorHex }}
                  />
                  <span>{product.colorName}</span>
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Stock Status</dt>
                <dd className="font-semibold text-sky-600 mt-0.5">
                  {outOfStock ? 'Out of Stock' : `${product.stock} units ready to ship`}
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-4 pt-2 text-xs text-zinc-600">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-sky-600" aria-hidden="true" />
                <span>100% Authentic The Magnet Apparel</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-sky-600" aria-hidden="true" />
                <span>Live Order Tracking + GST Invoice</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Size Chart Modal */}
      {sizeChartOpen && (
        <div
          className="fixed inset-0 z-50 bg-zinc-950/60 backdrop-blur-[1px] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="The Magnet Athletic Apparel Size Chart"
          data-testid="size-chart-modal"
        >
          <div className="bg-white rounded-xl max-w-lg w-full p-6 space-y-4 border border-zinc-200 shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-zinc-950">The Magnet Fit &amp; Size Chart</h3>
                <p className="text-xs text-zinc-500">
                  Garment measurements in inches · {product.category}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSizeChartOpen(false)}
                aria-label="Close size chart"
                className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 text-zinc-500">
                  <th className="py-2 font-semibold">Size</th>
                  <th className="py-2 font-semibold">Chest</th>
                  <th className="py-2 font-semibold">Shoulder</th>
                  <th className="py-2 font-semibold">Length</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 font-mono">
                {SIZE_CHART_ROWS.map((row) => (
                  <tr
                    key={row.size}
                    className={
                      selectedSize === row.size ? 'bg-yellow-50 font-bold text-zinc-950' : ''
                    }
                  >
                    <td className="py-2.5">{row.size}</td>
                    <td className="py-2.5">{row.chest}</td>
                    <td className="py-2.5">{row.shoulder}</td>
                    <td className="py-2.5">{row.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="text-[11px] text-zinc-500">
              Fit Tip: Choose your regular size for Compression Athletic Tees, or go one size up for
              a relaxed streetwear drop-shoulder look.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
