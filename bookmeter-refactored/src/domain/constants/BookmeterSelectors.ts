export const BOOKMETER_XPATH = {
  book: {
    amazonLink: "//a[img[@alt='Amazon']]",
    author: "//header/div[1]/ul/li",
    title: "//section[1]/header/div[1]/h1"
  },
  wish: {
    login: {
      booksUrl: "/html/body/div[1]/div[1]/section/div/div[1]/ul/li/div[2]/div[2]/a",
      amazonLink: "/html/body/div[1]/div[1]/section/div/div[1]/ul/li/div[2]/div[4]/a",
      isBookExist: "/html/body/div[1]/div[1]/section/div/div[1]/ul[1]/li"
    }
  },
  stacked: {
    booksUrl: "//ul/li[*]/div[2]/div[2]/a"
  }
} as const;
