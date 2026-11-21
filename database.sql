-- =============================================================================
-- VastraLoom — Indian Clothing & Wholesale Apparel Database Schema (MySQL 8.0+)
-- Compatible with Hostinger hPanel MySQL / MariaDB
-- Currency: INR (₹) | Tax: 18% GST
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- -----------------------------------------------------------------------------
-- 1. Users Table (Admin & Wholesale Staff Authentication)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'manager', 'customer') NOT NULL DEFAULT 'customer',
  phone VARCHAR(20) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 2. Products Table (Retail & Catalog Apparel Inventory)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  sku VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(180) NOT NULL,
  category ENUM('Kurtas', 'Cotton T-Shirts', 'Sarees', 'Nehru Jackets', 'Hoodies') NOT NULL,
  description TEXT NOT NULL,
  fabric VARCHAR(80) NOT NULL DEFAULT '100% Cotton',
  price_inr DECIMAL(10, 2) NOT NULL,
  stock INT UNSIGNED NOT NULL DEFAULT 0,
  sizes JSON NOT NULL COMMENT 'Array of available sizes e.g. ["S","M","L","XL","XXL"]',
  color_name VARCHAR(60) NOT NULL,
  color_hex VARCHAR(16) NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  featured TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_products_category (category),
  INDEX idx_products_price (price_inr)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 3. Retail Orders Table (Storefront Orders with 18% GST & UPI/COD)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_number VARCHAR(32) NOT NULL UNIQUE,
  customer_name VARCHAR(140) NOT NULL,
  customer_email VARCHAR(160) NOT NULL,
  customer_phone VARCHAR(20) NOT NULL,
  shipping_address TEXT NOT NULL,
  city VARCHAR(80) NOT NULL,
  state VARCHAR(80) NOT NULL,
  pincode VARCHAR(10) NOT NULL,
  payment_method ENUM('UPI / Razorpay', 'Cash on Delivery') NOT NULL DEFAULT 'UPI / Razorpay',
  payment_reference VARCHAR(120) DEFAULT NULL,
  items JSON NOT NULL COMMENT 'Line items with productId, name, size, qty, unitPrice',
  subtotal_inr DECIMAL(12, 2) NOT NULL,
  gst_inr DECIMAL(12, 2) NOT NULL COMMENT '18% GST',
  shipping_inr DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  total_inr DECIMAL(12, 2) NOT NULL,
  status ENUM('Pending', 'Approved / Quote Sent', 'In Production', 'Delivered') NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_orders_status (status),
  INDEX idx_orders_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 4. Bulk Quotes Table (Wholesale Custom Orders + Uploaded Logo)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bulk_quotes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  quote_number VARCHAR(32) NOT NULL UNIQUE,
  business_name VARCHAR(160) NOT NULL,
  contact_name VARCHAR(140) NOT NULL,
  contact_email VARCHAR(160) NOT NULL,
  contact_phone VARCHAR(20) NOT NULL,
  gstin VARCHAR(20) DEFAULT NULL,
  apparel_type VARCHAR(80) NOT NULL,
  fabric VARCHAR(60) NOT NULL,
  size_matrix JSON NOT NULL COMMENT '{"S":30,"M":50,"L":40,"XL":30,"XXL":0}',
  total_quantity INT UNSIGNED NOT NULL,
  custom_printing TINYINT(1) NOT NULL DEFAULT 0,
  logo_url VARCHAR(500) DEFAULT NULL,
  shipping_speed ENUM('Standard', 'Express') NOT NULL DEFAULT 'Standard',
  unit_price_inr DECIMAL(10, 2) NOT NULL,
  base_cost_inr DECIMAL(12, 2) NOT NULL,
  printing_cost_inr DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  discount_percent DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
  discount_amount_inr DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  discounted_subtotal_inr DECIMAL(12, 2) NOT NULL,
  gst_inr DECIMAL(12, 2) NOT NULL COMMENT '18% GST on discounted subtotal',
  shipping_fee_inr DECIMAL(10, 2) NOT NULL,
  estimated_total_inr DECIMAL(12, 2) NOT NULL,
  notes TEXT DEFAULT NULL,
  status ENUM('Pending', 'Approved / Quote Sent', 'In Production', 'Delivered') NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_quotes_status (status),
  INDEX idx_quotes_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
-- Seed Data: Default Admin Account (password hashed with bcrypt: admin@vastraloom.in / VastraAdmin2026)
-- Note: Server automatically verifies or hashes ADMIN_PASSWORD on first boot.
-- =============================================================================
INSERT IGNORE INTO users (full_name, email, password_hash, role, phone) VALUES
('Aarav Mehta (Admin)', 'admin@vastraloom.in', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', '+91 98290 44120');

-- =============================================================================
-- Seed Data: Indian Clothing Retail & Wholesale Catalog
-- =============================================================================
INSERT IGNORE INTO products (sku, name, category, description, fabric, price_inr, stock, sizes, color_name, color_hex, image_url, featured) VALUES
('VL-KRT-101', 'Jaipur Chanderi Handloom Kurta', 'Kurtas', 'Breathable ivory chanderi cotton kurta featuring tonal placket embroidery, mandarin collar, and reinforced side slits crafted for festive and everyday wear.', '100% Cotton', 1490.00, 145, '["S","M","L","XL","XXL"]', 'Ivory', '#F5F0E6', '/src/assets/images/product_kurta_ivory_1795171663177.jpg', 1),
('VL-TSH-204', 'Tiruppur 240 GSM Combed Cotton Tee', 'Cotton T-Shirts', 'Heavyweight ring-spun combed cotton crew-neck tee in deep heritage teal. Pre-shrunk bio-washed knit engineered for crisp retail drape and screen printing.', '100% Cotton', 690.00, 420, '["S","M","L","XL","XXL"]', 'Heritage Teal', '#0F766E', '/src/assets/images/product_tshirt_teal_1795171655296.jpg', 1),
('VL-SAR-309', 'Varanasi Zari Teal Silk Blend Saree', 'Sarees', '6.3-metre ceremonial Banarasi silk blend drape woven with floral antique gold zari borders and matching unstitched blouse piece.', 'Silk Blend', 4250.00, 62, '["S","M","L","XL"]', 'Deep Teal', '#115E59', '/src/assets/images/product_saree_silk_1795171652989.jpg', 1),
('VL-NHR-412', 'Jodhpur Raw Silk Nehru Jacket', 'Nehru Jackets', 'Structured midnight indigo textured raw silk bundi jacket finished with a crisp bandhgala collar, welt chest pocket, and matte brass buttons.', 'Silk Blend', 2890.00, 88, '["S","M","L","XL","XXL"]', 'Indigo Slate', '#2B3A4E', '/src/assets/images/product_nehru_jacket_1795171653051.jpg', 1),
('VL-HDY-505', 'Ludhiana 380 GSM French Terry Hoodie', 'Hoodies', 'Heavyweight brushed cotton-fleece unisex pullover hoodie in heather slate with double-lined hood and reinforced kangaroo pocket — ideal for corporate merchandise.', '100% Cotton', 1650.00, 210, '["S","M","L","XL","XXL"]', 'Heather Slate', '#64748B', '/src/assets/images/product_hoodie_slate_1795171652397.jpg', 1),
('VL-KRT-108', 'Sanganer Pure Linen Mandarin Kurta', 'Kurtas', 'Lightweight European-flax linen blend kurta tailored in a clean straight silhouette with mother-of-pearl buttons for summer gatherings.', 'Linen', 2190.00, 94, '["M","L","XL","XXL"]', 'Sandstone', '#D6C7B2', '/src/assets/images/product_kurta_ivory_1795171663177.jpg', 0),
('VL-TSH-219', 'Essential Bio-Wash Cotton Tee', 'Cotton T-Shirts', 'Everyday 180 GSM combed cotton unisex tee crafted in Tiruppur for uniform programs, retail private labels, and high-volume custom branding.', '100% Cotton', 390.00, 650, '["S","M","L","XL","XXL"]', 'Deep Teal', '#0F766E', '/src/assets/images/product_tshirt_teal_1795171655296.jpg', 0),
('VL-NHR-425', 'Heritage Handspun Linen Bandhgala Vest', 'Nehru Jackets', 'Tailored sleeveless Nehru jacket cut from textured slub linen with breathable cotton voile lining for warm-weather weddings.', 'Linen', 2450.00, 55, '["S","M","L","XL"]', 'Charcoal', '#334155', '/src/assets/images/product_nehru_jacket_1795171653051.jpg', 0);

-- =============================================================================
-- Seed Data: Sample Retail Orders & Bulk Quotes for Admin Dashboard Analytics
-- =============================================================================
INSERT IGNORE INTO orders (order_number, customer_name, customer_email, customer_phone, shipping_address, city, state, pincode, payment_method, payment_reference, items, subtotal_inr, gst_inr, shipping_inr, total_inr, status) VALUES
('VL-ORD-2601', 'Priya Deshmukh', 'priya.deshmukh@example.in', '+91 98201 33412', '402 Linking Road, Bandra West', 'Mumbai', 'Maharashtra', '400050', 'UPI / Razorpay', 'UPI-260198441', '[{"productId":3,"name":"Varanasi Zari Teal Silk Blend Saree","size":"M","qty":1,"unitPrice":4250},{"productId":1,"name":"Jaipur Chanderi Handloom Kurta","size":"L","qty":1,"unitPrice":1490}]', 5740.00, 1033.00, 0.00, 6773.00, 'Delivered'),
('VL-ORD-2602', 'Rohan Kulkarni', 'rohan.k@example.in', '+91 98450 77821', '14 Indiranagar 100ft Rd', 'Bengaluru', 'Karnataka', '560038', 'Cash on Delivery', NULL, '[{"productId":4,"name":"Jodhpur Raw Silk Nehru Jacket","size":"L","qty":2,"unitPrice":2890}]', 5780.00, 1040.00, 0.00, 6820.00, 'In Production'),
('VL-ORD-2603', 'Ananya Chatterjee', 'ananya.c@example.in', '+91 98300 51908', '28 Park Street, Ballygunge', 'Kolkata', 'West Bengal', '700016', 'UPI / Razorpay', 'UPI-260372819', '[{"productId":2,"name":"Tiruppur 240 GSM Combed Cotton Tee","size":"M","qty":3,"unitPrice":690}]', 2070.00, 373.00, 0.00, 2443.00, 'Pending');

INSERT IGNORE INTO bulk_quotes (quote_number, business_name, contact_name, contact_email, contact_phone, gstin, apparel_type, fabric, size_matrix, total_quantity, custom_printing, logo_url, shipping_speed, unit_price_inr, base_cost_inr, printing_cost_inr, discount_percent, discount_amount_inr, discounted_subtotal_inr, gst_inr, shipping_fee_inr, estimated_total_inr, notes, status) VALUES
('VL-BLK-8401', 'Kaveri Tech Solutions Pvt Ltd', 'Vikramaditya Rao', 'procurement@kaveritech.in', '+91 98451 22900', '29AAACK1234F1Z5', 'Combed Cotton T-Shirt', '100% Cotton', '{"S":60,"M":180,"L":160,"XL":100,"XXL":0}', 500, 1, NULL, 'Express', 210.00, 105000.00, 20000.00, 15.00, 18750.00, 106250.00, 19125.00, 6300.00, 131675.00, 'Annual summit corporate tees with left-chest 2-color screen print.', 'Approved / Quote Sent'),
('VL-BLK-8402', 'Rajwada Heritage Hotels', 'Meera Singhania', 'purchasing@rajwadahotels.in', '+91 98290 88214', '08AABCR4412K1Z2', 'Cotton Kurta', 'Linen', '{"S":20,"M":45,"L":50,"XL":35,"XXL":0}', 150, 1, NULL, 'Standard', 470.00, 70500.00, 6000.00, 10.00, 7650.00, 68850.00, 12393.00, 1450.00, 82693.00, 'Front-desk staff hospitality kurtas in natural ivory linen.', 'In Production'),
('VL-BLK-8403', 'Deccan Craft Collective', 'Siddharth Nair', 'orders@deccancraft.in', '+91 99001 64210', '27AABCD8891M1Z9', 'Heavyweight Hoodie', '100% Cotton', '{"S":15,"M":35,"L":30,"XL":20,"XXL":0}', 100, 0, NULL, 'Standard', 540.00, 54000.00, 0.00, 10.00, 5400.00, 48600.00, 8748.00, 1250.00, 58598.00, 'Blank winter drop stock for retail embroidery in Pune.', 'Pending');
