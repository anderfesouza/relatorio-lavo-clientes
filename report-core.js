/* Núcleo de cálculo do Relatório Clientes — Lavô Betha.
 * Porte fiel do relatorio_lavo.py. Roda no navegador e no Node (para validação).
 * Sem dependências. Dinheiro em centavos inteiros; datas em dias inteiros. */
(function (root) {
  "use strict";

  var V = 20;                 // janela do "Visitador", em dias
  var T_CENTS = 1800;         // ticket base (18,00) em centavos
  var INICIO_OPERACAO = Date.UTC(2026, 2, 20); // 20/03/2026

  // Documentos internos, comparados pelos DÍGITOS (ignora pontuação/formato).
  var DOCS_INTERNOS = {
    "22976763879": 1, "09788994903": 1, "03932536860": 1,
    "67899684820": 1, "36737934897": 1, "36155275858": 1,
  };

  // Documentos bloqueados pelo TEXTO EXATO (docs "quebrados", com letras).
  var DOCS_BLOQUEADOS_RAW = {
    "w1879999": 1, "111111": 1, "555.5trer": 1,
  };

  // Documentos bloqueados pelos DÍGITOS (CPFs inválidos, ignora vírgula/pontuação).
  var DOCS_BLOQUEADOS_DIG = {
    "333234887": 1,   // CPF inválido/inexistente, cadastrado com vírgula
  };

  // "Agrupar iguais": cadastros duplicados da mesma pessoa.
  // Mapeia cada documento alias -> documento DOMINANTE (que fica no relatório).
  // As vendas dos aliases entram no dominante; a linha do alias some.
  // Cadastro = mais antigo, Ultima = mais recente, Nome/Telefone = do dominante.
  var GRUPOS = {
    "378.862.073oo": "37886207300",   // Francisco Cesar Dos Santos (CPF digitado errado)
    "w21288": "w2128895",             // Fern
    "212256": "w2128895",             // Fern
    "46465667": "9168460831",         // David
    "327.928.680-1": "35793289801",   // Roberes Martins
  };

  // Sobrescritas por dominante (chave = só dígitos): força campos no resultado.
  // Ex.: o Roberes fica com o telefone do outro cadastro, não o do dominante.
  var OVERRIDES = {
    "35793289801": { "Telefone": "11960545827" },
  };

  // "Agrupar iguais" por DATA DE CADASTRO (quando não se tem o documento à mão).
  // O código descobre os documentos no customerReport pelas datas de cadastro.
  // Chave = cadastro do registro ALIAS (que some). Valor:
  //   paraCadastro = cadastro do registro que FICA (a saída herda essa data).
  //   documento    = (opcional) força este documento no registro final.
  var GRUPOS_CAD = {
    "21/09/2026 20:37:52": { paraCadastro: "21/09/2026 20:42:11" },                          // helton
    "13/09/2026 12:04:10": { paraCadastro: "13/09/2026 11:11:32", documento: "28071141801" }, // wagner (doc do outro cadastro)
    "16/08/2026 10:29:37": { paraCadastro: "16/08/2026 10:36:00" },                          // ronaldo
  };

  // Índice de aliases por texto exato E por dígitos, para casar em qualquer formato.
  var ALIAS = {};
  for (var _a in GRUPOS) {
    if (!GRUPOS.hasOwnProperty(_a)) continue;
    ALIAS[_a] = GRUPOS[_a];
    var _d = _a.replace(/\D/g, "");
    if (_d) ALIAS[_d] = GRUPOS[_a];
  }

  var COLUNAS = [
    "Nome", "Documento", "Telefone", "Email", "Cadastro", "Longevidade",
    "Ultima", "Ritmo", "Dias Visita", "Retorno", "Visitas", "Usos",
    "Faturamento", "TM", "Frequentador", "Bala na Agulha", "Descontos",
    "Saldo", "Cupons",
  ];

  var DIA = 86400000; // ms num dia

  // ---------------------------------------------------------------- utils

  function soDigitos(v) { return (v || "").replace(/\D/g, ""); }

  // Remove caracteres especiais (mantém letras e dígitos) — p/ Documento e Telefone.
  // "359.623.888-95" -> "35962388895"; "(11) 99153-6994" -> "11991536994".
  function limpaDoc(v) { return (v || "").replace(/[^0-9A-Za-z]/g, ""); }

  // Longevidade em dias (numérico): dias de Cadastro até hoje.
  function longevidadeDias(cadMs, hojeMs) {
    if (cadMs == null) return "";
    return String(Math.max(0, Math.round((hojeMs - cadMs) / DIA)));
  }

  // Documento bloqueado? (interno por dígitos OU texto exato quebrado)
  function bloqueado(rawDoc) {
    var t = (rawDoc || "").trim();
    if (DOCS_BLOQUEADOS_RAW[t]) return true;
    var d = soDigitos(t);
    return !!(DOCS_INTERNOS[d] || DOCS_BLOQUEADOS_DIG[d]);
  }

  // Resolve alias -> dominante (texto exato). Não-alias volta como está (trim).
  function resolveDominante(rawDoc, alias) {
    alias = alias || ALIAS;
    var t = (rawDoc || "").trim();
    if (alias[t]) return alias[t];
    var d = soDigitos(t);
    if (d && alias[d]) return alias[d];
    return t;
  }

  // Chave de agrupamento (após resolver alias): dígitos, ou o texto se não houver.
  function chaveDoc(rawDoc, alias) {
    var dom = resolveDominante(rawDoc, alias);
    return soDigitos(dom) || dom.toLowerCase();
  }

  // Normaliza uma data de cadastro para comparar ("dd/mm/aaaa hh:mm:ss").
  function normCad(v) { return (v || "").trim().replace(/\s+/g, " "); }

  // Monta o contexto de agrupamento desta execução: junta os grupos estáticos
  // (por documento) com os grupos por DATA DE CADASTRO, descobrindo os documentos
  // no próprio customerReport. Retorna { alias, cadFix, over }.
  function montaContexto(clientes) {
    var alias = {}, over = {}, cadFix = {}, k;
    for (k in ALIAS) if (ALIAS.hasOwnProperty(k)) alias[k] = ALIAS[k];
    for (k in OVERRIDES) if (OVERRIDES.hasOwnProperty(k)) {
      over[k] = {};
      for (var f in OVERRIDES[k]) if (OVERRIDES[k].hasOwnProperty(f)) over[k][f] = OVERRIDES[k][f];
    }

    // índice: cadastro normalizado -> documento (texto exato)
    var porCad = {};
    for (var i = 0; i < clientes.length; i++) {
      var ts = normCad(clientes[i]["Data_Cadastro"]);
      if (ts && porCad[ts] === undefined) porCad[ts] = (clientes[i]["Documento"] || "").trim();
    }

    for (var a in GRUPOS_CAD) {
      if (!GRUPOS_CAD.hasOwnProperty(a)) continue;
      var spec = GRUPOS_CAD[a];
      var aliasDoc = porCad[normCad(a)];
      var domDoc = porCad[normCad(spec.paraCadastro)];
      if (!aliasDoc || !domDoc) continue;   // registros ainda não estão neste export
      var domKey = soDigitos(domDoc) || domDoc.toLowerCase();
      alias[aliasDoc] = domDoc;
      var ad = soDigitos(aliasDoc); if (ad) alias[ad] = domDoc;
      cadFix[domKey] = spec.paraCadastro;   // a saída herda a data de cadastro escolhida
      if (spec.documento) {                 // força o documento final, se pedido
        over[domKey] = over[domKey] || {};
        over[domKey]["Documento"] = spec.documento;
      }
    }
    return { alias: alias, cadFix: cadFix, over: over };
  }

  function semAcento(v) {
    return (v || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  }

  function cupomNorm(v) { return semAcento((v || "").trim()).toLowerCase(); }

  function cupomValido(codigo) {
    var c = cupomNorm(codigo);
    return c !== "" && c !== "n/d";
  }

  // "1.234,56" -> 123456 centavos. Vazio/invalido -> 0.
  function parseCents(v) {
    var t = (v || "").trim().replace(/"/g, "");
    if (!t) return 0;
    t = t.replace(/\./g, "").replace(",", ".");
    var n = parseFloat(t);
    if (isNaN(n)) return 0;
    return Math.round(n * 100);
  }

  // Data BR -> UTC ms (só a data, meia-noite) ou null.
  function parseData(v) {
    var t = (v || "").trim();
    var m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (!m) return null;
    var dia = +m[1], mes = +m[2], ano = +m[3];
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    return Date.UTC(ano, mes - 1, dia);
  }

  // Data+hora BR -> UTC ms com hora (para ordenacao estavel) ou null.
  function parseTs(v) {
    var t = (v || "").trim();
    var m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
    if (!m) return null;
    var mes = +m[2], dia = +m[1], ano = +m[3];
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    return Date.UTC(ano, mes - 1, dia, +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }

  function contaMaquinas(campo) {
    var tokens = (campo || "").split(",");
    var maquinas = 0, recarga = false;
    for (var i = 0; i < tokens.length; i++) {
      var tk = tokens[i].trim();
      if (!tk) continue;
      if (cupomNorm(tk).indexOf("recarga") >= 0) recarga = true;
      else maquinas += 1;
    }
    return maquinas;
  }

  // Parser de CSV com delimitador ; e aspas duplas (com "" escapado).
  function leCSV(texto) {
    if (texto.charCodeAt(0) === 0xFEFF) texto = texto.slice(1);
    var linhas = [];
    var campo = "", linha = [], i = 0, n = texto.length, dentro = false;
    while (i < n) {
      var c = texto[i];
      if (dentro) {
        if (c === '"') {
          if (texto[i + 1] === '"') { campo += '"'; i += 2; continue; }
          dentro = false; i++; continue;
        }
        campo += c; i++; continue;
      }
      if (c === '"') { dentro = true; i++; continue; }
      if (c === ";") { linha.push(campo); campo = ""; i++; continue; }
      if (c === "\r") { i++; continue; }
      if (c === "\n") { linha.push(campo); linhas.push(linha); linha = []; campo = ""; i++; continue; }
      campo += c; i++;
    }
    if (campo !== "" || linha.length) { linha.push(campo); linhas.push(linha); }
    if (!linhas.length) return [];
    var head = linhas[0];
    var out = [];
    for (var r = 1; r < linhas.length; r++) {
      if (linhas[r].length === 1 && linhas[r][0] === "") continue;
      var obj = {};
      for (var k = 0; k < head.length; k++) obj[head[k]] = linhas[r][k] !== undefined ? linhas[r][k] : "";
      out.push(obj);
    }
    return out;
  }

  // ---------------------------------------------------------------- arredondamento

  // Divisao inteira com arredondamento meio-a-cima (half up), a>=0,b>0.
  function halfUpDiv(a, b) { return Math.floor((2 * a + b) / (2 * b)); }

  // Divisao inteira meio-a-par (banker's), a>=0,b>0. Espelha round() do Python.
  function halfEvenDiv(a, b) {
    var q = Math.floor(a / b), r = a - q * b, dois = 2 * r;
    if (dois < b) return q;
    if (dois > b) return q + 1;
    return (q % 2 === 0) ? q : q + 1;
  }

  // ---------------------------------------------------------------- formatacao

  function fmtCents(cents) {
    var sinal = cents < 0 ? "-" : "";
    var a = Math.abs(cents);
    var inteiro = Math.floor(a / 100);
    var frac = a % 100;
    return sinal + inteiro + "," + (frac < 10 ? "0" + frac : "" + frac);
  }

  function fmtData(ms) {
    if (ms == null) return "";
    var d = new Date(ms);
    var dd = ("0" + d.getUTCDate()).slice(-2);
    var mm = ("0" + (d.getUTCMonth() + 1)).slice(-2);
    return dd + "/" + mm + "/" + d.getUTCFullYear();
  }

  function fmtDataHora(ms, horaTxt) {
    if (ms == null) return "";
    return fmtData(ms) + " " + horaTxt;
  }

  function plural(n, singular, plural_) { return n + " " + (n === 1 ? singular : plural_); }

  function ultimoDiaDoMes(ano, mes) { return new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate(); }

  function somaMeses(baseMs, meses) {
    var d = new Date(baseMs);
    var total = d.getUTCMonth() + meses;
    var ano = d.getUTCFullYear() + Math.floor(total / 12);
    var mes = ((total % 12) + 12) % 12;
    var dia = Math.min(d.getUTCDate(), ultimoDiaDoMes(ano, mes));
    return Date.UTC(ano, mes, dia);
  }

  function longevidade(cadMs, hojeMs) {
    if (cadMs == null) return "";
    if (Math.round((hojeMs - cadMs) / DIA) <= 0) return "Hoje";
    var cad = new Date(cadMs), hoje = new Date(hojeMs);
    var meses = (hoje.getUTCFullYear() - cad.getUTCFullYear()) * 12 +
                (hoje.getUTCMonth() - cad.getUTCMonth());
    if (hoje.getUTCDate() < cad.getUTCDate()) meses -= 1;
    var ancora = somaMeses(cadMs, meses);
    var restoDias = Math.round((hojeMs - ancora) / DIA);
    if (meses >= 12) {
      var anos = Math.floor(meses / 12), sobra = meses % 12;
      var txt = plural(anos, "ano", "anos");
      if (sobra > 0) txt += " e " + plural(sobra, "mês", "meses");
      return txt;
    }
    if (meses >= 1) {
      var t = plural(meses, "mês", "meses");
      if (restoDias > 0) t += " e " + plural(restoDias, "dia", "dias");
      return t;
    }
    return plural(restoDias, "dia", "dias");
  }

  // media dos gaps (em dias) entre visitas consecutivas, como fracao S/n
  function gapsDe(visitas) {
    var gaps = [];
    for (var i = 0; i + 1 < visitas.length; i++) {
      gaps.push(Math.round((visitas[i + 1] - visitas[i]) / DIA));
    }
    return gaps;
  }

  function fmtIntervalo(visitas) {
    if (visitas.length <= 1) return "0,0";
    var gaps = gapsDe(visitas), soma = 0;
    for (var i = 0; i < gaps.length; i++) soma += gaps[i];
    var decimos = halfEvenDiv(soma * 10, gaps.length); // arredonda 1 casa (half-even)
    var sinal = decimos < 0 ? "-" : "";
    var a = Math.abs(decimos);
    return sinal + Math.floor(a / 10) + "," + (a % 10);
  }

  // ---------------------------------------------------------------- classificacao

  function classificaFrequentador(visitas, hojeMs) {
    if (!visitas.length) return "Curioso";
    var lv = visitas[visitas.length - 1];
    if (Math.round((hojeMs - lv) / DIA) > V) return "Sumido";
    if (visitas.length >= 2) {
      var va = visitas[visitas.length - 2];
      if (Math.round((lv - va) / DIA) > V) return "Pródigo";
    }
    var lim3 = hojeMs - 3 * V * DIA, c3 = 0;
    for (var i = 0; i < visitas.length; i++) if (visitas[i] >= lim3) c3++;
    if (c3 >= 3) return "Fiel";
    var lim2 = hojeMs - 2 * V * DIA, c2 = 0;
    for (var j = 0; j < visitas.length; j++) if (visitas[j] >= lim2) c2++;
    if (c2 >= 2) return "Promissor";
    return "Novo";
  }

  function calculaRetorno(freq, visitas, ultimaMs, cadMs, hojeMs) {
    if (freq === "Curioso") return cadMs;
    if (visitas.length === 1) return ultimaMs + V * DIA;
    var lim3 = hojeMs - 3 * V * DIA;
    var janela = visitas.filter(function (d) { return d >= lim3; });
    if (janela.length < 2) return ultimaMs + V * DIA;
    var gaps = gapsDe(janela), soma = 0;
    for (var i = 0; i < gaps.length; i++) soma += gaps[i];
    return ultimaMs + halfEvenDiv(soma, gaps.length) * DIA;
  }

  // ---------------------------------------------------------------- agregacao

  function agregaVendas(linhas, alias) {
    var porDoc = {};
    for (var i = 0; i < linhas.length; i++) {
      var l = linhas[i];
      var cnorm = cupomNorm(l["Codigo_Cupom"]);
      if (cnorm === "testes") continue;
      var docRaw = l["Doc_Cliente"];
      if (!soDigitos(docRaw) && !(docRaw || "").trim()) continue;
      if (bloqueado(docRaw)) continue;
      var doc = chaveDoc(docRaw, alias);   // resolve alias -> chave do dominante
      if (!doc) continue;
      var ms = parseData(l["Data_Hora"]);
      if (ms == null) continue;

      var ag = porDoc[doc];
      if (!ag) ag = porDoc[doc] = { fat: 0, usos: 0, visitas: {}, desc: 0, cupons: {} };

      var maquinas = contaMaquinas(l["Maquinas"]);
      var eusoubetha = cnorm === "eusoubetha";

      if (!eusoubetha) ag.fat += parseCents(l["Valor_Pago"]);
      ag.usos += maquinas;
      if (maquinas > 0) ag.visitas[ms] = 1;

      var codigo = l["Codigo_Cupom"];
      if (cupomValido(codigo) && !eusoubetha) {
        var diff = parseCents(l["Valor_Venda"]) - parseCents(l["Valor_Pago"]);
        if (diff > 0) ag.desc += diff;
      }
      if (cupomValido(codigo)) ag.cupons[(codigo || "").trim()] = 1;
    }
    return porDoc;
  }

  // ---------------------------------------------------------------- montagem

  function hojeEfetivo(hojeMs, vendas) {
    var maxV = null;
    for (var i = 0; i < vendas.length; i++) {
      var ms = parseData(vendas[i]["Data_Hora"]);
      if (ms != null && (maxV == null || ms > maxV)) maxV = ms;
    }
    if (maxV == null) return { hoje: hojeMs, ajustado: false };
    if (hojeMs == null || maxV > hojeMs) return { hoje: maxV, ajustado: hojeMs != null };
    return { hoje: hojeMs, ajustado: false };
  }

  function alertaRange(vendas, hojeMs) {
    var mn = null, mx = null;
    for (var i = 0; i < vendas.length; i++) {
      var ms = parseData(vendas[i]["Data_Hora"]);
      if (ms == null) continue;
      if (mn == null || ms < mn) mn = ms;
      if (mx == null || ms > mx) mx = ms;
    }
    if (mn == null) return "salesReport sem datas validas.";
    var msg = "salesReport cobre " + fmtData(mn) + " ate " + fmtData(mx) + ".";
    if (mn > INICIO_OPERACAO) {
      msg += " ATENCAO: o export nao comeca em 20/03/2026 (inicio da operacao)." +
             " Clientes antigos podem sair zerados — reexporte o periodo completo.";
    }
    return msg;
  }

  function montaLinhas(clientes, vendas, hojeMs, ctx) {
    var alias = ctx.alias, cadFix = ctx.cadFix, over = ctx.over;
    // 1) agrupa linhas de cliente por chave (resolvendo alias), pulando bloqueados.
    var grupos = {}, ordem = [];
    for (var i = 0; i < clientes.length; i++) {
      var c = clientes[i];
      var docRaw = c["Documento"];
      if (!(docRaw || "").trim()) continue;
      if (bloqueado(docRaw)) continue;
      var k = chaveDoc(docRaw, alias);
      if (!k) continue;
      var g = grupos[k];
      if (!g) { g = grupos[k] = { rows: [], dom: null }; ordem.push(k); }
      g.rows.push(c);
      // linha dominante = a que não é alias (resolve para si mesma)
      if (resolveDominante(docRaw, alias) === (docRaw || "").trim()) g.dom = c;
    }

    var saida = [];
    for (var oi = 0; oi < ordem.length; oi++) {
      var key = ordem[oi];
      var grp = grupos[key];
      var cli = grp.dom || grp.rows[0];   // dados de identificação vêm do dominante

      // mescla datas e saldo entre as linhas do grupo ("agrupar iguais")
      var cadTs = null, cadRow = null, ducMax = null, saldoCents = 0;
      for (var r = 0; r < grp.rows.length; r++) {
        var row = grp.rows[r];
        var ts = parseTs(row["Data_Cadastro"]);
        if (ts != null && (cadTs == null || ts < cadTs)) { cadTs = ts; cadRow = row; }
        var d = parseData(row["Data_Ultima_Compra"]);
        if (d != null && (ducMax == null || d > ducMax)) ducMax = d;
        saldoCents += parseCents(row["Saldo_Carteira"]);
      }

      // "unificar no <cadastro>": grupos por data forçam a data de cadastro final.
      var cadStr = cadRow ? cadRow["Data_Cadastro"] : null;
      if (cadFix[key]) { cadTs = parseTs(cadFix[key]); cadStr = cadFix[key]; }

      var cadMs = null, horaCad = "";
      if (cadTs != null) {
        var cd = new Date(cadTs);
        cadMs = Date.UTC(cd.getUTCFullYear(), cd.getUTCMonth(), cd.getUTCDate());
        var mm = (cadStr || "").match(/(\d{2}:\d{2}:\d{2})/);
        horaCad = mm ? mm[1] : "";
      }

      var ag = vendas[key] || { fat: 0, usos: 0, visitas: {}, desc: 0, cupons: {} };
      var visitas = Object.keys(ag.visitas).map(Number).sort(function (a, b) { return a - b; });

      var ultimaMs;
      if (!visitas.length) {
        ultimaMs = cadMs;
      } else {
        ultimaMs = visitas[visitas.length - 1];
        if (ducMax != null && ducMax > ultimaMs) ultimaMs = ducMax;
      }

      var freq = classificaFrequentador(visitas, hojeMs);

      var diasVisita;
      if (freq === "Curioso") {
        diasVisita = cadMs != null ? Math.round((hojeMs - cadMs) / DIA) : 0;
      } else {
        diasVisita = ultimaMs != null ? Math.round((hojeMs - ultimaMs) / DIA) : 0;
      }

      var tmCents = visitas.length ? halfUpDiv(ag.fat, visitas.length) : 0;

      var bala;
      if (tmCents === 0) bala = "Liso";
      else if (tmCents <= 2 * T_CENTS) bala = "Econômico";
      else if (tmCents <= 3 * T_CENTS) bala = "Prata";
      else if (tmCents <= 5 * T_CENTS) bala = "Ouro";
      else bala = "Diamante";

      var retornoMs = calculaRetorno(freq, visitas, ultimaMs, cadMs, hojeMs);

      var cupons = Object.keys(ag.cupons).sort();

      var rec = {
        _cad: cadTs,
        "Nome": (cli["Nome"] || "").trim(),
        "Documento": limpaDoc(cli["Documento"]),
        "Telefone": limpaDoc(cli["Telefone"]),
        "Email": (cli["Email"] || "").trim(),
        "Cadastro": cadMs != null ? fmtDataHora(cadMs, horaCad) : "",
        "Longevidade": longevidadeDias(cadMs, hojeMs),
        "Ultima": fmtData(ultimaMs),
        "Ritmo": fmtIntervalo(visitas),
        "Dias Visita": String(diasVisita),
        "Retorno": fmtData(retornoMs),
        "Visitas": String(visitas.length),
        "Usos": String(ag.usos),
        "Faturamento": fmtCents(ag.fat),
        "TM": fmtCents(tmCents),
        "Frequentador": freq,
        "Bala na Agulha": bala,
        "Descontos": fmtCents(ag.desc),
        "Saldo": fmtCents(saldoCents),
        "Cupons": cupons.join("; "),
      };
      var ov = over[key];           // sobrescritas por dominante (ex.: telefone do Roberes)
      if (ov) for (var f in ov) if (ov.hasOwnProperty(f)) {
        rec[f] = (f === "Documento" || f === "Telefone") ? limpaDoc(ov[f]) : ov[f];
      }
      saida.push(rec);
    }

    // ordena por Cadastro asc, nulos por ultimo, estavel
    saida.forEach(function (r, idx) { r._i = idx; });
    saida.sort(function (a, b) {
      var an = a._cad == null, bn = b._cad == null;
      if (an !== bn) return an ? 1 : -1;
      if (an && bn) return a._i - b._i;
      if (a._cad !== b._cad) return a._cad - b._cad;
      return a._i - b._i;
    });
    return saida;
  }

  // ---------------------------------------------------------------- csv

  function campoCSV(v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }

  function geraCSV(linhas) {
    var out = "﻿" + COLUNAS.map(campoCSV).join(";") + "\r\n";
    for (var i = 0; i < linhas.length; i++) {
      var r = linhas[i], cols = [];
      for (var k = 0; k < COLUNAS.length; k++) cols.push(campoCSV(r[COLUNAS[k]]));
      out += cols.join(";") + "\r\n";
    }
    return out;
  }

  // ---------------------------------------------------------------- api

  function gerar(txtClientes, txtVendas, hojeMs) {
    var clientes = leCSV(txtClientes);
    var vendasRaw = leCSV(txtVendas);
    var res = hojeEfetivo(hojeMs, vendasRaw);
    var aviso = alertaRange(vendasRaw, res.hoje);
    if (res.ajustado) {
      aviso = "Data de referencia ajustada para " + fmtData(res.hoje) +
              " (ha vendas mais recentes que a data informada).\n" + aviso;
    }
    var ctx = montaContexto(clientes);   // grupos estáticos + por data de cadastro
    var linhas = montaLinhas(clientes, agregaVendas(vendasRaw, ctx.alias), res.hoje, ctx);
    return { csv: geraCSV(linhas), linhas: linhas.length, hoje: res.hoje, aviso: aviso };
  }

  var API = { gerar: gerar, leCSV: leCSV, COLUNAS: COLUNAS };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.LavoReport = API;
})(typeof window !== "undefined" ? window : this);
