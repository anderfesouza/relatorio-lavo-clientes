# Relatório de Clientes — Lavô Betha

Gera o `Clientes_LAVO_BETHA_DD-MM-YYYY.csv` a partir dos dois exports do sistema
(`customerReport` + `salesReport`). **Roda 100% no navegador** — nenhum arquivo é
enviado a servidor nenhum, não usa internet para calcular e não tem custo por uso.

## Usar

Abra a página, arraste os dois CSVs e clique em **Gerar relatório**. O arquivo
baixa na hora. A ordem em que você solta não importa — cada arquivo é reconhecido
pelo nome (`customerReport…` / `salesReport…`).

A **data de referência é a de hoje** (relógio do computador). Isso resolve o caso
em que o export nomeia o `salesReport` com a data de ontem mas já traz as vendas
de hoje. Como rede de segurança, se houver venda mais recente que "hoje", a data é
puxada para a última venda (o `Dias Visita` nunca fica negativo).

## Arquivos

- `index.html` — a interface (carrega `report-core.js`).
- `report-core.js` — todo o cálculo. Fonte única da verdade das regras.
- `validate.mjs` — validador: compara a saída contra relatórios reais, campo a campo.

## Validação

O cálculo é validado byte-a-byte contra os relatórios reais do formato atual
(13/07, 14/07 e 18/07 de 2026): saída **idêntica**. Para rodar o validador com os
CSVs no seu `~/Downloads`:

```bash
node validate.mjs
```

## Regras (resumo)

Implementadas em `report-core.js`. Pontos que não são óbvios:

- **Dinheiro em centavos inteiros** (Faturamento, TM, Descontos, Saldo) — evita
  erro de ponto flutuante. TM arredonda meio-a-cima; comparação da "Bala na Agulha"
  usa múltiplos de R$ 18 (2T/3T/5T = 36/54/90).
- **`Intervalo` ≠ base do `Retorno`.** Intervalo usa o histórico completo de visitas;
  o Retorno usa só a janela de 3V (60 dias). Ambos arredondam meio-a-par (banker's).
- **Visitas** = dias distintos com ao menos uma máquina (recarga isolada não conta).
  **Usos** = soma de máquinas. Cupom `eusoubetha` não entra no faturamento; cupom
  `testes` é descartado; 6 documentos internos são excluídos.
- **Ordenação** por Cadastro (data + hora) ascendente.

Parâmetros no topo do `report-core.js`: `V = 20`, `T_CENTS = 1800`,
`DOCS_INTERNOS`, `INICIO_OPERACAO`.
