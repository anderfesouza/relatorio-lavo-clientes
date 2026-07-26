# Regras de cálculo — Relatório de Clientes (Lavô Betha)

**Este é o documento de controle das regras.** Ele descreve, em linguagem de
negócio, tudo o que o relatório calcula. A implementação fiel a estas regras está
em [`report-core.js`](report-core.js) — quando uma regra mudar, edite os dois:
aqui (para entender) e no `report-core.js` (para valer). Listas fáceis de editar
(bloqueados e agrupamentos) ficam no topo do `report-core.js`.

## Entradas

Dois CSV exportados do sistema (delimitador `;`, aspas `"`, UTF-8):

- **customerReport** — base de clientes. Colunas: `Nome, Documento, Telefone,
  Email, Data_Cadastro, Data_Ultima_Compra, Total_Compras, Quantidade_Compras,
  Saldo_Carteira`.
- **salesReport** — vendas. Colunas: `Data_Hora, Valor_Venda, Valor_Pago,
  Meio_de_Pagamento, Comprovante_cartao, Bandeira_Cartao, Loja, Nome_Cliente,
  Doc_Cliente, Total_Compras_Cliente, Telefone, Maquinas, Usou_Cupom,
  Codigo_Cupom`.

A base de clientes vem do customerReport; o salesReport só alimenta as
agregações. Um documento que só exista em vendas não entra no relatório.

## Parâmetros

- **V (Visitador)** = 20 dias
- **T (Ticket)** = R$ 18,00 (preço de uma máquina)
- **Data de referência ("hoje")** = data de hoje do computador. Rede de segurança:
  se houver venda mais recente que hoje, "hoje" é puxado para a última venda.
- **Início da operação** = 20/03/2026 (usado só para alertar sobre export parcial).

## Filtros

- Cupom `testes` → a linha de venda é descartada.
- Documento vazio → descartado.
- **Documentos bloqueados** (não aparecem no resultado):
  - Internos, comparados pelos **dígitos**: `22976763879, 09788994903,
    03932536860, 67899684820, 36737934897, 36155275858`.
  - Quebrados, comparados pelo **texto exato**: `w1879999, 111111, 555.5trer`.

## Agrupar iguais (cadastros duplicados da mesma pessoa)

Quando a mesma pessoa tem mais de um cadastro (ex.: CPF digitado errado), os
documentos são agrupados em um **documento dominante**. Só o dominante aparece;
os aliases somem. As vendas de todos entram no dominante.

| Dominante (fica) | Aliases (somem) | Pessoa |
|---|---|---|
| `37886207300` | `378.862.073oo` | Francisco Cesar Dos Santos |
| `w2128895` | `w21288`, `212256` | Fern |
| `9168460831` | `46465667` | David |

Ao agrupar:
- **Cadastro** = o mais antigo entre as linhas.
- **Última** = a mais recente (via vendas/última compra).
- **Nome, Telefone, Email, Documento** = os do dominante.
- **Faturamento, Usos, Visitas, Descontos, Cupons, Saldo** = somados/unidos.

## Parsing

- **Números** (formato BR): remover `.` (milhar), trocar `,` por `.`. Vazio → 0.
  Dinheiro é tratado em centavos inteiros (sem erro de ponto flutuante).
- **Datas**: `dd/mm/aaaa [hh:mm:ss]`. Falha no parse → vazio.
- **Máquinas** (coluna `Maquinas`): separa por vírgula. Token com "Recarga" **não**
  é máquina; os demais contam 1 máquina cada.

## Agregações por cliente (varrendo o salesReport)

| Campo | Regra |
|---|---|
| **Faturamento** | Soma de `Valor_Pago`, exceto linhas com cupom `eusoubetha`. |
| **Usos** | Soma da contagem de máquinas de todas as linhas. |
| **Visitas** | Dias distintos com ≥ 1 máquina (recarga isolada não gera visita). |
| **Descontos** | Soma de `(Valor_Venda − Valor_Pago)` quando há cupom válido (≠ `n/d`, ≠ vazio, ≠ `eusoubetha`) e a diferença é positiva. |
| **Cupons** | Conjunto de `Codigo_Cupom` ≠ `n/d` e ≠ vazio (inclui `eusoubetha`), unidos por "; ", ordenados. |

Recarga conta como faturamento, mas não gera visita nem uso.

## Colunas calculadas

- **Ultima**: maior entre a `Data_Ultima_Compra` do cadastro e a última visita das
  vendas. Sem visitas → data de Cadastro.
- **Ritmo** (antigo "Intervalo"): média, em dias, dos intervalos entre visitas
  consecutivas de **todo o histórico**. ≤ 1 visita → 0. Uma casa decimal.
- **Dias Visita**: se `Frequentador = Curioso` → hoje − Cadastro; senão hoje − Ultima.
- **TM (Ticket Médio)**: Faturamento ÷ nº de visitas (por **dia visitado**). Sem
  visitas → 0.
- **Frequentador** (primeiro que casar, nesta ordem):
  1. sem visitas → **Curioso**
  2. hoje − última visita > V → **Sumido**
  3. ≥ 2 visitas e (última − penúltima) > V → **Pródigo**
  4. ≥ 3 visitas nos últimos 3V dias → **Fiel**
  5. ≥ 2 visitas nos últimos 2V dias → **Promissor**
  6. resto → **Novo**
- **Retorno**:
  - Curioso → data de Cadastro
  - 1 visita → Ultima + V dias
  - ≥ 2 visitas → Ultima + média (arredondada) dos intervalos das visitas nos
    **últimos 3V dias**. Se houver < 2 visitas nessa janela → Ultima + V dias.
  - ⚠️ O Retorno usa a janela de 3V; o **Ritmo** usa o histórico completo.
- **Bala na Agulha** (pelo TM): 0 → **Liso**; ≤ 2T (36) → **Econômico**;
  ≤ 3T (54) → **Prata**; ≤ 5T (90) → **Ouro**; > 5T → **Diamante**.
- **Longevidade**: tempo de casa (Cadastro → hoje) em linguagem natural
  ("N ano(s)", "N mês/meses e D dia(s)", "D dia(s)", "Hoje").
- **Saldo**: `Saldo_Carteira` (somado, no caso de agrupamento).

## Saída

- Ordenação: por **Cadastro** ascendente (mais antigo primeiro).
- Colunas (19, nesta ordem): `Nome; Documento; Telefone; Email; Cadastro;
  Longevidade; Ultima; Ritmo; Dias Visita; Retorno; Visitas; Usos; Faturamento;
  TM; Frequentador; Bala na Agulha; Descontos; Saldo; Cupons`.
- Formato: CSV `;`, todos os campos entre aspas, UTF-8 **com BOM**.
- Nome do arquivo: `Clientes_LAVO_BETHA_DD-MM-YYYY.csv`.

## Armadilhas conhecidas

- **salesReport parcial**: se o export não começar em 20/03/2026, clientes antigos
  saem zerados. O app avisa.
- **customerReport vazio**: às vezes o sistema devolve "Não há cadastros de clientes
  nesta loja!" em vez dos dados. O app detecta e pede para reexportar.
- **Arredondamento**: dinheiro/TM usam meio-a-cima; Ritmo e Retorno usam meio-a-par
  (banker's), espelhando o comportamento original.
