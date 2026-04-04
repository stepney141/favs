import path from "path";

import axios from "axios";
import { config } from "dotenv";
import { initializeApp } from "firebase/app";
import { getStorage, ref } from "firebase/storage";
import { launch } from "puppeteer";

import { CHROME_ARGS, USER_AGENT } from "../.libs/constants";
import { cookiesToString, createCookieManager, ensureAuthentication, mergeCookies } from "../.libs/cookie";
import { $x } from "../.libs/pptr-utils";
import { exportFile, mapToArray, sleep } from "../.libs/utils";

import type { CookieData } from "puppeteer";

const baseURI = "https://note.com";
const likedApiURI = `${baseURI}/api/v1/notes/liked`;
const JOB_NAME = "note.com Favorites";
const CSV_FILENAME = "note_favorites.csv";
const COOKIE_PATH = "note_cookie.json";

const XPATH = {
  useridInput: '//*[@id="email"]',
  passwordInput: '//*[@id="password"]',
  loginButton: '//button/*[contains(text(), "ログイン")]'
};

config({ path: path.join(__dirname, "../.env") });
const email = process.env.NOTE_ACCOUNT!.toString();
const password = process.env.NOTE_PASSWORD!.toString();
const userName = "stepney141";

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY!,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.FIREBASE_PROJECT_ID!,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.FIREBASE_APP_ID!
};

type Note = {
  name: string;
  noteUrl: string;
  userNickname: string;
  publishAt: string;
  likeCount: number;
};
type NoteList = Map<string, Note>;

type NoteLikedApiResponse = {
  data: {
    contents: {
      key: string;
      name: string;
      noteUrl: string;
      user: {
        nickname: string;
      };
      publishAt: string;
      likeCount: number;
    }[];
    isLastPage: boolean;
    totalCount: number;
  };
};
type FetchResult = {
  payload: NoteLikedApiResponse;
  updatedCookies?: CookieData[];
};

const browserOptions = {
  defaultViewport: { width: 1000, height: 1000 },
  headless: true,
  args: CHROME_ARGS,
  // devtools: true,
  slowMo: 80
} as const;

function isNoteLikedApiResponse(value: unknown): value is NoteLikedApiResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.data !== "object" || candidate.data === null) {
    return false;
  }

  const data = candidate.data as Record<string, unknown>;
  return typeof data.last_page === "boolean" && Array.isArray(data.notes);
}

async function validateCookies(cookies: CookieData[]): Promise<boolean> {
  if (cookies.length === 0) {
    return false;
  }

  try {
    const response = await axios.get(likedApiURI, {
      headers: {
        Cookie: cookiesToString(cookies),
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        "Accept-Language": "ja-JP"
      },
      timeout: 30000
    });

    const isValid = isNoteLikedApiResponse(response.data);
    if (isValid) {
      console.log(`${JOB_NAME}: Existing cookies are valid`);
      return true;
    }

    console.log(`${JOB_NAME}: Existing cookies returned an unexpected response`);
    return false;
  } catch (error) {
    console.log(`${JOB_NAME}: Existing cookies are invalid, need to login`);
    return false;
  }
}

async function performLogin(): Promise<CookieData[]> {
  console.log(`${JOB_NAME}: Starting login process...`);
  const browser = await launch(browserOptions);
  try {
    const page = await browser.newPage();

    await page.setExtraHTTPHeaders({
      "accept-language": "ja-JP"
    });
    await page.setUserAgent(USER_AGENT);
    await page.goto(`${baseURI}/login`, {
      waitUntil: "load"
    });

    const userIdInputHandle = await $x(page, XPATH.useridInput);
    const passwordInputHandle = await $x(page, XPATH.passwordInput);
    const loginButtonHandle = await $x(page, XPATH.loginButton);

    if (userIdInputHandle.length === 0 || passwordInputHandle.length === 0 || loginButtonHandle.length === 0) {
      throw new Error("Failed to locate note.com login form elements");
    }

    await userIdInputHandle[0].type(email);
    await passwordInputHandle[0].type(password);

    await Promise.all([
      page.waitForNavigation({
        timeout: 60000,
        waitUntil: "networkidle2"
      }),
      loginButtonHandle[0].click()
    ]);

    const cookies = await browser.cookies();
    console.log(`${JOB_NAME}: Login completed successfully`);
    return cookies;
  } finally {
    await browser.close();
  }
}

async function getAllPages(initialCookies: CookieData[]): Promise<{ notes: NoteList; finalCookies: CookieData[] }> {
  const allNotes: NoteList = new Map();
  const entriesPerPage = 12; // 13以上を指定しても12に丸められる

  let currentCookies = initialCookies;
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    try {
      const fetchResult = await fetchNoteLikes(currentCookies, userName, page, entriesPerPage);
      console.error(
        `isLastPage: ${fetchResult.payload.data.isLastPage}, totalCount: ${fetchResult.payload.data.totalCount}`
      );

      for (const { key, name, noteUrl, user, publishAt, likeCount } of fetchResult.payload.data.contents) {
        allNotes.set(key, {
          name,
          noteUrl,
          userNickname: user.nickname,
          publishAt,
          likeCount
        });
      }

      // Update cookies if server provided new ones
      if (fetchResult.updatedCookies) {
        currentCookies = fetchResult.updatedCookies;
      }

      // Check if there's a next page
      hasNextPage = !fetchResult.payload.data.isLastPage;
      if (hasNextPage) {
        page++;
        await sleep(1000); // Rate limiting
      }
    } catch (error) {
      console.error(error);
    }
  }
  return { notes: allNotes, finalCookies: currentCookies };
}

/**
 * Fetch note.com likes data using cookies and internal api
 */
async function fetchNoteLikes(
  cookies: CookieData[],
  userName: string,
  page: number,
  entries_per_page: number
): Promise<FetchResult> {
  const cookieString = cookiesToString(cookies);
  const url = `${baseURI}/api/v2/creators/${userName}/contents?kind=likes&page=${page}&per=${entries_per_page}&disabled_pinned=false&with_notes=false`;
  console.error(url);

  const response = await axios.get(url, {
    headers: {
      Cookie: cookieString,
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      "Accept-Language": "ja-JP"
    },
    timeout: 30000
  });

  // Check if response contains updated cookies
  const setCookieHeader = response.headers["set-cookie"];
  let updatedCookies: CookieData[] | undefined;
  if (setCookieHeader && setCookieHeader.length > 0) {
    // Merge existing cookies with new ones from set-cookie headers
    updatedCookies = mergeCookies("note.com", cookies, setCookieHeader);
    console.log(`${JOB_NAME}: Updated cookies received from server`);
  }

  return {
    payload: response.data as NoteLikedApiResponse,
    updatedCookies
  };
}

(async () => {
  try {
    const startTime = Date.now();

    const app = initializeApp(firebaseConfig);
    const storage = getStorage(app);
    const pathReference = ref(storage, COOKIE_PATH);
    const cookieManager = createCookieManager(pathReference, JOB_NAME, COOKIE_PATH);

    const cookies = await ensureAuthentication(cookieManager, validateCookies, performLogin);
    const result = await getAllPages(cookies);

    await cookieManager.saveToFirebase(result.finalCookies);
    cookieManager.cleanupLocal();

    await exportFile({
      fileName: CSV_FILENAME,
      payload: mapToArray(result.notes),
      targetType: "csv",
      mode: "overwrite"
    }).then(() => {
      console.log(`${JOB_NAME}: Finished writing ${CSV_FILENAME}`);
    });

    console.log(`The processs took ${Math.round((Date.now() - startTime) / 1000)} seconds`);
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
})();
