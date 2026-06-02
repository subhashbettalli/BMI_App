# BVMI (BMI) Project — Amplify + S3 + DynamoDB

You asked for: **a BMI web app hosted on Amplify (or via S3→Amplify), saving data to DynamoDB** with an interesting UI and no fluff.

This repo contains:
- `frontend/` — static website (HTML/CSS/JS)
- `backend/` — AWS SAM template (HTTP API + Lambda + DynamoDB)

## Backend (deploy first)
```bash
cd backend
sam build
sam deploy --guided
```
Copy the stack output **ApiBaseUrl**.

## Frontend: set API URL
Open `frontend/index.html` after hosting and set API in **Settings** (or edit `frontend/config.js`).

## Host the frontend
### Option A — Amplify Hosting (manual deploy zip)
Zip the contents of `frontend/` and upload in Amplify Console → Deploy without Git. citeturn0search3

### Option B — S3 bucket → Amplify Hosting integration
Upload the `frontend/` files into an S3 bucket (optionally under a prefix like `site/`) and deploy to Amplify Hosting from that bucket. citeturn0search2turn0search22

## API Details
- `POST /records` — body includes patientName, units, height/weight. Server computes BMI.
- `GET /records?patientName=...` — returns saved records.

> CORS is enabled for browser access via Amplify Hosting. citeturn0search24turn0search17
