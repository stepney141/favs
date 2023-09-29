declare module "process" {
  global {
    namespace NodeJS {
      interface ProcessEnv {
        NODE_ENV?: string;
        BOOKMETER_ACCOUNT?: string;
        BOOKMETER_PASSWORD?: string;
        BOUNDHUB_ACCOUNT?: string;
        BOUNDHUB_PASSWORD?: string;
        CINII_API_APPID?: string;
        NOTE_ACCOUNT?: string;
        NOTE_PASSWORD?: string;
        TERATAIL_API_TOKEN?: string;
        TWITTER_ACCOUNT?: string;
        TWITTER_PASSWORD?: string;
        ZENN_GOOGLE_ACCOUNT?: string;
        ZENN_GOOGLE_PASSWORD?: string;
        WIKIPEDIA_USERNAME?: string;
        WIKIPEDIA_PASSWORD?: string;
        OAUTH_TOKEN_OF_GITHUB?: string;
        NICONICO_ACCOUNT?: string;
        NICONICO_PASSWORD?: string;
      }
    }
  }
}
