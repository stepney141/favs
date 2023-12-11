/**
 * environment variables
 * @link https://maku.blog/p/r8iry9g/
 */
declare namespace NodeJS {
  interface ProcessEnv {
    readonly NODE_ENV?: string;
    readonly BOOKMETER_ACCOUNT?: string;
    readonly BOOKMETER_PASSWORD?: string;
    readonly BOUNDHUB_ACCOUNT?: string;
    readonly BOUNDHUB_PASSWORD?: string;
    readonly CINII_API_APPID?: string;
    readonly NOTE_ACCOUNT?: string;
    readonly NOTE_PASSWORD?: string;
    readonly TERATAIL_API_TOKEN?: string;
    readonly TWITTER_ACCOUNT?: string;
    readonly TWITTER_PASSWORD?: string;
    readonly ZENN_GOOGLE_ACCOUNT?: string;
    readonly ZENN_GOOGLE_PASSWORD?: string;
    readonly WIKIPEDIA_USERNAME?: string;
    readonly WIKIPEDIA_PASSWORD?: string;
    readonly OAUTH_TOKEN_OF_GITHUB?: string;
    readonly NICONICO_ACCOUNT?: string;
    readonly NICONICO_PASSWORD?: string;
    readonly FIREBASE_API_KEY?: string;
    readonly FIREBASE_AUTH_DOMAIN?: string;
    readonly FIREBASE_PROJECT_ID?: string;
    readonly FIREBASE_STORAGE_BUCKET?: string;
    readonly FIREBASE_MESSAGING_SENDER_ID?: string;
    readonly FIREBASE_APP_ID?: string;
    readonly GOOGLE_BOOKS_API_KEY?: string;
  }
}
