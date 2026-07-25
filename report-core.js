/* Núcleo de cálculo do Relatório Clientes — Lavô Betha.
 * Porte fiel do relatorio_lavo.py. Roda no navegador e no Node (para validação).
 * Sem dependências. Dinheiro em centavos inteiros; datas em dias inteiros. */
(function (root) {
  "use strict";

  var V = 20;                 // janela do "Visitador", em dias
  var T_CENTS = 1800;         // ticket base (18,00) em centavos
  var INICIO_OPERACAO = Date.UTC(2026, 2, 20); // 20/03/2026

  var DOCS_INTERNOS = {
    "22976763879": 1, "09788994903": 1, "03932536860": 1,
    "67899684820": 1, "36737934897": 1, "36155275858": 1,
  };

  var COLUNAS = [
    "Nome", "Documento", "Telefone", "Email", "Cadastro", "Longevidade",
    "Ultima", "Intervalo", "Dias Visita", "Retorno", "Visitas", "Usos",
    "Faturamento", "TM", "Frequentador", "Bala na Agulha", "Descontos",
    "Saldo", "Cupons",
  ];

  var DIA = 86400000; // ms num dia

  // ---------------------------------------------------------------- utils

  function soDigitos(v) { return (v || "").replace(/\D/g, ""); }

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

  function agregaVendas(linhas) {
    var porDoc = {};
    for (var i = 0; i < linhas.length; i++) {
      var l = linhas[i];
      var cnorm = cupomNorm(l["Codigo_Cupom"]);
      if (cnorm === "testes") continue;
      var doc = soDigitos(l["Doc_Cliente"]);
      if (!doc || DOCS_INTERNOS[doc]) continue;
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

  function montaLinhas(clientes, vendas, hojeMs) {
    var saida = [];
    for (var i = 0; i < clientes.length; i++) {
      var cli = clientes[i];
      var doc = soDigitos(cli["Documento"]);
      if (!doc || DOCS_INTERNOS[doc]) continue;

      var cadMs = parseData(cli["Data_Cadastro"]);
      var horaCad = (function () {
        var t = (cli["Data_Cadastro"] || "").trim();
        var m = t.match(/(\d{2}:\d{2}:\d{2})/);
        return m ? m[1] : "";
      })();

      var ag = vendas[doc] || { fat: 0, usos: 0, visitas: {}, desc: 0, cupons: {} };
      var visitas = Object.keys(ag.visitas).map(Number).sort(function (a, b) { return a - b; });

      var ultimaMs;
      if (!visitas.length) {
        ultimaMs = cadMs;
      } else {
        ultimaMs = visitas[visitas.length - 1];
        var duc = parseData(cli["Data_Ultima_Compra"]);
        if (duc != null && duc > ultimaMs) ultimaMs = duc;
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

      saida.push({
        _cad: parseTs(cli["Data_Cadastro"]),
        "Nome": (cli["Nome"] || "").trim(),
        "Documento": (cli["Documento"] || "").trim(),
        "Telefone": (cli["Telefone"] || "").trim(),
        "Email": (cli["Email"] || "").trim(),
        "Cadastro": cadMs != null ? fmtDataHora(cadMs, horaCad) : "",
        "Longevidade": longevidade(cadMs, hojeMs),
        "Ultima": fmtData(ultimaMs),
        "Intervalo": fmtIntervalo(visitas),
        "Dias Visita": String(diasVisita),
        "Retorno": fmtData(retornoMs),
        "Visitas": String(visitas.length),
        "Usos": String(ag.usos),
        "Faturamento": fmtCents(ag.fat),
        "TM": fmtCents(tmCents),
        "Frequentador": freq,
        "Bala na Agulha": bala,
        "Descontos": fmtCents(ag.desc),
        "Saldo": fmtCents(parseCents(cli["Saldo_Carteira"])),
        "Cupons": cupons.join("; "),
      });
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
    var linhas = montaLinhas(clientes, agregaVendas(vendasRaw), res.hoje);
    return { csv: geraCSV(linhas), linhas: linhas.length, hoje: res.hoje, aviso: aviso };
  }

  var API = { gerar: gerar, leCSV: leCSV, COLUNAS: COLUNAS };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.LavoReport = API;
})(typeof window !== "undefined" ? window : this);
