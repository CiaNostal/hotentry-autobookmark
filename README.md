# hotentry-autobookmark

はてなブックマークのホットエントリー(`https://b.hatena.ne.jp/` およびその配下 `https://b.hatena.ne.jp/hotentry*`)、および個別のブックマークコメントページ(`https://b.hatena.ne.jp/entry/...`、例: `https://b.hatena.ne.jp/entry/s/example.com/path/`)に表示されているリンクを開いたときに、そのページを自動で**非公開ブックマーク**として登録するTampermonkeyユーザースクリプトです。コメント・タグは付与しません。

## 仕組み

- スクリプトは対象ページ上のリンク要素(ホットエントリー一覧: `.entrylist-contents-title a` / ブックマークコメントページ: `.js-entry-info-title-text`)へのクリックを検知します。
- クリックを検知すると、ページ遷移はブロックせず、裏で非同期にはてなブックマーク公式REST API(`https://bookmark.hatenaapis.com/rest/1/my/bookmark`)へPOSTリクエストを送り、ブックマークを登録します。
- 認証はOAuth 1.0a(HMAC-SHA1署名)です。署名処理は外部ライブラリに依存せず、スクリプト内に自前実装しています(CDN障害等での動作不良を避けるため)。
- OAuthの認証情報(Consumer key/secret, Access token/secret)は**リポジトリには一切含まれません**。各端末のTampermonkeyのローカルストレージ(`GM_setValue`)にのみ保存されます。

## リポジトリ構成

- `hotentry-autobookmark.user.js` … スクリプト本体。このファイルのみが本体で、他に依存ファイルはありません。

## 新しい端末に導入する手順

1. 対象ブラウザにTampermonkey拡張機能をインストールする。
2. 以下のURLをブラウザで開く。Tampermonkeyのインストール確認画面が出るので「インストール」をクリックする。
   ```
   https://raw.githubusercontent.com/CiaNostal/hotentry-autobookmark/main/hotentry-autobookmark.user.js
   ```
3. `https://b.hatena.ne.jp/` を開き、Tampermonkeyアイコンをクリックする。
4. ポップアップ内の「**設定: OAuth情報を入力/更新**」をクリックし、以下の4つを順番に入力する(この端末専用の一度きりの作業)。
   - Consumer key
   - Consumer secret
   - Access token
   - Access token secret

   4値の取得方法は「OAuth認証情報について」を参照。

5. ホットエントリーの記事リンクをクリックし、ブラウザのコンソール(F12)に `[hotentry-autobookmark] 登録成功:` と表示されること、はてなブックマークの非公開ブックマーク一覧に追加されることを確認する。

## コードを変更した場合の手順

このリポジトリはTampermonkeyの`@updateURL`/`@downloadURL`によって自動更新される構成になっています。**GitHub側を更新するだけで、既にインストール済みの全端末に反映されます**(手動での再配布は不要)。

1. `hotentry-autobookmark.user.js` を編集する。
2. スクリプト先頭のメタデータブロックにある `@version` を1つ上げる(例: `1.1.0` → `1.1.1`)。Tampermonkeyはこのバージョン番号の差分で更新の要不要を判断するため、上げ忘れると自動更新されません。
3. コミットしてGitHubにpushする。
   ```
   git add hotentry-autobookmark.user.js
   git commit -m "変更内容の説明"
   git push
   ```
4. Tampermonkeyは既定で1日1回程度自動的に更新チェックを行いますが、すぐ反映させたい場合は各端末でTampermonkeyダッシュボード → 対象スクリプト → 「アップデートを確認」を手動実行する。

OAuth認証情報の入力欄や保存の仕組み(`GM_setValue`のキー名など)を変更しない限り、既に保存済みの認証情報は更新後もそのまま使われるため、再入力は不要です。

## OAuth認証情報について

はてなブックマークの公式REST APIはOAuth 1.0a認証が必須です。以下の4値が必要です。

| 項目 | 取得元 |
|---|---|
| Consumer key / Consumer secret | https://www.hatena.ne.jp/oauth/develop でアプリを登録して発行(scopeは `write_private` のみでよい) |
| Access token / Access token secret | 上記consumerを使い、3-legged OAuthフロー(request_token → 認可 → access_token)を一度だけ実行して取得 |

Consumer key/secretは一度発行すれば使い回せます。新しい端末を追加する場合、同じ4値を「新しい端末に導入する手順」の手順4でそのまま入力すればよく、OAuthフローを毎回やり直す必要はありません。

**4値の紛失・漏洩時**は、https://www.hatena.ne.jp/oauth/develop の管理画面からアプリを削除(またはAccess tokenを無効化)すれば、そのトークンでのAPIアクセスは無効になります。

## トラブルシューティング

- **rawファイルが404になる**: リポジトリがPrivateになっていないか確認する。`raw.githubusercontent.com`は認証なしだとPrivateリポジトリのファイルを404で返すため、このリポジトリはPublicである必要がある(スクリプトに秘密情報は含まれないため公開して問題ない)。
- **Tampermonkeyのメニューに「設定: OAuth情報を入力/更新」が出ない**: `https://b.hatena.ne.jp/` または `/hotentry*` 配下のページを開いた状態でTampermonkeyアイコンをクリックしているか確認する(スクリプトが動作しているページでないとメニューは表示されない)。ダッシュボードでスクリプトが有効化されているかも確認する。
- **クリックしてもコンソールに何も出ない**: 対象のリンクが `.entrylist-contents-title a` に一致しない可能性がある。はてな側のHTML構造が変更された場合は、実ページのHTMLを確認しセレクタを更新する。
- **登録成功と出るがはてなブックマーク側に反映されない**: OAuthの4値の入力ミス(余分な空白・改行混入)を疑う。「設定: OAuth情報を入力/更新」からもう一度正しい値を入力し直す。

## 注意事項

- 個人利用を前提としています。はてなブックマークの利用規約・APIの利用条件の範囲内で使用してください。
- ホットエントリーのHTML構造(クラス名など)はサイトリニューアル等で変更される可能性があります。リンクが検知されなくなった場合は上記トラブルシューティングを参照してセレクタを見直してください。
