# 🚀 Free Deployment Guide: Registry Office File Tracker

This guide explains how to use and deploy the **Registry Office File Tracker** **100% FREE** without paying any subscription fees or needing a credit card.

---

## ⚡ Method 1: Instant Free Online Access via Cloudflare Tunnel (Recommended)

You already have `cloudflared-windows-amd64.exe` downloaded in the tracker folder. This method gives you a **free, encrypted public HTTPS web address** that works anywhere in the world on smartphones, tablets, or other computers.

### 🌟 Why this is the best free option:
- **$0.00 Cost Forever:** No credit card, no billing, no hidden fees.
- **100% Permanent Data:** All 4,134 records and newly registered files are stored directly on your computer's `data/registry.db`. No cloud storage limits or accidental data resets.
- **Secure Encrypted Link:** Uses Cloudflare's global SSL infrastructure (`https://xxxx.trycloudflare.com`).

### How to use:
1. Double-click **`Launch-Online-Tracker.bat`** in this folder.
2. The launcher will automatically:
   - Start the database server (if not already running).
   - Establish the free Cloudflare secure tunnel.
   - Automatically copy the public HTTPS link to your clipboard.
   - Open your web browser to the public link.
3. Simply paste (**Ctrl+V**) and share the link with colleagues or open it on your phone!
4. When finished, close the window or press `Ctrl+C` to stop sharing.

> 💡 **Tip:** Double-click `Create-Desktop-Shortcut.bat` to put a **"Registry File Tracker (Online Free)"** icon right on your Desktop for 1-click access!

---

## ☁️ Method 2: Render Free Web Service (24/7 Cloud Hosting)

If you prefer to host the app in the cloud so your computer doesn't need to stay on:

1. Push this project to your GitHub repository:
   ```bash
   git add .
   git commit -m "Configure 100% free deployment"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/registry-tracker.git
   git push -u origin main
   ```
2. Go to [dashboard.render.com](https://dashboard.render.com/) and click **New +** ➔ **Blueprint**.
3. Select your repository.
4. Render will read `render.yaml` with the configured **Free plan** (`plan: free`, zero dollars).
5. Click **Apply**.
6. When deployment finishes, you get a live URL:
   ```
   https://registry-tracker-xxxx.onrender.com
   ```

> ⚠️ **Note about Render Free Tier:** Render spins down free services after 15 minutes of inactivity (taking 30–50 seconds to wake up on the next visit). Furthermore, Render Free uses ephemeral storage; your bundled 4,134 baseline records are always safe, but newly added records reset if Render restarts the container.

---

## 🏢 Method 3: Local Office Network (Zero Internet Needed)

If your team is in the same building or connected to the same Wi-Fi router:

1. Double-click `allow-firewall.bat` once (as Administrator).
2. Double-click `Launch-Tracker.bat`.
3. Check your computer's IP address (e.g. `192.168.1.50`).
4. Any colleague on the same network can access the tracker by typing:
   ```
   http://192.168.1.50:3000
   ```
