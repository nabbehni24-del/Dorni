declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    BUCKET?: R2Bucket;
    AUTH_SECRET?: string;
    OTP_MODE?: string;
  }
}
