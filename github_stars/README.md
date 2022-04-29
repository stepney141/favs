# github_stars
Lists of GitHub repositories that I starred.  

## 解説

### 1. GitHubの任意のユーザーの情報を取得するREST APIを使い、自分が押したstarの情報を取得する

#### 1-1. star取得APIの叩き方

```bash
# curl
$ curl -H "Accept: application/vnd.github.v3+json" https://api.github.com/users/stepney141/starred
# wget
$ wget --no-check-certificate --header="Accept: application/vnd.github.v3+json" -q -O - https://api.github.com/users/stepney141/starred
```

このように、``GET api.github.com/users/ユーザー名/starred`` が該当するエンドポイントとなる

#### 1-2. とりあえずこうやればOK

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
- GitHub側でのstar数表示は225個(2020-08-17時点)なので、とりあえず100件ずつ3回叩けばOK
- ブレース展開を使用してwgetでjsonを一気に3つ入手 -> jqに渡してjsonを一個に結合 -> さらにjqに渡して「リポジトリ名」「URL」「リポジトリ説明文」のみを抽出、CSV化 -> txtに出力

#### 1-3. 改訂版

- ちゃんとしたCSV形式にするとこうなる

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

### 2. 現在認証しているユーザー自身の情報を取得するREST APIを使い、同じことをする

#### 2-1. OAuth Appのの二段階認証のやり方

1. ``https://github.com/settings/applications/new`` からGitHubアカウントに紐付けられたOAuth Appを作成し、Client IDとClient Secretを入手する。

   - Client ID , Client Secretはそれぞれ環境変数 CLIENT_ID , CLIENT_SECRET として保存しておくことを推奨
   - Callback URLの設定は必須。ぶっちゃけ何のURLを入れようと問題ないっぽいが、一応自分が保有/管理しているURLを使う方がいいかも？ 自分は自身のgithub.ioを入力した

2. ``https://github.com/login/oauth/authorize?client_id=$CLIENT_ID&scope=repo%20gist`` にブラウザでアクセスする。そうするとApp Authorizationの画面が出てくるので、ボタンを押して承認する。

3. 承認すると ``https://stepney141.github.io/?code=0123456789abcdefg`` みたいな感じで、自分が指定したCallback URLにリダイレクトされる。末尾にqueryとしてぶら下がっているCodeをコピペしておく

   - Codeは環境変数 CODE として保存しておくことを推奨

4. Code、Client ID、Client Secretを ``https://github.com/login/oauth/access_token`` にPOSTする(以下はcurlでの例)。

   - この例ではCode、Client ID、Client Secretの情報が環境変数として保存されていることを想定している。適当に読み替えられたし。

```bash
$ curl -X POST \
    -d "code=$CODE" \
    -d "client_id=$CLIENT_ID" \
    -d "client_secret=$CLIENT_SECRET" \
    https://github.com/login/oauth/access_token
```

5. POSTすると ``access_token=0123456789abcdef0123456789abcdef01234567&token_type=bearer`` という形式でアクセストークンが返ってくる。これをヘッダに入れてAPIを叩く。

   - アクセストークンは例によって環境変数 ACCESS_TOKEN として保存しておくことを推奨

#### 2-2. とりあえずこうやればOK 

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
