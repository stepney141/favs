# Wikipedia Watchlist Extractor

## 詰まったこと

- clientlogin が全然できない
- 以下の 3 点に注意したら解決
  - 1. contnt-type を指定する
  - 2. クエリパラメータを POST するために URLSearchParams を使う
  - 3. cookie を使って認証する
- 解決に役立ったリンク
  - https://www.mediawiki.org/wiki/Topic:Vmwf9vs5t9118w5m
  - https://phabricator.wikimedia.org/T249526
  - https://stackoverflow.com/questions/49367096/how-to-login-to-mediawiki-wikipedia-api-in-node-js
t --no-check-certificate --header="Accept: application/vnd.github.v3+json" -q -O - https://api.github.com/users/stepney141/starred
```

このように、`GET api.github.com/users/ユーザー名/starred` が該当するエンドポイントとなる

#### 1-2. とりあえずこうやれば OK

```bash
# wget
$ wget --no-check-certificate \
    --header="Accept: application/vnd.github.v3+json" \
    -q -O - \
    https://api.github.com/users/stepney141/starred\?per_page=100\&page={1..3} \
    | jq add -s \
    | jq '.[] | [ .full_name, .html_url, .description ] | @csv' -r \
    > starred_repos.txt
```

- ?と&のエスケープは必須
- GitHub 側での star 数表示は 225 個(2020-08-17 時点)なので、とりあえず 100 件ずつ 3 回叩けば OK
- ブレース展開を使用して wget で json を一気に 3 つ入手 -> jq に渡して json を一個に結合 -> さらに jq に渡して「リポジトリ名」「URL」「リポジトリ説明文」のみを抽出、CSV 化 -> txt に出力

#### 1-3. 改訂版

- ちゃんとした CSV 形式にするとこうなる

```bash
$ echo "full_name,html_url,description" \
> starred_repos.csv && \
wget --no-check-certificate \
    --header="Accept: application/vnd.github.v3+json" \
    -q -O - \
    https://api.github.com/users/stepney141/starred\?per_page=100\&page={1..3} \
    | jq add -s \
    | jq '.[] | [ .full_name, .html_url, .description ] | @csv' -r \
>> starred_repos.csv
```

### 2. 現在認証しているユーザー自身の情報を取得する REST API を使い、同じことをする

#### 2-1. OAuth App のの二段階認証のやり方

1. `https://github.com/settings/applications/new` から GitHub アカウントに紐付けられた OAuth App を作成し、Client ID と Client Secret を入手する。

   - Client ID , Client Secret はそれぞれ環境変数 CLIENT_ID , CLIENT_SECRET として保存しておくことを推奨
   - Callback URL の設定は必須。ぶっちゃけ何の URL を入れようと問題ないっぽいが、一応自分が保有/管理している URL を使う方がいいかも？ 自分は自身の github.io を入力した

2. `https://github.com/login/oauth/authorize?client_id=$CLIENT_ID&scope=repo%20gist` にブラウザでアクセスする。そうすると App Authorization の画面が出てくるので、ボタンを押して承認する。

3. 承認すると `https://stepney141.github.io/?code=0123456789abcdefg` みたいな感じで、自分が指定した Callback URL にリダイレクトされる。末尾に query としてぶら下がっている Code をコピペしておく

   - Code は環境変数 CODE として保存しておくことを推奨

4. Code、Client ID、Client Secret を `https://github.com/login/oauth/access_token` に POST する(以下は curl での例)。

   - この例では Code、Client ID、Client Secret の情報が環境変数として保存されていることを想定している。適当に読み替えられたし。

```bash
$ curl -X POST \
    -d "code=$CODE" \
    -d "client_id=$CLIENT_ID" \
    -d "client_secret=$CLIENT_SECRET" \
    https://github.com/login/oauth/access_token
```

5. POST すると `access_token=0123456789abcdef0123456789abcdef01234567&token_type=bearer` という形式でアクセストークンが返ってくる。これをヘッダに入れて API を叩く。

   - アクセストークンは例によって環境変数 ACCESS_TOKEN として保存しておくことを推奨

#### 2-2. とりあえずこうやれば OK

```bash
# 例によって環境変数を使っているので、適当に読み替えられたし
$ wget --no-check-certificate \
    --header="Accept: application/vnd.github.v3+json" \
    --header="Authorization: bearer $ACCESS_TOKEN"\
    -q -O - \
    https://api.github.com/user/starred\?per_page=100\&page={1..3} \
    | jq add -s \
    | jq '.[] | [ .full_name, .html_url, .description ] | @csv' -r \
    > starred_repos_auth.txt
```

#### 2-3. 改訂版

```bash
$ echo "full_name,html_url,description" \
> starred_repos_auth.csv && \
wget --no-check-certificate \
    --header="Accept: application/vnd.github.v3+json" \
    --header="Authorization: bearer $ACCESS_TOKEN" \
    -q -O - \
    https://api.github.com/user/starred\?per_page=100\&page={1..3} \
    | jq add -s \
    | jq '.[] | [ .full_name, .html_url, .description ] | @csv' -r \
>> starred_repos_auth.csv
```

### 参考文献

- https://docs.github.com/en/rest/reference/activity#list-repositories-starred-by-a-user
- https://docs.github.com/en/rest/reference/activity#list-repositories-starred-by-the-authenticated-user
- https://qiita.com/ngs/items/34e51186a485c705ffdb
- https://qiita.com/developer-kikikaikai/items/5f4f0e2ea274326d7157
