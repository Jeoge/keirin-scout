import { useState, useCallback } from "react";

// ─── 定数 ────────────────────────────────────────────────
const LINE_COLORS = [
  { bg:"#0d2035", border:"#2196F3", text:"#64b5f6", label:"ライン A" },
  { bg:"#200d1a", border:"#E91E63", text:"#f48fb1", label:"ライン B" },
  { bg:"#0d2016", border:"#4CAF50", text:"#81c784", label:"ライン C" },
  { bg:"#201a0d", border:"#FF9800", text:"#ffb74d", label:"ライン D" },
  { bg:"#180d20", border:"#9C27B0", text:"#ce93d8", label:"ライン E" },
  { bg:"#0d1a20", border:"#00BCD4", text:"#80deea", label:"ライン F" },
];
const LINE_IDS = ["A","B","C","D","E","F"];
const TABS = ["📝 レース入力","🕰 過去記録","📊 精度分析"];

const C = {
  bg:"#07090f", card:"#0c1120", border:"#1a2840",
  gold:"#f0b429", goldDim:"#7a5810",
  blue:"#4a9eff", green:"#2ecc71", red:"#e74c3c",
  orange:"#e67e22", purple:"#a855f7", teal:"#1abc9c",
  yellow:"#f1c40f",
  textPrimary:"#e8eaf6", textMuted:"#4a6a8c", textDim:"#1e2e40",
};

const makeRider = (n) => ({
  id: Date.now()+Math.random(),
  number: String(n),
  name: "", pref: "",
  winRate: "",   // 勝率(%)
  rate2: "",     // 2連対率(%)
  rate3: "",     // 3連対率(%)
  matchCount: "", // 試合数
  bCount: "",    // B(バック)回数
  nigeCount: "", // 逃回数
  makuriCount: "", // 捲り回数
  sashiCount: "", // 差し回数
  maCount: "",   // マーク(マ)回数
  kumi: "",      // 期別(例:123)
  lineId: "",
  linePos: "先行", // 先行/追込
});

const makeDefaultRiders = () => Array.from({length:9},(_,i)=>makeRider(i+1));

// ─── スタイル ─────────────────────────────────────────────
const inp = (extra={}) => ({
  padding:"5px 6px", borderRadius:"5px", border:`1.5px solid ${C.border}`,
  fontSize:"12px", outline:"none", width:"100%",
  background:"#050810", color:C.textPrimary, fontFamily:"inherit", ...extra,
});
const sel = () => ({...inp(), cursor:"pointer", fontSize:"11px"});
const cardSt = (extra={}) => ({
  background:C.card, border:`1px solid ${C.border}`,
  borderRadius:"12px", padding:"16px 18px", marginBottom:"12px", ...extra,
});
const secLbl = (c=C.textMuted) => ({
  fontSize:"9px", fontWeight:"700", color:c,
  letterSpacing:"0.14em", textTransform:"uppercase", marginBottom:"8px",
});
const btnSt = (bg,color,extra={}) => ({
  padding:"8px 18px", background:bg, border:"none", borderRadius:"8px",
  color, fontWeight:"700", fontSize:"12px", cursor:"pointer", fontFamily:"inherit", ...extra,
});
const tag = (bg, color, border) => ({
  display:"inline-flex", alignItems:"center",
  padding:"2px 8px", borderRadius:"20px", fontSize:"10px", fontWeight:"700",
  background:bg, color, border:`1px solid ${border||color}`,
});

// ─── 完全統合版 分析ロジック ──────────────────────────────
function analyze(riders, prizeLevel, anaMode) {
  const issues = [];
  const warnings = [];
  const result = {
    valid:[], eliminated:[], bets:[], anaBets:[],
    issues, warnings,
    raceWorth: true,
    skip: false,
    verdict: "",
    verdictColor: C.green,
    candidatesFirst: [],   // 頭候補リスト（優先順）
    candidatesThird: [],   // 3着候補リスト
    scenarios: [],         // シナリオ別買い目
    anaMode,
  };

  const withData = riders.filter(r => r.name !== "");
  if (withData.length === 0) {
    issues.push("選手データを入力してください");
    result.raceWorth = false;
    return result;
  }

  // ─── ライングループ化 ───
  const lines = {};
  riders.forEach(r => {
    if (!r.lineId) return;
    if (!lines[r.lineId]) lines[r.lineId] = [];
    lines[r.lineId].push(r);
  });
  const lineIds = Object.keys(lines);
  const lineSizes = {};
  lineIds.forEach(lid => lineSizes[lid] = lines[lid].length);

  // ─── STEP 1: 絶対王者判定 ───
  let zetsuaiOja = null;
  for (const r of withData) {
    const win = parseFloat(r.winRate);
    const r3  = parseFloat(r.rate3);
    const mc  = parseInt(r.matchCount);
    const b   = parseInt(r.bCount) || 0;
    const nige= parseInt(r.nigeCount) || 0;
    const topBN = b + nige;
    if (win >= 60 && r3 >= 90 && mc >= 20 && topBN >= 10) {
      zetsuaiOja = r;
      break;
    }
  }
  if (zetsuaiOja) {
    warnings.push(`👑 絶対王者：${zetsuaiOja.name||zetsuaiOja.number}番（勝率${zetsuaiOja.winRate}%・3連${zetsuaiOja.rate3}%）→ 頭固定一択`);
  }

  // ─── STEP 2: 賞金レベル判定 ───
  let raceType = "normal"; // normal / finals / a3
  if (prizeLevel === "finals") {
    raceType = "finals";
    warnings.push("💎 決勝級レース（賞金20万円以上）→ 本命決着率上昇、本命線厚め");
  } else if (prizeLevel === "a3") {
    raceType = "a3";
    result.skip = true;
    result.raceWorth = false;
    result.verdict = "A3チャレンジ予選 → 様子見推奨（配当低額）";
    result.verdictColor = C.textMuted;
    issues.push("A3チャレンジ予選は配当が低いため原則様子見推奨です");
    return result;
  }

  // ─── STEP 3: ライン構造判定 ───
  const has5PlusLine = lineIds.some(lid => lineSizes[lid] >= 5);
  if (has5PlusLine) {
    warnings.push("⚠ 5人以上のラインあり → 崩壊リスク高！対抗まくりライン厚め・見送り対象外");
  }

  // ─── STEP 4: 頭候補整理 ───
  const firstCandidates = [];

  // (A) 絶対王者 → 最優先
  if (zetsuaiOja) {
    firstCandidates.push({ rider: zetsuaiOja, reason:"👑 絶対王者", priority:1 });
  }

  // (B) 差し型最強パターン（絶対王者がいない or いても追加候補として明記）
  for (const r of withData) {
    if (zetsuaiOja && r.id === zetsuaiOja.id) continue;
    const sashi = parseInt(r.sashiCount) || 0;
    const ma    = parseInt(r.maCount) || 0;
    const mc    = parseInt(r.matchCount) || 0;
    const kumi  = parseInt(r.kumi) || 0;

    // 差し5+試合数20+
    if (sashi >= 5 && mc >= 20) {
      // 失効条件チェック: 同ラインリーダーがB10+捲5+試合数20+ → 番手降格
      const myLine = r.lineId ? lines[r.lineId] : null;
      const myLineLeader = myLine ? myLine.find(m => m.linePos === "先行" && m.id !== r.id) : null;
      let demoted = false;
      if (myLineLeader) {
        const lb = parseInt(myLineLeader.bCount)||0;
        const lk = parseInt(myLineLeader.makuriCount)||0;
        const lm = parseInt(myLineLeader.matchCount)||0;
        if (lb >= 10 && lk >= 5 && lm >= 20) {
          demoted = true;
          firstCandidates.push({ rider:r, reason:`差し型最強(差${sashi}・${mc}戦) ※同ライン先頭強→2着候補`, priority:3 });
        }
      }
      if (!demoted && !zetsuaiOja) {
        firstCandidates.push({ rider:r, reason:`⚡ 差し型最強(差${sashi}・${mc}戦)`, priority:1 });
      } else if (!demoted && zetsuaiOja) {
        firstCandidates.push({ rider:r, reason:`差し型最強(差${sashi}・${mc}戦)`, priority:2 });
      }
    }
    // マ5+試合数20+（新ルール）
    else if (ma >= 5 && mc >= 20 && !zetsuaiOja) {
      firstCandidates.push({ rider:r, reason:`⚡ マーク型最強(マ${ma}・${mc}戦)`, priority:1 });
    }
    // 差し回数トップ（試合数20未満でも）
    else if (sashi >= 3 && mc < 20) {
      firstCandidates.push({ rider:r, reason:`差し回数トップ候補(差${sashi}・試合数少)`, priority:3 });
    }
  }

  // (C) 若手評価補正 (120期以降)
  for (const r of withData) {
    const kumi = parseInt(r.kumi) || 0;
    const mc   = parseInt(r.matchCount) || 0;
    const b    = parseInt(r.bCount) || 0;
    const nige = parseInt(r.nigeCount) || 0;
    const makuri = parseInt(r.makuriCount) || 0;
    if (kumi >= 120) {
      const alreadyIn = firstCandidates.some(c => c.rider.id === r.id);
      if (!alreadyIn && (b + nige + makuri >= 3) && mc >= 20) {
        firstCandidates.push({ rider:r, reason:`🔥 若手${kumi}期(${mc}戦)`, priority:2 });
      }
    }
  }

  // (D) 3人ライン先頭で試合数20未満 → 番手も頭候補に追加
  lineIds.forEach(lid => {
    if (lines[lid].length !== 3) return;
    const leader = lines[lid].find(r => r.linePos === "先行");
    if (!leader) return;
    const mc = parseInt(leader.matchCount) || 0;
    if (mc < 20) {
      const bante = lines[lid].find(r => r.linePos === "追込");
      if (bante) {
        const alreadyIn = firstCandidates.some(c => c.rider.id === bante.id);
        if (!alreadyIn) {
          firstCandidates.push({ rider:bante, reason:`3人ライン番手(先頭試合数${mc}回で少)`, priority:3 });
        }
      }
    }
  });

  // (E) 先行ライン先頭（通常候補）
  lineIds.forEach(lid => {
    const leader = lines[lid].find(r => r.linePos === "先行");
    if (!leader) return;
    const r3 = parseFloat(leader.rate3) || 0;
    const mc = parseInt(leader.matchCount) || 0;
    const alreadyIn = firstCandidates.some(c => c.rider.id === leader.id);
    if (!alreadyIn && (r3 >= 70 || mc >= 20)) {
      firstCandidates.push({ rider:leader, reason:`先行ライン先頭(3連${leader.rate3}%)`, priority:zetsuaiOja ? 3 : 2 });
    }
  });

  // (F) 単騎まくり（捲り5+勝率30+）
  for (const r of withData) {
    const makuri = parseInt(r.makuriCount) || 0;
    const win = parseFloat(r.winRate) || 0;
    if (makuri >= 5 && win >= 30 && !r.lineId) {
      const alreadyIn = firstCandidates.some(c => c.rider.id === r.id);
      if (!alreadyIn) {
        firstCandidates.push({ rider:r, reason:`単騎まくり(捲${makuri}・勝率${r.winRate}%)`, priority:3 });
      }
    }
  }

  // 優先度でソート
  firstCandidates.sort((a,b) => a.priority - b.priority);
  result.candidatesFirst = firstCandidates;

  // ─── STEP 5: 3着候補 ───
  const thirdCandidates = [];
  const addThird = (r, reason) => {
    if (!thirdCandidates.some(c => c.rider.id === r.id)) {
      thirdCandidates.push({ rider:r, reason });
    }
  };

  withData.forEach(r => {
    const kumi = parseInt(r.kumi) || 0;
    const sashi = parseInt(r.sashiCount) || 0;
    const makuri = parseInt(r.makuriCount) || 0;
    const r3 = parseFloat(r.rate3) || 0;

    // 若手120期以降 → 試合数不問で自動採用
    if (kumi >= 120) addThird(r, `若手${kumi}期`);
    // ライン番手・最後尾
    if (r.lineId && r.linePos === "追込") addThird(r, "ライン番手・最後尾");
    // 差し型上位
    if (sashi >= 3) addThird(r, `差し型(差${sashi})`);
    // 単騎まくり
    if (makuri >= 5) addThird(r, `まくり(捲${makuri})`);
    // 3連対率50%以上
    if (r3 >= 50) addThird(r, `3連${r.rate3}%`);
  });
  result.candidatesThird = thirdCandidates;

  // ─── STEP 6: 見送り判定 ───
  const smallestLineSize = Math.min(...lineIds.map(lid => lineSizes[lid]));
  const isZetsuaiLeader = zetsuaiOja && lineIds.some(lid => {
    const leader = lines[lid]?.find(r => r.linePos === "先行");
    return leader?.id === zetsuaiOja.id;
  });
  const hasYoungOpponent = withData.some(r => {
    const kumi = parseInt(r.kumi) || 0;
    return kumi >= 120 && (!zetsuaiOja || r.id !== zetsuaiOja.id);
  });
  const allLineSizeLe4 = !has5PlusLine && lineIds.every(lid => lineSizes[lid] <= 4);

  if (allLineSizeLe4 && isZetsuaiLeader && !hasYoungOpponent && prizeLevel !== "normal") {
    result.skip = true;
    result.raceWorth = false;
    result.verdict = "⛔ 見送り推奨";
    result.verdictColor = C.textMuted;
    issues.push("全条件一致（4人以下ライン + 絶対王者先頭 + 若手不在 + 低配当）→ 見送り");
    return result;
  }

  // ─── 有効選手（3連対率フィルター） ───
  withData.forEach(r => {
    const r3 = parseFloat(r.rate3);
    const kumi = parseInt(r.kumi) || 0;
    // 若手120期以降は消去しない
    if (kumi >= 120) { result.valid.push({...r}); return; }
    // 実績ゼロは消去OK
    if (r.rate3 === "" || r3 === 0) {
      result.eliminated.push({...r, reason:"実績なし（勝率・3連対率0%）"});
      return;
    }
    // ライン番手は残す
    if (r.lineId && r.linePos === "追込") { result.valid.push({...r}); return; }
    result.valid.push({...r});
  });

  // ─── 買い目生成 ───
  // 頭候補上位から3つ、3着候補から幅広く
  const topFirst = firstCandidates.slice(0, 4).map(c => c.rider);
  const thirdPool = thirdCandidates.map(c => c.rider);
  const allValid = result.valid;

  const bets = [];
  const addBet = (r1, r2, r3, betsArr) => {
    if (!r1||!r2||!r3) return;
    if (r1.number===r2.number||r1.number===r3.number||r2.number===r3.number) return;
    const key = `${r1.number}-${r2.number}-${r3.number}`;
    if (!betsArr.includes(key) && betsArr.length < 30) betsArr.push(key);
  };

  // シナリオA: 先行成功（先行先頭 - 番手 - 全員）
  lineIds.forEach(lid => {
    const leader = lines[lid]?.find(r => r.linePos === "先行");
    const bante  = lines[lid]?.find(r => r.linePos === "追込");
    if (!leader || !bante) return;
    allValid.filter(r => r.id!==leader.id && r.id!==bante.id)
      .forEach(third => addBet(leader, bante, third, bets));
    allValid.filter(r => r.id!==leader.id && r.id!==bante.id)
      .forEach(third => addBet(bante, leader, third, bets));
  });

  // シナリオB: 差し型最強が頭（差し - 各ライン先頭 - 全員）
  const dashiTop = firstCandidates.filter(c => c.reason.includes("差し型") || c.reason.includes("マーク型")).slice(0, 2);
  dashiTop.forEach(({rider:dashi}) => {
    topFirst.filter(r => r.id !== dashi.id).forEach(second => {
      thirdPool.filter(r => r.id !== dashi.id && r.id !== second.id)
        .forEach(third => addBet(dashi, second, third, bets));
    });
  });

  // シナリオC: 絶対王者 - 番手 - 全員
  if (zetsuaiOja) {
    const ojaLine = lines[zetsuaiOja.lineId];
    const ojaBante = ojaLine?.find(r => r.linePos === "追込");
    allValid.filter(r => r.id !== zetsuaiOja.id && r.id !== ojaBante?.id)
      .forEach(third => {
        addBet(zetsuaiOja, ojaBante||allValid[0], third, bets);
      });
  }

  result.bets = bets.slice(0, 15);
  if (bets.length > 15) issues.push(`買い目${bets.length}点 → 上位15点に絞り込み`);

  // 穴狙い買い目（若手・差し型を軸）
  if (anaMode) {
    const anaBets = [];
    const anaAxis = [
      ...firstCandidates.filter(c => c.reason.includes("若手")).map(c => c.rider),
      ...firstCandidates.filter(c => c.reason.includes("差し型")).map(c => c.rider),
    ].slice(0, 3);

    anaAxis.forEach(axis => {
      allValid.filter(r => r.id !== axis.id).forEach(second => {
        thirdPool.filter(r => r.id !== axis.id && r.id !== second.id)
          .slice(0, 3)
          .forEach(third => {
            const key = `${axis.number}-${second.number}-${third.number}`;
            if (!anaBets.includes(key) && anaBets.length < 20) anaBets.push(key);
          });
      });
    });
    result.anaBets = anaBets.slice(0, 10);
  }

  // ─── 判定バナー ───
  if (has5PlusLine) {
    result.verdict = "🔥 5人ライン崩壊狙い → 買い（穴出やすい）";
    result.verdictColor = C.orange;
  } else if (zetsuaiOja && raceType === "finals") {
    result.verdict = "👑 絶対王者×決勝 → 本命線厚め";
    result.verdictColor = C.gold;
  } else if (dashiTop.length > 0) {
    result.verdict = "⚡ 差し型最強パターン → 中穴狙い推奨";
    result.verdictColor = C.purple;
  } else {
    result.verdict = "✅ このレースは買い";
    result.verdictColor = C.green;
  }

  return result;
}

function checkHit(bets, anaBets, r1, r2, r3) {
  const key = `${r1}-${r2}-${r3}`;
  const normalHit = bets.includes(key);
  const anaHit = anaBets.includes(key);
  return { hit:normalHit||anaHit, normalHit, anaHit, key };
}

// ─── RiderRow ─────────────────────────────────────────────
function RiderRow({rider, onChange, onRemove, lineColor}) {
  const upd = f => e => onChange({...rider, [f]: e.target.value});
  const ni = (extra={}) => ({...inp(extra), fontSize:"11px", padding:"4px 5px"});

  return (
    <div style={{
      display:"grid",
      gridTemplateColumns:"28px 90px 54px 44px 44px 44px 44px 36px 36px 36px 36px 36px 40px 76px 24px",
      gap:"3px", alignItems:"center", padding:"6px 8px",
      background: lineColor ? lineColor.bg : "#050810",
      borderLeft: `3px solid ${lineColor ? lineColor.border : C.border}`,
      borderRadius:"6px", marginBottom:"4px",
    }}>
      <input value={rider.number} onChange={upd("number")} placeholder="#"
        style={ni({textAlign:"center", fontWeight:"800", color:C.gold})}/>
      <input value={rider.name} onChange={upd("name")} placeholder="選手名" style={ni({})}/>
      <input value={rider.pref} onChange={upd("pref")} placeholder="府県" style={ni({})}/>
      <input value={rider.winRate} onChange={upd("winRate")} placeholder="勝率%" type="number" style={ni({textAlign:"center"})}/>
      <input value={rider.rate3} onChange={upd("rate3")} placeholder="3連%" type="number" style={ni({textAlign:"center"})}/>
      <input value={rider.matchCount} onChange={upd("matchCount")} placeholder="試合" type="number" style={ni({textAlign:"center"})}/>
      <input value={rider.kumi} onChange={upd("kumi")} placeholder="期" type="number" style={ni({textAlign:"center"})}/>
      <input value={rider.bCount} onChange={upd("bCount")} placeholder="B" type="number" style={ni({textAlign:"center"})}/>
      <input value={rider.nigeCount} onChange={upd("nigeCount")} placeholder="逃" type="number" style={ni({textAlign:"center"})}/>
      <input value={rider.makuriCount} onChange={upd("makuriCount")} placeholder="捲" type="number" style={ni({textAlign:"center"})}/>
      <input value={rider.sashiCount} onChange={upd("sashiCount")} placeholder="差" type="number" style={ni({textAlign:"center"})}/>
      <input value={rider.maCount} onChange={upd("maCount")} placeholder="マ" type="number" style={ni({textAlign:"center"})}/>
      <select value={rider.lineId} onChange={upd("lineId")} style={{...sel(), fontSize:"10px"}}>
        <option value="">なし</option>
        {LINE_IDS.map(id=><option key={id} value={id}>{id}</option>)}
      </select>
      <select value={rider.linePos} onChange={upd("linePos")} style={sel()}>
        <option value="先行">先行</option>
        <option value="追込">追込</option>
      </select>
      <button onClick={onRemove} style={{
        background:"transparent", border:`1px solid #2a1010`, borderRadius:"4px",
        color:C.red, cursor:"pointer", fontSize:"10px", width:"24px", height:"24px",
      }}>✕</button>
    </div>
  );
}

// ─── ImportModal ──────────────────────────────────────────
function ImportModal({onImport, onClose}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  const handlePaste = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      setText(clip); setError("");
    } catch { setError("テキストを直接貼り付けてください。"); }
  };

  const handleImport = () => {
    try {
      const json = JSON.parse(text.trim());
      if (!json.__keirinScout) { setError("KEIRIN SCOUT拡張機能からコピーされたデータではありません。"); return; }
      onImport(json);
    } catch { setError("データの形式が正しくありません。"); }
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",display:"flex",
      alignItems:"center",justifyContent:"center",zIndex:1000,padding:"20px"}}>
      <div style={{...cardSt(),width:"100%",maxWidth:"460px"}}>
        <div style={{fontSize:"15px",fontWeight:"800",color:C.teal,marginBottom:"12px"}}>📥 出走表インポート</div>
        <div style={{...cardSt({background:"#030608",marginBottom:"12px"})}}>
          <div style={secLbl()}>使い方</div>
          {["KEIRIN.jp または Gamboo の出走表ページを開く",
            "ブラウザ右上の 🚴 KEIRIN SCOUT 拡張機能アイコンをクリック",
            "「データをコピーしてアプリへ」ボタンを押す",
            "下の「クリップボードから貼り付け」を押す",
          ].map((s,i)=>(
            <div key={i} style={{display:"flex",gap:"8px",alignItems:"flex-start",marginBottom:"6px"}}>
              <span style={{width:"16px",height:"16px",borderRadius:"50%",
                background:`linear-gradient(135deg,${C.teal},#16a085)`,
                color:"#050d10",fontSize:"9px",fontWeight:"900",
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
              }}>{i+1}</span>
              <span style={{fontSize:"11px",color:C.textMuted,lineHeight:"1.5"}}>{s}</span>
            </div>
          ))}
        </div>
        <button onClick={handlePaste} style={btnSt(`linear-gradient(135deg,${C.teal},#16a085)`,"#050d10",{width:"100%",marginBottom:"8px",fontWeight:"800"})}>
          📋 クリップボードから貼り付け
        </button>
        {text && <div style={{padding:"6px 8px",background:"#030608",border:`1px solid ${C.border}`,borderRadius:"6px",fontSize:"10px",color:C.textMuted,marginBottom:"8px",wordBreak:"break-all",maxHeight:"50px",overflow:"hidden"}}>{text.substring(0,100)}…</div>}
        {error && <div style={{padding:"7px 10px",background:"#2a0a0a",border:`1px solid ${C.red}`,borderRadius:"6px",fontSize:"11px",color:C.red,marginBottom:"8px"}}>{error}</div>}
        <div style={{display:"flex",gap:"8px"}}>
          <button onClick={handleImport} disabled={!text}
            style={btnSt(text?C.gold:"#1a2030",text?"#080d18":C.textDim,{flex:1,fontWeight:"800",opacity:text?1:0.5})}>
            インポートする
          </button>
          <button onClick={onClose} style={btnSt("transparent",C.textMuted,{border:`1px solid ${C.border}`})}>閉じる</button>
        </div>
      </div>
    </div>
  );
}

// ─── HitCheckModal ────────────────────────────────────────
function HitCheckModal({entry, onClose, onUpdateEntry}) {
  const [r1,setR1]=useState(entry.actualResult?.r1||"");
  const [r2,setR2]=useState(entry.actualResult?.r2||"");
  const [r3,setR3]=useState(entry.actualResult?.r3||"");
  const [retAmt,setRetAmt]=useState(entry.returnAmount>0?String(entry.returnAmount):"");
  const bets=entry.bets||[]; const anaBets=entry.anaBets||[];
  const cr=(r1&&r2&&r3)?checkHit(bets,anaBets,r1,r2,r3):null;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:"20px"}}>
      <div style={{...cardSt(),width:"100%",maxWidth:"440px"}}>
        <div style={{fontSize:"15px",fontWeight:"800",color:C.teal,marginBottom:"4px"}}>🔍 的中チェック</div>
        <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"14px"}}>{entry.raceTitle||"無題レース"}</div>
        <div style={cardSt({background:"#030608",marginBottom:"12px"})}>
          <div style={secLbl()}>実際のレース結果（3連単）</div>
          <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
            {[["1着",r1,setR1],["2着",r2,setR2],["3着",r3,setR3]].map(([label,val,setVal],i)=>(
              <div key={i} style={{flex:1,textAlign:"center"}}>
                <div style={{fontSize:"9px",color:C.textMuted,marginBottom:"4px"}}>{label}</div>
                <input value={val} onChange={e=>setVal(e.target.value)} placeholder="車番" type="number"
                  style={inp({textAlign:"center",fontSize:"20px",fontWeight:"900",color:C.gold,padding:"8px"})}/>
              </div>
            ))}
          </div>
        </div>
        {cr&&(
          <div style={{padding:"12px 14px",borderRadius:"9px",marginBottom:"12px",animation:"fadeIn 0.3s ease",
            background:cr.hit?(cr.anaHit&&!cr.normalHit?"#180a28":"#0a2a1a"):"#2a0a0a",
            border:`1.5px solid ${cr.hit?(cr.anaHit&&!cr.normalHit?C.purple:C.green):C.red}`}}>
            <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
              <span style={{fontSize:"24px"}}>{cr.hit?(cr.anaHit&&!cr.normalHit?"🎰":"🎯"):"😞"}</span>
              <div>
                <div style={{fontWeight:"800",fontSize:"15px",color:cr.hit?(cr.anaHit&&!cr.normalHit?C.purple:C.green):C.red}}>
                  {cr.hit?(cr.anaHit&&!cr.normalHit?"穴狙い買い目で的中！":"推奨買い目で的中！"):"買い目に含まれていません"}
                </div>
                <div style={{fontSize:"11px",color:C.textMuted,marginTop:"2px"}}>結果：{r1}−{r2}−{r3}</div>
              </div>
            </div>
          </div>
        )}
        {bets.length>0&&(
          <div style={{marginBottom:"10px"}}>
            <div style={secLbl()}>買い目一覧</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:"5px"}}>
              {bets.map((b,i)=>{const isMatch=cr&&b===cr.key;return(
                <div key={i} style={{padding:"5px 9px",borderRadius:"6px",fontSize:"12px",fontWeight:"800",
                  fontVariantNumeric:"tabular-nums",
                  background:isMatch?"#0a3020":"#0d1a30",
                  border:`1.5px solid ${isMatch?C.green:C.goldDim}`,
                  color:isMatch?C.green:C.gold,
                  transform:isMatch?"scale(1.08)":"scale(1)",
                  boxShadow:isMatch?`0 0 10px rgba(46,204,113,0.4)`:"none",
                }}>{b}</div>
              );})}
            </div>
          </div>
        )}
        {cr?.hit&&(
          <div style={{marginBottom:"12px"}}>
            <div style={secLbl()}>払戻額（円）</div>
            <input value={retAmt} onChange={e=>setRetAmt(e.target.value)} type="number" placeholder="例：25000" style={inp({})}/>
          </div>
        )}
        <div style={{display:"flex",gap:"8px"}}>
          <button onClick={()=>onUpdateEntry({...entry,actualResult:{r1,r2,r3},
            hit:cr?.hit||false,normalHit:cr?.normalHit||false,anaHit:cr?.anaHit||false,
            skip:false,returnAmount:parseInt(retAmt)||0,
          })} style={btnSt(`linear-gradient(135deg,${C.teal},#16a085)`,"#050d10",{flex:1,fontWeight:"800"})}>
            結果を保存
          </button>
          <button onClick={onClose} style={btnSt("transparent",C.textMuted,{border:`1px solid ${C.border}`})}>閉じる</button>
        </div>
      </div>
    </div>
  );
}

// ─── SaveModal ────────────────────────────────────────────
function SaveModal({result,raceTitle,onSave,onClose}){
  const [hit,setHit]=useState(false);
  const [skip,setSkip]=useState(!result.raceWorth);
  const [betAmt,setBetAmt]=useState("");
  const [retAmt,setRetAmt]=useState("");
  const [memo,setMemo]=useState("");
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:"20px"}}>
      <div style={{...cardSt(),width:"100%",maxWidth:"400px",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{fontSize:"15px",fontWeight:"800",color:C.gold,marginBottom:"14px"}}>📋 レースを記録する</div>
        <div style={{marginBottom:"12px"}}>
          <div style={secLbl()}>結果</div>
          <div style={{display:"flex",gap:"6px"}}>
            {[{label:"✅ 的中",v:"hit"},{label:"❌ ハズレ",v:"miss"},{label:"⏭ 見送り",v:"skip"}].map(opt=>{
              const active=opt.v==="hit"?hit:opt.v==="skip"?skip:!hit&&!skip;
              const col=opt.v==="hit"?C.green:opt.v==="skip"?C.textMuted:C.red;
              return(<button key={opt.v} onClick={()=>{setHit(opt.v==="hit");setSkip(opt.v==="skip");}} style={{
                flex:1,padding:"7px 0",borderRadius:"6px",fontSize:"11px",fontWeight:"700",cursor:"pointer",fontFamily:"inherit",
                background:active?(opt.v==="hit"?"#0d3b2a":opt.v==="skip"?"#1a1a2a":"#3b0d0d"):"transparent",
                border:`1.5px solid ${active?col:C.border}`,color:active?col:C.textMuted,
              }}>{opt.label}</button>);
            })}
          </div>
        </div>
        {!skip&&<>
          <div style={{marginBottom:"10px"}}>
            <label style={{...secLbl(),display:"block"}}>投資額（円）</label>
            <input value={betAmt} onChange={e=>setBetAmt(e.target.value)} type="number" placeholder="例：3000" style={inp({})}/>
          </div>
          {hit&&<div style={{marginBottom:"10px"}}>
            <label style={{...secLbl(),display:"block"}}>払戻額（円）</label>
            <input value={retAmt} onChange={e=>setRetAmt(e.target.value)} type="number" placeholder="例：18000" style={inp({})}/>
          </div>}
        </>}
        <div style={{marginBottom:"14px"}}>
          <label style={{...secLbl(),display:"block"}}>メモ</label>
          <input value={memo} onChange={e=>setMemo(e.target.value)} placeholder="気づきを記録…" style={inp({})}/>
        </div>
        <div style={{display:"flex",gap:"8px"}}>
          <button onClick={()=>onSave({
            id:Date.now(),date:new Date().toLocaleDateString("ja-JP"),
            raceTitle,hit,skip,betAmount:parseInt(betAmt)||0,returnAmount:parseInt(retAmt)||0,
            memo,bets:result.bets||[],anaBets:result.anaBets||[],anaMode:result.anaMode,actualResult:null,
          })} style={btnSt(`linear-gradient(135deg,${C.gold},#e07b00)`,"#080d18",{flex:1,fontWeight:"800"})}>
            保存する
          </button>
          <button onClick={onClose} style={btnSt("transparent",C.textMuted,{border:`1px solid ${C.border}`})}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}

// ─── HistoryPanel ─────────────────────────────────────────
function HistoryPanel({history,onDelete,onUpdate}){
  const [checkTarget,setCheckTarget]=useState(null);
  const decided=history.filter(h=>!h.skip);
  const hits=history.filter(h=>h.hit).length;
  const totalBet=history.reduce((s,h)=>s+(h.betAmount||0),0);
  const totalRet=history.reduce((s,h)=>s+(h.returnAmount||0),0);
  const roi=totalBet>0?(((totalRet-totalBet)/totalBet)*100).toFixed(1):null;
  const pending=history.filter(h=>!h.skip&&h.actualResult===null).length;
  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"8px",marginBottom:"14px"}}>
        {[
          {label:"総レース数",value:history.length,color:C.blue},
          {label:"的中回数",value:`${hits}回`,color:C.green},
          {label:"的中率",value:decided.length>0?`${((hits/decided.length)*100).toFixed(0)}%`:"—",color:C.gold},
          {label:"収支率",value:roi!==null?`${parseFloat(roi)>0?"+":""}${roi}%`:"—",
            color:roi===null?C.textMuted:parseFloat(roi)>0?C.green:C.red},
        ].map(s=>(<div key={s.label} style={cardSt({marginBottom:0,padding:"12px 10px",textAlign:"center"})}>
          <div style={{fontSize:"20px",fontWeight:"800",color:s.color}}>{s.value}</div>
          <div style={{fontSize:"9px",color:C.textMuted,marginTop:"3px"}}>{s.label}</div>
        </div>))}
      </div>
      {pending>0&&(<div style={{padding:"9px 14px",marginBottom:"12px",borderRadius:"8px",
        background:"#0d1a10",border:`1px solid ${C.teal}`,display:"flex",alignItems:"center",gap:"8px"}}>
        <span style={{fontSize:"16px"}}>🔍</span>
        <span style={{fontSize:"12px",color:C.teal,fontWeight:"700"}}>結果未入力のレースが{pending}件あります。</span>
      </div>)}
      {history.length===0&&(<div style={cardSt({textAlign:"center",color:C.textMuted,padding:"40px 20px"})}>
        まだ記録がありません。<br/><span style={{fontSize:"11px",color:C.textDim}}>レース分析後に「記録に追加 →」で保存できます</span>
      </div>)}
      {history.map(h=>{
        const col=h.hit?C.green:h.skip?C.textDim:h.actualResult===null?C.orange:C.red;
        const statusLabel=h.skip?"⏭ 見送り":h.actualResult===null?"⏳ 未照合":h.hit?"✅ 的中":"❌ ハズレ";
        return(<div key={h.id} style={cardSt({borderLeft:`4px solid ${col}`,marginBottom:"8px"})}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"5px",flexWrap:"wrap"}}>
                <span style={{padding:"2px 8px",borderRadius:"20px",fontSize:"10px",fontWeight:"700",
                  background:h.hit?"#0d3b2a":h.skip?"#1a1a2a":h.actualResult===null?"#201000":"#3b0d0d",
                  color:col,border:`1px solid ${col}`}}>{statusLabel}</span>
                {h.anaMode&&<span style={{...tag("#200d30",C.purple)}}>穴狙い</span>}
                <span style={{fontSize:"10px",color:C.textMuted}}>{h.date}</span>
              </div>
              <div style={{fontSize:"14px",fontWeight:"700",color:C.textPrimary,marginBottom:"3px"}}>{h.raceTitle||"無題レース"}</div>
              {h.actualResult&&(<div style={{fontSize:"11px",color:C.textMuted,marginBottom:"2px"}}>
                実際の結果：<span style={{color:C.gold,fontWeight:"700",marginLeft:"3px"}}>{h.actualResult.r1}−{h.actualResult.r2}−{h.actualResult.r3}</span>
              </div>)}
              {h.betAmount>0&&(<div style={{fontSize:"11px",color:C.textMuted}}>
                投資 {h.betAmount.toLocaleString()}円
                {h.returnAmount>0&&<span style={{color:h.returnAmount>h.betAmount?C.green:C.red,marginLeft:"6px"}}>
                  → 払戻 {h.returnAmount.toLocaleString()}円（{h.returnAmount>h.betAmount?"+":""}{(h.returnAmount-h.betAmount).toLocaleString()}円）
                </span>}
              </div>)}
              {h.bets&&h.bets.length>0&&(<div style={{display:"flex",flexWrap:"wrap",gap:"4px",marginTop:"6px"}}>
                {h.bets.slice(0,6).map((b,bi)=>{
                  const isActual=h.actualResult&&`${h.actualResult.r1}-${h.actualResult.r2}-${h.actualResult.r3}`===b;
                  return(<span key={bi} style={{padding:"2px 7px",borderRadius:"4px",fontSize:"11px",fontWeight:"700",
                    background:isActual?"#0a3020":"#0d1a30",color:isActual?C.green:C.gold,border:`1px solid ${isActual?C.green:C.goldDim}`}}>{b}</span>);
                })}
                {h.bets.length>6&&<span style={{fontSize:"10px",color:C.textMuted,padding:"2px 0"}}>…他{h.bets.length-6}点</span>}
              </div>)}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:"5px",alignItems:"flex-end",marginLeft:"8px"}}>
              {!h.skip&&(<button onClick={()=>setCheckTarget(h)} style={btnSt(
                h.actualResult===null?"#0a2028":C.card,
                h.actualResult===null?C.teal:C.textMuted,
                {fontSize:"10px",padding:"4px 9px",border:`1px solid ${h.actualResult===null?C.teal:C.border}`}
              )}>{h.actualResult===null?"🔍 的中チェック":"🔄 再チェック"}</button>)}
              <button onClick={()=>onDelete(h.id)} style={{background:"transparent",border:"none",color:C.textDim,cursor:"pointer",fontSize:"13px",padding:"3px 6px"}}>🗑</button>
            </div>
          </div>
        </div>);
      })}
      {checkTarget&&(<HitCheckModal entry={checkTarget} onClose={()=>setCheckTarget(null)}
        onUpdateEntry={updated=>{onUpdate(updated);setCheckTarget(null);}}/>)}
    </div>
  );
}

// ─── 精度分析 ─────────────────────────────────────────────
function AccuracyPanel({history}){
  const decided=history.filter(h=>!h.skip&&h.actualResult!==null);
  if(decided.length===0){return(<div style={cardSt({textAlign:"center",color:C.textMuted,padding:"40px 20px"})}>
    まだ照合済みのレースがありません。<br/><span style={{fontSize:"11px",color:C.textDim}}>「的中チェック」を実行するとここに精度データが蓄積されます。</span>
  </div>);}
  const total=decided.length;
  const hits=decided.filter(h=>h.hit).length;
  const normalHits=decided.filter(h=>h.normalHit).length;
  const anaHits=decided.filter(h=>h.anaHit&&!h.normalHit).length;
  const totalBet=decided.reduce((s,h)=>s+(h.betAmount||0),0);
  const totalRet=decided.reduce((s,h)=>s+(h.returnAmount||0),0);
  const roi=totalBet>0?(((totalRet-totalBet)/totalBet)*100).toFixed(1):null;
  const byMonth={};
  decided.forEach(h=>{
    const m=h.date?h.date.substring(0,7):"不明";
    if(!byMonth[m])byMonth[m]={total:0,hits:0,bet:0,ret:0};
    byMonth[m].total++;if(h.hit)byMonth[m].hits++;
    byMonth[m].bet+=h.betAmount||0;byMonth[m].ret+=h.returnAmount||0;
  });
  const months=Object.entries(byMonth).sort((a,b)=>a[0]<b[0]?1:-1);
  const Bar=({label,value,max,color})=>{
    const pct=max>0?(value/max)*100:0;
    return(<div style={{marginBottom:"8px"}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:"3px"}}>
        <span style={{fontSize:"11px",color:C.textMuted}}>{label}</span>
        <span style={{fontSize:"11px",fontWeight:"700",color}}>{value}</span>
      </div>
      <div style={{height:"5px",background:C.textDim,borderRadius:"3px",overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:"3px",transition:"width 0.5s ease"}}/>
      </div>
    </div>);
  };
  return(<div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"8px",marginBottom:"14px"}}>
      {[
        {label:"照合済みレース",value:total,color:C.blue,sub:"件"},
        {label:"通常買い目的中率",value:`${((normalHits/total)*100).toFixed(0)}%`,color:C.green,sub:`${normalHits}/${total}回`},
        {label:"穴狙い追加的中",value:anaHits,color:C.purple,sub:"回"},
      ].map(s=>(<div key={s.label} style={cardSt({marginBottom:0,padding:"12px 10px",textAlign:"center"})}>
        <div style={{fontSize:"22px",fontWeight:"900",color:s.color}}>{s.value}</div>
        <div style={{fontSize:"9px",color:C.textMuted,marginTop:"2px"}}>{s.label}</div>
        <div style={{fontSize:"9px",color:C.textDim,marginTop:"1px"}}>{s.sub}</div>
      </div>))}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px",marginBottom:"12px"}}>
      <div style={cardSt()}>
        <div style={secLbl()}>的中内訳</div>
        <Bar label="通常買い目的中" value={normalHits} max={total} color={C.green}/>
        <Bar label="穴狙い的中" value={anaHits} max={total} color={C.purple}/>
        <Bar label="ハズレ" value={total-hits} max={total} color={C.red}/>
        <div style={{marginTop:"10px",padding:"8px",background:"#030608",borderRadius:"7px",textAlign:"center"}}>
          <div style={{fontSize:"10px",color:C.textMuted,marginBottom:"2px"}}>総合的中率</div>
          <div style={{fontSize:"24px",fontWeight:"900",color:hits/total>=0.3?C.green:C.orange}}>
            {((hits/total)*100).toFixed(0)}%
          </div>
        </div>
      </div>
      <div style={cardSt()}>
        <div style={secLbl()}>収支</div>
        {[
          {label:"総投資額",value:`${totalBet.toLocaleString()}円`,color:C.textPrimary},
          {label:"総払戻額",value:`${totalRet.toLocaleString()}円`,color:totalRet>totalBet?C.green:C.red},
          {label:"損益",value:`${totalRet-totalBet>=0?"+":""}${(totalRet-totalBet).toLocaleString()}円`,color:totalRet-totalBet>=0?C.green:C.red},
        ].map(s=>(<div key={s.label} style={{display:"flex",justifyContent:"space-between",
          padding:"6px 8px",background:"#030608",borderRadius:"6px",marginBottom:"5px"}}>
          <span style={{fontSize:"11px",color:C.textMuted}}>{s.label}</span>
          <span style={{fontSize:"12px",fontWeight:"700",color:s.color}}>{s.value}</span>
        </div>))}
        {roi!==null&&(<div style={{padding:"8px",borderRadius:"7px",textAlign:"center",
          background:parseFloat(roi)>0?"#0a2a1a":"#2a0a0a",border:`1px solid ${parseFloat(roi)>0?C.green:C.red}`}}>
          <div style={{fontSize:"10px",color:C.textMuted,marginBottom:"2px"}}>回収率</div>
          <div style={{fontSize:"22px",fontWeight:"900",color:parseFloat(roi)>0?C.green:C.red}}>
            {parseFloat(roi)>0?"+":""}{roi}%
          </div>
        </div>)}
      </div>
    </div>
    {months.length>0&&(<div style={cardSt()}>
      <div style={secLbl()}>月別成績</div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:"11px"}}>
          <thead><tr>{["月","レース","的中","的中率","投資","払戻","損益"].map(h=>(
            <th key={h} style={{padding:"6px 8px",color:C.textMuted,fontWeight:"600",
              textAlign:"right",borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>{h}</th>
          ))}</tr></thead>
          <tbody>{months.map(([m,d])=>{
            const hr=d.total>0?((d.hits/d.total)*100).toFixed(0):0;
            const pl=d.ret-d.bet;
            return(<tr key={m} style={{borderBottom:`1px solid ${C.textDim}`}}>
              <td style={{padding:"7px 8px",color:C.textPrimary,fontWeight:"700"}}>{m}</td>
              <td style={{padding:"7px 8px",color:C.textMuted,textAlign:"right"}}>{d.total}</td>
              <td style={{padding:"7px 8px",color:C.green,textAlign:"right",fontWeight:"700"}}>{d.hits}</td>
              <td style={{padding:"7px 8px",textAlign:"right",fontWeight:"700",color:parseInt(hr)>=30?C.green:C.orange}}>{hr}%</td>
              <td style={{padding:"7px 8px",color:C.textMuted,textAlign:"right"}}>{d.bet.toLocaleString()}</td>
              <td style={{padding:"7px 8px",color:d.ret>d.bet?C.green:C.red,textAlign:"right"}}>{d.ret.toLocaleString()}</td>
              <td style={{padding:"7px 8px",fontWeight:"700",textAlign:"right",color:pl>=0?C.green:C.red}}>{pl>=0?"+":""}{pl.toLocaleString()}</td>
            </tr>);
          })}</tbody>
        </table>
      </div>
    </div>)}
    <div style={cardSt({background:"#030e0a",border:`1px solid #1a3020`})}>
      <div style={secLbl(C.teal)}>📈 精度向上のヒント</div>
      <div style={{fontSize:"11px",color:C.textMuted,lineHeight:"2"}}>
        {hits/total>=0.35?<span style={{color:C.green}}>✅ 的中率35%以上を維持中。現在のロジックは適切です。</span>
          :<span style={{color:C.orange}}>⚠ 的中率が低め。差し型・若手候補の見逃しがないか確認を。</span>}
        <br/>
        {anaHits>0?<span style={{color:C.purple}}>🎰 穴狙い買い目が{anaHits}回追加的中しています。</span>
          :<span>穴狙い実績がまだありません。</span>}
        <br/>
        <span style={{color:C.textDim}}>※ 目標：3,000〜10,000円の中穴帯を安定して取ること（現在{total}件蓄積）</span>
      </div>
    </div>
  </div>);
}

// ─── メイン ───────────────────────────────────────────────
export default function App() {
  const [tab,setTab]             = useState(0);
  const [riders,setRiders]       = useState(makeDefaultRiders());
  const [prizeLevel,setPrizeLevel] = useState("normal"); // normal/finals/a3
  const [anaMode,setAnaMode]     = useState(false);
  const [raceTitle,setRaceTitle] = useState("");
  const [result,setResult]       = useState(null);
  const [history,setHistory]     = useState([]);
  const [showSave,setShowSave]   = useState(false);
  const [showImport,setShowImport] = useState(false);
  const [importMsg,setImportMsg] = useState("");

  const updateRider = useCallback(u => setRiders(p => p.map(r => r.id===u.id?u:r)), []);
  const removeRider = useCallback(id => setRiders(p => p.filter(r => r.id!==id)), []);
  const addRider    = () => setRiders(p => [...p, makeRider(p.length+1)]);
  const reset       = () => { setResult(null); setRiders(makeDefaultRiders()); setRaceTitle(""); setImportMsg(""); };
  const getLC       = id => { const i=LINE_IDS.indexOf(id); return i>=0?LINE_COLORS[i]:null; };
  const runAnalysis = () => setResult(analyze(riders, prizeLevel, anaMode));
  const handleSave  = entry => { setHistory(p=>[entry,...p]); setShowSave(false); };
  const handleUpdate= updated => setHistory(p => p.map(h => h.id===updated.id?updated:h));
  const pending     = history.filter(h=>!h.skip&&h.actualResult===null).length;

  const handleImport = json => {
    const newRiders = json.riders.map((r,i) => ({
      ...makeRider(r.number||i+1), ...r, id:Date.now()+Math.random(),
    }));
    setRiders(newRiders);
    if (json.raceTitle) setRaceTitle(json.raceTitle);
    setResult(null);
    setImportMsg(`✅ ${json.riders.length}名をインポートしました。勝率・差し回数・期別などを補完してください。`);
    setShowImport(false);
  };

  const colHeaders = ["#","選手名","府県","勝率%","3連%","試合","期","B","逃","捲","差","マ","ライン","位置",""];

  return (
    <div style={{fontFamily:"'Noto Sans JP',sans-serif",minHeight:"100vh",background:C.bg,color:C.textPrimary}}>

      {/* Header */}
      <div style={{
        background:"linear-gradient(180deg,#090f1e 0%,#07090f 100%)",
        borderBottom:`1px solid ${C.border}`,
        padding:"13px 18px", display:"flex", alignItems:"center", gap:"12px",
      }}>
        <div style={{
          width:"38px", height:"38px",
          background:`linear-gradient(135deg,${C.gold},#c06800)`,
          borderRadius:"9px", display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:"19px", boxShadow:`0 3px 12px rgba(240,180,40,0.3)`, flexShrink:0,
        }}>🚴</div>
        <div>
          <div style={{fontSize:"17px",fontWeight:"900",color:C.gold,letterSpacing:"0.06em"}}>KEIRIN SCOUT</div>
          <div style={{fontSize:"9px",color:C.textMuted,marginTop:"1px",letterSpacing:"0.1em"}}>競輪予想 完全統合版 v2.0</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:"3px"}}>
          {TABS.map((t,i)=>(
            <button key={i} onClick={()=>setTab(i)} style={{
              padding:"6px 11px",borderRadius:"6px",fontSize:"11px",fontWeight:"700",
              cursor:"pointer",fontFamily:"inherit",position:"relative",
              background:tab===i?C.gold:"transparent",
              color:tab===i?"#070910":C.textMuted,
              border:tab===i?"none":`1px solid ${C.border}`,
            }}>
              {t}
              {i===1&&pending>0&&(<span style={{
                position:"absolute",top:"-4px",right:"-4px",
                width:"13px",height:"13px",borderRadius:"50%",
                background:C.orange,color:"#fff",fontSize:"8px",fontWeight:"900",
                display:"flex",alignItems:"center",justifyContent:"center",
              }}>{pending}</span>)}
            </button>
          ))}
        </div>
      </div>

      <div style={{padding:"16px 18px",maxWidth:"1100px",margin:"0 auto"}}>

        {/* ── TAB 0: レース入力 ── */}
        {tab===0&&<>
          {/* レース設定 */}
          <div style={cardSt()}>
            <div style={secLbl()}>レース設定</div>
            <div style={{display:"flex",gap:"10px",flexWrap:"wrap",alignItems:"flex-end"}}>
              <div style={{flex:"3",minWidth:"200px"}}>
                <label style={{...secLbl(),display:"block"}}>レース名</label>
                <input value={raceTitle} onChange={e=>setRaceTitle(e.target.value)}
                  placeholder="例：川崎 第8R S級選抜" style={inp({})}/>
              </div>
              <div style={{minWidth:"160px"}}>
                <label style={{...secLbl(),display:"block"}}>賞金レベル</label>
                <select value={prizeLevel} onChange={e=>setPrizeLevel(e.target.value)} style={sel()}>
                  <option value="normal">予選級（10万円以下）</option>
                  <option value="finals">決勝級（20万円以上）</option>
                  <option value="a3">A3チャレンジ予選</option>
                </select>
              </div>
              <button onClick={()=>setAnaMode(v=>!v)} style={{
                padding:"7px 14px",borderRadius:"7px",fontSize:"12px",fontWeight:"700",
                cursor:"pointer",fontFamily:"inherit",
                background:anaMode?"#200d30":"transparent",
                color:anaMode?C.purple:C.textMuted,
                border:`1.5px solid ${anaMode?C.purple:C.border}`,
                display:"flex",alignItems:"center",gap:"5px",
              }}><span>🎰</span><span>穴狙い {anaMode?"ON":"OFF"}</span></button>
            </div>

            {/* 拡張機能インポートバナー */}
            <div style={{
              marginTop:"12px",padding:"9px 12px",
              background:"linear-gradient(135deg,#040c18,#081220)",
              border:`1px solid ${C.teal}`,borderRadius:"8px",
              display:"flex",alignItems:"center",justifyContent:"space-between",gap:"10px",
            }}>
              <div>
                <div style={{fontSize:"11px",fontWeight:"700",color:C.teal,marginBottom:"1px"}}>📥 Chrome拡張機能と連携</div>
                <div style={{fontSize:"9px",color:C.textMuted}}>KEIRIN.jp / Gamboo の出走表を1クリックで自動入力</div>
              </div>
              <button onClick={()=>setShowImport(true)} style={btnSt(
                `linear-gradient(135deg,${C.teal},#16a085)`,"#050d10",
                {fontSize:"11px",fontWeight:"800",padding:"6px 12px",whiteSpace:"nowrap",flexShrink:0}
              )}>貼り付けインポート</button>
            </div>
            {importMsg&&(<div style={{marginTop:"8px",padding:"7px 10px",background:"#0a2a1a",
              border:`1px solid ${C.green}`,borderRadius:"6px",fontSize:"11px",color:C.green}}>{importMsg}</div>)}
          </div>

          {/* 列ヘッダー */}
          <div style={{
            display:"grid",
            gridTemplateColumns:"28px 90px 54px 44px 44px 44px 44px 36px 36px 36px 36px 36px 40px 76px 24px",
            gap:"3px",padding:"3px 8px",marginBottom:"2px",
          }}>
            {colHeaders.map((h,i)=>(
              <div key={i} style={{fontSize:"9px",color:C.textDim,textAlign:"center"}}>{h}</div>
            ))}
          </div>

          {riders.map(r=>(
            <RiderRow key={r.id} rider={r} onChange={updateRider} onRemove={()=>removeRider(r.id)} lineColor={getLC(r.lineId)}/>
          ))}

          {/* ライン凡例 */}
          <div style={{display:"flex",gap:"5px",flexWrap:"wrap",marginTop:"7px",marginBottom:"12px"}}>
            {LINE_COLORS.map((lc,i)=>(
              <div key={i} style={{padding:"2px 9px",background:lc.bg,border:`1px solid ${lc.border}`,
                borderRadius:"20px",fontSize:"9px",color:lc.text,fontWeight:"700"}}>{lc.label}</div>
            ))}
          </div>

          {/* ボタン */}
          <div style={{display:"flex",gap:"7px",marginBottom:"20px",flexWrap:"wrap"}}>
            <button onClick={addRider} style={btnSt(C.card,C.textMuted,{border:`1px solid ${C.border}`})}>＋ 選手追加</button>
            <button onClick={runAnalysis} style={btnSt(`linear-gradient(135deg,${C.gold},#c06800)`,"#070910",{
              fontWeight:"900",boxShadow:`0 3px 14px rgba(240,180,40,0.25)`})}>🔍 分析する</button>
            <button onClick={reset} style={btnSt("transparent",C.textDim,{border:`1px solid #151f30`})}>リセット</button>
          </div>

          {/* ── 分析結果 ── */}
          {result&&(
            <div style={{animation:"fadeIn 0.3s ease"}}>

              {/* 判定バナー */}
              <div style={{
                padding:"13px 16px",borderRadius:"10px",marginBottom:"12px",
                background:result.raceWorth?"linear-gradient(135deg,#081a10,#0a2518)":"linear-gradient(135deg,#180808,#200a0a)",
                border:`1.5px solid ${result.verdictColor}`,
                display:"flex",alignItems:"center",justifyContent:"space-between",
              }}>
                <div>
                  <div style={{fontWeight:"800",fontSize:"15px",color:result.verdictColor}}>{result.verdict}</div>
                  <div style={{fontSize:"10px",color:C.textMuted,marginTop:"2px"}}>
                    {raceTitle||"無題レース"} ／ {prizeLevel==="finals"?"決勝級":prizeLevel==="a3"?"A3予選":"予選級"}
                    {result.anaMode&&<span style={{color:C.purple,marginLeft:"6px"}}>穴狙いモード</span>}
                  </div>
                </div>
                {result.raceWorth&&(
                  <button onClick={()=>setShowSave(true)} style={btnSt(C.gold,"#070910",{fontSize:"11px",fontWeight:"800",padding:"6px 12px"})}>
                    記録に追加 →
                  </button>
                )}
              </div>

              {/* 警告・注意 */}
              {result.warnings.length>0&&(
                <div style={cardSt({background:"#0d0a02",border:`1px solid #3a2800`,marginBottom:"12px"})}>
                  <div style={secLbl()}>判定メモ</div>
                  {result.warnings.map((w,i)=>(
                    <div key={i} style={{fontSize:"11px",color:"#d4960a",padding:"3px 0",borderBottom:`1px solid #1a1200`}}>{w}</div>
                  ))}
                </div>
              )}
              {result.issues.length>0&&(
                <div style={cardSt({background:"#0d0a02",border:`1px solid #3a2800`,marginBottom:"12px"})}>
                  <div style={secLbl()}>注意事項</div>
                  {result.issues.map((iss,i)=>(
                    <div key={i} style={{fontSize:"11px",color:"#e0a020",padding:"3px 0"}}>{iss}</div>
                  ))}
                </div>
              )}

              {result.raceWorth&&<>
                {/* 頭候補 */}
                {result.candidatesFirst.length>0&&(
                  <div style={cardSt({marginBottom:"12px"})}>
                    <div style={secLbl()}>🎯 頭候補（優先順）</div>
                    {result.candidatesFirst.map((c,i)=>(
                      <div key={i} style={{
                        display:"flex",alignItems:"center",gap:"8px",
                        padding:"7px 10px",marginBottom:"4px",borderRadius:"7px",
                        background:i===0?"linear-gradient(135deg,#0d2010,#102818)":"#070c14",
                        borderLeft:`3px solid ${i===0?C.gold:i===1?C.orange:C.textMuted}`,
                      }}>
                        <span style={{
                          width:"20px",height:"20px",borderRadius:"50%",flexShrink:0,
                          background:i===0?`linear-gradient(135deg,${C.gold},#c06800)`:i===1?`linear-gradient(135deg,${C.orange},#c05000)`:"#1a2030",
                          color:i<=1?"#070910":C.textMuted,
                          fontSize:"10px",fontWeight:"900",
                          display:"flex",alignItems:"center",justifyContent:"center",
                        }}>{i+1}</span>
                        <span style={{fontWeight:"900",color:C.gold,fontSize:"15px",width:"22px",textAlign:"center"}}>
                          {c.rider.number}
                        </span>
                        <span style={{fontSize:"13px",fontWeight:"700",flex:1}}>{c.rider.name||"—"}</span>
                        <span style={{fontSize:"10px",color:C.textMuted}}>{c.rider.pref}</span>
                        <span style={{...tag(
                          i===0?"#0d2a10":i===1?"#1a1200":"#0d1020",
                          i===0?C.green:i===1?C.gold:C.textMuted
                        )}}>{c.reason}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* 3着候補 */}
                {result.candidatesThird.length>0&&(
                  <div style={cardSt({marginBottom:"12px"})}>
                    <div style={secLbl()}>3着候補（総流し対象）</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:"6px"}}>
                      {result.candidatesThird.map((c,i)=>(
                        <div key={i} style={{
                          display:"flex",alignItems:"center",gap:"5px",
                          padding:"5px 10px",borderRadius:"6px",
                          background:"#070c14",border:`1px solid ${C.border}`,
                        }}>
                          <span style={{fontWeight:"900",color:C.gold,fontSize:"13px"}}>{c.rider.number}</span>
                          <span style={{fontSize:"12px"}}>{c.rider.name||"—"}</span>
                          <span style={{fontSize:"9px",color:C.textMuted}}>{c.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 推奨買い目 */}
                {result.bets.length>0&&(
                  <div style={cardSt()}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
                      <div style={secLbl()}>🎯 推奨買い目（3連単）</div>
                      <span style={{...tag(
                        result.bets.length<=15?"#0d3b2a":"#3b1a0d",
                        result.bets.length<=15?C.green:C.orange
                      )}}>{result.bets.length}点</span>
                    </div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:"6px"}}>
                      {result.bets.map((bet,i)=>(
                        <div key={i} style={{
                          padding:"6px 11px",background:"#0a1428",
                          border:`1px solid ${C.goldDim}`,borderRadius:"6px",
                          fontSize:"13px",fontWeight:"800",color:C.gold,
                          fontVariantNumeric:"tabular-nums",
                        }}>{bet}</div>
                      ))}
                    </div>
                    <div style={{marginTop:"8px",fontSize:"9px",color:C.textDim,lineHeight:"1.8"}}>
                      ※ 目標配当：3,000〜10,000円の中穴帯 ／ 最大15点 ／ 投票は自己責任で
                    </div>
                  </div>
                )}

                {/* 穴狙い買い目 */}
                {result.anaBets&&result.anaBets.length>0&&(
                  <div style={cardSt({border:`1px solid ${C.purple}`,background:"#0a0514"})}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
                      <div style={secLbl(C.purple)}>🎰 穴狙い買い目（若手・差し型軸）</div>
                      <span style={{...tag("#200d30",C.purple)}}>{result.anaBets.length}点</span>
                    </div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:"6px"}}>
                      {result.anaBets.map((bet,i)=>(
                        <div key={i} style={{
                          padding:"6px 11px",background:"#140828",
                          border:"1px solid #4a1a6a",borderRadius:"6px",
                          fontSize:"13px",fontWeight:"800",color:C.purple,
                          fontVariantNumeric:"tabular-nums",
                        }}>{bet}</div>
                      ))}
                    </div>
                  </div>
                )}
              </>}
            </div>
          )}
        </>}

        {tab===1&&<HistoryPanel history={history} onDelete={id=>setHistory(p=>p.filter(h=>h.id!==id))} onUpdate={handleUpdate}/>}
        {tab===2&&<AccuracyPanel history={history}/>}
      </div>

      {showSave&&result&&<SaveModal result={result} raceTitle={raceTitle} onSave={handleSave} onClose={()=>setShowSave(false)}/>}
      {showImport&&<ImportModal onImport={handleImport} onClose={()=>setShowImport(false)}/>}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600;700;800;900&display=swap');
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        input:focus,select:focus{border-color:#4a9eff!important;box-shadow:0 0 0 2px rgba(74,158,255,0.1)}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:#07090f}
        ::-webkit-scrollbar-thumb{background:#1a2840;border-radius:2px}
      `}</style>
    </div>
  );
}
