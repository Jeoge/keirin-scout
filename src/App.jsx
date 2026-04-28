import { useState, useCallback } from "react";

// ==================== CONSTANTS ====================
const EMPTY_PLAYER = {
  name: "", pref: "", rank: "", grade: "S1",
  winRate: "", threeRate: "", matches: "",
  period: "",
  B: "", nige: "", maki: "", sashi: "", ma: "",
  line: "A", role: "先行",
};

const LINE_LABELS = ["A", "B", "C", "D", "E", "F"];
const ROLE_OPTIONS = ["先行", "番手", "3番手", "4番手"];
const GRADE_OPTIONS = ["S1", "S2", "A1", "A2", "A3"];

// ==================== LOGIC ENGINE v2 ====================
function analyzeRace(players, prizeLevel, anaModeOn) {
  const results = { heads: [], third: [], buyTargets: [], anaBuy: [], skip: false, skipReason: "", patterns: [], warnings: [] };

  const withNum = players.map((p, i) => ({ ...p, num: i + 1 }));
  const valid = withNum.filter(p => p.name && p.name.trim() !== "");
  if (valid.length < 3) return results;

  const n = (v) => parseFloat(v) || 0;

  // ── ライン情報 ──
  const lineMap = {};
  valid.forEach(p => {
    if (!lineMap[p.line]) lineMap[p.line] = [];
    lineMap[p.line].push(p);
  });
  const lines = Object.values(lineMap);
  const fivePersonLine = lines.find(l => l.length >= 5);
  const fourPersonLines = lines.filter(l => l.length === 4);

  // ── STEP1: 完全絶対王者判定 ──
  // 条件: 勝率60%+ AND 3連対率90%+ AND (B回数orは逃回数がトップ) AND 試合数20+
  const maxB = Math.max(...valid.map(p => n(p.B)), 0);
  const maxNige = Math.max(...valid.map(p => n(p.nige)), 0);
  const absoluteKing = valid.find(p =>
    n(p.winRate) >= 60 &&
    n(p.threeRate) >= 90 &&
    (n(p.B) >= maxB && maxB > 0 || n(p.nige) >= maxNige && maxNige > 0) &&
    n(p.matches) >= 20
  );

  // ── STEP4-B: 差し型最強パターン ──
  // 差5以上+試合数20以上 OR マ5以上+試合数20以上
  const sashiTop = valid
    .filter(p => n(p.sashi) >= 5 && n(p.matches) >= 20)
    .sort((a, b) => n(b.sashi) - n(a.sashi));
  const maTop = valid
    .filter(p => n(p.ma) >= 5 && n(p.matches) >= 20)
    .sort((a, b) => n(b.ma) - n(a.ma));

  // 試合数が全員少ない場合（A3等）は相対的に判断
  const maxMatches = Math.max(...valid.map(p => n(p.matches)), 1);
  const sashiTopLow = maxMatches < 15 ? valid
    .filter(p => n(p.sashi) >= 2 && n(p.matches) >= 3)
    .sort((a, b) => n(b.sashi) - n(a.sashi)) : [];
  const maTopLow = maxMatches < 15 ? valid
    .filter(p => n(p.ma) >= 2 && n(p.matches) >= 3)
    .sort((a, b) => n(b.ma) - n(a.ma)) : [];

  const effectiveSashiTop = sashiTop.length > 0 ? sashiTop : sashiTopLow;
  const effectiveMaTop = maTop.length > 0 ? maTop : maTopLow;

  // ── STEP4-D: 若手120期以降 ──
  const youngsters = valid.filter(p => n(p.period) >= 120);

  // ── 頭候補追加関数 ──
  const headSet = new Set();
  const thirdSet = new Set();

  const addHead = (p, reason, priority = 2) => {
    if (!headSet.has(p.num)) {
      headSet.add(p.num);
      results.heads.push({ player: p, reason, priority });
    }
  };
  const addThird = (p, reason) => {
    if (!thirdSet.has(p.num)) {
      thirdSet.add(p.num);
      results.third.push({ player: p, reason });
    }
  };

  // ── STEP4-A: 完全絶対王者 ──
  if (absoluteKing) {
    addHead(absoluteKing, `✅ 完全絶対王者（勝率${absoluteKing.winRate}%・3連${absoluteKing.threeRate}%・試合数${absoluteKing.matches}）`, 1);
  }

  // ── STEP4-B: 差し型最強（頭候補最上位）──
  effectiveSashiTop.forEach((p, i) => {
    // ルール失効チェック: 完全絶対王者がいる場合
    if (absoluteKing) return;
    // 同ライン先頭が「B10+捲5+試合数20+」3条件全該当なら降格（例外あり）
    const lineMembers = lineMap[p.line] || [];
    const lineLeader = lineMembers.find(lp => lp.role === "先行" || lp.role === "両");
    const leaderStrong = lineLeader && n(lineLeader.B) >= 10 && n(lineLeader.maki) >= 5 && n(lineLeader.matches) >= 20;
    // 降格例外: S1級 or 同ライン勝率トップ or 差5+S5以上二刀流
    const lineWinRateTop = lineMembers.every(lp => lp.num === p.num || n(p.winRate) >= n(lp.winRate));
    const exception = p.grade === "S1" || lineWinRateTop || (n(p.sashi) >= 5 && n(p.B) >= 5);
    if (leaderStrong && !exception) {
      addHead(p, `⚠️ 差し型（差${p.sashi}回）降格例外なし→番手候補`, 5);
    } else {
      addHead(p, `🔥 差し型最強（差${p.sashi}回・試合数${p.matches}）`, i === 0 ? 1 : 2);
    }
  });

  effectiveMaTop.forEach((p, i) => {
    if (absoluteKing) return;
    if (!headSet.has(p.num)) {
      addHead(p, `🔥 マ型最強（マ${p.ma}回・試合数${p.matches}）`, i === 0 ? 1 : 2);
    }
  });

  // ── STEP4-D: 若手120期以降 ──
  youngsters.forEach(p => {
    // B10+先行先頭+試合数20+は最上位
    if (n(p.B) >= 10 && (p.role === "先行" || p.role === "両") && n(p.matches) >= 20) {
      addHead(p, `⭐ 若手${p.period}期・B${p.B}先行先頭（頭候補最上位）`, 1);
    } else {
      addHead(p, `⭐ 若手${p.period}期（120期以降・自動採用）`, 3);
    }
    addThird(p, `若手${p.period}期（試合数不問・自動採用）`);
  });

  // ── STEP4-E: 4人ライン番手差し切り頭（パターン④）──
  fourPersonLines.forEach(line => {
    const leader = line.find(p => p.role === "先行" || p.role === "両");
    const bante = line.find(p => p.role === "番手");
    const sanban = line.find(p => p.role === "3番手");
    const yonban = line.find(p => p.role === "4番手");
    if (leader && bante && n(leader.maki) === 0) {
      addHead(bante, `⚠️ 4人ライン番手差し切り（先頭捲り0回）`, 3);
    }
    // ── ルール⑭: 若手121期以降の先行先頭頭時→3番手・4番手も2着候補 ──
    if (leader && n(leader.period) >= 121) {
      // 3番手がS回数トップなら2着候補
      const maxS = Math.max(...valid.map(p => n(p.B)), 0);
      if (sanban && n(sanban.B) >= maxS * 0.7) {
        addThird(sanban, `ルール⑭：3番手S上位（B${sanban.B}）→2着候補`);
      }
      // 4番手が差し型最多なら2着・3着候補
      const maxSashi = Math.max(...valid.map(p => n(p.sashi)), 0);
      if (yonban && n(yonban.sashi) >= maxSashi * 0.7 && n(yonban.sashi) >= 2) {
        addThird(yonban, `ルール⑭：4番手差し型最多（差${yonban.sashi}）→2-3着候補`);
      }
      if (sanban) addThird(sanban, `ルール⑭：4人ライン3番手（若手先頭頭時）`);
      if (yonban) addThird(yonban, `ルール⑭：4人ライン4番手（若手先頭頭時）`);
      results.warnings.push(`💡 ルール⑭：${leader.name}（${leader.period}期）先頭頭→番手以外の2着分散に注意`);
    }
  });

  // ── 番手・3番手も頭候補に1〜2点（13Rの学び）──
  valid.forEach(p => {
    if (!headSet.has(p.num) && (p.role === "番手" || p.role === "3番手")) {
      const lineMembers = lineMap[p.line] || [];
      const leader = lineMembers.find(lp => lp.role === "先行" || lp.role === "両");
      if (leader) {
        addHead(p, `💡 ライン${p.line}${p.role}（差し切り候補・控えめ）`, 5);
      }
    }
  });

  // ── フォールバック: 先行型でB/逃上位の選手 ──
  if (results.heads.length === 0) {
    const senkoPlayers = valid
      .filter(p => p.role === "先行" || p.role === "両")
      .sort((a, b) => (n(b.B) * 4 + n(b.nige) * 3 + n(b.winRate) * 2) - (n(a.B) * 4 + n(a.nige) * 3 + n(a.winRate) * 2));
    senkoPlayers.slice(0, 3).forEach((p, i) => {
      addHead(p, `📊 先行型上位（B${p.B}・逃${p.nige}・勝率${p.winRate}%）`, i + 2);
    });
  }
  if (results.heads.length < 2) {
    valid
      .sort((a, b) => n(b.winRate) - n(a.winRate))
      .slice(0, 3)
      .forEach(p => { if (!headSet.has(p.num)) addHead(p, `📊 勝率上位（${p.winRate}%）`, 4); });
  }

  // ── STEP5: 3着候補 ──
  // 若手120期以降（自動）
  youngsters.forEach(p => addThird(p, `若手${p.period}期自動採用`));
  // ライン番手・最後尾（自動）
  lines.forEach(line => {
    line.forEach((p, idx) => {
      if (idx > 0) addThird(p, `ライン${p.line}${p.role}（自動採用）`);
    });
  });
  // 差し型上位（差5+試合数20+）
  effectiveSashiTop.forEach(p => addThird(p, `差し型上位（差${p.sashi}回）`));
  effectiveMaTop.forEach(p => addThird(p, `マ型上位（マ${p.ma}回）`));
  // 頭候補も3着候補に
  results.heads.forEach(h => addThird(h.player, "頭候補も3着対象"));
  // 残り全員（総流し精神）
  valid.forEach(p => addThird(p, "総流し"));

  // ── STEP6: 見送り判定 ──
  // 5人ライン→必ず買う
  if (fivePersonLine) {
    results.warnings.push("⚠️ 5人ライン検出！崩壊リスク高く中穴チャンス→必ず買う");
    results.skip = false;
  } else if (absoluteKing && !fivePersonLine && youngsters.length === 0 && effectiveSashiTop.length === 0) {
    results.skip = true;
    results.skipReason = `完全絶対王者【${absoluteKing.name}】確認。若手120期以降・差し型最強不在のため見送り推奨。`;
  }

  // ── パターン判定 ──
  const makiLines = lines.filter(l => l.some(p => n(p.maki) >= 3 || n(p.maki) >= 2));
  if (effectiveSashiTop.length > 0 && makiLines.length >= 2) {
    results.patterns.push("📌 パターン①：差し型最強頭＋対抗まくり連鎖（17,000円〜実証済み）");
  }
  if (lines.some(l => l.length === 3 && l.filter(p => n(p.sashi) >= 2).length >= 2)) {
    results.patterns.push("📌 パターン②：3人ライン番手差し切り完結（8,700円実証済み）");
  }
  if (fivePersonLine) {
    results.patterns.push("📌 パターン⑤：5人ライン崩壊→対抗まくり連鎖（32,000円実証済み）");
  }
  if (fourPersonLines.length > 0) {
    results.patterns.push("📌 パターン④：4人ライン番手差し切り頭（7,400円実証済み）");
  }

  results.heads.sort((a, b) => a.priority - b.priority);

  // ── 買い目生成 ──
  const allNums = valid.map(p => p.num);
  const thirdNums = results.third.slice(0, 8).map(t => t.player.num);

  let count = 0;
  const buys = [];
  for (const h of results.heads.slice(0, 5)) {
    for (const s of allNums) {
      if (s === h.player.num) continue;
      for (const t of thirdNums) {
        if (t === h.player.num || t === s) continue;
        if (count >= 25) break;
        buys.push([h.player.num, s, t]);
        count++;
      }
      if (count >= 25) break;
    }
    if (count >= 25) break;
  }
  results.buyTargets = buys;

  return results;
}


// ==================== COMPONENTS ====================

function Badge({ color, children }) {
  const colors = {
    red: "bg-red-500/20 text-red-300 border border-red-500/40",
    yellow: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/40",
    green: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40",
    blue: "bg-blue-500/20 text-blue-300 border border-blue-500/40",
    purple: "bg-purple-500/20 text-purple-300 border border-purple-500/40",
    gray: "bg-gray-500/20 text-gray-300 border border-gray-500/40",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${colors[color] || colors.gray}`}>
      {children}
    </span>
  );
}

function PriorityBadge({ priority }) {
  if (priority === 1) return <Badge color="red">最優先</Badge>;
  if (priority === 2) return <Badge color="yellow">優先</Badge>;
  if (priority === 3) return <Badge color="blue">候補</Badge>;
  return <Badge color="gray">補欠</Badge>;
}

function PlayerRow({ player, idx, onChange, onRemove, lineColor }) {
  const n = idx + 1;
  return (
    <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-3 mb-2">
      {/* Row 1: Number + Name + Pref + Grade */}
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-black text-white ${lineColor}`}>
          {n}
        </span>
        <input
          value={player.name}
          onChange={e => onChange("name", e.target.value)}
          placeholder="選手名"
          className="flex-1 bg-gray-700/50 border border-gray-600/50 rounded-lg px-2 py-1.5 text-white text-sm placeholder-gray-500 min-w-0"
        />
        <input
          value={player.pref}
          onChange={e => onChange("pref", e.target.value)}
          placeholder="府県"
          className="w-14 bg-gray-700/50 border border-gray-600/50 rounded-lg px-2 py-1.5 text-white text-sm placeholder-gray-500"
        />
        <select
          value={player.grade}
          onChange={e => onChange("grade", e.target.value)}
          className="w-14 bg-gray-700/50 border border-gray-600/50 rounded-lg px-1 py-1.5 text-white text-sm"
        >
          {GRADE_OPTIONS.map(g => <option key={g}>{g}</option>)}
        </select>
        <button onClick={onRemove} className="text-gray-500 hover:text-red-400 transition-colors text-lg leading-none">×</button>
      </div>

      {/* Row 2: Stats */}
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        {[
          ["winRate", "勝率%"], ["threeRate", "3連対%"], ["matches", "試合数"],
        ].map(([key, label]) => (
          <div key={key}>
            <div className="text-gray-500 text-xs mb-0.5">{label}</div>
            <input
              type="number"
              value={player[key]}
              onChange={e => onChange(key, e.target.value)}
              className="w-full bg-gray-700/50 border border-gray-600/50 rounded-lg px-2 py-1 text-white text-sm"
            />
          </div>
        ))}
      </div>

      {/* Row 3: B/逃/捲/差/マ */}
      <div className="grid grid-cols-5 gap-1 mb-2">
        {[["B", "B"], ["nige", "逃"], ["maki", "捲"], ["sashi", "差"], ["ma", "マ"]].map(([key, label]) => (
          <div key={key}>
            <div className="text-gray-500 text-xs mb-0.5 text-center">{label}</div>
            <input
              type="number"
              value={player[key]}
              onChange={e => onChange(key, e.target.value)}
              className="w-full bg-gray-700/50 border border-gray-600/50 rounded-lg px-1 py-1 text-white text-sm text-center"
            />
          </div>
        ))}
      </div>

      {/* Row 4: Line + Role + Period */}
      <div className="flex gap-2 items-center flex-wrap">
        <div className="flex items-center gap-1">
          <span className="text-gray-400 text-xs">ライン</span>
          <select
            value={player.line}
            onChange={e => onChange("line", e.target.value)}
            className="bg-gray-700/50 border border-gray-600/50 rounded-lg px-2 py-1 text-white text-sm"
          >
            {LINE_LABELS.map(l => <option key={l}>{l}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-400 text-xs">役割</span>
          <select
            value={player.role}
            onChange={e => onChange("role", e.target.value)}
            className="bg-gray-700/50 border border-gray-600/50 rounded-lg px-2 py-1 text-white text-sm"
          >
            {ROLE_OPTIONS.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-400 text-xs">期</span>
          <input
            type="number"
            value={player.period}
            onChange={e => onChange("period", e.target.value)}
            placeholder="期別"
            className="w-16 bg-gray-700/50 border border-gray-600/50 rounded-lg px-2 py-1 text-white text-sm"
          />
        </div>
      </div>
    </div>
  );
}

function ResultPanel({ result, players }) {
  const [selectedZone, setSelectedZone] = useState("ana");
  if (!result) return null;

  const LINE_COLORS = ["bg-red-500", "bg-blue-500", "bg-yellow-500", "bg-green-500", "bg-purple-500", "bg-pink-500"];
  const getColor = (num) => {
    const p = players[num - 1];
    if (!p) return "bg-gray-500";
    const li = ["A","B","C","D","E","F"].indexOf(p.line);
    return LINE_COLORS[li] || "bg-gray-500";
  };

  if (result.skip) {
    return (
      <div className="bg-orange-900/30 border border-orange-500/50 rounded-2xl p-4 mt-4">
        <div className="text-orange-300 font-bold text-lg mb-2">🚫 見送り推奨</div>
        <div className="text-orange-200 text-sm">{result.skipReason}</div>
      </div>
    );
  }

  // ── 買い目を3ゾーンに分類 ──
  const heads = result.heads;
  const honmeiHead = heads.filter(h => h.priority <= 2).slice(0, 1);
  const anaHeads   = heads.filter(h => h.priority <= 3).slice(0, 3);
  const anaHeads2     = heads.slice(0, 5);
  const thirds     = result.third.slice(0, 7).map(t => t.player.num);
  const allNums    = players.map((_, i) => i + 1).filter(n => players[n-1]?.name);

  // ── 25点を3ゾーンで分配 ──
  // ── 25点配分：本命3・中穴12・穴10（的中率13%実績→本命絞る）──
  // 本命線: 最大3点（頭1点・最有力のみ）
  const honmeiBuys = [];
  if (honmeiHead.length > 0) {
    const h = honmeiHead[0].player.num;
    for (const s of allNums) {
      if (s === h) continue;
      for (const t of thirds.slice(0, 4)) {
        if (t === h || t === s) continue;
        honmeiBuys.push([h, s, t]);
        if (honmeiBuys.length >= 3) break;
      }
      if (honmeiBuys.length >= 3) break;
    }
  }

  // 中穴: 最大12点（頭2〜3点・中心）
  const anaBuys = [];
  const anaH = anaHeads.slice(0, 3).map(h => h.player.num);
  const honmeiSet = new Set(honmeiBuys.map(b => b.join('-')));
  for (const h of anaH) {
    for (const s of allNums) {
      if (s === h) continue;
      for (const t of thirds) {
        if (t === h || t === s) continue;
        const key = [h,s,t].join('-');
        if (!honmeiSet.has(key) && !anaBuys.some(b => b[0]===h&&b[1]===s&&b[2]===t)) {
          anaBuys.push([h, s, t]);
        }
        if (anaBuys.length >= 14) break;
      }
      if (anaBuys.length >= 14) break;
    }
    if (anaBuys.length >= 12) break;
  }

  // 穴: 最大10点（頭広め・上2ゾーンと重複なし）
  const anaSet = new Set(anaBuys.map(b => b.join('-')));
  const anaBuys2 = result.buyTargets.filter(b => {
    const key = b.join('-');
    return !honmeiSet.has(key) && !anaSet.has(key);
  }).slice(0, 8);

  // 合計25点以内（3+14+8=25）
  const total = honmeiBuys.length + anaBuys.length + anaBuys2.length;

  const zones = {
    honmei: { label: "本命線", emoji: "🎯", color: "blue",   desc: `的中率低め・保険程度（${honmeiBuys.length}点）`, buys: honmeiBuys, invest: honmeiBuys.length * 100, range: "〜3,000円" },
    ana:    { label: "中穴",   emoji: "💫", color: "yellow", desc: `メイン狙い・3,000〜15,000円（${anaBuys.length}点）`, buys: anaBuys, invest: anaBuys.length * 100, range: "3,000〜15,000円" },
    ana2:   { label: "穴",     emoji: "🕳️", color: "red",    desc: `一発狙い・10,000〜25,000円（${anaBuys2.length}点）`, buys: anaBuys2, invest: anaBuys2.length * 100, range: "10,000〜25,000円" },
  };

  const zone = zones[selectedZone];

  const NumBadge = ({ num, size = "sm" }) => (
    <span className={`inline-flex items-center justify-center rounded-full font-black text-white flex-shrink-0
      ${size === "lg" ? "w-9 h-9 text-base" : "w-6 h-6 text-xs"}
      ${getColor(num)}`}>
      {num}
    </span>
  );

  return (
    <div className="space-y-4 mt-2">

      {/* Warnings & Patterns */}
      {result.warnings.map((w, i) => (
        <div key={i} className="bg-yellow-900/30 border border-yellow-500/50 rounded-xl p-3 text-yellow-300 text-xs font-bold">{w}</div>
      ))}
      {result.patterns.length > 0 && (
        <div className="bg-purple-900/30 border border-purple-500/40 rounded-xl p-3">
          <div className="text-purple-300 font-bold text-xs mb-1">🎯 該当パターン</div>
          {result.patterns.map((p, i) => <div key={i} className="text-purple-200 text-xs">{p}</div>)}
        </div>
      )}

      {/* 頭候補サマリー */}
      <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4">
        <div className="text-yellow-400 font-black text-sm mb-3">🏆 頭候補</div>
        <div className="space-y-2">
          {heads.slice(0, 4).map((h, i) => (
            <div key={i} className="flex items-center gap-3">
              <NumBadge num={h.player.num} size="lg" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-bold text-sm">{h.player.name}</span>
                  {h.priority === 1 && <span className="text-xs bg-red-500/20 text-red-300 border border-red-500/40 px-2 py-0.5 rounded font-bold">最有力</span>}
                  {h.priority === 2 && <span className="text-xs bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 px-2 py-0.5 rounded font-bold">有力</span>}
                  {h.priority >= 3 && <span className="text-xs bg-gray-500/20 text-gray-400 border border-gray-500/40 px-2 py-0.5 rounded">候補</span>}
                </div>
                <div className="text-gray-500 text-xs mt-0.5 truncate">{h.reason}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 合計点数バナー */}
      <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl px-4 py-3 flex items-center justify-between">
        <div className="text-gray-300 text-sm font-bold">合計買い目</div>
        <div className="flex items-center gap-3">
          <span className="text-white font-black text-xl">{total}点</span>
          <span className="text-gray-400 text-sm">{(total * 100).toLocaleString()}円</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${total <= 25 ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
            {total <= 25 ? "✅ 25点以内" : "⚠️ 超過"}
          </span>
        </div>
      </div>

      {/* ゾーン選択 */}
      <div>
        <div className="text-gray-400 text-xs mb-2 font-bold">狙う配当帯を選んでください</div>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(zones).map(([key, z]) => (
            <button
              key={key}
              onClick={() => setSelectedZone(key)}
              className={`rounded-xl p-3 border transition-all text-center ${
                selectedZone === key
                  ? z.color === "blue"   ? "bg-blue-500/20 border-blue-500/60 text-blue-300"
                  : z.color === "yellow" ? "bg-yellow-500/20 border-yellow-500/60 text-yellow-300"
                  : "bg-red-500/20 border-red-500/60 text-red-300"
                  : "bg-gray-800/40 border-gray-700/40 text-gray-500 hover:text-gray-300"
              }`}
            >
              <div className="text-xl mb-1">{z.emoji}</div>
              <div className="font-black text-sm">{z.label}</div>
              <div className="text-xs mt-0.5 opacity-70">{z.range}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 選択ゾーンの買い目 */}
      <div className={`border rounded-xl p-4 ${
        zone.color === "blue"   ? "bg-blue-900/20 border-blue-700/40"
        : zone.color === "yellow" ? "bg-yellow-900/20 border-yellow-700/40"
        : "bg-red-900/20 border-red-700/40"
      }`}>
        <div className="flex items-center justify-between mb-1">
          <div className={`font-black text-base ${
            zone.color === "blue" ? "text-blue-300" : zone.color === "yellow" ? "text-yellow-300" : "text-red-300"
          }`}>
            {zone.emoji} {zone.label}買い目
          </div>
          <div className="text-right">
            <div className="text-white font-black text-lg">{zone.buys.length}点</div>
            <div className="text-gray-400 text-xs">投資 {zone.invest.toLocaleString()}円</div>
          </div>
        </div>
        <div className="text-gray-400 text-xs mb-3">{zone.desc}</div>

        {zone.buys.length === 0 ? (
          <div className="text-gray-500 text-sm text-center py-4">
            データが不足しています。<br/>ライン・役割を確認してください。
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {zone.buys.map((b, i) => (
              <div key={i} className="bg-gray-900/60 rounded-lg px-2 py-1.5 flex items-center justify-center gap-1">
                <NumBadge num={b[0]} />
                <span className="text-gray-500 text-xs">-</span>
                <NumBadge num={b[1]} />
                <span className="text-gray-500 text-xs">-</span>
                <NumBadge num={b[2]} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3着候補 */}
      <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-3">
        <div className="text-emerald-400 font-bold text-xs mb-2">🎯 3着候補（流し対象）</div>
        <div className="flex flex-wrap gap-2">
          {result.third.slice(0, 8).map((t, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-gray-700/40 rounded-lg px-2 py-1">
              <NumBadge num={t.player.num} />
              <span className="text-white text-xs font-medium">{t.player.name}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}


function HistoryTab({ history, setHistory }) {
  const [form, setForm] = useState({ race: "", invest: "", payout: "", note: "" });

  const add = () => {
    if (!form.race || !form.invest) return;
    setHistory(h => [...h, { ...form, id: Date.now(), invest: Number(form.invest), payout: Number(form.payout || 0) }]);
    setForm({ race: "", invest: "", payout: "", note: "" });
  };

  const totalInvest = history.reduce((s, h) => s + h.invest, 0);
  const totalPayout = history.reduce((s, h) => s + h.payout, 0);
  const balance = totalPayout - totalInvest;
  const hitCount = history.filter(h => h.payout > 0).length;

  return (
    <div className="space-y-4">
      {/* Balance Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4 text-center">
          <div className="text-gray-400 text-xs mb-1">累計収支</div>
          <div className={`text-2xl font-black ${balance >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {balance >= 0 ? "+" : ""}{balance.toLocaleString()}円
          </div>
        </div>
        <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4 text-center">
          <div className="text-gray-400 text-xs mb-1">的中率</div>
          <div className="text-2xl font-black text-blue-400">
            {history.length > 0 ? Math.round(hitCount / history.length * 100) : 0}%
          </div>
          <div className="text-gray-500 text-xs">{hitCount}/{history.length}回</div>
        </div>
        <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4 text-center">
          <div className="text-gray-400 text-xs mb-1">投資額</div>
          <div className="text-lg font-bold text-gray-300">{totalInvest.toLocaleString()}円</div>
        </div>
        <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4 text-center">
          <div className="text-gray-400 text-xs mb-1">払戻額</div>
          <div className="text-lg font-bold text-gray-300">{totalPayout.toLocaleString()}円</div>
        </div>
      </div>

      {/* Add Record */}
      <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4">
        <div className="text-white font-bold text-sm mb-3">＋ 記録を追加</div>
        <input
          value={form.race}
          onChange={e => setForm(f => ({ ...f, race: e.target.value }))}
          placeholder="レース名（例：川崎 第6R）"
          className="w-full bg-gray-700/50 border border-gray-600/50 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 mb-2"
        />
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <div className="text-gray-400 text-xs mb-1">投資額（円）</div>
            <input type="number" value={form.invest} onChange={e => setForm(f => ({ ...f, invest: e.target.value }))}
              className="w-full bg-gray-700/50 border border-gray-600/50 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div>
            <div className="text-gray-400 text-xs mb-1">払戻額（円・0=外れ）</div>
            <input type="number" value={form.payout} onChange={e => setForm(f => ({ ...f, payout: e.target.value }))}
              className="w-full bg-gray-700/50 border border-gray-600/50 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
        </div>
        <textarea
          value={form.note}
          onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
          placeholder="メモ（外れた理由、気づき等）"
          rows={2}
          className="w-full bg-gray-700/50 border border-gray-600/50 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 mb-3 resize-none"
        />
        <button onClick={add} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-lg text-sm transition-colors">
          記録する
        </button>
      </div>

      {/* History List */}
      <div className="space-y-2">
        {[...history].reverse().map(h => (
          <div key={h.id} className={`bg-gray-800/60 border rounded-xl p-3 ${h.payout > 0 ? "border-emerald-700/50" : "border-red-700/30"}`}>
            <div className="flex items-center justify-between mb-1">
              <div className="text-white text-sm font-bold">{h.race}</div>
              <div className={`text-sm font-black ${h.payout > 0 ? "text-emerald-400" : "text-red-400"}`}>
                {h.payout > 0 ? `+${(h.payout - h.invest).toLocaleString()}円` : `-${h.invest.toLocaleString()}円`}
              </div>
            </div>
            <div className="flex gap-3 text-xs text-gray-400">
              <span>投資: {h.invest.toLocaleString()}円</span>
              {h.payout > 0 && <span>払戻: {h.payout.toLocaleString()}円</span>}
            </div>
            {h.note && <div className="text-gray-500 text-xs mt-1 italic">{h.note}</div>}
            <button
              onClick={() => setHistory(hs => hs.filter(x => x.id !== h.id))}
              className="text-gray-600 hover:text-red-400 text-xs mt-1 transition-colors"
            >削除</button>
          </div>
        ))}
        {history.length === 0 && (
          <div className="text-gray-500 text-sm text-center py-8">まだ記録がありません</div>
        )}
      </div>
    </div>
  );
}

// ==================== MAIN APP ====================
export default function App() {
  const [tab, setTab] = useState("input");
  const [raceName, setRaceName] = useState("");
  const [prizeLevel, setPrizeLevel] = useState("yosen");
  const [players, setPlayers] = useState(
    Array(7).fill(null).map(() => ({ ...EMPTY_PLAYER }))
  );
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importMsg, setImportMsg] = useState("");

  const handleImport = () => {
    try {
      const data = JSON.parse(importText.trim());
      if (!Array.isArray(data) || data.length === 0) throw new Error("データが空です");
      const imported = data.map((p, i) => ({
        ...EMPTY_PLAYER,
        name: p.name || "",
        pref: p.pref || "",
        grade: p.grade || "A1",
        period: String(p.period || ""),
        winRate: String(p.winRate || ""),
        threeRate: String(p.threeRate || ""),
        matches: String(p.matches || ""),
        B: String(p.B || ""),
        nige: String(p.nige || ""),
        maki: String(p.maki || ""),
        sashi: String(p.sashi || ""),
        ma: String(p.ma || ""),
        line: p.line || LINE_LABELS[i] || "A",
        role: p.role || "先行",
      }));
      setPlayers(imported);
      setImportMsg(`✅ ${imported.length}名を取り込みました！ライン・役割を確認してください`);
      setImportText("");
      setTimeout(() => { setShowImport(false); setImportMsg(""); }, 2000);
    } catch (e) {
      setImportMsg("❌ データの形式が正しくありません");
    }
  };

  const LINE_COLORS = ["bg-red-500", "bg-blue-500", "bg-yellow-500", "bg-green-500", "bg-purple-500", "bg-pink-500"];

  const updatePlayer = useCallback((idx, key, val) => {
    setPlayers(ps => ps.map((p, i) => i === idx ? { ...p, [key]: val } : p));
  }, []);

  const addPlayer = () => {
    if (players.length < 9) setPlayers(ps => [...ps, { ...EMPTY_PLAYER }]);
  };

  const removePlayer = (idx) => {
    if (players.length > 3) setPlayers(ps => ps.filter((_, i) => i !== idx));
  };

  const analyze = () => {
    // 名前が入っている選手だけで分析
    const activePlayers = players.filter(p => p.name.trim() !== "");
    if (activePlayers.length < 3) {
      alert("選手名を3人以上入力してください");
      return;
    }
    const res = analyzeRace(activePlayers, prizeLevel, true);
    setResult(res);
    setTab("result");
  };

  const reset = () => {
    setPlayers(Array(7).fill(null).map(() => ({ ...EMPTY_PLAYER })));
    setResult(null);
    setRaceName("");
    setTab("input");
  };

  const TABS = [
    { id: "input", label: "入力", icon: "📝" },
    { id: "result", label: "分析", icon: "🎯" },
    { id: "history", label: "記録", icon: "📊" },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-3 sticky top-0 z-20">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div>
            <div className="text-yellow-400 font-black text-lg tracking-wider">⚡ KEIRIN SCOUT</div>
            <div className="text-gray-500 text-xs">中穴特化・v3.0</div>
          </div>
          <div className="flex gap-1">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  tab === t.id
                    ? "bg-yellow-500 text-gray-900"
                    : "bg-gray-800 text-gray-400 hover:text-white"
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 pb-24">
        {/* INPUT TAB */}
        {tab === "input" && (
          <div>
            {/* Import Button */}
            <div className="mb-4">
              <button
                onClick={() => setShowImport(v => !v)}
                className="w-full bg-emerald-900/40 border border-emerald-600/50 hover:bg-emerald-800/40 text-emerald-300 font-bold py-3 rounded-xl text-sm transition-all"
              >
                📋 Chrome拡張データを貼り付けインポート
              </button>
              {showImport && (
                <div className="mt-2 bg-gray-800/80 border border-emerald-600/40 rounded-xl p-3">
                  <div className="text-emerald-300 text-xs font-bold mb-2">
                    Chrome拡張で「コピー」したデータをここに貼り付け
                  </div>
                  <textarea
                    value={importText}
                    onChange={e => setImportText(e.target.value)}
                    placeholder="拡張機能の「データをコピー」ボタンを押してからCtrl+Vで貼り付け"
                    rows={4}
                    className="w-full bg-gray-900 border border-gray-600/50 rounded-lg px-3 py-2 text-white text-xs placeholder-gray-600 resize-none mb-2 font-mono"
                  />
                  {importMsg && (
                    <div className={`text-xs font-bold mb-2 ${importMsg.startsWith("✅") ? "text-emerald-400" : "text-red-400"}`}>
                      {importMsg}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={handleImport}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-lg text-sm transition-colors"
                    >
                      取り込む
                    </button>
                    <button
                      onClick={() => { setShowImport(false); setImportText(""); setImportMsg(""); }}
                      className="px-4 bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold py-2 rounded-lg text-sm transition-colors"
                    >
                      閉じる
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Race Info */}
            <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4 mb-4">
              <div className="text-gray-300 text-sm font-bold mb-2">レース情報</div>
              <input
                value={raceName}
                onChange={e => setRaceName(e.target.value)}
                placeholder="例：川崎 第6R 3級選抜"
                className="w-full bg-gray-700/50 border border-gray-600/50 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 mb-2"
              />
              <div>
                <div className="text-gray-400 text-xs mb-1">賞金レベル</div>
                <div className="flex gap-2">
                  {[
                    ["yosen", "予選級（10万円以下）", "穴狙い全開"],
                    ["final", "決勝級（20万円以上）", "本命線厚め"],
                    ["skip", "A3チャレンジ予選", "見送り推奨"],
                  ].map(([val, label, note]) => (
                    <button
                      key={val}
                      onClick={() => setPrizeLevel(val)}
                      className={`flex-1 rounded-lg p-2 text-xs font-bold border transition-all ${
                        prizeLevel === val
                          ? "bg-yellow-500/20 border-yellow-500/60 text-yellow-300"
                          : "bg-gray-700/40 border-gray-600/40 text-gray-400 hover:text-white"
                      }`}
                    >
                      <div>{label}</div>
                      <div className="text-gray-500 font-normal mt-0.5">{note}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Players */}
            <div className="text-gray-300 text-sm font-bold mb-2">
              選手データ（{players.length}名）
            </div>
            {players.map((p, i) => (
              <PlayerRow
                key={i}
                player={p}
                idx={i}
                onChange={(key, val) => updatePlayer(i, key, val)}
                onRemove={() => removePlayer(i)}
                lineColor={LINE_COLORS[LINE_LABELS.indexOf(p.line)] || "bg-gray-500"}
              />
            ))}

            {players.length < 9 && (
              <button
                onClick={addPlayer}
                className="w-full border-2 border-dashed border-gray-700 hover:border-gray-500 text-gray-500 hover:text-gray-300 rounded-xl py-3 text-sm font-bold mb-4 transition-all"
              >
                ＋ 選手を追加
              </button>
            )}

            <button
              onClick={analyze}
              className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-gray-900 font-black py-4 rounded-xl text-lg shadow-lg shadow-yellow-500/20 transition-all"
            >
              🔍 分析する
            </button>
            <button onClick={reset} className="w-full mt-2 text-gray-500 hover:text-gray-300 py-2 text-sm transition-colors">
              リセット
            </button>
          </div>
        )}

        {/* RESULT TAB */}
        {tab === "result" && (
          <div>
            {raceName && (
              <div className="text-gray-400 text-sm mb-3">📍 {raceName}</div>
            )}
            {result ? (
              <ResultPanel result={result} players={players} />
            ) : (
              <div className="text-center py-16 text-gray-500">
                <div className="text-4xl mb-3">🔍</div>
                <div className="text-sm">入力タブでデータを入力して<br />「分析する」を押してください</div>
                <button onClick={() => setTab("input")} className="mt-4 bg-yellow-500 text-gray-900 font-bold px-6 py-2 rounded-lg text-sm">
                  入力へ
                </button>
              </div>
            )}
          </div>
        )}

        {/* HISTORY TAB */}
        {tab === "history" && (
          <HistoryTab history={history} setHistory={setHistory} />
        )}
      </div>

      {/* Bottom Analyze Button (floating) */}
      {tab === "input" && (
        <div className="fixed bottom-0 left-0 right-0 bg-gray-950/90 backdrop-blur border-t border-gray-800 p-4">
          <div className="max-w-lg mx-auto">
            <button
              onClick={analyze}
              className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-gray-900 font-black py-3 rounded-xl text-base shadow-lg transition-all"
            >
              🔍 分析する
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
