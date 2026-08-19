import type {
  MerchantSession,
  MerchantSessionRepository,
} from "../repositories/merchantSessionRepository";

type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: string;
  expires_in?: number;
  data?: {
    access_token?: string;
    refresh_token?: string;
    expires_at?: string;
    expires_in?: number;
  };
};

export class GoBizSessionService {
  constructor(
    private readonly merchantSessionRepository: MerchantSessionRepository,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async getActiveSession(merchantId: string): Promise<MerchantSession | null> {
    const session = await this.merchantSessionRepository.findByMerchantId(merchantId);

    if (!session || session.status !== "ACTIVE") {
      return null;
    }

    return session;
  }

  async refreshAfterUnauthorized(merchantId: string): Promise<MerchantSession | null> {
    return this.refreshSession(merchantId);
  }

  async refreshSession(merchantId: string): Promise<MerchantSession | null> {
    const session = await this.merchantSessionRepository.findByMerchantId(merchantId);

    if (!session || session.status !== "ACTIVE") {
      return null;
    }

    try {
      const response = await this.fetchFn("https://api.gobiz.co.id/goid/token", {
        method: "POST",
        headers: {
          accept: "application/json, text/plain, */*",
          "accept-language": "id",
          "authentication-type": "go-id",
          "content-type": "application/json",
          "gojek-country-code": "ID",
          "gojek-timezone": "Asia/Jakarta",
          origin: "https://portal.gofoodmerchant.co.id",
          referer: "https://portal.gofoodmerchant.co.id/",
          "x-appid": "go-biz-web-dashboard",
          "x-appversion": "platform-v3.111.0-1708bc9a",
          "x-deviceos": "Web",
          "x-platform": "Web",
          "x-user-locale": "en-GB",
          "x-user-type": "merchant",
        },
        body: JSON.stringify({
          client_id: "go-biz-web-new",
          grant_type: "refresh_token",
          data: {
            refresh_token: session.refreshToken,
            phone_number: "",
            country_code: "62",
          },
        }),
      });

      if (!response.ok) {
        await this.markReloginRequired(merchantId);
        return null;
      }

      const payload = (await response.json()) as TokenResponse;
      const tokenData = payload.data ?? payload;
      const accessToken = tokenData.access_token;

      if (!accessToken) {
        await this.markReloginRequired(merchantId);
        return null;
      }

      const refreshToken = tokenData.refresh_token ?? session.refreshToken;
      const expiresAt = this.resolveExpiresAt(tokenData);

      await this.merchantSessionRepository.updateTokens(merchantId, {
        accessToken,
        refreshToken,
        expiresAt,
      });

      return {
        ...session,
        accessToken,
        refreshToken,
        expiresAt,
        status: "ACTIVE",
        updatedAt: new Date().toISOString(),
      };
    } catch {
      await this.markReloginRequired(merchantId);
      return null;
    }
  }

  private async markReloginRequired(merchantId: string): Promise<void> {
    await this.merchantSessionRepository.updateStatus(merchantId, "RELOGIN_REQUIRED");
  }

  private resolveExpiresAt(tokenData: TokenResponse): string | null {
    if (tokenData.expires_at) {
      return tokenData.expires_at;
    }

    if (typeof tokenData.expires_in === "number" && tokenData.expires_in > 0) {
      return new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
    }

    return null;
  }
}
