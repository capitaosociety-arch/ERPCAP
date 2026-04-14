import * as XLSX from 'xlsx';

/**
 * Converte um array de objetos JSON para um arquivo Excel (.xlsx) e faz o download.
 * @param jsonData Array de objetos contendo os dados (linhas)
 * @param fileName Nome do arquivo a ser salvo (sem extensão final)
 * @param sheetName Opcional: Nome da aba (Planilha1 por padrão)
 */
export function downloadExcel(jsonData: any[], fileName: string, sheetName: string = 'Relatório') {
    if (!jsonData || jsonData.length === 0) {
        alert("Não há dados para exportar.");
        return;
    }

    // 1. Cria uma nova planilha a partir dos dados JSON
    const worksheet = XLSX.utils.json_to_sheet(jsonData);

    // 2. Cria um novo livro (workbook) de Excel e anexa a planilha
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    // 3. Modifica a largura das colunas dinamicamente (opcional melhoria visual)
    const headerKeys = Object.keys(jsonData[0]);
    const wscols = headerKeys.map(key => {
        // Encontra o maior tamanho de string naquela coluna
        const maxLength = jsonData.reduce((max, row) => {
            const val = row[key];
            const strLen = val !== null && val !== undefined ? String(val).length : 0;
            return Math.max(max, strLen);
        }, key.length);
        
        // Limita a largura entre 10 e 50 caracteres
        return { wch: Math.min(Math.max(maxLength + 2, 10), 50) };
    });
    worksheet['!cols'] = wscols;

    // 4. Executa o download direto do navegador
    XLSX.writeFile(workbook, `${fileName}.xlsx`);
}
