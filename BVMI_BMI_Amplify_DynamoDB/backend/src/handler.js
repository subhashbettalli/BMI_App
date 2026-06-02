'use strict';

const AWS = require('aws-sdk');
const dynamo = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.TABLE_NAME;

function response(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      // Note: SAM also sets CORS at API layer; keep headers here to be safe for proxy integrations.
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
    body: JSON.stringify(bodyObj),
  };
}

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function bmiCategory(bmi){
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Normal';
  if (bmi < 30) return 'Overweight';
  return 'Obesity';
}

// Compute BMI consistently server-side (trust nothing from the client).
function computeBMI({ units, heightCm, weightKg, heightFt, heightIn, weightLb }) {
  let hM = null;
  let wKg = null;

  if (units === 'metric') {
    if (typeof heightCm !== 'number' || typeof weightKg !== 'number') throw new Error('heightCm and weightKg are required for metric.');
    hM = heightCm / 100;
    wKg = weightKg;
  } else if (units === 'imperial') {
    if (typeof heightFt !== 'number' || typeof heightIn !== 'number' || typeof weightLb !== 'number') throw new Error('heightFt, heightIn, weightLb are required for imperial.');
    const totalIn = (heightFt * 12) + heightIn;
    const cm = totalIn * 2.54;
    hM = cm / 100;
    wKg = weightLb * 0.45359237;
  } else {
    throw new Error('units must be "metric" or "imperial".');
  }

  if (!(hM > 0) || !(wKg > 0)) throw new Error('Height/weight must be positive.');

  const bmi = wKg / (hM * hM);
  const bmiRounded = Math.round(bmi * 10) / 10;

  return { bmi: bmiRounded, category: bmiCategory(bmiRounded) };
}

exports.handler = async (event) => {
  try {
    const method = event?.requestContext?.http?.method || event?.httpMethod;
    if (method === 'OPTIONS') return response(200, { ok: true });

    if (method === 'POST') {
      const body = event.body ? JSON.parse(event.body) : {};
      const patientName = (body.patientName || '').toString().trim();
      if (!patientName) return response(400, { error: 'patientName is required' });

      const units = (body.units || 'metric').toString();
      // parse numeric inputs defensively
      const num = (v) => (v === null || v === undefined || v === '') ? undefined : Number(v);

      const payload = {
        units,
        heightCm: num(body.heightCm),
        weightKg: num(body.weightKg),
        heightFt: num(body.heightFt),
        heightIn: num(body.heightIn),
        weightLb: num(body.weightLb),
      };

      // normalize + clamp some ranges (avoid junk)
      if (payload.units === 'metric') {
        payload.heightCm = clamp(payload.heightCm, 50, 260);
        payload.weightKg = clamp(payload.weightKg, 10, 400);
      } else if (payload.units === 'imperial') {
        payload.heightFt = clamp(payload.heightFt, 1, 8);
        payload.heightIn = clamp(payload.heightIn, 0, 11);
        payload.weightLb = clamp(payload.weightLb, 20, 900);
      }

      const { bmi, category } = computeBMI(payload);

      const recordTs = new Date().toISOString();
      const item = {
        patientName,
        recordTs,
        bmi,
        category,
        units: payload.units,
        heightCm: payload.units === 'metric' ? payload.heightCm : undefined,
        weightKg: payload.units === 'metric' ? payload.weightKg : undefined,
        heightFt: payload.units === 'imperial' ? payload.heightFt : undefined,
        heightIn: payload.units === 'imperial' ? payload.heightIn : undefined,
        weightLb: payload.units === 'imperial' ? payload.weightLb : undefined,
        clientComputedAt: body.clientComputedAt || undefined
      };

      await dynamo.put({ TableName: TABLE_NAME, Item: item }).promise();
      return response(200, { ok: true, record: item });
    }

    if (method === 'GET') {
      const q = event.queryStringParameters || {};
      const patientName = (q.patientName || '').toString().trim();
      if (!patientName) {
        return response(400, { error: 'patientName query param is required. Example: /records?patientName=Ananya' });
      }

      const out = await dynamo.query({
        TableName: TABLE_NAME,
        KeyConditionExpression: '#pn = :pn',
        ExpressionAttributeNames: { '#pn': 'patientName' },
        ExpressionAttributeValues: { ':pn': patientName },
        ScanIndexForward: false, // newest first
        Limit: 200
      }).promise();

      return response(200, { ok: true, records: out.Items || [] });
    }

    return response(405, { error: `Method not allowed: ${method}` });
  } catch (err) {
    console.error(err);
    return response(500, { error: err.message || 'Server error' });
  }
};
