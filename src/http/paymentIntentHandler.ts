import { z } from "zod";

import type { AppConfig } from "../config";
import { PaymentIntentRepository } from "../repositories/paymentIntentRepository";
import { json } from "./response";

type ValidPaymentIntentBody = {
  platform: string;
  externalId: string;
  merchantId: string;
  amount: number;
  createdAt: string;
  expiresAt: string;
  webhookUrl: string;
};

type ValidationResult =
  | { ok: true; value: ValidPaymentIntentBody }
  | { ok: false; error: string };

const paymentIntentSchema = z
  .object({
    platform: z.string().trim().min(1),
    external_id: z.string().trim().min(1),
    merchant_id: z.string().trim().min(1).optional(),
    amount: z.number().int().positive(),
    created_at: z.string().trim().refine(isValidDateString, {
      message: "must be a valid date string",
    }),
    expires_at: z.string().trim().refine(isValidDateString, {
      message: "must be a valid date string",
    }),
    webhook_url: z.url().refine(isHttpUrl, {
      message: "must be a valid http/https URL",
    }),
  })
  .refine((value) => Date.parse(value.expires_at) > Date.parse(value.created_at), {
    message: "expires_at must be greater than created_at",
    path: ["expires_at"],
  });

export class PaymentIntentHandler {
  constructor(
    private readonly repository: PaymentIntentRepository,
    private readonly config: AppConfig,
  ) {}

  async create(request: Request): Promise<Response> {
    const body = await parseJson(request);
    if (!body.ok) return json({ error: body.error }, 400);

    const validated = validatePaymentIntentBody(body.value, this.config);
    if (!validated.ok) return json({ error: validated.error }, 400);

    const result = await this.repository.save(validated.value);
    if (result.id === null) {
      return json({ error: "Failed to save payment intent" }, 500);
    }

    return json(
      {
        intent_id: result.id,
        status: "PENDING",
      },
      result.inserted ? 201 : 200,
    );
  }
}

async function parseJson(
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false, error: "Invalid JSON body" };
  }
}

function validatePaymentIntentBody(
  body: unknown,
  config: AppConfig,
): ValidationResult {
  const parsed = paymentIntentSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: z.prettifyError(parsed.error) };
  }

  return {
    ok: true,
    value: {
      platform: parsed.data.platform,
      externalId: parsed.data.external_id,
      merchantId: config.merchantId,
      amount: parsed.data.amount,
      createdAt: parsed.data.created_at,
      expiresAt: parsed.data.expires_at,
      webhookUrl: parsed.data.webhook_url,
    },
  };
}

function isValidDateString(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
