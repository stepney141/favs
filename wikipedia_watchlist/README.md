# Wikipedia Watchlist Extractor

## 詰まったこと

- clientloginが全然できない
- 以下の3点に注意したら解決
  - 1. contnt-typeを指定する
  - 2. クエリパラメータをPOSTするためにURLSearchParamsを使う
  - 3. cookieを使って認証する
- 解決に役立ったリンク
  - https://www.mediawiki.org/wiki/Topic:Vmwf9vs5t9118w5m
  - https://phabricator.wikimedia.org/T249526
  - https://stackoverflow.com/questions/49367096/how-to-login-to-mediawiki-wikipedia-api-in-node-js
