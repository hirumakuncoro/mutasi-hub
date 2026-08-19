import type { MerchantSession } from "../repositories/merchantSessionRepository";

type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type GoBizTransaction = {
  id?: string;
  wallstreet_transaction_id?: string;
  order_id?: string;
  merchant_id?: string;
  transaction_status?: string;
  payment_type?: string;
  transaction_time?: string;
  settlement_time?: string;
  gross_amount?: number;
  real_gross_amount?: number;
};

type TransactionResponse = {
  transactions?: GoBizTransaction[];
  data?: {
    transactions?: GoBizTransaction[];
  };
};

export class GoBizUnauthorizedError extends Error {
  constructor() {
    super("GoBiz request unauthorized");
    this.name = "GoBizUnauthorizedError";
  }
}

export class GoBizTransactionClient {
  private readonly baseUrl =
    "https://api.gojekapi.com/merchant-analytics/v2/merchants/transactions";

  constructor(private readonly fetchFn: FetchFn = fetch) {}

  async fetchTransactions(input: {
    merchantId: string;
    session: MerchantSession;
    startTime: string;
    endTime: string;
    size?: number;
  }): Promise<GoBizTransaction[]> {
    const url = new URL(this.baseUrl);
    url.searchParams.set("from", "0");
    url.searchParams.set("size", String(input.size ?? 20));
    url.searchParams.set("start_time", input.startTime);
    url.searchParams.set("end_time", input.endTime);
    url.searchParams.set("merchant_ids", input.merchantId);

    const response = await this.fetchFn(url, {
      method: "GET",
      headers: {
        accept: "application/json, text/plain, */*",
        Authorization: `Bearer ${input.session.accessToken}`,
        Cookie: [
          `access_token=${input.session.accessToken}`,
          `refresh_token=${input.session.refreshToken}`,
          "auth_method=goid",
        ].join("; "),
        "authentication-type": "go-id",
        origin: "https://portal.gofoodmerchant.co.id",
        referer: "https://portal.gofoodmerchant.co.id/",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
      },
    });

    if (response.status === 401) {
      throw new GoBizUnauthorizedError();
    }

    if (!response.ok) {
      throw new Error(`GoBiz transaction request failed: ${response.status}`);
    }

    const payload = (await response.json()) as TransactionResponse;
    return payload.transactions ?? payload.data?.transactions ?? [];
  }
}
