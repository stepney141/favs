/**
 * scrapers モジュールで使用する定数。
 */

export const BOOKMETER_BASE_URI = "https://bookmeter.com";

export const XPATH = {
  book: {
    amazonLink: "//a[img[@alt='Amazon']]",
    author: "//header/div[1]/ul/li",
    title: "//section[1]/header/div[1]/h1",
    registerStackedBook: '//*[@id="js-book-registration-button"]/li[3]',
    registerWishBook: '//*[@id="js-book-registration-button"]/li[4]'
  },
  stacked: {
    booksUrl: "//ul/li[*]/div[2]/div[2]/a"
  },
  wish: {
    login: {
      isBookExist: "/html/body/div[1]/div[1]/section/div/div[1]/ul[1]/li",
      booksUrl: "/html/body/div[1]/div[1]/section/div/div[1]/ul/li/div[2]/div[2]/a",
      amazonLink: "/html/body/div[1]/div[1]/section/div/div[1]/ul/li/div[2]/div[4]/a"
    },
    guest: {
      booksUrl: "//ul/li[*]/div[2]/div[2]/a"
    }
  },
  login: {
    accountNameInput: '//*[@id="session_email_address"]',
    passwordInput: '//*[@id="session_password"]',
    loginButton: '//*[@id="js_sessions_new_form"]/form/div[4]/button'
  }
};
