BVMI Lambda (Node.js 20.x) ZIP

This ZIP is designed for the Lambda console default file (index.mjs / ESM) and Node.js 20.x runtime.

UPLOAD:
Lambda Console -> Code -> Upload from -> .zip file -> upload this zip

RUNTIME SETTINGS:
- Runtime: Node.js 20.x
- Handler: index.handler

ENV VARS:
- TABLE_NAME (required) : your DynamoDB table name
- ALLOWED_ORIGIN (optional): * or your Amplify domain
- TOKEN (optional): if set, clients must send header x-bmi-token
- PATIENT_GSI (optional): GSI name if your table PK is NOT patientName

ENDPOINTS:
- POST /records
  Metric:   {"patientName":"Test","units":"metric","heightCm":170,"weightKg":65}
  Imperial: {"patientName":"Test","units":"imperial","heightFt":5,"heightIn":7,"weightLb":165}

- GET /records?patientName=Test
- OPTIONS (CORS preflight)

NOTE:
AWS Lambda Node.js runtimes include a version of AWS SDK for JavaScript v3.
