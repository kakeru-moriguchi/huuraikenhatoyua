# 3試合保証トーナメント

1部8チーム・2部16チーム・3部8チームを管理する、3試合保証の大会運営Webアプリです。1部と3部は各12試合、2部はA/B各12試合と総合決勝1試合で進行します。

## 画面構成

1. **大会設定** — 大会名、開催日
2. **チーム登録** — 8チームをシード順に登録
3. **トーナメント** — 全12試合と進出経路を表示
4. **試合結果入力** — スコア入力、勝敗判定、後続試合への自動配置
5. **最終順位** — 1位から8位を自動表示

画面は1ページ内のステップナビゲーションとして実装しています。スマートフォンでは入力欄を1列化し、トーナメントはラウンド単位で横スクロールできます。

## データ構造

```ts
type BracketState = {
  teams: string[] // シード順、必ず8件
  scores: Record<MatchId, { a: string; b: string }>
}

type AppState = {
  name: string
  date: string
  divisions: {
    1: BracketState
    2: {
      A: BracketState
      B: BracketState
      grandFinal: { a: string; b: string }
    }
    3: BracketState
  }
}

type MatchDefinition = {
  id: MatchId
  round: 1 | 2 | 3
  title: string
  route: string
  sourceA: MatchSource
  sourceB: MatchSource
}

type MatchSource =
  | { type: 'seed'; seed: number }
  | { type: 'winner' | 'loser'; matchId: MatchId }
```

試合定義と入力スコアを分離し、出場チーム・勝者・敗者・順位は常に導出値として再計算します。端末内の `localStorage` に自動保存します。旧バージョンの単一大会データは1部へ自動移行します。

## 部門構成

- **1部** — 8チーム、M01〜M12で1位〜8位を決定
- **2部 Aブロック** — 8チーム、A-M01〜A-M12でブロック1位〜8位を決定
- **2部 Bブロック** — 8チーム、B-M01〜B-M12でブロック1位〜8位を決定
- **2部 総合決勝** — `division: 2 / stage: grand_final / id: D2-GF`。A/Bブロック優勝同士で総合優勝・準優勝を決定
- **3部** — 8チーム、M01〜M12で1位〜8位を決定

2部のA/Bブロックは完全に独立して進行します。ブロック優勝の変更により総合決勝の出場チームが変わった場合、総合決勝スコアだけを自動リセットします。

## 試合IDと遷移

| ID | 試合 | チームA | チームB | 勝者 | 敗者 |
| --- | --- | --- | --- | --- | --- |
| M01 | 1回戦A | 第1シード | 第8シード | M05 | M07 |
| M02 | 1回戦B | 第4シード | 第5シード | M05 | M07 |
| M03 | 1回戦C | 第2シード | 第7シード | M06 | M08 |
| M04 | 1回戦D | 第3シード | 第6シード | M06 | M08 |
| M05 | 勝者側A | M01勝者 | M02勝者 | M09 | M10 |
| M06 | 勝者側B | M03勝者 | M04勝者 | M09 | M10 |
| M07 | 敗者側A | M01敗者 | M02敗者 | M11 | M12 |
| M08 | 敗者側B | M03敗者 | M04敗者 | M11 | M12 |
| M09 | 決勝 | M05勝者 | M06勝者 | 1位 | 2位 |
| M10 | 3位決定戦 | M05敗者 | M06敗者 | 3位 | 4位 |
| M11 | 5・6位決定戦 | M07勝者 | M08勝者 | 5位 | 6位 |
| M12 | 7・8位決定戦 | M07敗者 | M08敗者 | 7位 | 8位 |

## 結果修正のルール

入力変更のたびに M01 から M12 までを順番に再計算します。修正によって後続試合の出場チームが変わった場合、その後続試合の得点を自動クリアします。出場チームが変わらない試合の得点は保持します。同点は未確定として扱います。

## 開発

```bash
npm install
npm run dev
npm run build
```

## Vercel

VercelへのGitHubインポートに対応しています。`vercel.json` がビルドコマンドを設定するため、Root Directoryを `./` のままデプロイできます。Vercel環境ではNitroアダプターがBuild Output API形式を生成し、既存のSites / Cloudflare向けビルドはそのまま維持します。

