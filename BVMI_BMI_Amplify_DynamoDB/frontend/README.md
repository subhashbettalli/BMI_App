# BVMI • BMI Tracker (Frontend)

This is a **static** (HTML/CSS/JS) web app. It calculates BMI (metric + imperial), shows a clean visual gauge, and saves each record to DynamoDB **via your API**.

## 1) Set your API base URL
After you deploy the backend, you will get a URL like:

`https://<apiId>.execute-api.<region>.amazonaws.com`

Paste it in the app UI: **Settings → API Base URL** (stored in localStorage), or edit `config.js`.

## 2) Deploy options
### Option A — Amplify Hosting (manual zip)
1. Go to Amplify Console → **Deploy without Git**.
2. Upload a zip containing these files (index.html, styles.css, app.js, config.js).
3. Done.

### Option B — S3 → Amplify Hosting integration
You can deploy a static website stored in an S3 bucket to Amplify Hosting. AWS documents this workflow. 
After upload, choose the bucket + prefix in Amplify Hosting.

## Local test
Open `index.html` directly, or use a local server:

- Python: `python -m http.server 5500` then open `http://localhost:5500`

> Note: saving/searching requires the backend API.
