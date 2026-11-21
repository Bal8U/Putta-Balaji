# Deploying VastraLoom on Hostinger hPanel (Node.js Web App + MySQL)

This application is engineered for clean, production deployment on **Hostinger Business / Cloud / VPS hosting** with **Node.js + Express + MySQL (`mysql2`)**.

## Step 1: Create Your MySQL Database in Hostinger hPanel
1. Log in to **Hostinger hPanel** → open **Databases → Management**.
2. Create a new MySQL database (e.g., `u123456789_vastraloom_db`), a MySQL user, and a strong password.
3. Click **Enter phpMyAdmin** next to your newly created database.
4. Select the **Import** tab, choose `database.sql` from the project root, and click **Import**.
   - This creates the `users`, `products`, `orders`, and `bulk_quotes` tables and loads sample Indian clothing seed records.

## Step 2: Upload & Build the Project
1. Upload the project files via **Git deployment** (recommended) or **File Manager / SFTP** into your Hostinger Node.js app root directory.
2. Ensure the `/uploads` directory is writable (`chmod 755 uploads`) so customer bulk-order logos and admin product photos persist cleanly.
3. Install dependencies and build the frontend static bundle:
   ```bash
   npm install
   npm run build
   ```

## Step 3: Configure `.env` Variables
Create a `.env` file in the project root (copied from `.env.example`) with your Hostinger MySQL details:
```env
PORT=3000
NODE_ENV=production
APP_URL=https://yourdomain.in

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=u123456789_vastraloom
DB_PASSWORD=YOUR_MYSQL_PASSWORD
DB_NAME=u123456789_vastraloom_db

JWT_SECRET=generate_a_64_char_random_secret
ADMIN_EMAIL=admin@vastraloom.in
ADMIN_PASSWORD=SetAStrongAdminPassword!
```

## Step 4: Start the Node.js Application
1. In **hPanel → Websites → Node.js Web App** (or PM2 on VPS), set:
   - **Node.js Version**: `20.x` or `22.x`
   - **Application Startup Command**: `npx tsx server.ts` (or `npm run start` after compiling `server.ts`)
   - **Port**: `3000` (or the port assigned by Hostinger via `process.env.PORT`)
2. Restart the application from hPanel. When `NODE_ENV=production` is set, `server.ts` serves the built static frontend from `/dist`, handles all `/api/*` REST endpoints against MySQL via `mysql2/promise`, and serves uploaded assets from `/uploads`.

## Step 5: Verify Production Health
- Visit `https://yourdomain.in/api/health` → confirms `database: "mysql"` and server status.
- Visit `https://yourdomain.in/admin` → sign in with your configured `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
