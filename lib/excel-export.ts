import * as XLSX from 'xlsx';

/**
 * Converte um array de objetos JSON para um arquivo Excel (.xlsx) e faz o download.
 * @param jsonData Array de objetos contendo os dados (linhas)
 * @param fileName Nome do arquivo a ser salvo (sem extensão final)
 * @param sheetName Opcional: Nome da aba (Planilha1 por padrão)
 */
/**
 * Converte múltiplos conjuntos de dados em um único arquivo Excel com várias abas.
 * @param sheets Array de objetos { data: any[], sheetName: string }
 * @param fileName Nome do arquivo
 */
export function downloadMultiSheetExcel(sheets: { data: any[], sheetName: string }[], fileName: string) {
    if (!sheets || sheets.length === 0) {
        alert("Não há dados para exportar.");
        return;
    }

    const workbook = XLSX.utils.book_new();

    sheets.forEach(sheet => {
        if (sheet.data && sheet.data.length > 0) {
            const worksheet = XLSX.utils.json_to_sheet(sheet.data);
            
            // Largura das colunas
            const headerKeys = Object.keys(sheet.data[0]);
            const wscols = headerKeys.map(key => {
                const maxLength = sheet.data.reduce((max, row) => {
                    const val = row[key];
                    const strLen = val !== null && val !== undefined ? String(val).length : 0;
                    return Math.max(max, strLen);
                }, key.length);
                return { wch: Math.min(Math.max(maxLength + 2, 10), 50) };
            });
            worksheet['!cols'] = wscols;

            XLSX.utils.book_append_sheet(workbook, worksheet, sheet.sheetName);
        }
    });

    XLSX.writeFile(workbook, `${fileName}.xlsx`);
}

export function downloadExcel(jsonData: any[], fileName: string, sheetName: string = 'Relatório') {
    downloadMultiSheetExcel([{ data: jsonData, sheetName }], fileName);
}
