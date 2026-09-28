# Deployment Guide: Render + Vercel Setup

This guide walks you through deploying the **Registry Office File Tracker** using **Render** and **Vercel**.

---

## 🏗️ Architecture: How Render + Vercel Work Together

| Component | Platform | Why |
| :--- | :--- | :--- |
| **Backend & SQLite Database** | **Render** | Render provides continuous Node.js runtime and **persistent disk storage** for your SQLite database (`registry.db`), keeping all records safe across restarts. |
| **Frontend UI (Static SPA)** | **Vercel** | Vercel provides instant global CDN delivery, automatic SSL, and fast static loading for the HTML/CSS/JS interface. |

> 💡 **Tip:** Render can also serve both the frontend and backend together as a single full-stack service if you prefer to deploy in one place!

---

## Step 1: Push Project to GitHub

If you haven't pushed the latest changes to GitHub yet:

1. Create a repository on [GitHub](https://github.com/new) (e.g. `registry-tracker`).
2. Run these commands in your project terminal:
   ```bash
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/registry-tracker.git
   git push -u origin main
   ```

---

## Step 2: Deploy Backend to Render

1. Go to your [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** ➔ **Blueprint**.
3. Connect your GitHub repository `registry-tracker`.
4. Render detects [render.yaml](render.yaml) automatically:
   - Sets runtime to **Docker**
   - Configures the persistent disk (`1 GB` mounted at `/var/data`)
   - Sets `DATA_DIR=/var/data`
   - Automatically seeds your existing 4,134 records into the disk on first launch!
5. Click **Apply**.
6. When deployment finishes, copy your Render web service URL:
   ```
   https://registry-tracker-xxxx.onrender.com
   ```

---

## Step 3: Deploy Frontend to Vercel

1. Go to your [Vercel Dashboard](https://vercel.com/new).
2. Click **Add New...** ➔ **Project**.
3. Import your GitHub repository `registry-tracker`.
4. Vercel automatically detects [vercel.json](vercel.json):
   - **Framework Preset:** Other
   - **Root Directory:** `./`
   - **Output Directory:** `public` (set automatically by vercel.json)
5. Click **Deploy**.
6. When deployment is complete, Vercel gives you your live URL:
   ```
   https://registry-tracker-xxxx.vercel.app
   ```

---

## Step 4: Connect Vercel to Render

You have two easy ways to connect your Vercel frontend to your Render backend:

### Option A: Using the in-app "⚙️ Server" Button (Instant - No redeploy needed)
1. Open your live Vercel app in your browser (`https://your-app.vercel.app`).
2. Click the **⚙️ Server** button in the top navigation bar.
3. Paste your Render backend URL (e.g. `https://registry-tracker-xxxx.onrender.com`).
4. Click **Test Connection** to verify that it connects to your database.
5. Click **Save & Connect**. Your browser will now save this connection and load your files immediately!

### Option B: Automatic Vercel API Rewrite (Zero configuration for all visitors)
1. Open [vercel.json](vercel.json) in your project.
2. Add your Render URL to the `rewrites` section:
   ```json
   {
     "version": 2,
     "outputDirectory": "public",
     "cleanUrls": true,
     "rewrites": [
       {
         "source": "/api/:match*",
         "destination": "https://YOUR-RENDER-APP.onrender.com/api/:match*"
       }
     ]
   }
   ```
3. Commit and push:
   ```bash
   git add vercel.json
   git commit -m "Configure Vercel API rewrite to Render backend"
   git push origin main
   ```
   Vercel will redeploy automatically, and all `/api/*` calls will be proxied straight to Render without any CORS or manual configuration needed by visitors!
