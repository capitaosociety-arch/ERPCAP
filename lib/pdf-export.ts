import { jsPDF } from 'jspdf';

// Cores da marca (Capitao Society)
const C = {
    green: '#10b981',
    greenDark: '#059669',
    blue: '#1e3a8a',
    slate: '#1e293b',
    slateDark: '#0f172a',
    red: '#ef4444',
    gray: '#64748b',
    light: '#f1f5f9',
    emeraldBg: '#ecfdf5',
    redBg: '#fef2f2',
    white: '#ffffff'
};

// Monetário em BRL
const fmt = (v: number) =>
    'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtQtd = (v: number) =>
    Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: v % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 });

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const monthLabel = (key: string) => {
    const [mm, yyyy] = key.split('/');
    return `${MONTHS[parseInt(mm) - 1]} / ${yyyy}`;
};

const roundedRect = (doc: jsPDF, x: number, y: number, w: number, h: number, r: number, fill: string) => {
    doc.setFillColor(fill);
    doc.roundedRect(x, y, w, h, r, r, 'F');
};

export function downloadDrePdf(dreMonths: any[], dreDetails: any[], selectedKey: string) {
    const month = dreMonths.find((m: any) => m.key === selectedKey);
    const detail = dreDetails.find((d: any) => d.key === selectedKey);

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210;
    const M = 14;
    let y = 0;

    // ===== PÁGINA 1: CABEÇALHO + DRE =====
    // Faixa superior decorativa
    doc.setFillColor('#0f172a');
    doc.rect(0, 0, W, 40, 'F');
    doc.setFillColor('#10b981');
    doc.rect(0, 40, W, 1.6, 'F');

    // Logo desenhada (C com chanfros, cores da marca)
    const lx = M, ly = 10, ls = 1.05;
    doc.setFillColor('#a4d13a');
    doc.roundedRect(lx, ly, 20 * ls, 20 * ls, 4, 4, 'F');
    doc.setFillColor('#0a589e');
    doc.triangle(lx, ly, lx + 20 * ls, ly, lx, ly + 20 * ls, 'F');

    // Letra C branca estilizada
    doc.setFillColor('#ffffff');
    doc.roundedRect(lx + 4.2 * ls, ly + 4.2 * ls, 11.6 * ls, 11.6 * ls, 2, 2, 'F');
    doc.setFillColor('#0a589e');
    doc.rect(lx + 8.6 * ls, ly + 8.6 * ls, 3.4 * ls, 2.8 * ls, 'F'); // chanfro central

    doc.setTextColor('#ffffff');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('CAPITÃO SOCIETY', lx + 24 * ls, ly + 9);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor('#94a3b8');
    doc.text('Centro Esportivo & Convivência', lx + 24 * ls, ly + 14.5);

    // Título do relatório (direita)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor('#ffffff');
    doc.text('DRE — Demonstrativo de Resultados', W - M, ly + 9, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor('#cbd5e1');
    doc.text(monthLabel(selectedKey), W - M, ly + 14.5, { align: 'right' });

    y = 50;

    // Resumo em cards
    const cardW = (W - M * 2 - 8) / 4;
    const cardH = 24;
    const cards: { label: string; value: number; color: string; money: boolean; pct?: string }[] = [
        { label: 'RECEITA BRUTA', value: month?.totalReceitas || 0, color: C.green, money: true },
        { label: 'LUCRO BRUTO', value: month?.lucroBruto || 0, color: C.blue, money: true, pct: month?.margemBruta + '%' },
        { label: 'EBITDA', value: month?.ebitda || 0, color: '#6366f1', money: true, pct: month?.margemEbitda + '%' },
        { label: 'RESULTADO LÍQUIDO', value: month?.resultadoLiquido || 0, color: C.slateDark, money: true, pct: month?.margemLiquida + '%' }
    ];

    cards.forEach((c, i) => {
        const x = M + i * (cardW + 2.7);
        roundedRect(doc, x, y, cardW, cardH, 4, c.color);
        doc.setTextColor('#ffffff');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.text(c.label, x + 3, y + 7);
        doc.setFontSize(10);
        doc.text(fmt(c.value), x + 3, y + 15);
        if (c.pct) {
            doc.setFontSize(6);
            doc.setFont('helvetica', 'normal');
            doc.text(c.pct + ' margem', x + 3, y + 20);
        }
    });

    y += cardH + 10;

    // Tabela do DRE
    const rows: { label: string; value: number | string; bold?: boolean; bg?: string; txt?: string; sub?: boolean }[] = [];

    rows.push({ label: '1. RECEITAS', value: '', bg: C.emeraldBg, txt: C.greenDark, bold: true });
    rows.push({ label: 'Vendas (PDV / Comandas)', value: fmt(month?.receitasVendas || 0), sub: true });
    rows.push({ label: 'Outras Receitas (contas a receber pagas)', value: fmt(month?.receitasOutras || 0), sub: true });
    rows.push({ label: 'Receita Bruta Total', value: fmt(month?.totalReceitas || 0), bold: true, txt: C.greenDark });

    rows.push({ label: '2. CUSTOS', value: '', bg: C.redBg, txt: C.red, bold: true });
    rows.push({ label: '(-) CMV — Custo das Mercadorias Vendidas', value: '- ' + fmt(month?.cmv || 0), sub: true });
    rows.push({ label: '= Lucro Bruto', value: fmt(month?.lucroBruto || 0), bold: true, txt: C.blue });

    rows.push({ label: '3. DESPESAS OPERACIONAIS', value: '', bg: C.redBg, txt: C.red, bold: true });
    const expenseCats = month ? Object.entries(month.despesas || {}) : [];
    if (expenseCats.length === 0) {
        rows.push({ label: 'Nenhuma despesa operacional lançada.', value: '', sub: true });
    } else {
        expenseCats.forEach(([cat, val]: any) => {
            rows.push({ label: `(-) ${cat}`, value: '- ' + fmt(val), sub: true });
        });
    }
    if ((month?.despesasFinanceiras || 0) > 0) {
        rows.push({ label: '(-) Despesas Financeiras (juros/tarifas)', value: '- ' + fmt(month.despesasFinanceiras), sub: true });
    }
    if ((month?.impostos || 0) > 0) {
        rows.push({ label: '(-) Impostos e Taxas', value: '- ' + fmt(month.impostos), sub: true });
    }
    const totalExpenses = month ? (month.totalDespesasOp + month.despesasFinanceiras + month.impostos) : 0;
    rows.push({ label: 'Total de Despesas', value: '- ' + fmt(totalExpenses), bold: true, txt: C.red });

    rows.push({ label: '= EBITDA (Resultado Operacional)', value: fmt(month?.ebitda || 0), bold: true, bg: '#eef2ff', txt: '#4f46e5' });
    rows.push({ label: '= Resultado Líquido do Período', value: fmt(month?.resultadoLiquido || 0), bold: true, bg: C.slateDark, txt: C.white });

    // Render da tabela
    const lineH = 8.5;
    const labelX = M + 4;
    const valueX = W - M - 4;
    for (const r of rows) {
        if (y + lineH > 265) { doc.addPage(); y = 20; }
        if (r.bg) roundedRect(doc, M, y, W - M * 2, lineH, 3, r.bg);
        doc.setFont('helvetica', r.bold ? 'bold' : 'normal');
        doc.setFontSize(r.sub ? 9 : 9.5);
        const txtColor = r.txt || (r.bold ? C.slate : C.gray);
        doc.setTextColor(txtColor);
        const label = r.sub ? '     ' + r.label : r.label;
        if (r.value !== '') {
            doc.text(String(r.value), valueX, y + lineH - 2.5, { align: 'right' });
        }
        doc.text(label, labelX, y + lineH - 2.5);
        y += lineH;
    }

    // Rodapé página 1
    y += 8;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(C.gray);
    doc.text('Regime de caixa — receitas recebidas e despesas pagas no período.', M, y);
    doc.text('Gerado em ' + new Date().toLocaleString('pt-BR', { timeZone: 'America/Cuiaba' }) + ' pelo sistema ERPCap.', W - M, y, { align: 'right' });

    // ===== PÁGINA 2+: DETALHAMENTO DAS CONTAS =====
    doc.addPage();
    doc.setFillColor('#0f172a');
    doc.rect(0, 0, W, 22, 'F');
    doc.setFillColor('#10b981');
    doc.rect(0, 22, W, 1.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor('#ffffff');
    doc.text('Detalhamento das Contas — ' + monthLabel(selectedKey), M, 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor('#cbd5e1');
    doc.text('Relação de todos os lançamentos que compuseram o DRE do período.', M, 17);

    let py = 32;
    const ensure = (h: number) => {
        if (py + h > 275) { doc.addPage(); py = 18; doc.setFillColor('#0f172a'); doc.rect(0, 0, W, 10, 'F'); doc.setTextColor('#ffffff'); doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text('Capitao Society — Detalhamento DRE (cont.)', M, 6); doc.setFillColor('#10b981'); doc.rect(0, 10, W, 1, 'F'); py = 20; }
    };

    // Tabela genérica
    const table = (title: string, head: string[], rowsData: string[][], widths: number[]) => {
        ensure(12);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(C.slateDark);
        doc.text(title, M, py);
        py += 5;
        // header
        ensure(7);
        roundedRect(doc, M, py, W - M * 2, 6.5, 2, C.slate);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        let hx = M;
        head.forEach((h, i) => {
            doc.setTextColor('#ffffff');
            doc.text(h, hx + 2.5, py + 4.5);
            hx += widths[i];
        });
        py += 6.5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        rowsData.forEach((rd, ri) => {
            ensure(5.6);
            if (ri % 2 === 1) roundedRect(doc, M, py, W - M * 2, 5.6, 1, C.light);
            let rx = M;
            rd.forEach((cell, i) => {
                doc.setTextColor(C.gray);
                if (i === rd.length - 1) { doc.setFont('helvetica', 'bold'); doc.setTextColor(C.slate); }
                doc.text(cell, rx + 2.5, py + 4, { align: i === rd.length - 1 ? 'right' : 'left' });
                rx += widths[i];
            });
            doc.setFont('helvetica', 'normal');
            py += 5.6;
        });
        py += 4;
    };

    if (detail) {
        const v = detail.vendas;
        if (v.length > 0) {
            table('Receitas de Vendas (PDV / Comandas)', ['Data', 'Método', 'Comanda', 'Valor'],
                v.map((x: any) => [x.data, x.metodo, '#' + x.comanda, fmt(x.valor)]),
                [38, 30, 40, 74]);
        }

        if (detail.outrasReceitas.length > 0) {
            table('Outras Receitas (contas a receber pagas)', ['Data', 'Descrição', '', 'Valor'],
                detail.outrasReceitas.map((x: any) => [x.data, x.descricao, '', fmt(x.valor)]),
                [38, 90, 0, 54]);
        }

        if (detail.despesas.length > 0) {
            table('Despesas Pagas no Período', ['Data', 'Categoria', 'Descrição', 'Valor'],
                detail.despesas.map((x: any) => [x.data, x.categoria, x.descricao, '- ' + fmt(x.valor)]),
                [30, 40, 62, 50]);
        }

        if (detail.cmv.length > 0) {
            // CMV agrupado por produto
            const cmvMap = new Map<string, { qtd: number; total: number }>();
            detail.cmv.forEach((x: any) => {
                const cur = cmvMap.get(x.produto) || { qtd: 0, total: 0 };
                cur.qtd += x.qtd;
                cur.total += x.total;
                cmvMap.set(x.produto, cur);
            });
            table('CMV — Custo das Mercadorias Vendidas (por produto)', ['Produto', 'Qtd.', 'Custo Unit.', 'Total'],
                Array.from(cmvMap.entries()).map(([prod, x]: any) => [prod, fmtQtd(x.qtd), fmt(x.total / (x.qtd || 1)), fmt(x.total)]),
                [72, 30, 40, 40]);
        }
    } else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(C.gray);
        doc.text('Nenhum lançamento no período.', M, py);
    }

    // Totais no final da página de detalhamento
    if (detail) {
        ensure(8);
        py += 3;
        doc.setDrawColor('#e2e8f0');
        doc.line(M, py, W - M, py);
        py += 8;
        const tots: [string, string][] = [
            ['Total de Receitas', fmt(month?.totalReceitas || 0)],
            ['Total de Despesas', '- ' + fmt(month ? month.totalDespesasOp + month.despesasFinanceiras + month.impostos : 0)],
            ['Resultado Líquido', fmt(month?.resultadoLiquido || 0)]
        ];
        tots.forEach(([lbl, val]) => {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(C.slate);
            doc.text(lbl, M, py);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(C.blue);
            doc.text(val, W - M, py, { align: 'right' });
            py += 6;
        });
    }

    doc.save(`DRE_Gerencial_${selectedKey.replace('/', '_')}.pdf`);
}
