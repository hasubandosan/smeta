/* Ядро: id, трёхзначная логика, формулы (AST), упаковки. Без DOM. Работает в браузере (глобал SM) и в Node. */
(function (root) {
  'use strict';
  const SM = root.SM = root.SM || {};
  SM.uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
  SM.TRI = Object.freeze({YES: 'YES', NO: 'NO', UNKNOWN: 'UNKNOWN', NA: 'NOT_APPLICABLE'});
  // «неизвестно» = null/undefined/''. Это НЕ ноль и НЕ «нет».
  SM.isUnknown = v => v === null || v === undefined || v === '' || (typeof v === 'number' && !isFinite(v));

  /* ---------- формулы ---------- */
  const FN = {ceil: Math.ceil, floor: Math.floor, round: Math.round, abs: Math.abs, min: Math.min, max: Math.max};

  function tokenize(src) {
    const re = /\s*(?:(\d+\.?\d*|\.\d+)|([\p{L}_][\p{L}\d_.]*)|(\S))/uy, out = [];
    let i = 0, m;
    while (i < src.length) {
      re.lastIndex = i; m = re.exec(src);
      if (!m) break;
      i = re.lastIndex;
      if (m[1] !== undefined) out.push({k: 'num', v: parseFloat(m[1])});
      else if (m[2] !== undefined) out.push({k: 'id', v: m[2]});
      else out.push({k: 'op', v: m[3]});
    }
    return out;
  }

  // parse(text) -> {ok:true, ast} | {ok:false, error}
  SM.parse = function (text) {
    const s = String(text == null ? '' : text).trim().replace(/,/g, '.');
    if (!s) return {ok: false, error: 'пустая формула'};
    const t = tokenize(s); let p = 0;
    const peek = () => t[p], isOp = v => t[p] && t[p].k === 'op' && t[p].v === v;
    const fail = m => { throw new Error(m); };
    const expr = () => { let l = term(); while (isOp('+') || isOp('-')) { const op = t[p++].v; l = {t: 'bin', op, l, r: term()}; } return l; };
    const term = () => { let l = unary(); while (isOp('*') || isOp('/')) { const op = t[p++].v; l = {t: 'bin', op, l, r: unary()}; } return l; };
    const unary = () => { if (isOp('-')) { p++; return {t: 'neg', x: unary()}; } if (isOp('+')) { p++; return unary(); } return atom(); };
    const atom = () => {
      const x = t[p++]; if (!x) fail('неожиданный конец формулы');
      if (x.k === 'num') return {t: 'num', v: x.v};
      if (x.k === 'id') {
        if (isOp('(')) {
          p++; const args = [];
          if (!isOp(')')) { do { args.push(expr()); } while (isOp(',') && p++); }
          if (!isOp(')')) fail('нет закрывающей скобки'); p++;
          if (!FN[x.v]) fail('неизвестная функция ' + x.v);
          return {t: 'call', fn: x.v, args};
        }
        return {t: 'var', name: x.v};
      }
      if (x.v === '(') { const e = expr(); if (!isOp(')')) fail('нет закрывающей скобки'); p++; return e; }
      return fail('лишний символ «' + x.v + '»');
    };
    try { const ast = expr(); if (p !== t.length) fail('лишний символ «' + t[p].v + '»'); return {ok: true, ast}; }
    catch (e) { return {ok: false, error: e.message}; }
  };

  // evalAst -> число или null (если встретилась неизвестная переменная; имена попадают в missing)
  SM.evalAst = function (ast, vars, missing) {
    const ev = n => {
      switch (n.t) {
        case 'num': return n.v;
        case 'var': { const v = vars[n.name]; if (SM.isUnknown(v)) { missing && missing.add(n.name); return null; } return +v; }
        case 'neg': { const x = ev(n.x); return x === null ? null : -x; }
        case 'call': { const a = n.args.map(ev); return a.some(x => x === null) ? null : FN[n.fn](...a); }
        case 'bin': {
          const a = ev(n.l), b = ev(n.r); if (a === null || b === null) return null;
          if (n.op === '+') return a + b; if (n.op === '-') return a - b; if (n.op === '*') return a * b;
          if (b === 0) throw new Error('деление на ноль'); return a / b;
        }
      }
      throw new Error('неизвестный узел');
    };
    return ev(ast);
  };

  // evalExpr(text, vars) -> {ok:true,value} | {ok:false,unknown:[имена]} | {ok:false,error}
  SM.evalExpr = function (text, vars) {
    if (typeof text === 'number') return {ok: true, value: text};
    const p = SM.parse(text); if (!p.ok) return {ok: false, error: p.error};
    const missing = new Set();
    try {
      const v = SM.evalAst(p.ast, vars || {}, missing);
      return v === null ? {ok: false, unknown: [...missing]} : (isFinite(v) ? {ok: true, value: v} : {ok: false, error: 'результат не число'});
    } catch (e) { return {ok: false, error: e.message}; }
  };

  // Объяснение «простым языком»: подставляет значения вместо имён. labels: {имя: 'Площадь'}
  SM.explain = function (text, vars, labels) {
    const p = SM.parse(text); if (!p.ok) return p.error;
    const num = n => String(Math.round(n * 1e6) / 1e6).replace('.', ',');
    const prec = o => (o === '+' || o === '-' ? 1 : 2);
    const show = (n, pp, right) => {
      switch (n.t) {
        case 'num': return num(n.v);
        case 'var': { const v = vars[n.name]; return SM.isUnknown(v) ? '«' + ((labels && labels[n.name]) || n.name) + ' — неизвестно»' : num(+v); }
        case 'neg': return '-' + show(n.x, 3);
        case 'call': return n.fn + '(' + n.args.map(a => show(a, 0)).join('; ') + ')';
        case 'bin': { const q = prec(n.op), s = show(n.l, q, false) + ' ' + ({'*': '×', '/': '÷'}[n.op] || n.op) + ' ' + show(n.r, q, true);
          return q < pp || (q === pp && right) ? '(' + s + ')' : s; }
      }
    };
    const r = SM.evalExpr(text, vars);
    return show(p.ast, 0, false) + (r.ok ? ' = ' + num(r.value) : r.unknown ? ' = ? (не хватает данных)' : ' = ошибка: ' + r.error);
  };

  /* ---------- упаковки: потребность ≠ покупка ---------- */
  SM.packs = (need, packQty) => (+packQty > 0 ? Math.ceil(need / packQty - 1e-9) : null);
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SM;
