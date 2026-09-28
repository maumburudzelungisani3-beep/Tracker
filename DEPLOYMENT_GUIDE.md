# Deployment Guide: Registry Office File Tracker

This application is ready for deployment to **Render** or **Railway** with persistent storage for SQLite.

---

## 1. Push Your Code to GitHub

If you haven't already pushed this project to GitHub:

1. Go to [GitHub](https://github.com/new) and create a new repository (e.g. `registry-tracker`).
2. Run these commands in your project folder:
   ```bash
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/registry-tracker.git
   git push -u origin main
   ```

---

## 2. Deploy Option A: Render (Recommended)

Render offers managed web services with Docker and persistent disks.

### Option A1: Automatic via Blueprint (`render.yaml`)
1. Go to [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** ➔ **Blueprint**.
3. Connect your GitHub repository `registry-tracker`.
4. Render will read [render.yaml](render.yaml), which automatically configures:
   - Web Service with Docker
   - Persistent Disk mounted at `/var/data`
   - Environment variables `PORT=3000` and `DATA_DIR=/var/data`
5. Click **Apply**.

### Option A2: Manual Web Service on Render
1. Click **New +** ➔ **Web Service**.
2. Select your repository.
3. Choose **Docker** as the runtime.
4. (Optional for data persistence across deploys):
   - Under **Disks**, click **Add Disk**.
   - Name: `registry-disk`
   - Mount Path: `/app/data`
   - Size: `1 GB`
5. Click **Create Web Service**.

> **Note on Initial Data:** The app automatically copies your current database with all 4,134 records into the mounted volume on its very first launch, so your data is ready immediately!

---

## 3. Deploy Option B: Railway

Railway offers fast Docker container deployments with volume mounts.

1. Go to [Railway Dashboard](https://railway.com/dashboard).
2. Click **New Project** ➔ **Deploy from GitHub repo**.
3. Select your `registry-tracker` repository.
4. Railway will automatically detect the [Dockerfile](Dockerfile) and [railway.json](railway.json).
5. **Add Persistent Storage**:
   - In the project canvas, right-click or click **Add Service** ➔ **Volume**.
   - Attach the volume to your app service.
   - Set the mount path to:
     ```
     /app/data
     ```
6. Under **Networking**, click **Generate Domain** to get a public `https://....up.railway.app` URL.

---

## 4. Deploy Option C: Self-Hosted / VPS with Docker Compose

If you have a Linux VPS (Ubuntu, Debian, etc.):

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/registry-tracker.git
cd registry-tracker

# Start in the background
docker compose up -d
```

The app will run on `http://YOUR_SERVER_IP:3000` with automated database persistence in the `tracker-storage` volume.
