// BVMI Lambda (Node.js 20.x / ESM) - DynamoDB GET/POST/OPTIONS
// Handler: index.handler

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.TABLE_NAME;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const TOKEN = process.env.TOKEN || "";
const PATIENT_GSI = process.env.PATIENT_GSI || "";

// v3 Document client (auto marshalling)
const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({}),
  {
    marshallOptions: { removeUndefinedValues: true },
  }
);

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "content-type,x-bmi-token",
    "Access-Control-Allow-Methods": "OPTIONS,GET,POST",
  };
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function bmiCategory(bmi) {
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Normal";
  if (bmi < 30) return "Overweight";
  return "Obesity";
}

function computeBMI(payload) {
  const units = payload.units === "imperial" ? "imperial" : "metric";

  if (units === "metric") {
    const heightCm = Number(payload.heightCm);
    const weightKg = Number(payload.weightKg);

    if (!Number.isFinite(heightCm) || !Number.isFinite(weightKg)) {
      throw new Error("For metric, heightCm and weightKg are required (numbers).");
    }

    const hM = clamp(heightCm, 50, 260) / 100;
    const wKg = clamp(weightKg, 10, 400);

    return { units, heightCm: clamp(heightCm, 50, 260), weightKg: wKg, hM, wKg };
  }

  const heightFt = Number(payload.heightFt);
  const heightIn = Number(payload.heightIn);
  const weightLb = Number(payload.weightLb);

  if (!Number.isFinite(heightFt) || !Number.isFinite(heightIn) || !Number.isFinite(weightLb)) {
    throw new Error("For imperial, heightFt, heightIn, weightLb are required (numbers).");
  }

  const ft = clamp(heightFt, 1, 8);
  const inch = clamp(heightIn, 0, 11);
  const lb = clamp(weightLb, 20, 900);

  const totalIn = ft * 12 + inch;
  const heightCm = totalIn * 2.54;
  const hM = heightCm / 100;
  const wKg = lb * 0.45359237;

  return { units, heightFt: ft, heightIn: inch, weightLb: lb, heightCm, hM, wKg };
}

function getMethod(event) {
  return event?.requestContext?.http?.method || event?.httpMethod || "GET";
}

function tokenOk(event) {
  if (!TOKEN) return true;
  const incoming = (event?.headers?.["x-bmi-token"] || event?.headers?.["X-BMI-Token"] || "").trim();
  return incoming === TOKEN;
}

export const handler = async (event) => {
  const method = getMethod(event);

  // Preflight
  if (method === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }

  // Optional auth
  if (!tokenOk(event)) {
    return json(401, { ok: false, message: "Unauthorized" });
  }

  try {
    // POST /records
    if (method === "POST") {
      const body = event?.body ? JSON.parse(event.body) : {};
      const patientName = String(body.patientName || "").trim();
      if (!patientName) return json(400, { ok: false, message: "patientName is required" });

      const computed = computeBMI(body);
      const bmiRaw = computed.wKg / (computed.hM * computed.hM);
      const bmi = Math.round(bmiRaw * 10) / 10;
      const category = bmiCategory(bmi);

      const recordTs = new Date().toISOString();
      const id = `${patientName}#${recordTs}`;

      const item = {
        patientName,
        recordTs,
        id,
        bmi,
        category,
        units: computed.units,

        // Normalized inputs (undefined values are removed automatically)
        heightCm: computed.units === "metric" ? computed.heightCm : undefined,
        weightKg: computed.units === "metric" ? computed.weightKg : undefined,
        heightFt: computed.units === "imperial" ? computed.heightFt : undefined,
        heightIn: computed.units === "imperial" ? computed.heightIn : undefined,
        weightLb: computed.units === "imperial" ? computed.weightLb : undefined,

        clientComputedAt: body.clientComputedAt || undefined,
        serverCreatedAt: recordTs,
      };

      await ddb.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
        ConditionExpression: "attribute_not_exists(#id)",
        ExpressionAttributeNames: { "#id": "id" },
      }));

      return json(201, { ok: true, record: item });
    }

    // GET /records?patientName=...
    if (method === "GET") {
      const patientName = String(event?.queryStringParameters?.patientName || "").trim();
      if (!patientName) {
        return json(400, { ok: false, message: "patientName query param required. Example: /records?patientName=Ananya" });
      }

      // 1) Try PK = patientName query
      try {
        const out = await ddb.send(new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: "#pn = :pn",
          ExpressionAttributeNames: { "#pn": "patientName" },
          ExpressionAttributeValues: { ":pn": patientName },
          ScanIndexForward: false,
          Limit: 200,
        }));
        return json(200, { ok: true, records: out.Items || [] });
      } catch (e) {
        console.warn("Primary query failed, falling back:", e?.name, e?.message);
      }

      // 2) Try GSI if provided
      if (PATIENT_GSI) {
        const out = await ddb.send(new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: PATIENT_GSI,
          KeyConditionExpression: "#pn = :pn",
          ExpressionAttributeNames: { "#pn": "patientName" },
          ExpressionAttributeValues: { ":pn": patientName },
          ScanIndexForward: false,
          Limit: 200,
        }));
        return json(200, { ok: true, records: out.Items || [] });
      }

      // 3) Last resort: scan
      const out = await ddb.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: "#pn = :pn",
        ExpressionAttributeNames: { "#pn": "patientName" },
        ExpressionAttributeValues: { ":pn": patientName },
        Limit: 200,
      }));

      const records = (out.Items || []).sort((a, b) =>
        String(b.recordTs || "").localeCompare(String(a.recordTs || ""))
      );

      return json(200, { ok: true, records });
    }

    return json(405, { ok: false, message: `Method not allowed: ${method}` });
  } catch (err) {
    console.error("Lambda error:", err);
    const isDuplicate = err?.name === "ConditionalCheckFailedException" || err?.Code === "ConditionalCheckFailedException";
    return json(isDuplicate ? 409 : 500, {
      ok: false,
      message: isDuplicate ? "Record already exists" : (err?.message || "Server error"),
    });
  }
};
