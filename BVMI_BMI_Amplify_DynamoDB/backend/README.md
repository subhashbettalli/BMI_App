# BVMI • BMI Tracker (Backend)

This backend stores BMI records in DynamoDB and exposes a simple HTTP API:

- `POST /records`  → create record (server computes BMI)
- `GET  /records?patientName=...` → list records for a patient (newest first)

## Deploy (AWS SAM)
Prereqs: AWS CLI configured, AWS SAM CLI installed.

```bash
cd backend
sam build
sam deploy --guided
```

During guided deploy:
- Stack name: `bvmi-bmi-backend` (example)
- Region: choose your region (e.g., ap-south-1)
- TableName: keep default or change
- StageName: prod (default)

After deploy, copy the **ApiBaseUrl** output and paste into the frontend Settings.

## Deploy via CloudFormation (no SAM CLI)
You can deploy the same `template.yaml` as a CloudFormation stack.
The function code is inside `src/` (so SAM packaging is still easiest), but if you need pure CFN, use SAM CLI.
